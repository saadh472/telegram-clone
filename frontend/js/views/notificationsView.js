/** VIEW — Notifications panel (demo, derived from chat unread). */
import {
  $, $$, escapeHtml, formatChatTime, buildEmptyInlineHtml, showToast,
  focusFirstIn, rememberFocus, restoreFocus
} from '../utils.js';
import {
  buildNotifications, markAllNotificationsRead, unreadNotificationCount, hasUnreadNotifications
} from '../models/notificationsModel.js';
import { updateNavActiveState } from './navMenuView.js';
import { navigate, clearRouteHash } from '../router.js';

const MARK_READ_TRANSITION_MS = 340;

let onNotificationClick = null;
let markAllReadInFlight = false;

export function setNotificationClickHandler(fn) {
  onNotificationClick = fn;
}

export function updateNotificationBadge() {
  const count = unreadNotificationCount();
  const badge = $('#notifications-badge');
  const sidebarBadge = $('#sidebar-notifications-badge');
  [badge, sidebarBadge].forEach((el) => {
    if (!el) return;
    if (count > 0) {
      el.textContent = count > 9 ? '9+' : String(count);
      el.classList.remove('hidden');
    } else {
      el.textContent = '';
      el.classList.add('hidden');
    }
  });
  updateMarkAllReadButton();
}

export function updateMarkAllReadButton() {
  const btn = $('#mark-all-read-btn');
  if (!btn || markAllReadInFlight) return;
  const visible = hasUnreadNotifications();
  btn.hidden = !visible;
  btn.disabled = !visible;
  btn.setAttribute('aria-hidden', visible ? 'false' : 'true');
}

function setMarkAllReadLoading(loading) {
  const btn = $('#mark-all-read-btn');
  if (!btn) return;
  btn.classList.toggle('is-loading', loading);
  btn.disabled = loading || !hasUnreadNotifications();
  if (loading) btn.setAttribute('aria-busy', 'true');
  else btn.removeAttribute('aria-busy');
}

async function handleMarkAllRead() {
  const btn = $('#mark-all-read-btn');
  if (!btn || markAllReadInFlight || btn.disabled || !hasUnreadNotifications()) return;

  const unreadItems = $$('.notification-item.unread');
  if (!unreadItems.length) return;

  markAllReadInFlight = true;
  setMarkAllReadLoading(true);

  unreadItems.forEach((el) => el.classList.add('marking-read'));
  await new Promise((resolve) => setTimeout(resolve, MARK_READ_TRANSITION_MS));

  markAllNotificationsRead();
  updateNotificationBadge();

  unreadItems.forEach((el) => {
    el.classList.remove('unread', 'marking-read');
  });

  setMarkAllReadLoading(false);
  markAllReadInFlight = false;
  updateMarkAllReadButton();
  showToast('All notifications marked as read', 'success');
}

export function renderNotifications() {
  const list = $('#notifications-list');
  if (!list) return;
  const items = buildNotifications();
  if (!items.length) {
    list.innerHTML = buildEmptyInlineHtml({
      title: 'No notifications',
      hint: 'New messages from your chats will appear here',
      extraClass: 'notifications-empty',
      icon: 'messages'
    });
    updateMarkAllReadButton();
    return;
  }
  list.innerHTML = items.map((n) => `
    <button type="button" class="notification-item${n.unread ? ' unread' : ''}" data-chat-id="${n.chatId}" aria-label="${escapeHtml(n.title)}: ${escapeHtml(n.body)}${n.unread ? ' (unread)' : ''}">
      <span class="notification-icon" aria-hidden="true">${n.icon}</span>
      <span class="notification-body">
        <span class="notification-title">${escapeHtml(n.title)}</span>
        <span class="notification-text">${escapeHtml(n.body)}</span>
      </span>
      <span class="notification-time">${formatChatTime(n.time)}</span>
    </button>`).join('');
  updateMarkAllReadButton();
}

export function openNotificationsPanel({ fromRoute = false } = {}) {
  renderNotifications();
  const panel = $('#notifications-panel');
  rememberFocus(panel);
  panel?.classList.remove('hidden');
  requestAnimationFrame(() => panel?.classList.add('open'));
  focusFirstIn(panel, '.notification-item, #close-notifications-btn');
  updateNavActiveState('notifications');
  if (!fromRoute) navigate({ name: 'notifications' }, { replace: true });
}

export function closeNotificationsPanel({ fromRoute = false } = {}) {
  const panel = $('#notifications-panel');
  if (!panel || panel.classList.contains('hidden')) return;
  panel.classList.remove('open');
  updateNavActiveState('');
  setTimeout(() => {
    panel.classList.add('hidden');
    if (!fromRoute) restoreFocus(panel, '#notifications-btn');
  }, 260);
  if (!fromRoute && window.location.hash === '#notifications') clearRouteHash();
}

export function isNotificationsOpen() {
  const panel = $('#notifications-panel');
  return !!panel && !panel.classList.contains('hidden') && panel.classList.contains('open');
}

export function toggleNotificationsPanel() {
  const panel = $('#notifications-panel');
  if (!panel) return;
  if (panel.classList.contains('open')) closeNotificationsPanel();
  else openNotificationsPanel();
}

export function initNotificationsPanel() {
  $('#notifications-backdrop')?.addEventListener('click', () => {
    closeNotificationsPanel();
    markAllNotificationsRead();
    updateNotificationBadge();
  });
  $('#close-notifications-btn')?.addEventListener('click', () => {
    closeNotificationsPanel();
    markAllNotificationsRead();
    updateNotificationBadge();
  });
  $('#mark-all-read-btn')?.addEventListener('click', () => {
    handleMarkAllRead();
  });
  $('#notifications-list')?.addEventListener('click', (e) => {
    const item = e.target.closest('.notification-item');
    if (!item || !onNotificationClick) return;
    onNotificationClick(Number(item.dataset.chatId));
    closeNotificationsPanel();
    markAllNotificationsRead();
    updateNotificationBadge();
  });
}
