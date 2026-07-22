/** VIEW — Message thread (barrel + event delegation). */

export {

  updateInputState, autoResizeInput, updateActionButton, updateComposeMeta, applyReceiverMode,

  setInputAreaEnabled, initActionButton,

  renderChatHeaderStatus, showTypingIndicator, hideTypingIndicator,

  showMessagesAreaTyping, hideMessagesAreaTyping,

  showReplyBar, hideReplyBar, showEditBar, hideEditBar, toggleEmojiPicker, initEmojiPicker,

  toggleStickerPicker, initStickerPicker, initPickerPanel, hidePickerPanel,

  initAttachmentInput, initVoiceRecording, initComposeDropZone

} from './messageInput.js';



export {

  showMessagesSkeleton, showMessagesError, resetMessagesView,

  renderMessages, appendOrUpdateMessage, promoteOptimisticMessage,

  removeMessageFromDom, scrollToBottom, updateScrollFab, isNearBottom,

  updateStatusesInPlace, updateReactionChipsForMessage, syncE2eChatBanner,

  updateEditedMessageInPlace,
  updateDeletedMessageInPlace,
  updateMessageSearchMeta,
  focusMessageSearchResult,
  applyMessageSearchToRenderedRows

} from './messageRender.js';



import { authState, chatState, SELECTORS } from '../config.js';

import { $, $$, showToast, parseVoiceBase64, canEditMessage, isMessageDeleted, sanitizeAudioDataUrl } from '../utils.js';



let chatListClickBound = false;

let activeVoiceAudio = null;



function playVoiceMessage(messageId) {

  const msg = chatState.messages.find((m) => String(m.id) === String(messageId));

  const src = msg ? sanitizeAudioDataUrl(parseVoiceBase64(msg.content)) : null;

  if (!src) {

    showToast('No audio stored for this voice message', 'info');

    return;

  }

  if (activeVoiceAudio) {

    activeVoiceAudio.pause();

    activeVoiceAudio = null;

  }

  activeVoiceAudio = new Audio(src);

  activeVoiceAudio.play().catch(() => showToast('Could not play voice message', 'error'));

}



/** Delegated listeners on the messages container (context menu, hover actions, dblclick reply). */

export function initMessageViewDelegation(handlers) {

  const container = $(SELECTORS.messagesContainer);

  if (!container || container.dataset.delegation) return;

  container.dataset.delegation = '1';



  let longPressTimer = null;

  let longPressRow = null;



  container.addEventListener('touchstart', (e) => {

    const row = e.target.closest('.msg-row');

    if (!row) return;

    longPressRow = row;

    longPressTimer = setTimeout(() => {

      const id = Number(row.dataset.id) || row.dataset.id;

      const touch = e.touches[0];

      handlers.onContextMenu?.(id, touch.clientX, touch.clientY);

    }, 500);

  }, { passive: true });



  container.addEventListener('touchend', () => {

    if (longPressTimer) clearTimeout(longPressTimer);

    longPressTimer = null;

    longPressRow = null;

  });



  container.addEventListener('touchmove', () => {

    if (longPressTimer) clearTimeout(longPressTimer);

  });



  container.addEventListener('contextmenu', (e) => {

    const row = e.target.closest('.msg-row');

    if (!row) return;

    e.preventDefault();

    handlers.onContextMenu?.(Number(row.dataset.id) || row.dataset.id, e.clientX, e.clientY);

  });



  container.addEventListener('dblclick', (e) => {
    if (e.target.closest('.reaction-chip, .msg-bubble-react-btn, .msg-hover-bar, .msg-reactions, .reaction-picker')) return;
    const row = e.target.closest('.msg-row');
    if (!row) return;
    const id = Number(row.dataset.id) || row.dataset.id;
    handlers.onReact?.(id, row.querySelector('.msg-bubble') || row.querySelector('.sticker-content') || row);
  });



  container.addEventListener('keydown', (e) => {

    if (e.key !== 'Enter' && e.key !== ' ') return;

    if (!e.target.closest('#e2e-chat-banner')) return;

    e.preventDefault();

    showToast('Demo E2E: messages use client-side AES-GCM, not Signal protocol. For assignment demo only.', 'info');

  });



  container.addEventListener('click', (e) => {

    if (e.target.closest('#load-more-messages-btn')) return;



    if (e.target.closest('#e2e-chat-banner')) {

      showToast('Demo E2E: messages use client-side AES-GCM, not Signal protocol. For assignment demo only.', 'info');

      return;

    }



    const retryBtn = e.target.closest('.msg-retry-btn');

    if (retryBtn) {

      const row = retryBtn.closest('.msg-row');

      if (row) handlers.onRetry?.(row.dataset.id);

      return;

    }



    const voiceBtn = e.target.closest('.voice-play-btn');

    if (voiceBtn) {

      const row = voiceBtn.closest('.msg-row');

      if (row) playVoiceMessage(Number(row.dataset.id) || row.dataset.id);

      return;

    }



    const chip = e.target.closest('.reaction-chip');

    if (chip) {

      e.preventDefault();

      e.stopPropagation();

      const row = chip.closest('.msg-row');

      if (!row) return;

      handlers.onReactionToggle?.(Number(row.dataset.id) || row.dataset.id, chip.dataset.emoji);

      return;

    }



    const reactBtn = e.target.closest('.msg-bubble-react-btn, .msg-hover-btn[data-action="react"]');

    if (reactBtn) {

      e.preventDefault();

      e.stopPropagation();

      const row = reactBtn.closest('.msg-row');

      if (!row) return;

      const id = Number(row.dataset.id) || row.dataset.id;

      handlers.onReact?.(id, row.querySelector('.msg-bubble') || row.querySelector('.sticker-content') || row);

      return;

    }



    const btn = e.target.closest('.msg-hover-btn');

    if (!btn) return;

    e.preventDefault();

    e.stopPropagation();

    const row = btn.closest('.msg-row');

    if (!row) return;

    const id = Number(row.dataset.id) || row.dataset.id;

    const action = btn.dataset.action;

    if (action === 'reply') handlers.onReply?.(id);

    else if (action === 'copy') handlers.onCopy?.(id);

    else if (action === 'forward') handlers.onForward?.(id);

    else if (action === 'edit') handlers.onEdit?.(id);

    else if (action === 'delete') handlers.onDelete?.(id);

  });

}



export function bindChatListDelegation(onOpen, { onUnarchive } = {}) {

  const list = $(SELECTORS.chatList);

  if (!list || chatListClickBound) return;

  chatListClickBound = true;

  list.addEventListener('click', (e) => {

    if (e.target.closest('.chat-action-btn') || e.target.closest('.chat-section-toggle')) return;

    const btn = e.target.closest('.chat-item');

    if (btn?.dataset.id) onOpen(Number(btn.dataset.id));

  });



  let longPressTimer = null;

  let longPressItem = null;



  list.addEventListener('touchstart', (e) => {

    const item = e.target.closest('.chat-item[data-archived="1"]');

    if (!item) return;

    longPressItem = item;

    longPressTimer = setTimeout(() => {

      const chatId = Number(longPressItem?.dataset.id);

      if (chatId && onUnarchive) {

        onUnarchive(chatId);

        showToast('Chat unarchived', 'info');

      }

    }, 600);

  }, { passive: true });



  list.addEventListener('touchend', () => {

    if (longPressTimer) clearTimeout(longPressTimer);

    longPressTimer = null;

    longPressItem = null;

  });



  list.addEventListener('touchmove', () => {

    if (longPressTimer) clearTimeout(longPressTimer);

  });



  list.addEventListener('contextmenu', (e) => {

    const item = e.target.closest('.chat-item[data-archived="1"]');

    if (!item || !onUnarchive) return;

    e.preventDefault();

    onUnarchive(Number(item.dataset.id));

    showToast('Chat unarchived', 'info');

  });

}



export function updateChatListActiveState() {

  const chatsById = new Map(chatState.chats.map((chat) => [String(chat.id), chat]));

  $$('.chat-item').forEach((btn) => {

    const id = String(btn.dataset.id);

    const chat = chatsById.get(id);

    const unread = chat?.unread_count > 0;

    btn.classList.toggle('active', id === String(chatState.activeChatId));

    btn.classList.toggle('unread', unread && id !== String(chatState.activeChatId));

  });

}



export function updateContextMenuForMessage(messageId) {

  const menu = $(SELECTORS.msgContextMenu);

  const editItem = menu?.querySelector('[data-action="edit"]');

  const msg = chatState.messages.find((m) => String(m.id) === String(messageId));

  const deleted = isMessageDeleted(msg);

  editItem?.classList.toggle('hidden', !msg || !canEditMessage(msg));

  menu?.querySelectorAll('[data-action="reply"], [data-action="copy"], [data-action="forward"], [data-action="react"]')
    .forEach((el) => el.classList.toggle('hidden', deleted));

}


