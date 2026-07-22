/** CONTROLLER — Message context actions (reply, copy, forward, delete). */
import { authState, chatState, uiState, SELECTORS } from '../config.js';
import { $, $$, showToast, invalidateChatListCache, isTextOnlyMessage, canEditMessage, isMessageDeleted } from '../utils.js';
import { deleteMessage as deleteMessageApi, hideMessage as hideMessageApi, sendMessage as sendMessageApi, editMessage as editMessageApi } from '../models/chatModel.js';
import { decryptMessage, isE2eEncrypted } from '../models/e2eCrypto.js';
import { openForwardModal, closeForwardModal } from '../views/forwardView.js';
import { openDeleteModal } from '../views/deleteMessageView.js';
import { showReplyBar, hideReplyBar, hideEditBar, showEditBar, hidePickerPanel, removeMessageFromDom, updateReactionChipsForMessage, renderMessages, updateContextMenuForMessage, updateEditedMessageInPlace, updateDeletedMessageInPlace, autoResizeInput, updateActionButton, updateInputState } from '../views/messageView.js';
import { showReactionPicker, hideReactionPicker, isPickerOpenFor } from '../views/reactionView.js';
import { toggleReaction, hasUserReacted } from '../models/messageReactions.js';

let contextMessageId = null;
let forwardMessageId = null;
let onForwardComplete = null;
let onMessageListChanged = null;
let reactionHintShown = false;

try {
  reactionHintShown = sessionStorage.getItem('reaction_hint_shown') === '1';
} catch {
  /* private browsing */
}

export function setForwardCompleteHandler(fn) {
  onForwardComplete = fn;
}

export function setMessageListChangedHandler(fn) {
  onMessageListChanged = fn;
}

export function getMessageById(id) {
  return chatState.messages.find((m) => String(m.id) === String(id));
}

export function hideContextMenu() {
  if (contextMessageId) {
    $(`.msg-row[data-id="${contextMessageId}"]`)?.classList.remove('context-selected');
  }
  $(SELECTORS.msgContextMenu)?.classList.add('hidden');
  contextMessageId = null;
}

export function showContextMenu(messageId, x, y) {
  hideContextMenu();
  const menu = $(SELECTORS.msgContextMenu);
  if (!menu) return;
  contextMessageId = messageId;
  updateContextMenuForMessage(messageId);
  $(`.msg-row[data-id="${messageId}"]`)?.classList.add('context-selected');
  menu.classList.remove('hidden');
  const rect = menu.getBoundingClientRect();
  const left = Math.min(x, window.innerWidth - rect.width - 8);
  const top = Math.min(y, window.innerHeight - rect.height - 8);
  menu.style.left = `${Math.max(8, left)}px`;
  menu.style.top = `${Math.max(8, top)}px`;
}

export function handleReply(messageId) {
  cancelEdit();
  const msg = getMessageById(messageId);
  if (!msg || isMessageDeleted(msg)) return;
  chatState.replyTo = msg;
  showReplyBar(msg);
  hideContextMenu();
  $(SELECTORS.messageInput)?.focus();
}

export function handleReact(messageId, anchorEl) {
  hideContextMenu();
  const msg = getMessageById(messageId);
  if (isMessageDeleted(msg)) return;
  if (isPickerOpenFor(messageId)) {
    hideReactionPicker();
    return;
  }
  const row = $(`.msg-row[data-id="${messageId}"]`);
  const anchor = anchorEl || row?.querySelector('.msg-bubble') || row?.querySelector('.sticker-content') || row;
  showReactionPicker(messageId, anchor);
}

export function handleReactionToggle(messageId, emoji) {
  const wasActive = hasUserReacted(messageId, emoji);
  toggleReaction(messageId, emoji)
    .then(() => {
      updateReactionChipsForMessage(messageId);
      const chip = $(`.msg-row[data-id="${messageId}"] .reaction-chip[data-emoji="${emoji}"]`);
      chip?.classList.add('reaction-pop');
      setTimeout(() => chip?.classList.remove('reaction-pop'), 450);
      hideReactionPicker();
      if (!wasActive && !reactionHintShown) {
        reactionHintShown = true;
        try { sessionStorage.setItem('reaction_hint_shown', '1'); } catch { /* ignore */ }
        showToast('Tap a reaction chip to remove it', 'info');
      }
    })
    .catch((err) => {
      hideReactionPicker();
      showToast(err?.message || 'Could not update reaction', 'error');
    });
}

async function resolveEditablePlainText(msg) {
  if (msg.plainContent) return msg.plainContent;
  const content = msg.content;
  if (isE2eEncrypted(content)) {
    return decryptMessage(chatState.activeChatId, content);
  }
  return content;
}

function highlightEditingMessage(messageId) {
  $$(`.msg-row.editing-target`).forEach((row) => row.classList.remove('editing-target'));
  $(`.msg-row[data-id="${messageId}"]`)?.classList.add('editing-target');
}

export async function startEditMessage(messageId) {
  hideContextMenu();
  const msg = getMessageById(messageId);
  if (!msg) return;
  if (!canEditMessage(msg)) {
    if (String(messageId).startsWith('temp-')) {
      showToast('Wait for message to send before editing', 'info');
    } else if (msg.sender_id === authState.user?.id && isTextOnlyMessage(msg)) {
      showToast('Messages can only be edited within 48 hours', 'info');
    }
    return;
  }
  try {
    const plain = await resolveEditablePlainText(msg);
    hideReplyBar();
    chatState.editingId = messageId;
    chatState.editingPlainText = plain;
    showEditBar();
    highlightEditingMessage(messageId);
    const input = $(SELECTORS.messageInput);
    if (input) {
      input.value = plain;
      autoResizeInput();
      updateActionButton();
      updateInputState();
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
    }
    hidePickerPanel();
  } catch (err) {
    showToast(err?.message || 'Could not load message for editing', 'error');
  }
}

export function cancelEdit() {
  const input = $(SELECTORS.messageInput);
  if (input) input.value = '';
  hideEditBar();
  autoResizeInput();
  updateActionButton();
  updateInputState();
}

export async function saveEdit() {
  const messageId = chatState.editingId;
  if (!messageId || !chatState.activeChatId) return false;
  const input = $(SELECTORS.messageInput);
  const next = input?.value?.trim();
  const original = (chatState.editingPlainText || '').trim();
  if (!next) {
    showToast('Message cannot be empty', 'error');
    return false;
  }
  if (next === original) {
    cancelEdit();
    return true;
  }
  if (uiState.sending) return false;
  uiState.sending = true;
  updateInputState();
  try {
    const updated = await editMessageApi(chatState.activeChatId, messageId, next);
    const idx = chatState.messages.findIndex((m) => String(m.id) === String(messageId));
    if (idx !== -1) {
      chatState.messages[idx] = {
        ...chatState.messages[idx],
        ...updated,
        content: updated.content ?? chatState.messages[idx].content,
        plainContent: next,
        edited_at: updated.edited_at || new Date().toISOString()
      };
    }
    cancelEdit();
    updateEditedMessageInPlace(messageId);
    showToast('Message edited', 'success');
    return true;
  } catch (err) {
    const msg = err?.message || 'Could not edit message';
    if (/48|older|not yours|cannot edit/i.test(msg)) {
      showToast('Messages can only be edited within 48 hours', 'error');
    } else {
      showToast(msg, 'error');
    }
    return false;
  } finally {
    uiState.sending = false;
    updateInputState();
    input?.focus();
  }
}

/** @deprecated Use startEditMessage — kept for existing handler wiring */
export async function handleEditMessage(messageId) {
  return startEditMessage(messageId);
}
export function handleCopy(messageId) {
  const msg = getMessageById(messageId);
  if (!msg || isMessageDeleted(msg)) return;
  navigator.clipboard?.writeText(msg.plainContent || msg.content);
  showToast('Copied to clipboard', 'success');
  hideContextMenu();
}

export function handleDeleteMessage(messageId) {
  hideContextMenu();
  if (!chatState.activeChatId) return;
  const msg = getMessageById(messageId);
  if (!msg) return;
  if (String(messageId).startsWith('temp-')) {
    showToast('Wait for message to send before deleting', 'info');
    return;
  }
  const isSender = msg.sender_id === authState.user?.id;
  openDeleteModal(messageId, isSender, {
    onEveryone: deleteForEveryone,
    onMe: deleteForMe
  });
}

function latestVisibleServerMessage() {
  for (let i = chatState.messages.length - 1; i >= 0; i -= 1) {
    const msg = chatState.messages[i];
    if (msg && !String(msg.id).startsWith('temp-')) return msg;
  }
  return null;
}

function syncActiveChatPreviewFromMessages() {
  if (!chatState.activeChatId) return null;
  const latest = latestVisibleServerMessage();
  const summary = latest
    ? {
        last_message: latest.is_deleted ? '[deleted]' : (latest.plainContent || latest.content || ''),
        last_message_time: latest.created_at,
        last_message_deleted: !!latest.is_deleted
      }
    : {
        last_message: null,
        last_message_time: null,
        last_message_deleted: false
      };

  const chat = chatState.chats.find((c) => c.id === chatState.activeChatId);
  if (chat) Object.assign(chat, summary);
  if (chatState.activeChat) Object.assign(chatState.activeChat, summary);
  invalidateChatListCache(uiState);
  return { chatId: chatState.activeChatId, ...summary };
}

async function deleteForEveryone(messageId) {
  if (!chatState.activeChatId) return;
  try {
    const updated = await deleteMessageApi(chatState.activeChatId, messageId);
    const idx = chatState.messages.findIndex((m) => String(m.id) === String(messageId));
    if (idx !== -1) {
      chatState.messages[idx] = {
        ...chatState.messages[idx],
        ...updated,
        is_deleted: true,
        content: updated.content || '[deleted]',
        plainContent: undefined
      };
    }
    updateDeletedMessageInPlace(messageId);
    const summary = syncActiveChatPreviewFromMessages();
    await onMessageListChanged?.({ ...summary, messageId, scope: 'everyone' });
    showToast('Message deleted for everyone', 'success');
  } catch (err) {
    showToast(err.message || 'Could not delete message', 'error');
  }
}

async function deleteForMe(messageId) {
  if (!chatState.activeChatId) return;
  try {
    await hideMessageApi(chatState.activeChatId, messageId);
    chatState.messages = chatState.messages.filter((m) => String(m.id) !== String(messageId));
    removeMessageFromDom(messageId);
    const summary = syncActiveChatPreviewFromMessages();
    await onMessageListChanged?.({ ...summary, messageId, scope: 'me' });
    showToast('Message deleted for you', 'success');
  } catch (err) {
    showToast(err.message || 'Could not delete message', 'error');
  }
}

export function handleForward(messageId) {
  forwardMessageId = messageId;
  hideContextMenu();
  const msg = getMessageById(messageId);
  if (!msg || isMessageDeleted(msg)) return;
  openForwardModal(msg, forwardToChat);
}

export async function forwardToChat(targetChatId) {
  const msg = getMessageById(forwardMessageId);
  const sourceChatId = chatState.activeChatId;
  closeForwardModal();
  if (!msg || !sourceChatId) return;
  try {
    let content = msg.plainContent || msg.content;
    if (isE2eEncrypted(content)) {
      content = await decryptMessage(sourceChatId, content);
    }
    const body = content.startsWith('↪ ') ? content : `↪ ${content}`;
    await sendMessageApi(targetChatId, body);
    showToast('Message forwarded', 'success');
    invalidateChatListCache(uiState);
    forwardMessageId = null;
    await onForwardComplete?.(targetChatId);
    return targetChatId;
  } catch (err) {
    showToast(err.message || 'Forward failed', 'error');
    forwardMessageId = null;
    return null;
  }
}

export function initContextMenuDelegation() {
  const menu = $(SELECTORS.msgContextMenu);
  if (!menu || menu.dataset.delegation) return;
  menu.dataset.delegation = '1';
  menu.addEventListener('click', (e) => {
    const item = e.target.closest('.context-menu-item');
    if (!item || !contextMessageId) return;
    e.stopPropagation();
    const action = item.dataset.action;
    if (action === 'copy') handleCopy(contextMessageId);
    else if (action === 'reply') handleReply(contextMessageId);
    else if (action === 'react') handleReact(contextMessageId);
    else if (action === 'forward') handleForward(contextMessageId);
    else if (action === 'edit') handleEditMessage(contextMessageId);
    else if (action === 'delete') handleDeleteMessage(contextMessageId);
  });
}

export function resetMessageActions() {
  hideContextMenu();
  hideReactionPicker();
  cancelEdit();
  forwardMessageId = null;
  contextMessageId = null;
}
