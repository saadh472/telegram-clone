/** MODEL — Client-side E2E encryption (demo AES-GCM via Web Crypto API). */

export const E2E_PREFIX = 'e2e:';
const E2E_DEMO_SECRET = 'telegram-clone-scd-demo-secret';
const E2E_PREFS_KEY = 'telegram_e2e_prefs';
const E2E_TOAST_KEY = 'telegram_e2e_toast_sent';

const keyCache = new Map();

export function isE2eEncrypted(content) {
  return typeof content === 'string' && content.startsWith(E2E_PREFIX);
}

function readPrefs() {
  try {
    return JSON.parse(sessionStorage.getItem(E2E_PREFS_KEY) || '{}');
  } catch {
    return {};
  }
}

function writePrefs(prefs) {
  sessionStorage.setItem(E2E_PREFS_KEY, JSON.stringify(prefs));
}

/** Private chats use E2E by default; groups opt-in via toggle. */
export function isE2eEnabledForChat(chat) {
  if (!chat) return false;
  const prefs = readPrefs();
  if (prefs[chat.id] === false) return false;
  if (prefs[chat.id] === true) return true;
  return chat.type === 'private';
}

export function setE2eEnabledForChat(chatId, enabled) {
  const prefs = readPrefs();
  prefs[chatId] = enabled;
  writePrefs(prefs);
}

export function shouldEncryptContent(chat, content) {
  if (!chat || !content || typeof content !== 'string') return false;
  if (!isE2eEnabledForChat(chat)) return false;
  if (content.startsWith('[sticker] ') || content.startsWith('[photo] ')
    || content.startsWith('[file] ') || content.startsWith('[voice] ')) {
    return false;
  }
  return !isE2eEncrypted(content);
}

async function deriveChatKey(chatId) {
  const cacheKey = String(chatId);
  if (keyCache.has(cacheKey)) return keyCache.get(cacheKey);

  const enc = new TextEncoder();
  const keyMaterial = await crypto.subtle.importKey(
    'raw',
    enc.encode(`${E2E_DEMO_SECRET}:${chatId}`),
    'PBKDF2',
    false,
    ['deriveKey']
  );
  const key = await crypto.subtle.deriveKey(
    {
      name: 'PBKDF2',
      salt: enc.encode('telegram-clone-e2e-v1'),
      iterations: 100000,
      hash: 'SHA-256'
    },
    keyMaterial,
    { name: 'AES-GCM', length: 256 },
    false,
    ['encrypt', 'decrypt']
  );
  keyCache.set(cacheKey, key);
  return key;
}

function bytesToBase64(bytes) {
  let binary = '';
  const chunk = 0x8000;
  for (let i = 0; i < bytes.length; i += chunk) {
    binary += String.fromCharCode(...bytes.subarray(i, i + chunk));
  }
  return btoa(binary);
}

function base64ToBytes(b64) {
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function encryptMessage(chatId, plaintext) {
  const key = await deriveChatKey(chatId);
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const enc = new TextEncoder();
  const ciphertext = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv },
    key,
    enc.encode(plaintext)
  );
  const combined = new Uint8Array(iv.length + ciphertext.byteLength);
  combined.set(iv, 0);
  combined.set(new Uint8Array(ciphertext), iv.length);
  return `${E2E_PREFIX}${bytesToBase64(combined)}`;
}

export async function decryptMessage(chatId, encryptedContent) {
  if (!isE2eEncrypted(encryptedContent)) return encryptedContent;
  const b64 = encryptedContent.slice(E2E_PREFIX.length);
  const combined = base64ToBytes(b64);
  const iv = combined.slice(0, 12);
  const data = combined.slice(12);
  const key = await deriveChatKey(chatId);
  const plaintext = await crypto.subtle.decrypt(
    { name: 'AES-GCM', iv },
    key,
    data
  );
  return new TextDecoder().decode(plaintext);
}

const E2E_CHUNK_SIZE = 10;
const E2E_IDLE_THRESHOLD = 40;

function scheduleDecryptYield() {
  if (typeof requestIdleCallback === 'function') {
    return new Promise((resolve) => {
      requestIdleCallback(() => resolve(), { timeout: 80 });
    });
  }
  return new Promise((resolve) => {
    requestAnimationFrame(() => resolve());
  });
}

async function decryptOneMessage(chatId, msg) {
  if (!isE2eEncrypted(msg.content)) return msg;
  try {
    const content = await decryptMessage(chatId, msg.content);
    const copy = { ...msg, content, e2e: true };
    if (copy.reply_to_content && isE2eEncrypted(copy.reply_to_content)) {
      try {
        copy.reply_to_content = await decryptMessage(chatId, copy.reply_to_content);
      } catch {
        copy.reply_to_content = '🔒 Encrypted message';
      }
    }
    return copy;
  } catch {
    return { ...msg, content: '🔒 Unable to decrypt', e2e: true, decryptFailed: true };
  }
}

export async function decryptMessagesForChat(chatId, messages) {
  if (!Array.isArray(messages) || !messages.length) return messages || [];

  const useIdle = messages.length > E2E_IDLE_THRESHOLD;
  const out = [];

  for (let i = 0; i < messages.length; i += 1) {
    if (useIdle && i > 0 && i % E2E_CHUNK_SIZE === 0) {
      await scheduleDecryptYield();
    }
    out.push(await decryptOneMessage(chatId, messages[i]));
  }
  return out;
}

export function markE2eToastShown(chatId) {
  const key = `${E2E_TOAST_KEY}_${chatId}`;
  sessionStorage.setItem(key, '1');
}

export function shouldShowE2eToast(chatId) {
  return sessionStorage.getItem(`${E2E_TOAST_KEY}_${chatId}`) !== '1';
}

export const E2E_LOCK_ICON = '<svg class="e2e-lock-icon" width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M18 8h-1V6c0-2.76-2.24-5-5-5S7 3.24 7 6v2H6c-1.1 0-2 .9-2 2v10c0 1.1.9 2 2 2h12c1.1 0 2-.9 2-2V10c0-1.1-.9-2-2-2zm-6 9c-1.1 0-2-.9-2-2s.9-2 2-2 2 .9 2 2-.9 2-2 2zm3.1-9H8.9V6c0-1.71 1.39-3.1 3.1-3.1 1.71 0 3.1 1.39 3.1 3.1v2z"/></svg>';

export function e2eLockBadgeHtml() {
  return `<span class="msg-e2e-badge" title="End-to-end encrypted">${E2E_LOCK_ICON}</span>`;
}

/** Centered in-thread E2E notice (Telegram-style), placed above date dividers. */
export function e2eChatBannerHtml() {
  return `<div id="e2e-chat-banner" class="e2e-chat-banner" role="button" tabindex="0" title="Tap to learn more">
    <span class="e2e-chat-banner-pill">${E2E_LOCK_ICON}<span class="e2e-chat-banner-text">Demo E2E encryption (client-side AES — not Signal)</span></span>
  </div>`;
}

export function updateChatHeaderLock(chat) {
  const lock = document.getElementById('chat-e2e-lock');
  if (!lock) return;
  const enabled = isE2eEnabledForChat(chat);
  lock.classList.toggle('hidden', !enabled);
  lock.setAttribute('title', enabled ? 'End-to-end encrypted' : '');
}

export function updateE2eToggleButton(chat) {
  const btn = document.getElementById('chat-info-e2e-btn');
  if (!btn || !chat) return;
  const enabled = isE2eEnabledForChat(chat);
  const label = btn.querySelector('.chat-info-action-label');
  if (label) label.textContent = enabled ? 'Encryption enabled' : 'Enable encryption';
  btn.classList.toggle('active', enabled);
}
