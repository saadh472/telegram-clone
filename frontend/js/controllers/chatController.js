/** CONTROLLER — Chat and messaging orchestration. */
import {
  authState, chatState, uiState, connectionState, SELECTORS, EMOJIS, STICKERS,
  RECEIVER_VIEW_KEY, STATUS_DELIVERED_MS, VIEW_FLIP_MS, SEARCH_DEBOUNCE_MS,
  MAX_FILE_SIZE_BYTES, MAX_FILE_SIZE_LABEL, MAX_TEXT_LENGTH, MAX_MEDIA_BASE64_LENGTH
} from '../config.js';
import { $, $$, debounce, throttle, rafThrottle, showToast, confirmAction, invalidateChatListCache, formatStickerContent, formatPhotoContent, formatFileContent, formatVoiceContent, cachePhotoThumbnail, migratePhotoThumbnail, animateSendSuccess, updateTabBadge, updateSidebarBadge, chatsUnreadTotal, isMediaMessage, isPhotoMessage, getPhotoThumbnail, escapeHtml, userAvatarStyle, getInitials } from '../utils.js';
import {
  formatBackendUnreachable, checkBackendHealth, startHealthCheck, stopHealthCheck, updateOfflineBanner
} from '../models/apiModel.js';
import {
  fetchChats, fetchChatsCached, fetchUsers, fetchMessages, sendMessage as sendMessageApi,
  createPrivateChat, createGroupChat, setActiveChat, clearActiveChat, fetchMembers, addMemberToChat,
  getCachedChats, getChatsSync, scheduleDebouncedChatsRefresh, mergeMessages, mergeMessageDelta, postTyping, fetchTyping,
  sendHeartbeat, sendOfflineBeacon, editMessage as editMessageApi, resetChatModelState, chatsFingerprint
} from '../models/chatModel.js';
import {
  isE2eEnabledForChat, shouldShowE2eToast, markE2eToastShown,
  updateChatHeaderLock, decryptMessagesForChat
} from '../models/e2eCrypto.js';
import { togglePin, toggleMute, toggleArchive, getChatPref } from '../models/chatPrefs.js';
import {
  renderChatSkeleton, flashChatItem, renderChatList, renderChatHeader,
  showActiveChatPanel, hideActiveChatPanel, closeSidebarMobile,
  openNewChatModal, closeNewChatModal, showModalLoading, renderUserList, showModalError,
  focusUserListItem, selectFocusedUser, closeSettingsPanel, openSettingsPanel, toggleSettingsPanel,
  syncChatFilterTabs, updateChatItemSummary,
  openProfilePage, closeProfilePage, isProfileOpen, isSettingsOpen
} from '../views/chatListView.js';
import { renderUserInfo } from '../views/authView.js';
import {
  showMessagesSkeleton, showMessagesError, renderMessages, scrollToBottom,
  updateScrollFab, updateInputState, autoResizeInput, updateActionButton, updateComposeMeta,
  applyReceiverMode, isNearBottom, initMessageViewDelegation, syncE2eChatBanner,
  hideReplyBar, toggleEmojiPicker, initEmojiPicker, toggleStickerPicker, initStickerPicker,
  initAttachmentInput, initVoiceRecording, setInputAreaEnabled, initActionButton,
  promoteOptimisticMessage, initPickerPanel, hidePickerPanel, initComposeDropZone,
  showTypingIndicator, hideTypingIndicator, updateStatusesInPlace, updateChatListActiveState,
  updateMessageSearchMeta, focusMessageSearchResult, applyMessageSearchToRenderedRows
} from '../views/messageView.js';
import { openCallOverlay, initCallView } from '../views/callView.js';
import {
  initReactionPicker, setReactionSelectHandler, hideReactionPicker
} from '../views/reactionView.js';
import { migrateReactions, hydrateReactionsForChat, clearReactionsCache } from '../models/messageReactions.js';
import { closeForwardModal } from '../views/forwardView.js';
import { initDeleteModal, closeDeleteModal } from '../views/deleteMessageView.js';
import { openChatInfoPanel, closeChatInfoPanel, updatePinMuteButtons, toggleChatE2e, initGroupPermissionsDelegation } from '../views/chatInfoView.js';
import { initNavMenu, setNavMenuHandler, closeNavDropdown, updateNavActiveState } from '../views/navMenuView.js';
import {
  initNotificationsPanel, setNotificationClickHandler, updateNotificationBadge,
  openNotificationsPanel, closeNotificationsPanel, isNotificationsOpen
} from '../views/notificationsView.js';
import { initShortcutsPanel, openShortcutsPanel, closeShortcutsPanel, isShortcutsOpen } from '../views/shortcutsView.js';
import { initRouter, setRouterHandlers, navigate, syncRouteFromHash, clearRouteHash } from '../router.js';
import {
  showContextMenu, hideContextMenu, initContextMenuDelegation,
  handleReply, handleCopy, handleForward, handleDeleteMessage, resetMessageActions,
  handleReact, handleReactionToggle, startEditMessage, cancelEdit, saveEdit,
  setForwardCompleteHandler, setMessageListChangedHandler
} from './messageActions.js';
import { startPolling, stopPolling, destroyPolling } from './chatPolling.js';

const DRAFTS_KEY_PREFIX = 'telegram_chat_drafts_';
const MAX_DRAFTS = 50;
const MESSAGE_DELTA_FULL_SYNC_EVERY = 5;

async function pollTick() {
  if (chatState.activeChatId) {
    await loadMessages();
    await pollRemoteTyping();
  } else {
    await loadChats();
  }
}

let heartbeatInterval = null;
let connectivityListenersReady = false;
let chatListFocusIndex = -1;
let messageDeltaPolls = 0;

function draftsStorageKey() {
  return `${DRAFTS_KEY_PREFIX}${authState.user?.id || 'guest'}`;
}

function readDrafts() {
  try {
    return JSON.parse(localStorage.getItem(draftsStorageKey()) || '{}') || {};
  } catch {
    return {};
  }
}

function writeDrafts(drafts) {
  try {
    const entries = Object.entries(drafts).slice(-MAX_DRAFTS);
    localStorage.setItem(draftsStorageKey(), JSON.stringify(Object.fromEntries(entries)));
  } catch {
    /* draft persistence is a convenience; ignore quota/privacy failures */
  }
}

function saveActiveDraft() {
  if (!chatState.activeChatId || chatState.editingId) return;
  const input = $(SELECTORS.messageInput);
  if (!input) return;
  const drafts = readDrafts();
  const key = String(chatState.activeChatId);
  const value = input.value.slice(0, MAX_TEXT_LENGTH);
  if (value.trim()) drafts[key] = value;
  else delete drafts[key];
  writeDrafts(drafts);
}

function restoreDraft(chatId) {
  const input = $(SELECTORS.messageInput);
  if (!input || chatState.editingId) return;
  const draft = readDrafts()[String(chatId)] || '';
  input.value = draft;
  autoResizeInput();
  updateActionButton();
  updateComposeMeta();
}

function clearDraft(chatId = chatState.activeChatId) {
  if (!chatId) return;
  const drafts = readDrafts();
  delete drafts[String(chatId)];
  writeDrafts(drafts);
}

function visibleChatItems() {
  return $(`${SELECTORS.chatList}`) ? $$(`${SELECTORS.chatList} .chat-item`) : [];
}

function focusChatListItem(nextIndex) {
  const items = visibleChatItems();
  if (!items.length) return false;
  const index = Math.max(0, Math.min(nextIndex, items.length - 1));
  chatListFocusIndex = index;
  items.forEach((item, i) => item.classList.toggle('keyboard-focused', i === index));
  items[index].focus({ preventScroll: true });
  items[index].scrollIntoView({ block: 'nearest' });
  return true;
}

function moveChatListFocus(delta) {
  const items = visibleChatItems();
  if (!items.length) return false;
  const current = Math.max(0, items.findIndex((item) => item.classList.contains('keyboard-focused') || item === document.activeElement));
  const next = (current + delta + items.length) % items.length;
  return focusChatListItem(next);
}

function clearChatListKeyboardFocus() {
  chatListFocusIndex = -1;
  visibleChatItems().forEach((item) => item.classList.remove('keyboard-focused'));
}

function startPresenceHeartbeat() {
  stopPresenceHeartbeat();
  sendHeartbeat().catch(() => {});
  heartbeatInterval = setInterval(() => sendHeartbeat().catch(() => {}), 60000);
}

function stopPresenceHeartbeat() {
  if (heartbeatInterval) {
    clearInterval(heartbeatInterval);
    heartbeatInterval = null;
  }
}

async function pollRemoteTyping() {
  if (!chatState.activeChatId) return;
  try {
    const typers = await fetchTyping(chatState.activeChatId);
    if (typers?.length) {
      const names = typers.map((t) => t.display_name).join(', ');
      showTypingIndicator(names);
    } else {
      hideTypingIndicator();
    }
  } catch {
    /* ignore typing poll errors */
  }
}

const postTypingThrottled = throttle(() => {
  if (chatState.activeChatId && connectionState.online) {
    postTyping(chatState.activeChatId).catch(() => {});
  }
}, 2000);

export function primeChatsFromCache() {
  const cached = getChatsSync();
  if (!cached?.length) return false;
  chatState.chats = cached;
  renderChatList(uiState.chatSearchQuery, openChat);
  return true;
}

export function onShowApp() {
  primeChatsFromCache();
  loadReceiverViewPreference();
  setInputAreaEnabled(false);
  initPickerPanel();
  initEmojiPicker(EMOJIS, (emoji) => {
    const input = $(SELECTORS.messageInput);
    if (input) {
      input.value += emoji;
      autoResizeInput();
      updateActionButton();
      input.focus();
    }
    toggleEmojiPicker(false);
  });
  initStickerPicker(STICKERS, (sticker) => {
    hidePickerPanel();
    sendSticker(sticker);
  });
  initReactionPicker();
  setReactionSelectHandler(handleReactionToggle);
  initCallView();
  initNotificationsPanel();
  initShortcutsPanel();
  initRouter();
  setRouterHandlers({
    onChat: (chatId) => {
      if (chatState.activeChatId === chatId) return;
      const chat = chatState.chats.find((c) => c.id === chatId);
      if (chat) openChat(chatId, { fromRoute: true });
      else loadChats().then(() => openChat(chatId, { fromRoute: true }));
    },
    onSettings: () => { if (!isSettingsOpen()) openSettingsPanel({ fromRoute: true }); },
    onProfile: () => { if (!isProfileOpen()) openProfilePage({ from: 'sidebar', fromRoute: true }); },
    onNotifications: () => { if (!isNotificationsOpen()) openNotificationsPanel({ fromRoute: true }); },
    onHome: () => {
      if (chatState.activeChatId) {
        hideActiveChatPanel();
        clearActiveChat();
        hideReplyBar();
        cancelEdit();
        resetMessageActions();
        setInputAreaEnabled(false);
        loadChats();
      }
      closeSettingsPanel({ fromRoute: true });
      closeNotificationsPanel({ fromRoute: true });
      if (isProfileOpen()) closeProfilePage({ fromRoute: true });
    }
  });
  setNavMenuHandler(handleNavMenuAction);
  setNotificationClickHandler((chatId) => openChat(chatId));
  setMessageListChangedHandler(() => {
    if (!updateChatItemSummary(chatState.activeChat)) {
      renderChatList(uiState.chatSearchQuery, openChat, { force: true });
    }
    return loadChats(false, { silent: true });
  });
  initGroupPermissionsDelegation((perm, enabled) => {
    showToast(`${perm.replace(/_/g, ' ')} ${enabled ? 'enabled' : 'disabled'} (demo)`, 'info');
  });
  loadInitialAppData();
  startPolling(pollTick);
  startHealthCheck(uiState);
  startPresenceHeartbeat();
  updateNotificationBadge();
  syncRouteFromHash();
}

function handleNavMenuAction(action) {
  switch (action) {
    case 'profile':
      openProfilePage({ from: 'sidebar' });
      break;
    case 'notifications':
      openNotificationsPanel();
      break;
    case 'settings':
      openSettingsPanel();
      break;
    case 'new-chat':
      handleOpenNewChatModal();
      break;
    default:
      break;
  }
}

function buildActiveChatSummaryFromMessages() {
  if (!chatState.activeChatId) return null;
  const latest = latestActiveServerMessage();
  return latest
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
}

function applyLocalActiveSummary(chats) {
  if (!chatState.activeChatId || !chatState.messages.length) return chats;
  const summary = buildActiveChatSummaryFromMessages();
  if (!summary) return chats;
  return chats.map((chat) => (
    chat.id === chatState.activeChatId
      ? { ...chat, ...summary }
      : chat
  ));
}

async function loadInitialAppData() {
  const hadCache = primeChatsFromCache() || chatState.chats.length > 0;
  if (!hadCache) {
    uiState.chatsLoading = true;
    renderChatSkeleton();
  }

  try {
    await Promise.all([
      loadChats(false, { silent: true }),
      Promise.resolve(renderUserInfo())
    ]);
  } catch {
    if (!chatState.chats.length) renderChatList('', openChat);
  }
}

function applyChatsUpdate(chats) {
  const nextChats = applyLocalActiveSummary(chats);
  const fp = chatsFingerprint(nextChats);
  const listHasItems = !!$(SELECTORS.chatList)?.querySelector('.chat-item');

  if (uiState.lastChatListFingerprint?.startsWith(`${fp}|`) && listHasItems) {
    chatState.chats = nextChats;
    if (chatState.activeChatId) {
      chatState.activeChat = chatState.chats.find((c) => c.id === chatState.activeChatId) || chatState.activeChat;
    }
    updateChatListActiveState();
    return;
  }

  const prevUnread = new Map(chatState.chats.map((c) => [c.id, c.unread_count]));
  chatState.chats = nextChats;
  chatState.chats.forEach((c) => {
    const prev = prevUnread.get(c.id) ?? 0;
    const muted = getChatPref(c.id).muted;
    if (!muted && c.unread_count > prev && c.id !== chatState.activeChatId) flashChatItem(c.id);
  });
  if (chatState.activeChatId) {
    chatState.activeChat = chatState.chats.find((c) => c.id === chatState.activeChatId) || chatState.activeChat;
  }
  const unreadTotal = chatsUnreadTotal(nextChats);
  updateTabBadge(unreadTotal);
  updateSidebarBadge(unreadTotal);
  updateNotificationBadge();
  renderChatList(uiState.chatSearchQuery, openChat);
}

function debouncedLoadChats() {
  scheduleDebouncedChatsRefresh((chats) => applyChatsUpdate(chats));
}

function latestActiveServerMessage() {
  for (let i = chatState.messages.length - 1; i >= 0; i -= 1) {
    const msg = chatState.messages[i];
    if (msg && !String(msg.id).startsWith('temp-')) return msg;
  }
  return null;
}

function syncActiveChatSummaryFromMessages() {
  if (!chatState.activeChatId) return false;
  const next = buildActiveChatSummaryFromMessages();
  if (!next) return false;

  const chat = chatState.chats.find((c) => c.id === chatState.activeChatId);
  const changed = !!chat && (
    chat.last_message !== next.last_message
    || chat.last_message_time !== next.last_message_time
    || !!chat.last_message_deleted !== next.last_message_deleted
  );
  if (chat) Object.assign(chat, next);
  if (chatState.activeChat) Object.assign(chatState.activeChat, next);
  if (changed) invalidateChatListCache(uiState);
  return changed;
}

export function resetChatSession() {
  stopPolling();
  stopHealthCheck(uiState);
  stopPresenceHeartbeat();
  resetMessageActions();
  resetChatModelState();
  clearReactionsCache();
  hideActiveChatPanel();
  hideTypingIndicator();
  hideReplyBar();
  closeChatInfoPanel();
  closeForwardModal();
  closeNewChatModal();
  closeSettingsPanel({ fromRoute: true });
  closeNotificationsPanel({ fromRoute: true });
  closeShortcutsPanel();
  clearRouteHash();
  uiState.chatSearchQuery = '';
  uiState.chatsLoading = false;
  uiState.sending = false;
  uiState.newBelowCount = 0;
  uiState.lastChatListFingerprint = '';
  uiState.renderedChatId = null;
  uiState.renderedMessageIds = new Set();
  uiState.renderedMessageOrder = [];
  messageDeltaPolls = 0;
  const search = $(SELECTORS.searchInput);
  if (search) search.value = '';
  renderChatList('', () => {});
  updateTabBadge(0);
  updateSidebarBadge(0);
  setInputAreaEnabled(false);
}

export function onShowAuth() {
  resetChatSession();
}

export async function loadChats(showSkeleton = false, { silent = false } = {}) {
  if (!authState.token) return;

  const userId = authState.user?.id;
  const cached = userId ? getCachedChats(userId) : null;

  if (!silent && cached?.length && !showSkeleton) {
    chatState.chats = cached;
    renderChatList(uiState.chatSearchQuery, openChat);
  }

  if (showSkeleton && !cached?.length) {
    uiState.chatsLoading = true;
    renderChatSkeleton();
  }

  try {
    const { chats, fromCache } = silent
      ? { chats: await fetchChats(), fromCache: false }
      : await fetchChatsCached({
        background: !!cached?.length && !showSkeleton,
        onFresh: (fresh) => applyChatsUpdate(fresh)
      });

    if (fromCache && silent) return;

    applyChatsUpdate(chats);
  } catch (err) {
    if (err.status === 401) return;
    if (showSkeleton && !chatState.chats.length) renderChatList('', openChat);
    if (showSkeleton && !chatState.chats.length) {
      showToast(err.isNetworkError ? formatBackendUnreachable() : 'Could not load chats', 'error');
    }
  } finally {
    uiState.chatsLoading = false;
  }
}

export async function openChat(chatId, { fromRoute = false } = {}) {
  saveActiveDraft();
  setActiveChat(chatId);
  messageDeltaPolls = 0;
  uiState.newBelowCount = 0;
  uiState.userNearBottom = true;
  resetMessageActions();

  showActiveChatPanel();
  closeSidebarMobile();
  updateNavActiveState('');

  const chat = chatState.activeChat;
  if (!chat) return;

  if (!fromRoute) navigate({ name: 'chat', chatId }, { replace: false });

  renderChatHeader(chat);
  updateChatHeaderLock(chat);
  renderChatList(uiState.chatSearchQuery, openChat);
  setInputAreaEnabled(true);
  updateInputState();
  showMessagesSkeleton();
  await loadMessages(true);
  updateInputState();
  applyReceiverMode(uiState.receiverView);
  restoreDraft(chatId);
  $(SELECTORS.messageInput)?.focus();

  if (chat.type === 'group') {
    fetchMembers(chat.id).then((members) => {
      if (chatState.activeChatId === chat.id && members?.length) {
        chat.member_count = members.length;
        renderChatHeader(chat, members.length);
      }
    }).catch(() => {});
  } else {
    hideTypingIndicator();
  }
}

export async function loadOlderMessages() {
  if (!chatState.activeChatId || !chatState.hasMoreMessages || uiState.loadingOlder) return;
  uiState.loadingOlder = true;
  const container = $(SELECTORS.messagesContainer);
  const prevHeight = container?.scrollHeight || 0;
  const prevTop = container?.scrollTop || 0;
  try {
    const newOffset = Math.max(0, chatState.messageOffset - 50);
    const page = await fetchMessages(chatState.activeChatId, { offset: newOffset, limit: 50 });
    const existingIds = new Set(chatState.messages.map((m) => String(m.id)));
    const older = page.messages.filter((m) => !existingIds.has(String(m.id)));
    chatState.messages = [...older, ...chatState.messages];
    chatState.messageOffset = page.offset;
    chatState.messageTotal = page.total;
    chatState.hasMoreMessages = page.has_more;
    renderMessages({ full: true });
    requestAnimationFrame(() => {
      if (container) container.scrollTop = container.scrollHeight - prevHeight + prevTop;
    });
  } catch {
    showToast('Could not load older messages', 'error');
  } finally {
    uiState.loadingOlder = false;
  }
}

function lastServerMessageId() {
  for (let i = chatState.messages.length - 1; i >= 0; i -= 1) {
    const id = chatState.messages[i]?.id;
    if (id != null && !String(id).startsWith('temp-')) return id;
  }
  return null;
}

export async function loadMessages(initial = false) {
  if (!chatState.activeChatId || !authState.token) return;

  const prevLen = chatState.messages.length;
  const prevLastId = chatState.messages[chatState.messages.length - 1]?.id;
  const sinceId = lastServerMessageId();
  const useDelta = !initial
    && sinceId != null
    && chatState.messages.length > 0
    && messageDeltaPolls < MESSAGE_DELTA_FULL_SYNC_EVERY;

  try {
    const page = await fetchMessages(chatState.activeChatId, useDelta ? { sinceId } : {});
    const preserveLoadedHistory = !initial && chatState.messages.length > page.messages.length;
    const { messages: merged, changed } = page.delta || preserveLoadedHistory
      ? mergeMessageDelta(chatState.messages, page.messages, authState.user?.id)
      : mergeMessages(chatState.messages, page.messages, authState.user?.id);
    const hadNew = merged.length > prevLen && merged[merged.length - 1]?.id !== prevLastId;
    const lastIncoming = merged[merged.length - 1];
    const isNewFromOther = hadNew && lastIncoming?.sender_id !== authState.user?.id;

    chatState.messages = merged;
    const activeSummaryChanged = syncActiveChatSummaryFromMessages();
    chatState.messageTotal = page.total ?? merged.length;
    if (page.delta) {
      messageDeltaPolls += 1;
    } else {
      chatState.messageOffset = page.offset;
      chatState.hasMoreMessages = page.has_more;
      messageDeltaPolls = 0;
    }

    merged.forEach((m) => {
      if (m.sender_id !== authState.user?.id) return;
      const meta = chatState.messageMeta[m.id];
      if (meta?.failed || meta?.status === 'sending') return;
      if (m.is_read) {
        chatState.messageMeta[m.id] = { status: 'read' };
      } else if (!meta) {
        chatState.messageMeta[m.id] = { status: 'delivered' };
      }
    });

    if (initial) chatState.lastReadCount = merged.length;
    if (initial || hadNew || changed) {
      await hydrateReactionsForChat(chatState.activeChatId);
    }
    renderMessages({
      highlightNew: isNewFromOther && !uiState.userNearBottom,
      full: initial || (!page.delta && changed)
    });
    updateScrollFab();
    updateLoadMoreButton();
    if (activeSummaryChanged) {
      updateChatItemSummary(chatState.activeChat);
    }
    if (!initial && (hadNew || changed)) debouncedLoadChats();
  } catch (err) {
    if (err.status === 401) return;
    if (initial) showMessagesError(() => loadMessages(true));
  }
}

function updateLoadMoreButton() {
  const btn = $(SELECTORS.loadMoreBtn);
  if (!btn) return;
  btn.classList.toggle('hidden', !chatState.hasMoreMessages);
}

async function retryFailedMessage(messageId) {
  const id = String(messageId);
  const msg = chatState.messages.find((m) => String(m.id) === id);
  if (!msg || !chatState.messageMeta[id]?.failed) return;
  const content = msg.plainContent || msg.content;
  if (!content) {
    showToast('Cannot retry — message data missing', 'error');
    return;
  }
  const options = {};
  if (isPhotoMessage(content)) {
    const thumb = getPhotoThumbnail(msg.id, content);
    if (thumb) options.photoThumbnail = thumb;
  }
  chatState.messages = chatState.messages.filter((m) => String(m.id) !== id);
  delete chatState.messageMeta[id];
  renderMessages({ full: true });
  await sendMessage(content, options);
}

export async function sendMessage(contentOverride, options = {}) {
  if (chatState.editingId && !contentOverride) {
    return saveEdit();
  }
  if (uiState.sending) return false;
  const input = $(SELECTORS.messageInput);
  const content = (contentOverride ?? input?.value)?.trim();
  if (!content || !chatState.activeChatId) return false;
  if (content.length > MAX_TEXT_LENGTH && !content.startsWith('[photo] ')
    && !content.startsWith('[file] ') && !content.startsWith('[voice] ')
    && !content.startsWith('[sticker] ')) {
    showToast(`Message is too long (max ${MAX_TEXT_LENGTH.toLocaleString()} characters)`, 'error');
    return false;
  }
  if ((content.startsWith('[photo] ') || content.startsWith('[file] ') || content.startsWith('[voice] '))
    && content.length > MAX_MEDIA_BASE64_LENGTH) {
    showToast(`Media message is too large (max ${MAX_FILE_SIZE_LABEL})`, 'error');
    return false;
  }
  if (!connectionState.online) {
    showToast('You are offline. Message not sent.', 'error');
    return false;
  }

  const { photoThumbnail } = options;
  const replyToId = chatState.replyTo?.id || null;
  const tempId = `temp-${Date.now()}`;
  if (photoThumbnail) cachePhotoThumbnail(tempId, photoThumbnail);
  const optimistic = {
    id: tempId,
    content,
    plainContent: content,
    created_at: new Date().toISOString(),
    sender_id: authState.user.id,
    sender_name: authState.user.display_name,
    sender_color: authState.user.avatar_color,
    reply_to_content: chatState.replyTo?.content,
    reply_to_sender: chatState.replyTo?.sender_name,
    e2e: isE2eEnabledForChat(chatState.activeChat)
  };

  uiState.sending = true;
  updateInputState();
  chatState.messages.push(optimistic);
  chatState.messageMeta[tempId] = { status: 'sending' };
  if (!contentOverride && input) {
    input.value = '';
    clearDraft(chatState.activeChatId);
    autoResizeInput();
    updateActionButton();
    updateComposeMeta();
  }
  hideReplyBar();
  renderMessages();
  requestAnimationFrame(() => scrollToBottom());

  try {
    const encrypting = isE2eEnabledForChat(chatState.activeChat) && !isMediaMessage(content);

    if (encrypting && shouldShowE2eToast(chatState.activeChatId)) {
      markE2eToastShown(chatState.activeChatId);
      showToast('Demo E2E: message encrypted client-side (AES demo, not Signal)', 'success');
    }

    const rawMsg = await sendMessageApi(chatState.activeChatId, content, replyToId);
    const [msg] = await decryptMessagesForChat(chatState.activeChatId, [rawMsg]);
    const idx = chatState.messages.findIndex((m) => m.id === tempId);
    if (idx !== -1) {
      chatState.messages[idx] = { ...msg, plainContent: content, e2e: encrypting };
    }
    delete chatState.messageMeta[tempId];
    chatState.messageMeta[msg.id] = { status: 'sent' };
    migrateReactions(tempId, msg.id);
    migratePhotoThumbnail(tempId, msg.id);
    promoteOptimisticMessage(tempId, msg);
    renderMessages();
    animateSendSuccess($(`.msg-row[data-id="${msg.id}"]`));
    setTimeout(() => {
      chatState.messageMeta[msg.id] = { status: 'delivered' };
      updateStatusesInPlace();
    }, STATUS_DELIVERED_MS);
    invalidateChatListCache(uiState);
    debouncedLoadChats();
    return true;
  } catch (err) {
    const errorMsg = err.isNetworkError ? formatBackendUnreachable() : (err.message || 'Send failed');
    chatState.messageMeta[tempId] = { status: 'failed', failed: true, error: errorMsg };
    renderMessages();
    showToast(errorMsg, 'error');
    return false;
  } finally {
    uiState.sending = false;
    updateInputState();
    input?.focus();
  }
}

export async function sendSticker(stickerEmoji) {
  if (!stickerEmoji || uiState.sending) return;
  await sendMessage(formatStickerContent(stickerEmoji));
}

async function handleFileAttachment(file) {
  if (!file) return;
  if (!chatState.activeChatId) {
    showToast('Select a chat before attaching a file', 'info');
    return;
  }
  if (uiState.sending) {
    showToast('Please wait — message still sending', 'info');
    return;
  }

  if (file.size > MAX_FILE_SIZE_BYTES) {
    showToast(`File too large (max ${MAX_FILE_SIZE_LABEL})`, 'error');
    return;
  }

  const isImage = file.type.startsWith('image/');
  const filename = file.name || (isImage ? 'Photo' : 'File');
  const estimatedPayload = Math.ceil(file.size * 1.37) + filename.length + 16;
  if (estimatedPayload > MAX_MEDIA_BASE64_LENGTH) {
    showToast(`File is too large to send (max ${MAX_FILE_SIZE_LABEL})`, 'error');
    return;
  }

  const reader = new FileReader();
  reader.onload = async () => {
    const dataUrl = reader.result;
    if (!dataUrl || typeof dataUrl !== 'string') {
      showToast('Could not read file', 'error');
      return;
    }
    const content = isImage
      ? formatPhotoContent(filename, dataUrl)
      : formatFileContent(filename, dataUrl);
    const ok = await sendMessage(content, isImage ? { photoThumbnail: dataUrl } : {});
    if (ok) {
      showToast(isImage ? 'Photo sent' : 'File sent', 'success');
    }
  };
  reader.onerror = () => showToast('Could not read file', 'error');
  reader.readAsDataURL(file);
}

async function handleVoiceMessage(durationSeconds, audioDataUrl) {
  if (!durationSeconds || uiState.sending) return;
  const content = formatVoiceContent(durationSeconds, audioDataUrl || null);
  const ok = await sendMessage(content);
  if (ok) showToast('Voice message sent', 'success');
}

function toggleReceiverView() {
  uiState.receiverView = !uiState.receiverView;
  sessionStorage.setItem(RECEIVER_VIEW_KEY, uiState.receiverView ? '1' : '0');
  applyReceiverMode(uiState.receiverView);
  const container = $(SELECTORS.messagesContainer);
  container?.classList.add('view-flip');
  setTimeout(() => container?.classList.remove('view-flip'), VIEW_FLIP_MS);
}

function loadReceiverViewPreference() {
  uiState.receiverView = sessionStorage.getItem(RECEIVER_VIEW_KEY) === '1';
  applyReceiverMode(uiState.receiverView);
}

export async function handleOpenNewChatModal() {
  uiState.userListMode = 'newChat';
  addMemberChatId = null;
  openNewChatModal();
  $('#modal-title').textContent = 'New Chat';
  const modeBtn = $('#new-group-btn');
  if (modeBtn) {
    modeBtn.textContent = 'New Group';
    modeBtn.title = 'Create group';
    modeBtn.setAttribute('aria-label', 'Create group');
    modeBtn.classList.remove('hidden');
  }
  $('#new-chat-tabs')?.classList.add('hidden');
  $('#group-name-input') && ($('#group-name-input').value = '');
  updateGroupCreateState();
  uiState.userListFocusIndex = -1;
  const search = $(SELECTORS.userSearch);
  if (search) search.value = '';
  showModalLoading();
  try {
    chatState.users = await fetchUsers();
    renderUserList('', startPrivateChat);
  } catch (err) {
    showModalError(err.isNetworkError ? formatBackendUnreachable() : err.message);
  }
  search?.focus();
}

async function startPrivateChat(userId) {
  try {
    const chat = await createPrivateChat(userId);
    closeNewChatModal();
    invalidateChatListCache(uiState);
    await loadChats();
    openChat(chat.id);
    showToast('Chat started', 'success');
  } catch (err) {
    showToast(err.isNetworkError ? formatBackendUnreachable() : err.message, 'error');
  }
}

async function openChatInfo() {
  const chat = chatState.activeChat;
  if (!chat) return;
  try {
    const members = chat.type === 'group' ? await fetchMembers(chat.id) : [];
    openChatInfoPanel(chat, members);
  } catch {
    openChatInfoPanel(chat, []);
  }
}

let addMemberChatId = null;
let groupSelectedIds = [];

function userListSelectHandler() {
  return uiState.userListMode === 'addMember' ? addMemberToGroup : startPrivateChat;
}

async function openAddMemberModal() {
  const chat = chatState.activeChat;
  if (!chat || chat.type !== 'group') return;
  uiState.userListMode = 'addMember';
  addMemberChatId = chat.id;
  openNewChatModal();
  $('#modal-title').textContent = 'Add Member';
  $('#new-group-btn')?.classList.add('hidden');
  $('#new-chat-tabs')?.classList.add('hidden');
  uiState.userListFocusIndex = -1;
  const search = $(SELECTORS.userSearch);
  if (search) search.value = '';
  showModalLoading();
  try {
    const [users, members] = await Promise.all([fetchUsers(), fetchMembers(chat.id)]);
    const memberIds = new Set(members.map((m) => m.id));
    chatState.users = users.filter((u) => !memberIds.has(u.id));
    renderUserList('', addMemberToGroup);
  } catch (err) {
    showModalError(err.isNetworkError ? formatBackendUnreachable() : err.message);
  }
  search?.focus();
}

async function addMemberToGroup(userId) {
  const chatId = addMemberChatId || chatState.activeChatId;
  if (!chatId) return;
  try {
    await addMemberToChat(chatId, userId);
    addMemberChatId = null;
    closeNewChatModal();
    showToast('Member added', 'success');
    invalidateChatListCache(uiState);
    await loadChats(false, { silent: true });
    if (chatState.activeChat?.type === 'group') {
      const members = await fetchMembers(chatState.activeChatId);
      chatState.activeChat.member_count = members.length;
      renderChatHeader(chatState.activeChat, members.length);
      openChatInfoPanel(chatState.activeChat, members);
    }
  } catch (err) {
    showToast(err.isNetworkError ? formatBackendUnreachable() : err.message, 'error');
  }
}

export function initChatController() {
  initNavMenu();
  setForwardCompleteHandler((chatId) => openChat(chatId));
  initMessageViewDelegation({
    onContextMenu: showContextMenu,
    onReply: handleReply,
    onCopy: handleCopy,
    onForward: handleForward,
    onDelete: handleDeleteMessage,
    onEdit: startEditMessage,
    onRetry: retryFailedMessage,
    onReact: handleReact,
    onReactionToggle: handleReactionToggle
  });
  initContextMenuDelegation();

  $(SELECTORS.backBtn)?.addEventListener('click', () => {
    saveActiveDraft();
    hideActiveChatPanel();
    clearActiveChat();
    hideReplyBar();
    cancelEdit();
    resetMessageActions();
    setInputAreaEnabled(false);
    loadChats();
    navigate({ name: 'home' }, { replace: false });
  });

  $(SELECTORS.sidebarOverlay)?.addEventListener('click', closeSidebarMobile);
  $$(SELECTORS.viewToggleBtn).forEach((btn) => btn.addEventListener('click', toggleReceiverView));

  const input = $(SELECTORS.messageInput);

  input?.addEventListener('input', () => {
    autoResizeInput();
    updateActionButton();
    saveActiveDraft();
    postTypingThrottled();
  });

  input?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      if (input.value.trim() && !uiState.sending) {
        if (chatState.editingId) saveEdit();
        else sendMessage();
      }
    }
    if (e.key === 'Escape') {
      if (chatState.editingId) cancelEdit();
      else hideReplyBar();
    }
  });

  $(SELECTORS.messagesContainer)?.addEventListener('scroll', rafThrottle((e) => {
    const container = e.target;
    uiState.userNearBottom = isNearBottom(container);
    if (uiState.userNearBottom) {
      uiState.newBelowCount = 0;
      chatState.lastReadCount = chatState.messages.length;
    } else {
      const scrollRange = Math.max(1, container.scrollHeight - container.clientHeight);
      const ratio = container.scrollTop / scrollRange;
      const unseen = Math.ceil((1 - ratio) * chatState.messages.length);
      chatState.lastReadCount = Math.max(
        chatState.lastReadCount,
        Math.min(chatState.messages.length, chatState.messages.length - unseen)
      );
    }
    updateScrollFab();
  }), { passive: true });

  $(SELECTORS.messagesContainer)?.addEventListener('click', (e) => {
    if (e.target.closest('#load-more-messages-btn')) {
      loadOlderMessages();
      return;
    }
    const isReactionControl = e.target.closest(
      '.msg-bubble-react-btn, .msg-hover-btn[data-action="react"], .reaction-chip'
    );
    hideContextMenu();
    if (!isReactionControl) hideReactionPicker();
    toggleEmojiPicker(false);
    toggleStickerPicker(false);
  });

  $(SELECTORS.scrollBottomBtn)?.addEventListener('click', () => scrollToBottom());
  $(SELECTORS.searchInput)?.addEventListener('input', debounce((e) => {
    clearChatListKeyboardFocus();
    renderChatList(e.target.value, openChat);
  }, SEARCH_DEBOUNCE_MS));
  $(SELECTORS.searchInput)?.addEventListener('keydown', (e) => {
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusChatListItem(0);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      const items = visibleChatItems();
      focusChatListItem(Math.max(0, items.length - 1));
    } else if (e.key === 'Enter') {
      const items = visibleChatItems();
      if (items.length === 1) {
        e.preventDefault();
        items[0].click();
      }
    } else if (e.key === 'Escape') {
      clearChatListKeyboardFocus();
    }
  });
  $(SELECTORS.searchClearBtn)?.addEventListener('click', () => {
    const search = $(SELECTORS.searchInput);
    if (search) search.value = '';
    renderChatList('', openChat, { force: true });
    clearChatListKeyboardFocus();
    search?.focus();
  });
  $(SELECTORS.chatFilterTabs)?.addEventListener('click', (e) => {
    const btn = e.target.closest('.chat-filter-tab');
    if (!btn) return;
    uiState.chatFilter = btn.dataset.filter || 'all';
    syncChatFilterTabs();
    renderChatList(uiState.chatSearchQuery, openChat, { force: true });
  });
  $(SELECTORS.chatFilterTabs)?.addEventListener('keydown', (e) => {
    if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(e.key)) return;
    const tabs = $$('#chat-filter-tabs .chat-filter-tab');
    if (!tabs.length) return;
    e.preventDefault();
    const current = Math.max(0, tabs.findIndex((tab) => tab.classList.contains('active')));
    const next = e.key === 'Home'
      ? 0
      : e.key === 'End'
        ? tabs.length - 1
        : (current + (e.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus();
    tabs[next].click();
  });
  $(SELECTORS.chatList)?.addEventListener('click', (e) => {
    clearChatListKeyboardFocus();
    const action = e.target.closest('[data-sidebar-action]')?.dataset.sidebarAction;
    if (action === 'new-chat') {
      if (uiState.chatFilter === 'groups') openGroupChatModal();
      else handleOpenNewChatModal();
    } else if (action === 'clear-search') {
      const search = $(SELECTORS.searchInput);
      if (search) search.value = '';
      clearChatListKeyboardFocus();
      renderChatList('', openChat, { force: true });
      search?.focus();
    }
  });
  $(SELECTORS.newChatBtn)?.addEventListener('click', handleOpenNewChatModal);
  $(SELECTORS.emptyNewChatBtn)?.addEventListener('click', handleOpenNewChatModal);
  $(SELECTORS.emptyShortcutsBtn)?.addEventListener('click', () => openShortcutsPanel());
  $('#settings-new-chat-btn')?.addEventListener('click', () => {
    closeSettingsPanel({ fromRoute: true });
    handleOpenNewChatModal();
  });
  $(SELECTORS.chatList)?.addEventListener('keydown', (e) => {
    if (!e.target.closest('.chat-item')) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      moveChatListFocus(1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      moveChatListFocus(-1);
    } else if (e.key === 'Home') {
      e.preventDefault();
      focusChatListItem(0);
    } else if (e.key === 'End') {
      e.preventDefault();
      const items = visibleChatItems();
      focusChatListItem(Math.max(0, items.length - 1));
    } else if (e.key === 'Escape') {
      e.preventDefault();
      clearChatListKeyboardFocus();
      $(SELECTORS.searchInput)?.focus();
    }
  });
  $('#settings-shortcuts-btn')?.addEventListener('click', () => {
    closeSettingsPanel({ fromRoute: true });
    openShortcutsPanel();
  });
  $('#close-modal-btn')?.addEventListener('click', () => {
    addMemberChatId = null;
    uiState.userListMode = 'newChat';
    closeNewChatModal();
  });
  $('.modal-backdrop')?.addEventListener('click', () => {
    addMemberChatId = null;
    uiState.userListMode = 'newChat';
    closeNewChatModal();
  });
  $(SELECTORS.userSearch)?.addEventListener('input', debounce((e) => {
    uiState.userListFocusIndex = -1;
    if (uiState.userListMode === 'newGroup') {
      groupSelectedIds = $$('#user-list input[type=checkbox]:checked').map((el) => Number(el.value));
      renderGroupUserList(e.target.value, groupSelectedIds);
    } else {
      renderUserList(e.target.value, userListSelectHandler());
    }
  }, SEARCH_DEBOUNCE_MS));

  $(SELECTORS.userSearch)?.addEventListener('keydown', (e) => {
    const items = $$(`${SELECTORS.userList} .user-item`);
    if (!items.length) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      focusUserListItem(uiState.userListFocusIndex + 1);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusUserListItem(Math.max(0, uiState.userListFocusIndex - 1));
    } else if (e.key === 'Enter') {
      e.preventDefault();
      selectFocusedUser();
    }
  });

  $(SELECTORS.userList)?.addEventListener('click', (e) => {
    if (!e.target.closest('[data-modal-retry]')) return;
    if (uiState.userListMode === 'newGroup') openGroupChatModal();
    else if (uiState.userListMode === 'addMember') openAddMemberModal();
    else handleOpenNewChatModal();
  });

  $$('[data-close="forward-modal"]').forEach((el) => {
    el.addEventListener('click', closeForwardModal);
  });

  initDeleteModal();

  document.addEventListener('click', (e) => {
    if (!e.target.closest(SELECTORS.msgContextMenu) && !e.target.closest('.msg-row')) {
      hideContextMenu();
    }
    if (!e.target.closest(SELECTORS.reactionPicker)
      && !e.target.closest('.msg-bubble-react-btn')
      && !e.target.closest('.msg-hover-btn[data-action="react"]')
      && !e.target.closest('.reaction-chip')
      && !e.target.closest(`${SELECTORS.msgContextMenu} .context-menu-item[data-action="react"]`)) {
      hideReactionPicker();
    }
    if (!e.target.closest(SELECTORS.emojiPicker) && !e.target.closest(SELECTORS.emojiBtn)
      && !e.target.closest(SELECTORS.stickerPicker) && !e.target.closest(SELECTORS.stickerBtn)
      && !e.target.closest(SELECTORS.pickerPanel)) {
      hidePickerPanel();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
      if (isShortcutsOpen()) { closeShortcutsPanel(); return; }
      hideContextMenu();
      closeNewChatModal();
      closeForwardModal();
      closeDeleteModal();
      closeChatInfoPanel();
      closeNotificationsPanel();
      closeNavDropdown();
      hidePickerPanel();
      hideReactionPicker();
      hideReplyBar();
      if (isProfileOpen()) closeProfilePage();
      else closeSettingsPanel();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
      e.preventDefault();
      const search = $(SELECTORS.searchInput);
      if (search && !$('#app')?.classList.contains('hidden')) {
        search.focus();
        search.select();
      }
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'f') {
      if ($('#app')?.classList.contains('hidden') || !chatState.activeChatId) return;
      e.preventDefault();
      const bar = $(SELECTORS.chatSearchBar);
      bar?.classList.remove('hidden');
      $('#chat-search-btn')?.setAttribute('aria-expanded', 'true');
      const inputEl = $(SELECTORS.chatSearchInput);
      inputEl?.focus();
      inputEl?.select();
      updateMessageSearchMeta();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === 'n') {
      e.preventDefault();
      if (!$('#app')?.classList.contains('hidden')) handleOpenNewChatModal();
    }
    if ((e.ctrlKey || e.metaKey) && e.key === '/') {
      e.preventDefault();
      if (!$('#app')?.classList.contains('hidden')) openShortcutsPanel();
    }
  });

  $('#notifications-btn')?.addEventListener('click', () => openNotificationsPanel());
  $('#user-profile-btn')?.addEventListener('click', () => openProfilePage({ from: 'sidebar' }));
  $('#close-settings-btn')?.addEventListener('click', closeSettingsPanel);
  $('#settings-backdrop')?.addEventListener('click', closeSettingsPanel);

  $(SELECTORS.chatHeaderInfo)?.addEventListener('click', openChatInfo);
  $(SELECTORS.chatHeaderInfo)?.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openChatInfo(); }
  });
  $(SELECTORS.closeChatInfoBtn)?.addEventListener('click', closeChatInfoPanel);
  $(SELECTORS.chatInfoBackdrop)?.addEventListener('click', closeChatInfoPanel);

  $(SELECTORS.chatInfoPinBtn)?.addEventListener('click', () => {
    if (!chatState.activeChatId) return;
    togglePin(chatState.activeChatId);
    updatePinMuteButtons(chatState.activeChatId);
    renderChatList(uiState.chatSearchQuery, openChat, { force: true });
    showToast('Chat pin updated', 'success');
  });

  $(SELECTORS.chatInfoMuteBtn)?.addEventListener('click', () => {
    if (!chatState.activeChatId) return;
    toggleMute(chatState.activeChatId);
    updatePinMuteButtons(chatState.activeChatId);
    renderChatList(uiState.chatSearchQuery, openChat, { force: true });
    showToast(getChatPref(chatState.activeChatId).muted ? 'Notifications muted' : 'Notifications on', 'info');
  });

  $('#chat-info-archive-btn')?.addEventListener('click', () => {
    if (!chatState.activeChatId) return;
    const chatId = chatState.activeChatId;
    const archived = toggleArchive(chatId);
    closeChatInfoPanel();
    hideActiveChatPanel();
    clearActiveChat();
    renderChatList(uiState.chatSearchQuery, openChat, { force: true });
    showToast(archived ? 'Chat archived' : 'Chat unarchived', 'info');
  });

  $('#chat-info-e2e-btn')?.addEventListener('click', () => {
    if (!chatState.activeChat) return;
    const enabled = toggleChatE2e(chatState.activeChat);
    updateChatHeaderLock(chatState.activeChat);
    syncE2eChatBanner();
    renderChatList(uiState.chatSearchQuery, openChat, { force: true });
    showToast(
      enabled ? 'End-to-end encryption enabled' : 'Encryption disabled for this chat',
      enabled ? 'success' : 'info'
    );
  });

  $('#chat-info-add-member-btn')?.addEventListener('click', () => {
    openAddMemberModal();
  });

  $(SELECTORS.cancelReplyBtn)?.addEventListener('click', hideReplyBar);
  $(SELECTORS.cancelEditBtn)?.addEventListener('click', cancelEdit);

  initAttachmentInput(handleFileAttachment);
  initComposeDropZone(handleFileAttachment);
  initVoiceRecording(handleVoiceMessage);
  initActionButton(() => {
    if (chatState.editingId) saveEdit();
    else sendMessage();
  });

  $(SELECTORS.emojiBtn)?.addEventListener('click', (e) => {
    e.stopPropagation();
    const panel = $(SELECTORS.pickerPanel);
    if (panel?.classList.contains('hidden')) toggleEmojiPicker(true);
    else hidePickerPanel();
  });

  $(SELECTORS.stickerBtn)?.addEventListener('click', (e) => {
    e.stopPropagation();
    const panel = $(SELECTORS.pickerPanel);
    if (panel?.classList.contains('hidden')) toggleStickerPicker(true);
    else hidePickerPanel();
  });
  $(SELECTORS.voiceCallBtn)?.addEventListener('click', () => openCallOverlay('voice'));
  $(SELECTORS.videoCallBtn)?.addEventListener('click', () => openCallOverlay('video'));
  $('#chat-info-voice-call-btn')?.addEventListener('click', () => openCallOverlay('voice'));
  $('#chat-info-video-call-btn')?.addEventListener('click', () => openCallOverlay('video'));
  $('#chat-search-btn')?.addEventListener('click', () => {
    const bar = $(SELECTORS.chatSearchBar);
    const opening = bar?.classList.contains('hidden');
    bar?.classList.toggle('hidden');
    $('#chat-search-btn')?.setAttribute('aria-expanded', opening ? 'true' : 'false');
    if (bar && !bar.classList.contains('hidden')) {
      $(SELECTORS.chatSearchInput)?.focus();
      updateMessageSearchMeta();
    } else {
      chatState.messageSearch = '';
      chatState.messageSearchIndex = -1;
      applyMessageSearchToRenderedRows({ focus: false });
    }
  });

  $(SELECTORS.chatSearchCloseBtn)?.addEventListener('click', () => {
    const inputEl = $(SELECTORS.chatSearchInput);
    inputEl && (inputEl.value = '');
    chatState.messageSearch = '';
    chatState.messageSearchIndex = -1;
    $(SELECTORS.chatSearchBar)?.classList.add('hidden');
    $('#chat-search-btn')?.setAttribute('aria-expanded', 'false');
    applyMessageSearchToRenderedRows({ focus: false });
    $('#chat-search-btn')?.focus();
  });

  $(SELECTORS.chatSearchInput)?.addEventListener('input', debounce((e) => {
    chatState.messageSearch = e.target.value.trim().toLowerCase();
    chatState.messageSearchIndex = -1;
    applyMessageSearchToRenderedRows({ focus: true });
  }, SEARCH_DEBOUNCE_MS));

  $(SELECTORS.chatSearchInput)?.addEventListener('keydown', (e) => {
    if (e.key !== 'Enter') return;
    e.preventDefault();
    focusMessageSearchResult(e.shiftKey ? -1 : 1);
  });

  $(SELECTORS.chatSearchPrevBtn)?.addEventListener('click', () => focusMessageSearchResult(-1));
  $(SELECTORS.chatSearchNextBtn)?.addEventListener('click', () => focusMessageSearchResult(1));

  $(SELECTORS.loadMoreBtn)?.addEventListener('click', () => loadOlderMessages());

  $('#group-name-input')?.addEventListener('input', () => updateGroupCreateState());
  $('#new-group-btn')?.addEventListener('click', () => {
    if (uiState.userListMode === 'newGroup') handleOpenNewChatModal();
    else openGroupChatModal();
  });
  $('#create-group-btn')?.addEventListener('click', () => createGroupFromModal());

  updateInputState();
  updateActionButton();
  updateComposeMeta();
}

export function initConnectivityListeners() {
  if (connectivityListenersReady) return;
  connectivityListenersReady = true;
  window.addEventListener('online', () => {
    connectionState.online = true;
    updateOfflineBanner();
    checkBackendHealth(true);
    if (authState.token) showToast('Back online', 'success');
  });
  window.addEventListener('offline', () => {
    connectionState.online = false;
    updateOfflineBanner();
    updateInputState();
    showToast('You are offline', 'error');
  });
  window.addEventListener('beforeunload', () => {
    sendOfflineBeacon();
    destroyPolling();
    stopHealthCheck(uiState);
    stopPresenceHeartbeat();
  });
}

async function openGroupChatModal() {
  uiState.userListMode = 'newGroup';
  groupSelectedIds = [];
  openNewChatModal();
  $('#modal-title').textContent = 'New Group';
  const modeBtn = $('#new-group-btn');
  if (modeBtn) {
    modeBtn.textContent = 'Contacts';
    modeBtn.title = 'Back to contacts';
    modeBtn.setAttribute('aria-label', 'Back to contacts');
    modeBtn.classList.remove('hidden');
  }
  $('#new-chat-tabs')?.classList.remove('hidden');
  $('#group-name-input') && ($('#group-name-input').value = '');
  const search = $(SELECTORS.userSearch);
  if (search) search.value = '';
  showModalLoading();
  try {
    chatState.users = await fetchUsers();
    renderGroupUserList('', groupSelectedIds);
  } catch (err) {
    showModalError(err.isNetworkError ? formatBackendUnreachable() : err.message);
  }
  search?.focus();
}

function updateGroupCreateState() {
  const name = $('#group-name-input')?.value.trim() || '';
  groupSelectedIds = $$('#user-list input[type=checkbox]:checked').map((el) => Number(el.value));
  const btn = $('#create-group-btn');
  const meta = $('#group-create-meta');
  const selectedCount = groupSelectedIds.length;
  if (btn) {
    btn.disabled = !name || selectedCount < 1;
    btn.textContent = selectedCount > 0 ? `Create (${selectedCount})` : 'Create Group';
  }
  if (meta) {
    if (!name && selectedCount < 1) meta.textContent = 'Name the group and select at least one contact.';
    else if (!name) meta.textContent = `${selectedCount} selected. Add a group name to continue.`;
    else if (selectedCount < 1) meta.textContent = 'Select at least one contact to continue.';
    else meta.textContent = `${selectedCount} member${selectedCount === 1 ? '' : 's'} selected. Ready to create.`;
  }
}

function renderGroupUserList(query, selectedIds) {
  const list = $(SELECTORS.userList);
  if (!list) return;
  const q = query.trim().toLowerCase();
  const filtered = chatState.users.filter((u) =>
    u.display_name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)
  );
  if (!filtered.length) {
    list.innerHTML = q
      ? `<p class="empty-hint">No contacts match "${escapeHtml(q)}"</p>`
      : '<p class="empty-hint">No users found</p>';
    return;
  }
  list.innerHTML = filtered.map((u) => {
    const checked = selectedIds.includes(u.id) ? ' checked' : '';
    return `<label class="user-item group-user-item">
      <input class="group-user-checkbox" type="checkbox" value="${u.id}"${checked}>
      <span class="group-user-check" aria-hidden="true"></span>
      <span class="avatar xs" style="background:${userAvatarStyle(u)}">${getInitials(u.display_name)}</span>
      <span class="group-user-text"><span>${escapeHtml(u.display_name)}</span><small>@${escapeHtml(u.username)}</small></span>
    </label>`;
  }).join('');
  list.querySelectorAll('input[type=checkbox]').forEach((cb) => {
    cb.addEventListener('change', () => {
      groupSelectedIds = $$('#user-list input[type=checkbox]:checked').map((el) => Number(el.value));
      updateGroupCreateState();
    });
  });
  updateGroupCreateState();
}

async function createGroupFromModal() {
  const btn = $('#create-group-btn');
  const name = $('#group-name-input')?.value.trim();
  const selected = $$('#user-list input[type=checkbox]:checked').map((el) => Number(el.value));
  if (!name || selected.length < 1) {
    showToast('Enter a group name and select at least one member', 'error');
    return;
  }
  if (btn?.disabled) return;
  if (btn) {
    btn.disabled = true;
    btn.setAttribute('aria-busy', 'true');
  }
  try {
    const chat = await createGroupChat(name, selected);
    closeNewChatModal();
    uiState.userListMode = 'newChat';
    groupSelectedIds = [];
    invalidateChatListCache(uiState);
    await loadChats();
    openChat(chat.id);
    showToast('Group created', 'success');
  } catch (err) {
    showToast(err.isNetworkError ? formatBackendUnreachable() : err.message, 'error');
  } finally {
    if (btn) {
      btn.disabled = false;
      btn.removeAttribute('aria-busy');
    }
  }
}
