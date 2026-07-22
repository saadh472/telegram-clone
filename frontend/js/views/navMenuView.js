/** VIEW — Sidebar nav menu dropdown. */
import { $, $$ } from '../utils.js';
import { buildDropdownHtml, buildBadgeHtml } from './uiComponents.js';
import { unreadNotificationCount } from '../models/notificationsModel.js';

let menuHandler = null;
let closeTimer = null;
let listenersBound = false;

const NAV_ICONS = {
  profile: '<svg class="nav-menu-icon nav-menu-icon-profile" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4Zm0 2c-2.67 0-8 1.34-8 4v1.25C4 20.21 4.79 21 5.75 21h12.5c.96 0 1.75-.79 1.75-1.75V18c0-2.66-5.33-4-8-4Z"/></svg>',
  notifications: '<svg class="nav-menu-icon nav-menu-icon-notifications" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 22a2.5 2.5 0 0 0 2.45-2h-4.9A2.5 2.5 0 0 0 12 22Zm7-6.2-1.75-1.75V9.8a5.27 5.27 0 0 0-4-5.12V4a1.25 1.25 0 1 0-2.5 0v.68a5.27 5.27 0 0 0-4 5.12v4.25L5 15.8V17h14v-1.2Z"/></svg>',
  settings: '<svg class="nav-menu-icon nav-menu-icon-settings" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M19.43 12.98c.04-.32.07-.65.07-.98s-.02-.66-.07-.98l2.11-1.65a.5.5 0 0 0 .12-.64l-2-3.46a.5.5 0 0 0-.6-.22l-2.49 1a7.34 7.34 0 0 0-1.69-.98L14.5 2.42A.49.49 0 0 0 14 2h-4a.49.49 0 0 0-.5.42L9.12 5.07c-.61.24-1.18.56-1.69.98l-2.49-1a.5.5 0 0 0-.6.22l-2 3.46a.5.5 0 0 0 .12.64l2.11 1.65c-.04.32-.08.65-.08.98s.03.66.08.98l-2.11 1.65a.5.5 0 0 0-.12.64l2 3.46c.14.24.42.34.68.22l2.41-.97c.53.4 1.1.73 1.72.97l.35 2.63c.04.24.25.42.5.42h4c.25 0 .46-.18.5-.42l.35-2.63c.62-.24 1.2-.57 1.72-.97l2.41.97c.26.12.54.02.68-.22l2-3.46a.5.5 0 0 0-.12-.64l-2.11-1.65ZM12 15.5A3.5 3.5 0 1 1 12 8a3.5 3.5 0 0 1 0 7.5Z"/></svg>',
  newChat: '<svg class="nav-menu-icon nav-menu-icon-new-chat" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M4 17.25V21h3.75L18.81 9.94l-3.75-3.75L4 17.25Zm17.71-10.21a1 1 0 0 0 0-1.41l-2.34-2.34a1 1 0 0 0-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83Z"/></svg>'
};

export function setNavMenuHandler(fn) {
  menuHandler = fn;
}

function clearCloseTimer() {
  if (closeTimer) {
    clearTimeout(closeTimer);
    closeTimer = null;
  }
}

export function updateNavActiveState(activeAction = '') {
  $$('#nav-dropdown .dropdown-item').forEach((item) => {
    const on = item.dataset.action === activeAction;
    item.classList.toggle('active', on);
    item.setAttribute('aria-current', on ? 'page' : 'false');
  });
}

export function mountNavDropdown() {
  if ($('#nav-dropdown')) return;
  const notifCount = unreadNotificationCount();
  const html = buildDropdownHtml('nav-dropdown', [
    { action: 'profile', label: 'My Profile', icon: NAV_ICONS.profile },
    { action: 'notifications', label: 'Notifications', icon: NAV_ICONS.notifications },
    { divider: true },
    { action: 'settings', label: 'Settings', icon: NAV_ICONS.settings },
    { action: 'new-chat', label: 'New Chat', icon: NAV_ICONS.newChat }
  ], { align: 'left' });
  document.body.insertAdjacentHTML('beforeend', html);
  const notifItem = $('#nav-dropdown .dropdown-item[data-action="notifications"]');
  if (notifItem && notifCount > 0) {
    notifItem.insertAdjacentHTML('beforeend', buildBadgeHtml(notifCount, { max: 9, className: 'dropdown-badge' }));
  }
}

export function openNavDropdown(anchor) {
  const menu = $('#nav-dropdown');
  if (!menu || !anchor) return;
  clearCloseTimer();
  menu.classList.remove('hidden');
  const rect = anchor.getBoundingClientRect();
  menu.style.top = `${rect.bottom + 6}px`;
  menu.style.left = `${rect.left}px`;
  requestAnimationFrame(() => menu.classList.add('open'));
  anchor.setAttribute('aria-expanded', 'true');
}

export function closeNavDropdown() {
  const menu = $('#nav-dropdown');
  if (!menu) return;
  clearCloseTimer();
  menu.classList.remove('open');
  $('#menu-btn')?.setAttribute('aria-expanded', 'false');
  closeTimer = setTimeout(() => {
    menu.classList.add('hidden');
    closeTimer = null;
  }, 150);
}

export function toggleNavDropdown(anchor) {
  const menu = $('#nav-dropdown');
  if (!menu) return;
  if (menu.classList.contains('open')) closeNavDropdown();
  else openNavDropdown(anchor);
}

export function initNavMenu() {
  mountNavDropdown();
  if (listenersBound) return;
  listenersBound = true;

  const menuBtn = $('#menu-btn');
  menuBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    toggleNavDropdown(e.currentTarget);
  });

  $('#nav-dropdown')?.addEventListener('click', (e) => {
    const item = e.target.closest('.dropdown-item');
    if (!item) return;
    e.stopPropagation();
    closeNavDropdown();
    menuHandler?.(item.dataset.action);
  });

  document.addEventListener('click', (e) => {
    if (!e.target.closest('#nav-dropdown') && !e.target.closest('#menu-btn')) {
      closeNavDropdown();
    }
  });

  document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') closeNavDropdown();
  });
}
