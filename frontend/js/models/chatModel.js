/** MODEL — Chat and message API + merge helpers. */

import { authState, chatState, OPTIMISTIC_MATCH_MS, DEBOUNCE_MS, API_BASE } from '../config.js';
import { apiFetch } from './apiModel.js';
import {
  encryptMessage,
  decryptMessagesForChat,
  shouldEncryptContent,
  isE2eEncrypted
} from './e2eCrypto.js';

let messagesAbort = null;
let chatsAbort = null;

const chatsMemoryCache = { userId: null, data: null, ts: 0 };
const CHATS_LS_PREFIX = 'tg_chats_cache_';
let chatsRefreshTimer = null;
let chatsRefreshInFlight = false;

export function cancelMessageFetch() {
  if (messagesAbort) {
    messagesAbort.abort();
    messagesAbort = null;
  }
}

export function cancelChatsFetch() {
  if (chatsAbort) {
    chatsAbort.abort();
    chatsAbort = null;
  }
}

export function createMessageFetchSignal() {
  cancelMessageFetch();
  messagesAbort = new AbortController();
  return messagesAbort.signal;
}

export function createChatsFetchSignal() {
  cancelChatsFetch();
  chatsAbort = new AbortController();
  return chatsAbort.signal;
}

/** Synchronous cached chat list for the logged-in user (memory → localStorage). */
export function getChatsSync() {
  const userId = authState.user?.id;
  return userId ? getCachedChats(userId) : null;
}

export function getCachedChats(userId) {
  if (!userId) return null;
  if (chatsMemoryCache.userId === userId && chatsMemoryCache.data) {
    return chatsMemoryCache.data;
  }
  try {
    const raw = localStorage.getItem(`${CHATS_LS_PREFIX}${userId}`);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (Array.isArray(parsed)) {
      chatsMemoryCache.userId = userId;
      chatsMemoryCache.data = parsed;
      return parsed;
    }
  } catch {
    /* ignore corrupt cache */
  }
  return null;
}

export function setCachedChats(userId, chats) {
  if (!userId || !Array.isArray(chats)) return;
  chatsMemoryCache.userId = userId;
  chatsMemoryCache.data = chats;
  chatsMemoryCache.ts = Date.now();
  try {
    localStorage.setItem(`${CHATS_LS_PREFIX}${userId}`, JSON.stringify(chats));
  } catch {
    /* localStorage quota */
  }
}

export function clearChatsCache(userId) {
  if (userId) localStorage.removeItem(`${CHATS_LS_PREFIX}${userId}`);
  if (chatsMemoryCache.userId === userId) {
    chatsMemoryCache.userId = null;
    chatsMemoryCache.data = null;
    chatsMemoryCache.ts = 0;
  }
}

export async function fetchChats(signal = null) {
  const sig = signal || createChatsFetchSignal();
  const chats = await apiFetch('/chats', { signal: sig, retries: 1 });
  if (authState.user?.id) setCachedChats(authState.user.id, chats);
  return chats;
}

/**
 * Return cached chats immediately when available; refresh in background.
 * @returns {{ chats: array, fromCache: boolean }}
 */
export async function fetchChatsCached({ signal = null, background = false, onFresh = null } = {}) {
  const userId = authState.user?.id;
  const cached = userId ? getCachedChats(userId) : null;

  if (!background && cached?.length) {
    const sig = signal || createChatsFetchSignal();
    fetchChats(sig)
      .then((fresh) => {
        if (onFresh) onFresh(fresh);
      })
      .catch((err) => {
        if (err?.name !== 'AbortError' && err.status !== 401) {
          /* keep stale cache on background failure */
        }
      });
    return { chats: cached, fromCache: true };
  }

  const chats = await fetchChats(signal);
  return { chats, fromCache: false };
}

export function fetchChatsInBackground() {
  if (chatsRefreshInFlight || !authState.token) return;
  chatsRefreshInFlight = true;
  const sig = createChatsFetchSignal();
  fetchChats(sig)
    .catch((err) => {
      if (err?.name !== 'AbortError' && err.status !== 401) {
        /* silent background refresh failure */
      }
    })
    .finally(() => {
      chatsRefreshInFlight = false;
    });
}

export function scheduleDebouncedChatsRefresh(onUpdated, delay = DEBOUNCE_MS) {
  if (chatsRefreshTimer) clearTimeout(chatsRefreshTimer);
  chatsRefreshTimer = setTimeout(async () => {
    chatsRefreshTimer = null;
    if (!authState.token) return;
    try {
      const chats = await fetchChats();
      onUpdated?.(chats);
    } catch (err) {
      if (err.status !== 401 && err?.name !== 'AbortError') {
        /* keep cached list on transient errors */
      }
    }
  }, delay);
}

export async function fetchUsers() {
  return apiFetch('/users', { retries: 1 });
}

export async function fetchMessages(chatId, {
  offset = 0,
  limit = 50,
  signal = null,
  sinceId = null
} = {}) {
  const sig = signal || createMessageFetchSignal();
  const qs = new URLSearchParams({ limit: String(limit), offset: String(offset) });
  if (sinceId != null) qs.set('since_id', String(sinceId));
  const raw = await apiFetch(`/chats/${chatId}/messages?${qs}`, { signal: sig, retries: 1 });
  const payload = Array.isArray(raw)
    ? { messages: raw, total: raw.length, offset: 0, limit: raw.length, has_more: false }
    : raw;
  const messages = await decryptMessagesForChat(chatId, payload.messages || []);
  return { ...payload, messages };
}

export async function sendMessage(chatId, content, replyToId = null) {
  const chat = chatState.chats.find((c) => c.id === chatId) || chatState.activeChat;
  let payload = content;
  if (shouldEncryptContent(chat, content)) {
    payload = await encryptMessage(chatId, content);
  }

  const body = { content: payload };
  if (replyToId) body.reply_to_id = replyToId;
  return apiFetch(`/chats/${chatId}/messages`, { method: 'POST', body: JSON.stringify(body), retries: 2 });
}

export async function editMessage(chatId, messageId, content) {
  const chat = chatState.chats.find((c) => c.id === chatId) || chatState.activeChat;
  let payload = content;
  if (shouldEncryptContent(chat, content)) {
    payload = await encryptMessage(chatId, content);
  }
  return apiFetch(`/chats/${chatId}/messages/${messageId}`, {
    method: 'PATCH',
    body: JSON.stringify({ content: payload }),
    retries: 2
  });
}

export async function deleteMessage(chatId, messageId) {
  return apiFetch(`/chats/${chatId}/messages/${messageId}`, { method: 'DELETE', retries: 2 });
}

export async function hideMessage(chatId, messageId) {
  return apiFetch(`/chats/${chatId}/messages/${messageId}/hide`, { method: 'POST', retries: 2 });
}

export async function fetchMembers(chatId) {
  return apiFetch(`/chats/${chatId}/members`);
}

export async function addMemberToChat(chatId, userId) {
  return apiFetch(`/chats/${chatId}/members`, {
    method: 'POST',
    body: JSON.stringify({ user_id: userId })
  });
}

export async function forwardMessage(targetChatId, content) {
  return sendMessage(targetChatId, `↪ ${content}`);
}

export async function createPrivateChat(userId) {
  return apiFetch('/chats', {
    method: 'POST',
    body: JSON.stringify({ user_id: userId })
  });
}

export async function createGroupChat(name, memberIds) {
  return apiFetch('/chats', {
    method: 'POST',
    body: JSON.stringify({ type: 'group', name, member_ids: memberIds })
  });
}

export async function postTyping(chatId) {
  return apiFetch(`/chats/${chatId}/typing`, { method: 'POST' });
}

export async function fetchTyping(chatId) {
  return apiFetch(`/chats/${chatId}/typing`, { retries: 0 });
}

export async function sendHeartbeat() {
  return apiFetch('/users/heartbeat', { method: 'POST', retries: 0 });
}

export function sendOfflineBeacon() {
  const token = authState.token || localStorage.getItem('token');
  if (!token) return;
  fetch(`${API_BASE}/users/offline`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
    keepalive: true
  }).catch(() => {});
}

export function setActiveChat(chatId) {
  cancelMessageFetch();
  chatState.activeChatId = chatId;
  chatState.activeChat = chatState.chats.find((c) => c.id === chatId) || null;
  chatState.messages = [];
  chatState.messageMeta = {};
  chatState.lastReadCount = 0;
  chatState.replyTo = null;
  chatState.editingId = null;
  chatState.editingPlainText = null;
  chatState.messageSearch = '';
  chatState.messageSearchIndex = -1;
  chatState.messageTotal = 0;
  chatState.messageOffset = 0;
  chatState.hasMoreMessages = false;
}

export function clearActiveChat() {
  cancelMessageFetch();
  chatState.activeChatId = null;
  chatState.activeChat = null;
  chatState.messages = [];
  chatState.messageMeta = {};
  chatState.lastReadCount = 0;
  chatState.replyTo = null;
  chatState.messageSearch = '';
  chatState.messageSearchIndex = -1;
}

/** Merge server messages with optimistic temps; dedupe by id. */
export function mergeMessages(current, incoming, userId) {
  const keptOptimistic = [];
  const currentById = new Map(current.map((msg) => [String(msg.id), msg]));
  const incomingComparable = incoming.map((inc) => ({
    msg: inc,
    createdAt: new Date(inc.created_at).getTime(),
    content: inc.content
  }));

  for (const msg of current) {
    if (!String(msg.id).startsWith('temp-')) continue;
    const msgCreatedAt = new Date(msg.created_at).getTime();
    const matched = incomingComparable.some(
      ({ msg: inc, createdAt, content }) => inc.sender_id === userId
        && Math.abs(createdAt - msgCreatedAt) < OPTIMISTIC_MATCH_MS
        && (content === msg.content || (msg.plainContent && isE2eEncrypted(content)))
    );
    if (!matched) keptOptimistic.push(msg);
  }

  const appendIds = [];
  let updatedExisting = false;
  for (const inc of incoming) {
    const cur = currentById.get(String(inc.id));
    if (!cur) {
      appendIds.push(inc.id);
      continue;
    }
    if (
      cur.is_deleted !== inc.is_deleted
      || cur.content !== inc.content
      || cur.edited_at !== inc.edited_at
      || cur.reply_to_content !== inc.reply_to_content
    ) {
      updatedExisting = true;
    }
  }

  const merged = [...incoming];
  const mergedComparable = new Set(incoming.map((m) => `${m.sender_id}|${m.plainContent || m.content}`));
  for (const opt of keptOptimistic) {
    const plain = opt.plainContent || opt.content;
    const key = `${opt.sender_id}|${plain}`;
    if (!mergedComparable.has(key)) {
      merged.push(opt);
      mergedComparable.add(key);
    }
  }
  merged.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  return {
    messages: merged,
    appendIds,
    changed: appendIds.length > 0 || keptOptimistic.length > 0 || merged.length !== current.length || updatedExisting
  };
}

function isSameMessagePayload(a, b) {
  return a.is_deleted === b.is_deleted
    && a.content === b.content
    && a.edited_at === b.edited_at
    && a.reply_to_content === b.reply_to_content
    && a.is_read === b.is_read;
}

function optimisticMatchesIncoming(opt, inc, userId) {
  if (!String(opt.id).startsWith('temp-')) return false;
  if (inc.sender_id !== userId) return false;
  const optCreatedAt = new Date(opt.created_at).getTime();
  const incCreatedAt = new Date(inc.created_at).getTime();
  const contentMatches = inc.content === opt.content || (opt.plainContent && isE2eEncrypted(inc.content));
  return contentMatches && Math.abs(incCreatedAt - optCreatedAt) < OPTIMISTIC_MATCH_MS;
}

export function mergeMessageDelta(current, incoming, userId) {
  if (!incoming.length) {
    return { messages: current, appendIds: [], changed: false };
  }

  const merged = [...current];
  const indexById = new Map(merged.map((msg, index) => [String(msg.id), index]));
  const appendIds = [];
  let changed = false;

  for (const inc of incoming) {
    const id = String(inc.id);
    const existingIndex = indexById.get(id);
    if (existingIndex != null) {
      if (!isSameMessagePayload(merged[existingIndex], inc)) {
        merged[existingIndex] = inc;
        changed = true;
      }
      continue;
    }

    const optimisticIndex = merged.findIndex((msg) => optimisticMatchesIncoming(msg, inc, userId));
    if (optimisticIndex >= 0) {
      indexById.delete(String(merged[optimisticIndex].id));
      merged[optimisticIndex] = inc;
      indexById.set(id, optimisticIndex);
      appendIds.push(inc.id);
      changed = true;
      continue;
    }

    indexById.set(id, merged.length);
    merged.push(inc);
    appendIds.push(inc.id);
    changed = true;
  }

  if (changed) {
    merged.sort((a, b) => {
      const byTime = new Date(a.created_at) - new Date(b.created_at);
      if (byTime) return byTime;
      return String(a.id).localeCompare(String(b.id), undefined, { numeric: true });
    });
  }

  return { messages: merged, appendIds, changed };
}

export function chatsFingerprint(chats) {
  return chats.map((c) => `${c.id}:${c.unread_count}:${c.last_message_time}:${c.last_message_deleted ? 1 : 0}:${c.last_message}`).join('|');
}

export function messagesPrefixUnchanged(prevOrder, messages) {
  const incoming = messages.map((m) => String(m.id));
  let prefixLen = 0;
  while (prefixLen < prevOrder.length && prefixLen < incoming.length
    && prevOrder[prefixLen] === incoming[prefixLen]) {
    prefixLen += 1;
  }
  if (prefixLen < prevOrder.length) return { full: true, append: [] };
  if (prefixLen === incoming.length) return { full: false, append: [] };
  return { full: false, append: messages.slice(prefixLen) };
}

export function resetChatModelState() {
  cancelMessageFetch();
  cancelChatsFetch();
  if (chatsRefreshTimer) {
    clearTimeout(chatsRefreshTimer);
    chatsRefreshTimer = null;
  }
  chatsRefreshInFlight = false;
  const userId = authState.user?.id;
  if (userId) clearChatsCache(userId);
  chatState.chats = [];
  chatState.users = [];
  clearActiveChat();
}
