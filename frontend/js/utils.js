/** DOM helpers, formatting, toasts. */
import { DEBOUNCE_MS, SENDER_COLORS, MESSAGE_EDIT_MS, authState } from './config.js';
import { getChatPref } from './models/chatPrefs.js';

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];

const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])'
].join(',');

const focusReturnStack = new WeakMap();

function visibleFocusable(el) {
  if (!el) return false;
  if (el.closest('[hidden], .hidden')) return false;
  const style = window.getComputedStyle(el);
  return style.visibility !== 'hidden' && style.display !== 'none';
}

export function getFocusableElements(root = document) {
  return $$(FOCUSABLE_SELECTOR, root).filter(visibleFocusable);
}

export function rememberFocus(surface) {
  if (surface && document.activeElement instanceof HTMLElement) {
    focusReturnStack.set(surface, document.activeElement);
  }
}

export function restoreFocus(surface, fallbackSelector = '') {
  const target = surface ? focusReturnStack.get(surface) : null;
  const fallback = fallbackSelector ? $(fallbackSelector) : null;
  requestAnimationFrame(() => {
    if (target && document.contains(target) && !target.disabled) target.focus({ preventScroll: true });
    else if (fallback && !fallback.disabled) fallback.focus({ preventScroll: true });
  });
}

export function focusFirstIn(root, preferredSelector = '') {
  if (!root) return;
  requestAnimationFrame(() => {
    const preferred = preferredSelector ? $(preferredSelector, root) : null;
    if (preferred && !preferred.disabled && visibleFocusable(preferred)) {
      preferred.focus({ preventScroll: true });
      return;
    }
    getFocusableElements(root)[0]?.focus({ preventScroll: true });
  });
}

export function trapFocusIn(root, event) {
  if (!root || event.key !== 'Tab') return;
  const focusable = getFocusableElements(root);
  if (!focusable.length) {
    event.preventDefault();
    root.focus?.({ preventScroll: true });
    return;
  }
  const first = focusable[0];
  const last = focusable[focusable.length - 1];
  if (event.shiftKey && document.activeElement === first) {
    event.preventDefault();
    last.focus({ preventScroll: true });
  } else if (!event.shiftKey && document.activeElement === last) {
    event.preventDefault();
    first.focus({ preventScroll: true });
  }
}

export function initFocusGuards() {
  if (document.body.dataset.focusGuardsReady) return;
  document.body.dataset.focusGuardsReady = '1';
  document.addEventListener('keydown', (event) => {
    if (event.key !== 'Tab') return;
    const surfaces = $$('.modal.open, .settings-panel.open, .profile-panel.open, .notifications-panel.open, .chat-info-panel.open, .shortcuts-panel.open, .confirm-dialog.open, .call-overlay:not(.hidden)');
    const topSurface = surfaces[surfaces.length - 1];
    if (topSurface) trapFocusIn(topSurface, event);
  });
}

export function escapeHtml(str) {
  const d = document.createElement('div');
  d.textContent = str ?? '';
  return d.innerHTML;
}

/** Block XSS via malicious data: URLs in img/src or download href. */
const BLOCKED_DATA_MIMES = /^(text\/html|text\/javascript|application\/javascript|image\/svg)/i;

export function sanitizeDataUrl(url, allowedPrefixes = ['image/']) {
  if (!url || typeof url !== 'string' || !url.startsWith('data:')) return null;
  const semi = url.indexOf(';');
  const mime = (semi > 5 ? url.slice(5, semi) : url.slice(5)).toLowerCase().trim();
  if (BLOCKED_DATA_MIMES.test(mime)) return null;
  if (!allowedPrefixes.some((p) => mime.startsWith(p))) return null;
  return url;
}

export function sanitizeImageDataUrl(url) {
  return sanitizeDataUrl(url, ['image/jpeg', 'image/png', 'image/gif', 'image/webp', 'image/']);
}

export function sanitizeFileDataUrl(url) {
  return sanitizeDataUrl(url, [
    'application/octet-stream', 'application/pdf', 'application/zip',
    'text/plain', 'application/msword', 'application/vnd.'
  ]);
}

export function sanitizeAudioDataUrl(url) {
  return sanitizeDataUrl(url, ['audio/']);
}

const EMPTY_ICON_SEARCH = `<svg viewBox="0 0 120 120" width="100" height="100">
  <circle cx="60" cy="60" r="50" fill="var(--accent-soft)" opacity="0.5"/>
  <circle cx="52" cy="52" r="22" fill="none" stroke="var(--accent)" stroke-width="4"/>
  <line x1="68" y1="68" x2="88" y2="88" stroke="var(--accent)" stroke-width="4" stroke-linecap="round"/>
  <line x1="38" y1="78" x2="82" y2="78" stroke="var(--text-muted)" stroke-width="3" stroke-linecap="round" opacity="0.4"/>
  <line x1="44" y1="88" x2="70" y2="88" stroke="var(--text-muted)" stroke-width="3" stroke-linecap="round" opacity="0.25"/>
</svg>`;

const EMPTY_ICON_CHAT = `<svg viewBox="0 0 80 80" width="64" height="64">
  <circle cx="40" cy="40" r="36" fill="var(--accent-soft)" opacity="0.6"/>
  <path fill="var(--accent)" d="M24 38h32v4H24zm0-10h20v4H24zm0 20h26v4H24z" opacity="0.9"/>
</svg>`;

const EMPTY_ICON_FORWARD = `<svg viewBox="0 0 80 80" width="64" height="64">
  <circle cx="40" cy="40" r="36" fill="var(--accent-soft)" opacity="0.5"/>
  <path fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" d="M28 40h24M44 30l8 10-8 10" opacity="0.9"/>
</svg>`;

const EMPTY_ICON_USERS = `<svg viewBox="0 0 80 80" width="64" height="64">
  <circle cx="40" cy="40" r="36" fill="var(--accent-soft)" opacity="0.5"/>
  <circle cx="34" cy="34" r="14" fill="none" stroke="var(--accent)" stroke-width="3"/>
  <line x1="44" y1="44" x2="56" y2="56" stroke="var(--accent)" stroke-width="3" stroke-linecap="round"/>
</svg>`;

const EMPTY_ICON_MESSAGES = `<svg viewBox="0 0 80 80" width="64" height="64">
  <circle cx="40" cy="40" r="36" fill="var(--accent-soft)" opacity="0.6"/>
  <path fill="none" stroke="var(--accent)" stroke-width="3" stroke-linecap="round" d="M24 32c0-4 4-8 16-8s16 4 16 8v12c0 4-4 8-16 8H32l-8 8v-8" opacity="0.9"/>
</svg>`;

const EMPTY_ICON_GENERIC = EMPTY_ICON_USERS;

const EMPTY_ICONS = {
  search: EMPTY_ICON_SEARCH,
  chat: EMPTY_ICON_CHAT,
  forward: EMPTY_ICON_FORWARD,
  users: EMPTY_ICON_USERS,
  messages: EMPTY_ICON_MESSAGES,
  generic: EMPTY_ICON_GENERIC
};

/** Unified empty-state markup for sidebar, modals, and chat panes. */
export function buildEmptyInlineHtml({
  title = '',
  hint = '',
  extraClass = '',
  icon = 'generic',
  svg = null,
  htmlTitle = false,
  htmlHint = false,
  extra = ''
} = {}) {
  const iconMarkup = svg !== false
    ? `<div class="empty-state-icon" aria-hidden="true">${svg || EMPTY_ICONS[icon] || EMPTY_ICON_GENERIC}</div>`
    : '';
  const titleHtml = title
    ? `<p class="empty-title">${htmlTitle ? title : escapeHtml(title)}</p>`
    : '';
  const hintHtml = hint
    ? `<p class="empty-hint">${htmlHint ? hint : escapeHtml(hint)}</p>`
    : '';
  const classes = ['empty-inline', extraClass].filter(Boolean).join(' ');
  return `<div class="${classes}">${iconMarkup}${titleHtml}${hintHtml}${extra}</div>`;
}

export function debounce(fn, ms = DEBOUNCE_MS) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), ms);
  };
}

export function throttle(fn, ms) {
  let last = 0;
  let pending = null;
  return (...args) => {
    const now = Date.now();
    const remaining = ms - (now - last);
    if (remaining <= 0) {
      if (pending) {
        clearTimeout(pending);
        pending = null;
      }
      last = now;
      fn(...args);
    } else if (!pending) {
      pending = setTimeout(() => {
        last = Date.now();
        pending = null;
        fn(...args);
      }, remaining);
    }
  };
}

/** Coalesce rapid calls to one animation frame (ideal for scroll handlers). */
export function rafThrottle(fn) {
  let scheduled = false;
  let lastArgs = null;
  return (...args) => {
    lastArgs = args;
    if (scheduled) return;
    scheduled = true;
    requestAnimationFrame(() => {
      scheduled = false;
      fn(...lastArgs);
    });
  };
}

/** Force chat list re-render on next call (after send / new message). */
export function invalidateChatListCache(uiState) {
  uiState.lastChatListFingerprint = '';
}

export function getInitials(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length >= 2) return (parts[0][0] + parts[1][0]).toUpperCase();
  return name.slice(0, 2).toUpperCase();
}

export function senderColor(id, colors = SENDER_COLORS) {
  return colors[(id || 0) % colors.length];
}

export function formatChatTime(iso) {
  if (!iso) return '';
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'now';
  if (d.toDateString() === now.toDateString()) {
    return d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  }
  if (diff < 604800000) {
    return d.toLocaleDateString([], { weekday: 'short' });
  }
  return d.toLocaleDateString([], { month: 'short', day: 'numeric' });
}

export function formatBubbleTime(iso) {
  if (!iso) return '';
  return new Date(iso).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
}

export function formatDateDivider(iso) {
  const d = new Date(iso);
  const now = new Date();
  if (d.toDateString() === now.toDateString()) return 'Today';
  const yesterday = new Date(now);
  yesterday.setDate(yesterday.getDate() - 1);
  if (d.toDateString() === yesterday.toDateString()) return 'Yesterday';
  return d.toLocaleDateString([], { month: 'long', day: 'numeric', year: 'numeric' });
}

export function highlightMatch(text, query) {
  if (!query) return escapeHtml(text);
  const re = new RegExp(`(${query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
  return escapeHtml(text).replace(re, '<mark>$1</mark>');
}

/** Rich multi-stop palettes — index chosen by hashed username/key. */
const AVATAR_PALETTES = [
  ['#667eea', '#764ba2', '#5b4bb4'],
  ['#f093fb', '#f5576c', '#c23616'],
  ['#4facfe', '#00c6fb', '#3390ec'],
  ['#43e97b', '#38f9d7', '#27ae60'],
  ['#fa709a', '#fee140', '#e17076'],
  ['#30cfd0', '#667eea', '#a695e7'],
  ['#a8edea', '#fed6e3', '#65aadd'],
  ['#ff9a9e', '#fad0c4', '#e17076'],
  ['#ffecd2', '#fcb69f', '#e5ca77'],
  ['#11998e', '#38ef7d', '#7bc862'],
  ['#ee0979', '#ff6a00', '#e53935'],
  ['#8360c3', '#2ebf91', '#3390ec']
];

function hashAvatarKey(str) {
  let h = 2166136261;
  const s = String(str || 'default');
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** Multi-stop gradient from hashed key; optional base color tints the palette. */
export function avatarGradient(color, key = '') {
  const seed = key || color || 'default';
  const [c1, c2, c3] = AVATAR_PALETTES[hashAvatarKey(seed) % AVATAR_PALETTES.length];
  const base = color || c1;
  return `linear-gradient(135deg, ${base} 0%, color-mix(in srgb, ${base} 50%, ${c2}) 38%, color-mix(in srgb, ${c2} 65%, ${c3}) 72%, ${c3} 100%)`;
}

/** Inline style background for a user or chat avatar. */
export function userAvatarStyle(userOrKey, color) {
  const key = typeof userOrKey === 'object'
    ? (userOrKey.username || userOrKey.display_name || String(userOrKey.id || ''))
    : String(userOrKey || '');
  const c = (typeof userOrKey === 'object' ? userOrKey.avatar_color : color) || '#3390ec';
  return avatarGradient(c, key);
}

/** Lightweight confirm — returns a Promise<boolean>. */
export function confirmAction(message, { title = 'Confirm', confirmLabel = 'Confirm', cancelLabel = 'Cancel' } = {}) {
  return new Promise((resolve) => {
    const existing = $('#confirm-dialog');
    existing?.remove();
    const overlay = document.createElement('div');
    overlay.id = 'confirm-dialog';
    overlay.className = 'confirm-dialog';
    overlay.setAttribute('role', 'alertdialog');
    overlay.setAttribute('aria-modal', 'true');
    overlay.setAttribute('aria-labelledby', 'confirm-dialog-title');
    overlay.innerHTML = `
      <div class="confirm-dialog-backdrop" data-action="cancel"></div>
      <div class="confirm-dialog-card">
        <h4 id="confirm-dialog-title">${escapeHtml(title)}</h4>
        <p>${escapeHtml(message)}</p>
        <div class="confirm-dialog-actions">
          <button type="button" class="btn-secondary" data-action="cancel">${escapeHtml(cancelLabel)}</button>
          <button type="button" class="btn-primary" data-action="confirm">${escapeHtml(confirmLabel)}</button>
        </div>
      </div>`;
    document.body.appendChild(overlay);
    rememberFocus(overlay);
    requestAnimationFrame(() => overlay.classList.add('open'));
    const cleanup = (result) => {
      overlay.classList.remove('open');
      document.removeEventListener('keydown', onKey);
      setTimeout(() => {
        overlay.remove();
        restoreFocus(overlay);
      }, 200);
      resolve(result);
    };
    overlay.addEventListener('click', (e) => {
      const action = e.target.closest('[data-action]')?.dataset.action;
      if (action === 'confirm') cleanup(true);
      else if (action === 'cancel') cleanup(false);
    });
    const onKey = (e) => {
      if (e.key === 'Escape') cleanup(false);
    };
    document.addEventListener('keydown', onKey);
    focusFirstIn(overlay, '[data-action="cancel"]');
  });
}

export function showToast(message, type = 'info') {
  const container = $('#toast-container');
  if (!container) return;
  const icons = {
    success: '<svg class="toast-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
    error: '<svg class="toast-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>',
    info: '<svg class="toast-icon" viewBox="0 0 24 24"><path fill="currentColor" d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-6h2v6zm0-8h-2V7h2v2z"/></svg>'
  };
  const el = document.createElement('div');
  el.className = `toast toast-${type}`;
  el.innerHTML = `${icons[type] || icons.info}<span>${escapeHtml(message)}</span>`;
  container.appendChild(el);
  requestAnimationFrame(() => el.classList.add('show'));
  setTimeout(() => {
    el.classList.remove('show');
    setTimeout(() => el.remove(), 350);
  }, 3500);
}

export function formatLastSeen(iso, online = false) {
  if (online) return 'online';
  if (!iso) return 'last seen recently';
  const d = new Date(iso);
  const now = new Date();
  const diff = now - d;
  if (diff < 60000) return 'last seen just now';
  if (diff < 3600000) return `last seen ${Math.floor(diff / 60000)} min ago`;
  if (d.toDateString() === now.toDateString()) {
    return `last seen today at ${d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}`;
  }
  return `last seen ${d.toLocaleDateString([], { month: 'short', day: 'numeric' })}`;
}

export function updateTabBadge(unreadTotal) {
  document.title = unreadTotal > 0 ? `(${unreadTotal}) Telegram Web` : 'Telegram Web';
}

export function updateSidebarBadge(unreadTotal) {
  const badge = $('#sidebar-unread-badge');
  if (!badge) return;
  if (unreadTotal > 0) {
    badge.textContent = unreadTotal > 99 ? '99+' : String(unreadTotal);
    badge.classList.remove('hidden');
  } else {
    badge.textContent = '';
    badge.classList.add('hidden');
  }
}

export const STICKER_PREFIX = '[sticker] ';

export function isStickerMessage(content) {
  return typeof content === 'string' && content.startsWith(STICKER_PREFIX);
}

export function parseStickerEmoji(content) {
  if (!isStickerMessage(content)) return null;
  return content.slice(STICKER_PREFIX.length).trim() || '🎭';
}

export function formatStickerContent(emoji) {
  return `${STICKER_PREFIX}${emoji}`;
}

export const PHOTO_PREFIX = '[photo] ';
export const FILE_PREFIX = '[file] ';
export const VOICE_PREFIX = '[voice] ';
const MEDIA_SEP = '|';

export function isPhotoMessage(content) {
  return typeof content === 'string' && content.startsWith(PHOTO_PREFIX);
}

export function isFileMessage(content) {
  return typeof content === 'string' && content.startsWith(FILE_PREFIX);
}

export function isVoiceMessage(content) {
  return typeof content === 'string' && content.startsWith(VOICE_PREFIX);
}

export function isMediaMessage(content) {
  return isPhotoMessage(content) || isFileMessage(content) || isVoiceMessage(content);
}

export const DELETED_MESSAGE_TEXT = 'This message was deleted';
export const DELETED_CONTENT_MARKER = '[deleted]';

export function isMessageDeleted(msg) {
  if (!msg) return false;
  if (msg.is_deleted) return true;
  return msg.content === DELETED_CONTENT_MARKER;
}

export function isDeletedContent(content) {
  return content === DELETED_CONTENT_MARKER;
}

export function isTextOnlyMessage(msg) {
  if (!msg?.content) return false;
  const c = msg.content;
  return !isStickerMessage(c) && !isPhotoMessage(c) && !isFileMessage(c) && !isVoiceMessage(c);
}

export function canEditMessage(msg, userId = authState.user?.id) {
  if (!msg || !userId || msg.sender_id !== userId) return false;
  if (isMessageDeleted(msg)) return false;
  if (String(msg.id).startsWith('temp-')) return false;
  if (!isTextOnlyMessage(msg)) return false;
  const age = Date.now() - new Date(msg.created_at).getTime();
  return age <= MESSAGE_EDIT_MS;
}

export function parsePhotoFilename(content) {
  if (!isPhotoMessage(content)) return null;
  const rest = content.slice(PHOTO_PREFIX.length);
  const pipe = rest.lastIndexOf(MEDIA_SEP);
  return (pipe >= 0 ? rest.slice(0, pipe) : rest).trim() || 'Photo';
}

export function parsePhotoBase64(content) {
  if (!isPhotoMessage(content)) return null;
  const rest = content.slice(PHOTO_PREFIX.length);
  const pipe = rest.lastIndexOf(MEDIA_SEP);
  if (pipe < 0) return null;
  const b64 = rest.slice(pipe + 1).trim();
  if (!b64) return null;
  return b64.startsWith('data:') ? b64 : `data:image/jpeg;base64,${b64}`;
}

export function parseFileFilename(content) {
  if (!isFileMessage(content)) return null;
  const rest = content.slice(FILE_PREFIX.length);
  const pipe = rest.lastIndexOf(MEDIA_SEP);
  return (pipe >= 0 ? rest.slice(0, pipe) : rest).trim() || 'File';
}

export function parseFileBase64(content) {
  if (!isFileMessage(content)) return null;
  const rest = content.slice(FILE_PREFIX.length);
  const pipe = rest.lastIndexOf(MEDIA_SEP);
  if (pipe < 0) return null;
  const b64 = rest.slice(pipe + 1).trim();
  if (!b64) return null;
  return b64.startsWith('data:') ? b64 : `data:application/octet-stream;base64,${b64}`;
}

export function parseVoiceDuration(content) {
  if (!isVoiceMessage(content)) return null;
  const rest = content.slice(VOICE_PREFIX.length);
  const pipe = rest.lastIndexOf(MEDIA_SEP);
  return (pipe >= 0 ? rest.slice(0, pipe) : rest).trim() || '0:00';
}

export function parseVoiceBase64(content) {
  if (!isVoiceMessage(content)) return null;
  const rest = content.slice(VOICE_PREFIX.length);
  const pipe = rest.lastIndexOf(MEDIA_SEP);
  if (pipe < 0) return null;
  const b64 = rest.slice(pipe + 1).trim();
  if (!b64) return null;
  return b64.startsWith('data:') ? b64 : `data:audio/webm;base64,${b64}`;
}

export function formatPhotoContent(filename, dataUrl = null) {
  const name = filename || 'Photo';
  if (dataUrl) {
    const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    return `${PHOTO_PREFIX}${name}${MEDIA_SEP}${b64}`;
  }
  return `${PHOTO_PREFIX}${name}`;
}

export function formatFileContent(filename, dataUrl = null) {
  const name = filename || 'File';
  if (dataUrl) {
    const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    return `${FILE_PREFIX}${name}${MEDIA_SEP}${b64}`;
  }
  return `${FILE_PREFIX}${name}`;
}

export function formatVoiceContent(seconds, dataUrl = null) {
  const label = typeof seconds === 'string' ? seconds : formatVoiceDuration(seconds);
  if (dataUrl) {
    const b64 = dataUrl.includes(',') ? dataUrl.split(',')[1] : dataUrl;
    return `${VOICE_PREFIX}${label}${MEDIA_SEP}${b64}`;
  }
  return `${VOICE_PREFIX}${label}`;
}

export function formatVoiceDuration(seconds) {
  const s = Math.max(0, Math.floor(seconds));
  const mins = Math.floor(s / 60);
  const secs = s % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function formatMediaReplyPreview(content) {
  if (isDeletedContent(content)) return DELETED_MESSAGE_TEXT;
  if (isStickerMessage(content)) return `${parseStickerEmoji(content)} Sticker`;
  if (isPhotoMessage(content)) return `📷 ${parsePhotoFilename(content)}`;
  if (isFileMessage(content)) return `📎 ${parseFileFilename(content)}`;
  if (isVoiceMessage(content)) return `🎤 Voice message (${parseVoiceDuration(content)})`;
  return content;
}

const photoThumbnailCache = new Map();

export function cachePhotoThumbnail(messageId, dataUrl) {
  if (messageId && dataUrl) photoThumbnailCache.set(String(messageId), dataUrl);
}

export function getPhotoThumbnail(messageId, content = null) {
  if (content) {
    const embedded = parsePhotoBase64(content);
    if (embedded) return embedded;
  }
  return photoThumbnailCache.get(String(messageId)) || null;
}

export function migratePhotoThumbnail(fromId, toId) {
  const key = String(fromId);
  const url = photoThumbnailCache.get(key);
  if (url && toId) {
    photoThumbnailCache.set(String(toId), url);
    photoThumbnailCache.delete(key);
  }
}

/** Format last message preview with media type icons. */
export function isForwardedContent(content) {
  return typeof content === 'string' && content.startsWith('↪ ');
}

export function stripForwardPrefix(content) {
  if (!isForwardedContent(content)) return content;
  return content.slice(2).trimStart();
}

export function formatMessagePreview(text, { deleted = false } = {}) {
  if (deleted) return { icon: '', label: DELETED_MESSAGE_TEXT, deleted: true };
  if (!text) return { icon: '', label: 'No messages' };
  const t = text.trim();
  if (t === DELETED_CONTENT_MARKER || t === DELETED_MESSAGE_TEXT) {
    return { icon: '', label: DELETED_MESSAGE_TEXT, deleted: true };
  }
  if (t.startsWith('e2e:')) return { icon: '🔒', label: 'Encrypted message' };
  if (isStickerMessage(t)) return { icon: parseStickerEmoji(t) || '🎭', label: 'Sticker' };
  if (isPhotoMessage(t) || t === '📷 Photo' || t.startsWith('data:image/')) {
    return { icon: '📷', label: isPhotoMessage(t) ? (parsePhotoFilename(t) || 'Photo') : 'Photo' };
  }
  if (isFileMessage(t)) return { icon: '📎', label: parseFileFilename(t) || 'File' };
  if (isVoiceMessage(t) || t === '🎤 Voice message' || t.startsWith('data:audio/')) {
    const dur = isVoiceMessage(t) ? parseVoiceDuration(t) : null;
    return { icon: '🎤', label: dur ? `Voice message (${dur})` : 'Voice message' };
  }
  if (t.startsWith('↪')) {
    const nested = formatMessagePreview(t.replace(/^↪\s*/, ''));
    return { icon: nested.icon || '↪', label: nested.label.slice(0, 60) };
  }
  if (/^data:[^;]+;base64,/.test(t) || (t.length > 120 && /^[A-Za-z0-9+/=\s]+$/.test(t.slice(0, 120)))) {
    return { icon: '📎', label: 'Attachment' };
  }
  return { icon: '', label: t.slice(0, 80) };
}

export function chatsUnreadTotal(chats) {
  return chats.reduce((sum, c) => {
    if (getChatPref(c.id).muted) return sum;
    return sum + (c.unread_count || 0);
  }, 0);
}

export const URL_REGEX = /https?:\/\/[^\s<>"{}|\\^`[\]]+/gi;

export function extractFirstUrl(text) {
  if (!text || typeof text !== 'string') return null;
  const match = text.match(/https?:\/\/[^\s<>"{}|\\^`[\]]+/i);
  return match?.[0] || null;
}

export function linkifyContent(text) {
  if (!text) return '';
  const escaped = escapeHtml(text);
  return escaped.replace(/https?:\/\/[^\s<>"{}|\\^`[\]]+/gi, (url) =>
    `<a href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer" class="msg-link">${escapeHtml(url)}</a>`
  );
}

export function getLinkPreviewStub(url) {
  try {
    const u = new URL(url);
    const domain = u.hostname.replace(/^www\./, '');
    return { url, domain, title: `${domain.charAt(0).toUpperCase() + domain.slice(1)} (link preview stub)` };
  } catch {
    return null;
  }
}

export function buildLinkPreviewHtml(url) {
  const preview = getLinkPreviewStub(url);
  if (!preview) return '';
  return `
    <a class="link-preview" href="${escapeHtml(preview.url)}" target="_blank" rel="noopener noreferrer">
      <span class="link-preview-bar"></span>
      <span class="link-preview-body">
        <span class="link-preview-title">${escapeHtml(preview.title)}</span>
        <span class="link-preview-domain">${escapeHtml(preview.domain)}</span>
      </span>
    </a>`;
}

/** Ripple effect for icon buttons — call once after DOM ready. */
export function initRippleButtons(root = document) {
  const selector = '.icon-btn, .input-tool-btn, .action-btn, .header-action-btn, .chat-action-btn, .new-chat-fab, .install-app-btn, .btn-primary, .btn-secondary, .btn-danger, .btn-ghost, .settings-quick-action, .chat-filter-tab';
  $$(selector, root).forEach((btn) => {
    if (btn.dataset.ripple) return;
    btn.dataset.ripple = '1';
    btn.addEventListener('click', (e) => {
      if (btn.disabled || btn.getAttribute('aria-disabled') === 'true') return;
      const rect = btn.getBoundingClientRect();
      const ripple = document.createElement('span');
      ripple.className = 'ripple';
      const size = Math.max(rect.width, rect.height) * 2;
      ripple.style.width = `${size}px`;
      ripple.style.height = `${size}px`;
      ripple.style.left = `${e.clientX - rect.left - size / 2}px`;
      ripple.style.top = `${e.clientY - rect.top - size / 2}px`;
      btn.appendChild(ripple);
      ripple.addEventListener('animationend', () => ripple.remove(), { once: true });
    });
  });
}

export function animateSendSuccess(row) {
  if (!row) return;
  row.classList.add('msg-just-sent');
  const status = row.querySelector('.msg-status');
  if (status) status.classList.add('status-pop');
  setTimeout(() => {
    row.classList.remove('msg-just-sent');
    status?.classList.remove('status-pop');
  }, 600);
}

/** Lazy-load images in message thread via IntersectionObserver. */
let lazyMediaObserver = null;

export function initLazyMediaObserver(root = document) {
  if (lazyMediaObserver) lazyMediaObserver.disconnect();
  if (!('IntersectionObserver' in window)) return;

  lazyMediaObserver = new IntersectionObserver((entries) => {
    entries.forEach((entry) => {
      if (!entry.isIntersecting) return;
      const img = entry.target;
      const src = img.dataset.src;
      if (src && img.src !== src) {
        img.src = src;
        img.removeAttribute('data-src');
      }
      lazyMediaObserver.unobserve(img);
    });
  }, { rootMargin: '120px' });

  root.querySelectorAll('img.photo-thumb[data-src]').forEach((img) => {
    lazyMediaObserver.observe(img);
  });
}

export function observeLazyImage(img) {
  if (!lazyMediaObserver || !img?.dataset?.src) return;
  lazyMediaObserver.observe(img);
}

