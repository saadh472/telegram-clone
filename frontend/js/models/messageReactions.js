/** MODEL — Message reactions (server source of truth; localStorage offline cache). */
import { authState, chatState, connectionState, REACTIONS_STORAGE_KEY } from '../config.js';
import { apiFetch } from './apiModel.js';

/** In-memory cache for current session — populated from server. */
const reactionsCache = new Map();

function loadAllLocal() {
  try {
    return JSON.parse(localStorage.getItem(REACTIONS_STORAGE_KEY) || '{}');
  } catch {
    return {};
  }
}

function saveAllLocal(data) {
  try {
    localStorage.setItem(REACTIONS_STORAGE_KEY, JSON.stringify(data));
  } catch {
    /* quota */
  }
}

function cacheKey(messageId) {
  return String(messageId);
}

function setCache(messageId, reactions) {
  const key = cacheKey(messageId);
  if (!reactions || !Object.keys(reactions).length) {
    reactionsCache.delete(key);
  } else {
    reactionsCache.set(key, reactions);
  }
}

export function getReactionsForMessage(messageId) {
  const key = cacheKey(messageId);
  if (reactionsCache.has(key)) return reactionsCache.get(key);
  return loadAllLocal()[key] || {};
}

export function hasUserReacted(messageId, emoji) {
  const userId = authState.user?.id;
  if (!userId) return false;
  const reactions = getReactionsForMessage(messageId);
  return (reactions[emoji] || []).includes(userId);
}

function applyLocalToggle(messageId, emoji, userId) {
  const key = cacheKey(messageId);
  const all = loadAllLocal();
  if (!all[key]) all[key] = {};
  if (!all[key][emoji]) all[key][emoji] = [];
  const users = all[key][emoji];
  const idx = users.indexOf(userId);
  if (idx >= 0) users.splice(idx, 1);
  else users.push(userId);
  if (users.length === 0) delete all[key][emoji];
  if (Object.keys(all[key]).length === 0) delete all[key];
  saveAllLocal(all);
  const reactions = all[key] ? { ...all[key] } : {};
  setCache(messageId, Object.keys(reactions).length ? reactions : null);
  return reactions;
}

export function setReactionsForMessage(messageId, reactions) {
  const key = cacheKey(messageId);
  const all = loadAllLocal();
  if (!reactions || !Object.keys(reactions).length) {
    delete all[key];
    reactionsCache.delete(key);
  } else {
    all[key] = reactions;
    reactionsCache.set(key, reactions);
  }
  saveAllLocal(all);
  return getReactionsForMessage(messageId);
}

/** Fetch all reactions for a chat from server and merge into cache. */
export async function hydrateReactionsForChat(chatId) {
  if (!chatId || !authState.token) return;
  try {
    const data = await apiFetch(`/chats/${chatId}/reactions`, { retries: 0 });
    const byMessage = data.reactions || {};
    Object.entries(byMessage).forEach(([msgId, reactions]) => {
      setReactionsForMessage(msgId, reactions);
    });
  } catch {
    /* offline — keep localStorage cache */
  }
}

export async function toggleReaction(messageId, emoji) {
  const userId = authState.user?.id;
  if (!userId) return getReactionsForMessage(messageId);

  const isTemp = String(messageId).startsWith('temp-');
  if (!isTemp && chatState.activeChatId) {
    try {
      const data = await apiFetch(
        `/chats/${chatState.activeChatId}/messages/${messageId}/reactions`,
        { method: 'POST', body: JSON.stringify({ emoji }) }
      );
      return setReactionsForMessage(messageId, data.reactions || {});
    } catch (err) {
      if (connectionState.online) throw err;
      /* offline — fall through to local toggle */
    }
  }
  return applyLocalToggle(messageId, emoji, userId);
}

export function migrateReactions(fromId, toId) {
  const fromKey = cacheKey(fromId);
  const toKey = cacheKey(toId);
  if (fromKey === toKey) return;
  const all = loadAllLocal();
  if (!all[fromKey] && !reactionsCache.has(fromKey)) return;
  const reactions = reactionsCache.get(fromKey) || all[fromKey];
  if (reactions) {
    setReactionsForMessage(toId, reactions);
    delete all[fromKey];
    reactionsCache.delete(fromKey);
    saveAllLocal(all);
  }
}

export function clearReactionsCache() {
  reactionsCache.clear();
  try {
    localStorage.removeItem(REACTIONS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
}
