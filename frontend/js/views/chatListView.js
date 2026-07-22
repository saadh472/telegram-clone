/** VIEW — Sidebar, chat list, modal. */
import { chatState, uiState, SELECTORS, FLASH_CHAT_MS } from '../config.js';
import {
  $, $$, escapeHtml, formatChatTime, getInitials, highlightMatch, formatMessagePreview,
  formatLastSeen, userAvatarStyle, buildEmptyInlineHtml, focusFirstIn, rememberFocus, restoreFocus
} from '../utils.js';
import { sortChats, filterActiveChats, filterArchivedChats, getChatPref, toggleArchive } from '../models/chatPrefs.js';
import { chatsFingerprint } from '../models/chatModel.js';
import { isE2eEnabledForChat } from '../models/e2eCrypto.js';
import { bindChatListDelegation, updateChatListActiveState } from './messageView.js';
import { renderProfile } from './profileView.js';
import { navigate, clearRouteHash } from '../router.js';
import { updateNavActiveState } from './navMenuView.js';

const PIN_ICON = '<svg class="pin-icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16 12V4h1V2H7v2h1v8l-2 2v2h5.2v6h1.6v-6H18v-2l-2-2z"/></svg>';
const MUTE_ICON = '<svg class="muted-icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M16.5 12c0-1.77-1.02-3.29-2.5-4.03v2.21l2.45 2.45c.03-.2.05-.41.05-.63zm2.5 0c0 .94-.2 1.82-.54 2.64l1.51 1.51C20.63 14.91 21 13.5 21 12c0-4.28-2.99-7.86-7-8.77v2.06c2.89.86 5 3.54 5 6.71zM4.27 3L3 4.27 7.73 9H3v6h4l5 5v-6.73l4.25 4.25c-.67.52-1.42.93-2.25 1.18v2.06c1.38-.31 2.63-.95 3.69-1.81L19.73 21 21 19.73l-9-9L4.27 3zM12 4L9.91 6.09 12 8.18V4z"/></svg>';
const E2E_LOCK_ICON = '<svg class="e2e-list-lock" width="12" height="12" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>';
const ARCHIVE_ICON = '<svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M20.54 5.23l-1.39-1.68C18.88 3.21 18.47 3 18 3H6c-.47 0-.88.21-1.16.55L3.46 5.23C3.17 5.57 3 6.02 3 6.5V19c0 1.1.9 2 2 2h14c1.1 0 2-.9 2-2V6.5c0-.48-.17-.93-.46-1.27zM6.24 5h11.52l.81 1H5.43l.81-1zM5 19V8h14v11H5z"/></svg>';

const CHAT_LIST_BATCH_THRESHOLD = 50;
const CHAT_LIST_BATCH_SIZE = 25;

export function renderChatSkeleton() {
  const status = $(SELECTORS.chatListStatus);
  if (status) {
    status.textContent = 'Loading conversations';
    status.classList.add('muted');
  }
  $(SELECTORS.chatList).innerHTML = `<div class="skeleton-list">${[1, 2, 3, 4, 5].map(() =>
    `<div class="skeleton-item"><div class="skeleton-avatar"></div><div class="skeleton-lines"><div class="skeleton-line w70"></div><div class="skeleton-line w40"></div></div></div>`
  ).join('')}</div>`;
}

export function flashChatItem(chatId) {
  const item = $(`.chat-item[data-id="${chatId}"]`);
  if (!item) return;
  item.classList.remove('flash');
  void item.offsetWidth;
  item.classList.add('flash', 'flash-new-msg');
  setTimeout(() => item.classList.remove('flash', 'flash-new-msg'), FLASH_CHAT_MS);
}

function buildPreviewHtml(text, { deleted: messageDeleted = false } = {}) {
  const { icon, label, deleted } = formatMessagePreview(text, { deleted: messageDeleted });
  const deletedClass = deleted ? ' preview-deleted' : '';
  if (icon) return `<span class="preview-icon">${icon}</span> <span class="preview-label${deletedClass}">${escapeHtml(label)}</span>`;
  return `<span class="preview-label${deletedClass}">${escapeHtml(label)}</span>`;
}

function buildChatItemHtml(chat, q, prevKnown = uiState.knownChatIds, { archived = false } = {}) {
  const active = chat.id === chatState.activeChatId;
  const unread = chat.unread_count > 0 && !active;
  const pref = getChatPref(chat.id);
  const pinned = pref.pinned;
  const muted = pref.muted;
  const e2e = isE2eEnabledForChat(chat);
  const onlineClass = chat.type !== 'group' && chat.other_online ? ' online' : '';
  const isNew = !prevKnown.has(chat.id);
  const enterClass = isNew ? ' chat-item-enter' : '';
  const archivedClass = archived ? ' archived' : '';
  const avatarRing = chat.type !== 'group'
    ? `<span class="avatar-ring ${chat.other_online ? 'online' : 'offline'}"></span>`
    : '';

  const ariaLabel = [
    chat.display_name || 'Chat',
    unread ? `${chat.unread_count} unread message${chat.unread_count === 1 ? '' : 's'}` : '',
    pinned ? 'pinned' : '',
    archived ? 'archived' : ''
  ].filter(Boolean).join(', ');

  return `
    <button type="button" class="chat-item${enterClass}${archivedClass} ${active ? 'active' : ''} ${unread ? 'unread' : ''} ${pinned ? 'pinned' : ''}" data-id="${chat.id}" data-archived="${archived ? '1' : '0'}" aria-label="${escapeHtml(ariaLabel)}" aria-current="${active ? 'true' : 'false'}">
      <div class="avatar-wrap">
        <div class="avatar${onlineClass}" style="background:${userAvatarStyle(chat)}">
          ${chat.type === 'group' ? '👥' : getInitials(chat.display_name)}
        </div>
        ${avatarRing}
      </div>
      <div class="chat-item-body">
        <div class="chat-item-top">
          <span class="chat-name ${unread ? 'bold' : ''}">${highlightMatch(chat.display_name || 'Chat', q)}</span>
          ${pinned || muted ? `<span class="chat-name-icons">${pinned ? PIN_ICON : ''}${muted ? MUTE_ICON : ''}</span>` : ''}
        </div>
        <div class="chat-item-bottom">
          <span class="chat-preview">${e2e ? E2E_LOCK_ICON : ''}${buildPreviewHtml(chat.last_message, { deleted: chat.last_message_deleted })}</span>
        </div>
      </div>
      <div class="chat-item-meta">
        <span class="chat-time">${formatChatTime(chat.last_message_time)}</span>
        ${unread ? `<span class="unread-badge">${chat.unread_count > 9 ? '9+' : chat.unread_count}</span>` : ''}
      </div>
    </button>`;
}

export function updateChatItemSummary(chat) {
  if (!chat?.id) return false;
  const item = $(`.chat-item[data-id="${chat.id}"]`);
  if (!item) return false;
  const active = chat.id === chatState.activeChatId;
  const unread = chat.unread_count > 0 && !active;
  const preview = item.querySelector('.chat-preview');
  const time = item.querySelector('.chat-time');
  const name = item.querySelector('.chat-name');
  const meta = item.querySelector('.chat-item-meta');
  if (preview) {
    const e2e = isE2eEnabledForChat(chat);
    preview.innerHTML = `${e2e ? E2E_LOCK_ICON : ''}${buildPreviewHtml(chat.last_message, { deleted: chat.last_message_deleted })}`;
  }
  if (time) {
    time.textContent = formatChatTime(chat.last_message_time);
  }
  if (name) name.classList.toggle('bold', unread);
  item.classList.toggle('active', active);
  item.classList.toggle('unread', unread);
  item.setAttribute('aria-current', active ? 'true' : 'false');
  item.setAttribute('aria-label', [
    chat.display_name || 'Chat',
    unread ? `${chat.unread_count} unread message${chat.unread_count === 1 ? '' : 's'}` : '',
    getChatPref(chat.id).pinned ? 'pinned' : '',
    getChatPref(chat.id).archived ? 'archived' : ''
  ].filter(Boolean).join(', '));
  if (meta) {
    let badge = meta.querySelector('.unread-badge');
    if (unread) {
      if (!badge) {
        badge = document.createElement('span');
        badge.className = 'unread-badge';
        meta.appendChild(badge);
      }
      badge.textContent = chat.unread_count > 9 ? '9+' : String(chat.unread_count);
    } else {
      badge?.remove();
    }
  }
  return true;
}

export function chatListRenderOrderKey(chats, query = uiState.chatSearchQuery) {
  const q = query.trim().toLowerCase();
  const activeSorted = sortChats(filterByMode(filterActiveChats(chats)));
  const archivedSorted = sortChats(filterByMode(filterArchivedChats(chats)));
  const filtered = filterByQuery(activeSorted, q);
  const archivedFiltered = filterByQuery(archivedSorted, q);
  return [...filtered, ...archivedFiltered]
    .map((chat) => `${getChatPref(chat.id).archived ? 'archived' : 'active'}:${chat.id}`)
    .join('|');
}

export function updateChatListSummariesInPlace(chats) {
  const list = $(SELECTORS.chatList);
  if (!list?.querySelector('.chat-item')) return false;
  let updatedAll = true;
  chats.forEach((chat) => {
    if (!updateChatItemSummary(chat)) updatedAll = false;
  });
  updateChatListActiveState();
  return updatedAll;
}

function buildEmptySearchHtml(q) {
  return buildEmptyInlineHtml({
    title: `No chats match "<strong>${escapeHtml(q)}</strong>"`,
    hint: 'Try another name or a word from the last message',
    extraClass: 'sidebar-empty search-empty',
    icon: 'search',
    htmlTitle: true
  });
}
function buildSectionLabel(title, icon = '', { collapsible = false, collapsed = false, sectionId = '' } = {}) {
  if (!collapsible) {
    return `<div class="chat-section-label">${icon}${title}</div>`;
  }
  return `<button type="button" class="chat-section-label chat-section-toggle${collapsed ? ' collapsed' : ''}" data-section="${sectionId}" aria-expanded="${!collapsed}">
    ${icon}<span>${title}</span>
    <svg class="section-chevron" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M7.41 8.59 12 13.17l4.59-4.58L18 10l-6 6-6-6 1.41-1.41z"/></svg>
  </button>`;
}

function filterByQuery(chats, q) {
  return chats.filter((c) =>
    (c.display_name || '').toLowerCase().includes(q)
    || (c.last_message || '').toLowerCase().includes(q)
  );
}

function filterByMode(chats) {
  switch (uiState.chatFilter) {
    case 'unread':
      return chats.filter((c) => c.unread_count > 0);
    case 'groups':
      return chats.filter((c) => c.type === 'group');
    default:
      return chats;
  }
}

function filterNoun(count) {
  if (uiState.chatFilter === 'unread') return count === 1 ? 'unread chat' : 'unread chats';
  if (uiState.chatFilter === 'groups') return count === 1 ? 'group' : 'groups';
  return count === 1 ? 'chat' : 'chats';
}

export function syncChatFilterTabs() {
  $$('#chat-filter-tabs .chat-filter-tab').forEach((btn) => {
    const active = btn.dataset.filter === uiState.chatFilter;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
}

function updateChatListStatus(count, q) {
  const status = $(SELECTORS.chatListStatus);
  const clearBtn = $(SELECTORS.searchClearBtn);
  const search = $(SELECTORS.searchInput);
  if (clearBtn) clearBtn.classList.toggle('hidden', !q);
  if (search) search.setAttribute('aria-expanded', q ? 'true' : 'false');
  if (!status) return;
  if (q) {
    status.textContent = count ? `${count} ${filterNoun(count)} found` : `No ${filterNoun(0)} found`;
    status.classList.remove('muted');
  } else if (uiState.chatFilter !== 'all') {
    status.textContent = `${count} ${filterNoun(count)}`;
    status.classList.remove('muted');
  } else {
    status.textContent = 'Recent conversations';
    status.classList.add('muted');
  }
}

function buildNoFilteredChatsHtml(q) {
  const label = uiState.chatFilter === 'groups' ? 'groups' : uiState.chatFilter === 'unread' ? 'unread chats' : 'conversations';
  if (q) {
    return buildEmptyInlineHtml({
      title: `No ${label} match "<strong>${escapeHtml(q)}</strong>"`,
      hint: 'Try another name, username, or word from the last message',
      extraClass: 'sidebar-empty search-empty',
      icon: 'search',
      htmlTitle: true,
      extra: `<div class="sidebar-empty-actions">
        <button type="button" class="btn-secondary btn-sm sidebar-empty-action" data-sidebar-action="clear-search">Clear Search</button>
        <button type="button" class="btn-secondary btn-sm sidebar-empty-action" data-sidebar-action="new-chat">Start New Chat</button>
      </div>`
    });
  }
  if (uiState.chatFilter === 'unread') {
    return buildEmptyInlineHtml({
      title: 'No unread chats',
      hint: 'You are caught up',
      extraClass: 'sidebar-empty',
      icon: 'chat'
    });
  }
  if (uiState.chatFilter === 'groups') {
    return buildEmptyInlineHtml({
      title: 'No groups yet',
      hint: 'Create a group from New Chat',
      extraClass: 'sidebar-empty',
      icon: 'users',
      extra: '<button type="button" class="btn-secondary btn-sm sidebar-empty-action" data-sidebar-action="new-chat">Create Group</button>'
    });
  }
  return buildEmptyInlineHtml({
    title: 'No conversations yet',
    hint: 'Press + to start your first chat',
    extraClass: 'sidebar-empty',
    icon: 'chat',
    extra: '<button type="button" class="btn-secondary btn-sm sidebar-empty-action" data-sidebar-action="new-chat">Start New Chat</button>'
  });
}

function renderActiveSections(filtered, q, prevKnown) {
  return renderActiveSectionParts(filtered, q, prevKnown).join('');
}

function renderActiveSectionParts(filtered, q, prevKnown) {
  const pinned = filtered.filter((c) => getChatPref(c.id).pinned);
  const rest = filtered.filter((c) => !getChatPref(c.id).pinned);
  const parts = [];
  if (pinned.length) {
    parts.push(buildSectionLabel('Pinned', PIN_ICON));
    pinned.forEach((chat) => parts.push(buildChatItemHtml(chat, q, prevKnown)));
  }
  if (rest.length) {
    if (pinned.length) parts.push(buildSectionLabel('All Chats'));
    rest.forEach((chat) => parts.push(buildChatItemHtml(chat, q, prevKnown)));
  }
  return parts;
}

function renderArchivedSectionParts(archivedFiltered, q, prevKnown) {
  if (!archivedFiltered.length) return [];
  const collapsed = !uiState.archivedSectionOpen;
  const parts = [buildSectionLabel(`Archived (${archivedFiltered.length})`, ARCHIVE_ICON, {
    collapsible: true,
    collapsed,
    sectionId: 'archived'
  })];
  if (!collapsed) {
    parts.push('<div class="chat-section-body" data-section-body="archived">');
    archivedFiltered.forEach((chat) => parts.push(buildChatItemHtml(chat, q, prevKnown, { archived: true })));
    parts.push('</div>');
  }
  return parts;
}

function mountListParts(list, parts, itemCount, onComplete) {
  if (itemCount <= CHAT_LIST_BATCH_THRESHOLD) {
    list.innerHTML = parts.join('');
    onComplete?.();
    return;
  }
  list.innerHTML = '';
  let idx = 0;
  const flushBatch = () => {
    const end = Math.min(idx + CHAT_LIST_BATCH_SIZE, parts.length);
    const wrap = document.createElement('div');
    wrap.innerHTML = parts.slice(idx, end).join('');
    const frag = document.createDocumentFragment();
    while (wrap.firstChild) frag.appendChild(wrap.firstChild);
    list.appendChild(frag);
    idx = end;
    if (idx < parts.length) requestAnimationFrame(flushBatch);
    else onComplete?.();
  };
  requestAnimationFrame(flushBatch);
}

function bindSectionToggles(list, onOpen) {
  list.querySelectorAll('.chat-section-toggle').forEach((btn) => {
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (btn.dataset.section === 'archived') {
        uiState.archivedSectionOpen = !uiState.archivedSectionOpen;
        renderChatList(uiState.chatSearchQuery, onOpen, { force: true });
      }
    });
  });
}

function finishChatListMount(list, filtered, archivedFiltered, onOpen) {
  [...filtered, ...archivedFiltered].forEach((c) => uiState.knownChatIds.add(c.id));
  bindSectionToggles(list, onOpen);
  requestAnimationFrame(() => {
    $$('.chat-item-enter', list).forEach((el) => {
      el.addEventListener('animationend', () => el.classList.remove('chat-item-enter'), { once: true });
    });
  });
}

function renderArchivedSection(archivedFiltered, q, prevKnown) {
  return renderArchivedSectionParts(archivedFiltered, q, prevKnown).join('');
}

export function renderChatList(query = '', onOpen, { force = false } = {}) {
  uiState.chatSearchQuery = query;
  const list = $(SELECTORS.chatList);
  if (!list) return;
  syncChatFilterTabs();

  bindChatListDelegation(onOpen, {
    onUnarchive: (chatId) => {
      toggleArchive(chatId);
      renderChatList(uiState.chatSearchQuery, onOpen, { force: true });
    }
  });

  const fp = chatsFingerprint(chatState.chats);
  const renderKey = `${fp}|${uiState.chatFilter}|${query.trim().toLowerCase()}`;
  if (!force && renderKey === uiState.lastChatListFingerprint && list.querySelector('.chat-item')) {
    updateChatListActiveState();
    return;
  }
  uiState.lastChatListFingerprint = renderKey;

  const q = query.trim().toLowerCase();
  const activeSorted = sortChats(filterByMode(filterActiveChats(chatState.chats)));
  const archivedSorted = sortChats(filterByMode(filterArchivedChats(chatState.chats)));
  const filtered = filterByQuery(activeSorted, q);
  const archivedFiltered = filterByQuery(archivedSorted, q);
  updateChatListStatus(filtered.length + archivedFiltered.length, q);

  if (!filtered.length && !archivedFiltered.length) {
    list.innerHTML = buildNoFilteredChatsHtml(q);
    return;
  }

  const prevKnown = uiState.knownChatIds;
  const parts = [
    ...renderActiveSectionParts(filtered, q, prevKnown),
    ...renderArchivedSectionParts(archivedFiltered, q, prevKnown)
  ];

  mountListParts(list, parts, filtered.length + archivedFiltered.length, () => finishChatListMount(list, filtered, archivedFiltered, onOpen));
}

export function renderChatHeader(chat, memberCount = null) {
  const avatar = $(SELECTORS.chatAvatar);
  if (avatar) {
    avatar.style.background = userAvatarStyle(chat);
    avatar.textContent = chat.type === 'group' ? '👥' : getInitials(chat.display_name);
    avatar.classList.toggle('online', chat.type !== 'group' && !!chat.other_online);
  }
  const title = $(SELECTORS.chatTitle);
  if (title) title.textContent = chat.display_name || 'Chat';

  const status = $(SELECTORS.chatStatus);
  if (status) {
    if (chat.type === 'group') {
      const count = memberCount ?? chat.member_count;
      status.textContent = count != null ? `${count} members` : 'group';
      status.className = 'chat-status';
    } else if (chat.other_online) {
      status.textContent = 'online';
      status.className = 'chat-status online';
    } else {
      status.textContent = formatLastSeen(chat.other_last_seen, false);
      status.className = 'chat-status';
    }
  }
}

export function showActiveChatPanel() {
  $(SELECTORS.emptyState)?.classList.add('hidden');
  $(SELECTORS.activeChat)?.classList.remove('hidden');
  $(SELECTORS.app)?.classList.add('chat-open');
}

export function hideActiveChatPanel() {
  $(SELECTORS.emptyState)?.classList.remove('hidden');
  $(SELECTORS.activeChat)?.classList.add('hidden');
  $(SELECTORS.app)?.classList.remove('chat-open');
}

export function closeSidebarMobile() {
  $(SELECTORS.sidebar)?.classList.remove('open');
  $(SELECTORS.sidebarOverlay)?.classList.add('hidden');
  $(SELECTORS.settingsPanel)?.classList.add('hidden');
  closeProfilePage({ skipReturn: true });
}

export function openNewChatModal() {
  const modal = $('#new-chat-modal');
  if (!modal) return;
  rememberFocus(modal);
  modal.classList.remove('hidden', 'closing');
  requestAnimationFrame(() => modal.classList.add('open'));
  focusFirstIn(modal, '#user-search');
}

export function closeNewChatModal() {
  const modal = $('#new-chat-modal');
  if (!modal || modal.classList.contains('hidden')) return;
  modal.classList.remove('open');
  modal.classList.add('closing');
  setTimeout(() => {
    modal.classList.add('hidden');
    modal.classList.remove('closing');
      restoreFocus(modal, SELECTORS.newChatBtn);
  }, 220);
  if (window.location.hash === '#new-chat') clearRouteHash();
}

export function showModalLoading() {
  $(SELECTORS.userList).innerHTML = `<div class="modal-loading"><span class="spinner"></span><span>Loading users…</span></div>`;
}

export function showModalError(msg, { retryLabel = 'Try Again' } = {}) {
  $(SELECTORS.userList).innerHTML = buildEmptyInlineHtml({
    title: msg,
    extraClass: 'modal-empty',
    icon: 'generic',
    extra: `<button type="button" class="btn-secondary btn-sm modal-retry-btn" data-modal-retry>${escapeHtml(retryLabel)}</button>`
  });
}

let userSelectHandler = null;

export function renderUserList(query = '', onSelect) {
  userSelectHandler = onSelect;
  const q = query.trim().toLowerCase();
  const filtered = chatState.users.filter((u) =>
    u.display_name.toLowerCase().includes(q) || u.username.toLowerCase().includes(q)
  );
  const list = $(SELECTORS.userList);
  if (!list) return;

  if (!filtered.length) {
    list.innerHTML = q
      ? buildEmptyInlineHtml({
          title: `No contacts match "<strong>${escapeHtml(q)}</strong>"`,
          hint: 'Search by name or username',
          extraClass: 'modal-empty',
          icon: 'users',
          htmlTitle: true
        })
      : buildEmptyInlineHtml({
          title: 'No users available',
          extraClass: 'modal-empty',
          icon: 'users'
        });
    uiState.userListFocusIndex = -1;
    return;
  }

  list.innerHTML = filtered.map((user, i) => `
    <button type="button" class="user-item${i === uiState.userListFocusIndex ? ' focused' : ''}" data-id="${user.id}" data-index="${i}">
      <div class="avatar" style="background:${userAvatarStyle(user)}">${getInitials(user.display_name)}</div>
      <div class="user-item-info">
        <h4>${highlightMatch(user.display_name, q)}</h4>
        <span>@${highlightMatch(user.username, q)}</span>
      </div>
    </button>`).join('');

  if (uiState.userListFocusIndex >= filtered.length) uiState.userListFocusIndex = filtered.length - 1;

  if (!list.dataset.delegation) {
    list.dataset.delegation = '1';
    list.addEventListener('click', (e) => {
      const btn = e.target.closest('.user-item');
      if (btn && userSelectHandler) userSelectHandler(Number(btn.dataset.id));
    });
  }
}

export function focusUserListItem(index) {
  const items = $$(`${SELECTORS.userList} .user-item`);
  if (!items.length) return;
  const i = Math.max(0, Math.min(index, items.length - 1));
  uiState.userListFocusIndex = i;
  items.forEach((el, idx) => el.classList.toggle('focused', idx === i));
  items[i]?.scrollIntoView({ block: 'nearest' });
}

export function selectFocusedUser() {
  const item = $(`${SELECTORS.userList} .user-item.focused`);
  if (item && userSelectHandler) userSelectHandler(Number(item.dataset.id));
}

export function openSettingsPanel({ fromRoute = false } = {}) {
  const panel = $(SELECTORS.settingsPanel);
  rememberFocus(panel);
  panel?.classList.remove('hidden');
  requestAnimationFrame(() => panel?.classList.add('open'));
  focusFirstIn(panel, '#close-settings-btn');
  updateNavActiveState('settings');
  if (!fromRoute) navigate({ name: 'settings' }, { replace: true });
}

export function closeSettingsPanel({ fromRoute = false } = {}) {
  const panel = $(SELECTORS.settingsPanel);
  panel?.classList.remove('open');
  setTimeout(() => {
    panel?.classList.add('hidden');
    if (!fromRoute) restoreFocus(panel, '#menu-btn');
  }, 250);
  updateNavActiveState('');
  if (!fromRoute && window.location.hash === '#settings') clearRouteHash();
}

export function isSettingsOpen() {
  const panel = $(SELECTORS.settingsPanel);
  return !!panel && !panel.classList.contains('hidden') && panel.classList.contains('open');
}

export function toggleSettingsPanel() {
  const panel = $(SELECTORS.settingsPanel);
  if (!panel) return;
  if (panel.classList.contains('open')) closeSettingsPanel();
  else openSettingsPanel();
}

let profileReturnTo = 'sidebar';

export function isProfileOpen() {
  const panel = $(SELECTORS.profilePanel);
  return !!panel && !panel.classList.contains('hidden') && panel.classList.contains('open');
}

export function openProfilePage({ from = 'sidebar', fromRoute = false } = {}) {
  profileReturnTo = from === 'settings' ? 'settings' : 'sidebar';
  if (from === 'settings') closeSettingsPanel({ fromRoute: true });

  renderProfile();

  const panel = $(SELECTORS.profilePanel);
  rememberFocus(panel);
  panel?.classList.remove('hidden');
  requestAnimationFrame(() => panel?.classList.add('open'));
  focusFirstIn(panel, '#profile-back-btn');
  updateNavActiveState('profile');
  if (!fromRoute && from === 'sidebar') {
    navigate({ name: 'profile' }, { replace: true });
  }
}

export function closeProfilePage({ skipReturn = false, fromRoute = false } = {}) {
  const panel = $(SELECTORS.profilePanel);
  if (!panel || panel.classList.contains('hidden')) return;

  const returnTo = profileReturnTo;
  panel.classList.remove('open');
  updateNavActiveState('');
  setTimeout(() => {
    panel.classList.add('hidden');
    if (!fromRoute && window.location.hash === '#profile') {
      clearRouteHash();
    }
    if (!skipReturn && returnTo === 'settings') {
      openSettingsPanel({ fromRoute: true });
    } else if (!fromRoute) {
      restoreFocus(panel, '#user-profile-btn');
    }
  }, 280);
}
