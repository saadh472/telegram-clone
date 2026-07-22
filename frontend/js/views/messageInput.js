/** VIEW — Message input, typing, reply bar, emoji picker, attachments, voice. */
import { chatState, uiState, SELECTORS, INPUT_MAX_HEIGHT, MAX_TEXT_LENGTH } from '../config.js';
import {
  $, $$, formatLastSeen, isStickerMessage, parseStickerEmoji, formatMediaReplyPreview,
  formatVoiceDuration, showToast
} from '../utils.js';

let emojiList = [];
let stickerList = [];
let onEmojiSelect = null;
let onStickerSelect = null;

export function updateInputState() {
  const wrap = $(SELECTORS.messageInputWrap);
  const input = $(SELECTORS.messageInput);
  const actionBtn = $(SELECTORS.actionBtn);
  const attachBtn = $(SELECTORS.attachBtn);
  const area = $('.message-input-area');
  const recording = uiState.recording;
  const editing = !!chatState.editingId;
  const disabled = uiState.sending || !chatState.activeChatId || recording;
  wrap?.classList.toggle('disabled', disabled && !editing);
  area?.classList.toggle('is-sending', uiState.sending);
  if (input) input.disabled = disabled && !editing;
  if (actionBtn) {
    actionBtn.disabled = disabled && !(editing && input?.value.trim());
    actionBtn.classList.toggle('is-sending', uiState.sending);
    actionBtn.setAttribute('aria-busy', uiState.sending ? 'true' : 'false');
  }
  if (attachBtn) attachBtn.disabled = disabled || editing;
}

export function autoResizeInput() {
  const ta = $(SELECTORS.messageInput);
  if (!ta) return;
  ta.style.height = 'auto';
  ta.style.height = Math.min(ta.scrollHeight, INPUT_MAX_HEIGHT) + 'px';
}

export function updateActionButton() {
  const btn = $(SELECTORS.actionBtn);
  const input = $(SELECTORS.messageInput);
  const wrap = $(SELECTORS.messageInputWrap);
  if (!btn || !input) return;
  const editing = !!chatState.editingId;
  const hasText = input.value.trim().length > 0;
  const wasSend = btn.classList.contains('send-mode');
  btn.classList.toggle('send-mode', hasText || editing);
  btn.classList.toggle('mic-mode', !hasText && !editing);
  wrap?.classList.toggle('has-text', hasText);
  if (hasText !== wasSend) btn.classList.add('action-morph');
  const disabled = uiState.sending || !chatState.activeChatId || uiState.recording;
  btn.disabled = disabled && !(editing && hasText);
  if (editing) {
    btn.setAttribute('aria-label', hasText ? 'Save edit' : 'Save edit');
    btn.title = 'Save edit';
  } else {
    btn.setAttribute('aria-label', hasText ? 'Send message' : 'Record voice');
    btn.title = hasText ? 'Send message' : 'Record voice';
  }
  updateComposeMeta();
}

export function updateComposeMeta() {
  const input = $(SELECTORS.messageInput);
  const meta = $(SELECTORS.composeMeta);
  const count = $(SELECTORS.composeCount);
  const wrap = $(SELECTORS.messageInputWrap);
  if (!input || !meta || !count) return;

  const length = input.value.length;
  const remaining = MAX_TEXT_LENGTH - length;
  const hasText = length > 0;
  const warning = remaining <= 500 && remaining >= 0;
  const invalid = remaining < 0;

  count.textContent = hasText
    ? `${length.toLocaleString()} / ${MAX_TEXT_LENGTH.toLocaleString()}`
    : `0 / ${MAX_TEXT_LENGTH.toLocaleString()}`;
  meta.classList.toggle('visible', hasText || chatState.editingId);
  meta.classList.toggle('warning', warning);
  meta.classList.toggle('error', invalid);
  wrap?.classList.toggle('input-warning', warning);
  wrap?.classList.toggle('input-error', invalid);
  input.setAttribute('aria-invalid', invalid ? 'true' : 'false');
}

export function applyReceiverMode(enabled) {
  $(SELECTORS.chatPanel)?.classList.toggle('receiver-mode', enabled);
  const title = enabled ? 'Switch to sender view' : 'Switch to receiver view';
  const label = enabled ? 'Receiver' : 'Sender';
  $$(SELECTORS.viewToggleBtn).forEach((btn) => {
    btn.classList.toggle('active', enabled);
    btn.title = title;
    btn.setAttribute('aria-label', title);
    btn.querySelector('.toggle-label')?.replaceChildren(document.createTextNode(label));
  });
}

export function setInputAreaEnabled(enabled) {
  const area = $('.message-input-area');
  area?.classList.toggle('no-chat', !enabled);
}

export function renderChatHeaderStatus(chat) {
  const status = $(SELECTORS.chatStatus);
  if (!status || !chat) return;
  if (chat.type === 'group') {
    status.textContent = 'group';
    status.className = 'chat-status';
  } else if (chat.other_online) {
    status.textContent = 'online';
    status.className = 'chat-status online';
  } else {
    status.textContent = formatLastSeen(chat.other_last_seen, false);
    status.className = 'chat-status';
  }
}

function setPickerTab(tab) {
  $$('.picker-tab').forEach((btn) => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  $(SELECTORS.emojiPicker)?.classList.toggle('hidden', tab !== 'emoji');
  $(SELECTORS.stickerPicker)?.classList.toggle('hidden', tab !== 'stickers');
  const search = $(SELECTORS.pickerSearch);
  if (search) {
    search.placeholder = tab === 'stickers' ? 'Search stickers…' : 'Search emoji…';
    search.value = '';
    filterPickerGrid('');
  }
}

function filterPickerGrid(query) {
  const q = query.trim().toLowerCase();
  const activeTab = $('.picker-tab.active')?.dataset.tab || 'emoji';
  const grid = activeTab === 'stickers' ? $(SELECTORS.stickerPicker) : $(SELECTORS.emojiPicker);
  if (!grid) return;
  $$('button', grid).forEach((btn) => {
    const label = (btn.getAttribute('aria-label') || btn.textContent || '').toLowerCase();
    btn.classList.toggle('hidden', q.length > 0 && !label.includes(q));
  });
}

function renderPickerGrid(picker, items, className = '') {
  if (!picker) return;
  picker.innerHTML = items.map((item) =>
    `<button type="button" class="${className}" role="option" aria-label="${item}">${item}</button>`
  ).join('');
}

export function showPickerPanel(tab = 'emoji') {
  $(SELECTORS.pickerPanel)?.classList.remove('hidden');
  setPickerTab(tab);
}

export function hidePickerPanel() {
  $(SELECTORS.pickerPanel)?.classList.add('hidden');
  const search = $(SELECTORS.pickerSearch);
  if (search) search.value = '';
  filterPickerGrid('');
}

export function toggleEmojiPicker(show) {
  if (show) showPickerPanel('emoji');
  else hidePickerPanel();
}

export function toggleStickerPicker(show) {
  if (show) showPickerPanel('stickers');
  else hidePickerPanel();
}

export function showTypingIndicator(name = '') {
  const indicator = $(SELECTORS.typingIndicator);
  const headerText = $('.chat-header-text');
  const label = indicator?.querySelector('.typing-label');
  if (label) label.textContent = name ? `${name} is typing` : 'typing';
  indicator?.classList.remove('hidden');
  headerText?.classList.add('typing-active');
  showMessagesAreaTyping(name);
}

export function hideTypingIndicator() {
  $(SELECTORS.typingIndicator)?.classList.add('hidden');
  $('.chat-header-text')?.classList.remove('typing-active');
  hideMessagesAreaTyping();
}

export function showMessagesAreaTyping(name = '') {
  const el = $(SELECTORS.messagesTyping);
  if (!el) return;
  const label = el.querySelector('.messages-typing-label');
  if (label) label.textContent = name ? `${name} is typing…` : 'typing…';
  el.classList.remove('hidden');
}

export function hideMessagesAreaTyping() {
  $(SELECTORS.messagesTyping)?.classList.add('hidden');
}

export function showReplyBar(msg) {
  const bar = $(SELECTORS.replyBar);
  if (!bar || !msg) return;
  chatState.replyTo = msg;
  $('#reply-bar-name').textContent = msg.sender_name || 'Message';
  $('#reply-bar-text').textContent = isStickerMessage(msg.content)
    ? `${parseStickerEmoji(msg.content)} Sticker`
    : formatMediaReplyPreview(msg.content);
  bar.classList.remove('hidden');
  bar.dataset.replyId = msg.id;
}

export function hideReplyBar() {
  $(SELECTORS.replyBar)?.classList.add('hidden');
  delete chatState.replyTo;
}

export function showEditBar() {
  const bar = $(SELECTORS.editBar);
  const area = $('.message-input-area');
  bar?.classList.remove('hidden');
  area?.classList.add('editing-mode');
}

export function hideEditBar() {
  $(SELECTORS.editBar)?.classList.add('hidden');
  $('.message-input-area')?.classList.remove('editing-mode');
  chatState.editingId = null;
  chatState.editingPlainText = null;
  $$(`.msg-row.editing-target`).forEach((row) => row.classList.remove('editing-target'));
}

export function initEmojiPicker(emojis, onSelect) {
  emojiList = emojis;
  onEmojiSelect = onSelect;
  const picker = $(SELECTORS.emojiPicker);
  if (!picker || picker.dataset.ready) return;
  picker.dataset.ready = '1';
  renderPickerGrid(picker, emojis);
  picker.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button:not(.hidden)');
    if (btn) onEmojiSelect?.(btn.textContent);
  });
}

export function initStickerPicker(stickers, onSelect) {
  stickerList = stickers;
  onStickerSelect = onSelect;
  const picker = $(SELECTORS.stickerPicker);
  if (!picker || picker.dataset.ready) return;
  picker.dataset.ready = '1';
  renderPickerGrid(picker, stickers, 'sticker-option');
  picker.addEventListener('click', (ev) => {
    const btn = ev.target.closest('button:not(.hidden)');
    if (btn) onStickerSelect?.(btn.textContent);
  });
}

export function initPickerPanel() {
  const panel = $(SELECTORS.pickerPanel);
  if (!panel || panel.dataset.ready) return;
  panel.dataset.ready = '1';

  $$('.picker-tab', panel).forEach((tab) => {
    tab.addEventListener('click', () => setPickerTab(tab.dataset.tab));
  });

  $(SELECTORS.pickerSearch)?.addEventListener('input', (e) => filterPickerGrid(e.target.value));
}

function setRecordingUI(active) {
  uiState.recording = active;
  $(SELECTORS.voiceRecordingBar)?.classList.toggle('hidden', !active);
  $(SELECTORS.messageInputRow)?.classList.toggle('hidden', active);
  updateInputState();
  updateActionButton();
}

function showRecordingBar() {
  setRecordingUI(true);
  const timer = $(SELECTORS.voiceRecordingTimer);
  if (timer) timer.textContent = '0:00';
}

function hideRecordingBar() {
  setRecordingUI(false);
}

function openFilePicker(fileInput) {
  fileInput.value = '';
  if (typeof fileInput.showPicker === 'function') {
    fileInput.showPicker().catch(() => fileInput.click());
  } else {
    fileInput.click();
  }
}

/** Wire attach button + hidden file input. */
export function initAttachmentInput(onFileSelected) {
  const attachBtn = $(SELECTORS.attachBtn);
  let fileInput = $(SELECTORS.fileInput);
  if (!attachBtn || !fileInput || attachBtn.dataset.ready) return;
  attachBtn.dataset.ready = '1';

  // Keep file input on body so display:none ancestors never block the picker.
  if (fileInput.parentElement !== document.body) {
    document.body.appendChild(fileInput);
  }

  attachBtn.addEventListener('click', () => {
    if (!chatState.activeChatId) {
      showToast('Select a chat before attaching a file', 'info');
      return;
    }
    if (uiState.sending) {
      showToast('Please wait — message still sending', 'info');
      return;
    }
    if (uiState.recording) {
      showToast('Finish or cancel voice recording first', 'info');
      return;
    }
    if (attachBtn.disabled) {
      showToast('Cannot attach files right now', 'info');
      return;
    }
    openFilePicker(fileInput);
  });

  fileInput.addEventListener('change', () => {
    const file = fileInput.files?.[0];
    if (!file) return;
    onFileSelected(file);
    fileInput.value = '';
  });
}

function canAcceptAttachment() {
  if (!chatState.activeChatId) {
    showToast('Select a chat before attaching a file', 'info');
    return false;
  }
  if (uiState.sending) {
    showToast('Please wait — message still sending', 'info');
    return false;
  }
  if (uiState.recording) {
    showToast('Finish or cancel voice recording first', 'info');
    return false;
  }
  if (chatState.editingId) {
    showToast('Finish editing before attaching a file', 'info');
    return false;
  }
  return true;
}

/** Drag-and-drop files onto the compose area. */
export function initComposeDropZone(onFileSelected) {
  const area = $('.message-input-area');
  const wrap = $(SELECTORS.messageInputWrap);
  if (!area || area.dataset.dropReady) return;
  area.dataset.dropReady = '1';

  const showDrop = () => {
    if (!canAcceptAttachment()) return;
    area.classList.add('drag-over');
    wrap?.classList.add('drag-over');
  };
  const hideDrop = () => {
    area.classList.remove('drag-over');
    wrap?.classList.remove('drag-over');
  };

  ['dragenter', 'dragover'].forEach((evt) => {
    area.addEventListener(evt, (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (e.dataTransfer?.types?.includes('Files')) showDrop();
    });
  });
  area.addEventListener('dragleave', (e) => {
    if (!area.contains(e.relatedTarget)) hideDrop();
  });
  area.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();
    hideDrop();
    if (!canAcceptAttachment()) return;
    const file = e.dataTransfer?.files?.[0];
    if (file) onFileSelected(file);
  });
}

/** Wire mic/send button — send when text present, record voice otherwise. */
export function initActionButton(onSend) {
  const actionBtn = $(SELECTORS.actionBtn);
  if (!actionBtn || actionBtn.dataset.actionReady) return;
  actionBtn.dataset.actionReady = '1';
  actionBtn.addEventListener('animationend', (e) => {
    if (e.animationName === 'actionMorph') actionBtn.classList.remove('action-morph');
  });

  actionBtn.addEventListener('click', () => {
    const input = $(SELECTORS.messageInput);
    if (chatState.editingId) {
      if (input?.value.trim()) onSend();
      return;
    }
    if (input?.value.trim()) {
      onSend();
      return;
    }
  });
}

/** Wire voice recording UI with MediaRecorder. */
export function initVoiceRecording(onSendVoice) {
  const actionBtn = $(SELECTORS.actionBtn);
  const cancelBtn = $(SELECTORS.voiceRecordingCancel);
  const sendBtn = $(SELECTORS.voiceRecordingSend);
  if (!actionBtn || actionBtn.dataset.voiceReady) return;
  actionBtn.dataset.voiceReady = '1';

  let mediaRecorder = null;
  let mediaStream = null;
  let recordingStart = 0;
  let timerId = null;
  let audioChunks = [];

  function clearTimer() {
    if (timerId) {
      clearInterval(timerId);
      timerId = null;
    }
  }

  function stopStream() {
    mediaStream?.getTracks().forEach((t) => t.stop());
    mediaStream = null;
    mediaRecorder = null;
  }

  function getDurationSeconds() {
    if (!recordingStart) return 0;
    return Math.max(1, Math.round((Date.now() - recordingStart) / 1000));
  }

  function updateTimer() {
    const elapsed = recordingStart ? Math.floor((Date.now() - recordingStart) / 1000) : 0;
    const timer = $(SELECTORS.voiceRecordingTimer);
    if (timer) timer.textContent = formatVoiceDuration(elapsed);
  }

  function finishRecording(send) {
    clearTimer();
    const duration = getDurationSeconds();
    const recorder = mediaRecorder;
    const chunks = audioChunks.slice();
    stopStream();
    hideRecordingBar();
    audioChunks = [];
    if (send && duration > 0) {
      if (chunks.length) {
        const blob = new Blob(chunks, { type: chunks[0]?.type || 'audio/webm' });
        const reader = new FileReader();
        reader.onload = () => onSendVoice(duration, reader.result);
        reader.readAsDataURL(blob);
      } else {
        showToast('No audio captured — check microphone permissions', 'error');
      }
    }
  }

  async function startRecording() {
    if (chatState.editingId) return;
    if (uiState.sending || !chatState.activeChatId || uiState.recording) return;
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      showToast('Voice recording is not supported in this browser', 'error');
      return;
    }
    try {
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      audioChunks = [];
      mediaRecorder = new MediaRecorder(mediaStream);
      mediaRecorder.ondataavailable = (ev) => {
        if (ev.data?.size) audioChunks.push(ev.data);
      };
      mediaRecorder.onstop = () => {};
      mediaRecorder.start();
      recordingStart = Date.now();
      showRecordingBar();
      updateTimer();
      timerId = setInterval(updateTimer, 500);
    } catch {
      stopStream();
      hideRecordingBar();
      showToast('Microphone permission denied. Enable mic access to record voice messages.', 'error');
    }
  }

  actionBtn.addEventListener('click', () => {
    const input = $(SELECTORS.messageInput);
    if (chatState.editingId) return;
    if (input?.value.trim()) return;
    if (uiState.recording) return;
    startRecording();
  });

  cancelBtn?.addEventListener('click', () => {
    if (mediaRecorder?.state === 'recording') mediaRecorder.stop();
    finishRecording(false);
  });

  sendBtn?.addEventListener('click', () => {
    if (mediaRecorder?.state === 'recording') {
      mediaRecorder.addEventListener('stop', () => finishRecording(true), { once: true });
      mediaRecorder.stop();
    } else {
      finishRecording(true);
    }
  });
}
