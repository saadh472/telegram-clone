/** Client-side hash router — #chat/12, #settings, #profile, #notifications */
import { authState } from './config.js';

let navigating = false;
let routerReady = false;
let handlers = {
  onChat: null,
  onSettings: null,
  onProfile: null,
  onNotifications: null,
  onHome: null
};

export function setRouterHandlers(h) {
  handlers = { ...handlers, ...h };
}

export function parseRoute(hash = window.location.hash) {
  const raw = (hash || '').replace(/^#/, '').trim();
  if (!raw) return { name: 'home' };
  if (raw === 'settings') return { name: 'settings' };
  if (raw === 'profile') return { name: 'profile' };
  if (raw === 'notifications') return { name: 'notifications' };
  const chatMatch = raw.match(/^chat\/(\d+)$/);
  if (chatMatch) return { name: 'chat', chatId: Number(chatMatch[1]) };
  return { name: 'unknown', raw };
}

export function buildHash(route) {
  switch (route?.name) {
    case 'chat':
      return route.chatId ? `#chat/${route.chatId}` : '';
    case 'settings':
      return '#settings';
    case 'profile':
      return '#profile';
    case 'notifications':
      return '#notifications';
    default:
      return '';
  }
}

export function navigate(route, { replace = false } = {}) {
  if (!authState.token) return;
  const next = buildHash(route);
  const current = window.location.hash;
  if (next === current) {
    dispatchRoute(route);
    return;
  }
  navigating = true;
  const url = window.location.pathname + window.location.search + next;
  if (replace) history.replaceState(null, '', url);
  else history.pushState(null, '', url);
  navigating = false;
  dispatchRoute(route);
}

export function clearRouteHash() {
  if (!window.location.hash) return;
  history.replaceState(null, '', window.location.pathname + window.location.search);
}

export function syncRouteFromHash() {
  if (!authState.token || navigating) return;
  dispatchRoute(parseRoute());
}

function dispatchRoute(route) {
  switch (route.name) {
    case 'chat':
      handlers.onChat?.(route.chatId);
      break;
    case 'settings':
      handlers.onSettings?.();
      break;
    case 'profile':
      handlers.onProfile?.();
      break;
    case 'notifications':
      handlers.onNotifications?.();
      break;
    case 'home':
      handlers.onHome?.();
      break;
    default:
      break;
  }
}

export function initRouter() {
  if (routerReady) return;
  routerReady = true;
  window.addEventListener('hashchange', () => {
    if (navigating) return;
    syncRouteFromHash();
  });
  window.addEventListener('popstate', () => {
    if (navigating) return;
    syncRouteFromHash();
  });
}
