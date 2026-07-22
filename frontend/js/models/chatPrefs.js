/** Chat preferences stored in localStorage (pin, mute, archive). */
const KEY = 'telegram_chat_prefs';

function load() {
  try {
    return JSON.parse(localStorage.getItem(KEY) || '{}');
  } catch {
    return {};
  }
}

function save(data) {
  localStorage.setItem(KEY, JSON.stringify(data));
}

function chatKey(chatId) {
  return String(chatId);
}

export function getChatPref(chatId) {
  const all = load();
  return all[chatKey(chatId)] || { pinned: false, muted: false, archived: false };
}

export function setChatPref(chatId, patch) {
  const all = load();
  const key = chatKey(chatId);
  all[key] = { ...getChatPref(chatId), ...patch };
  save(all);
}

export function togglePin(chatId) {
  const p = getChatPref(chatId);
  setChatPref(chatId, { pinned: !p.pinned });
  return !p.pinned;
}

export function toggleMute(chatId) {
  const p = getChatPref(chatId);
  setChatPref(chatId, { muted: !p.muted });
  return !p.muted;
}

export function toggleArchive(chatId) {
  const p = getChatPref(chatId);
  setChatPref(chatId, { archived: !p.archived });
  return !p.archived;
}

export function isMuted(chatId) {
  return getChatPref(chatId).muted;
}

export function isArchived(chatId) {
  return getChatPref(chatId).archived;
}

export function filterActiveChats(chats) {
  return chats.filter((c) => !getChatPref(c.id).archived);
}

export function filterArchivedChats(chats) {
  return chats.filter((c) => getChatPref(c.id).archived);
}

export function sortChats(chats) {
  return [...chats].sort((a, b) => {
    const pa = getChatPref(a.id).pinned ? 1 : 0;
    const pb = getChatPref(b.id).pinned ? 1 : 0;
    if (pa !== pb) return pb - pa;
    const ta = a.last_message_time ? new Date(a.last_message_time).getTime() : 0;
    const tb = b.last_message_time ? new Date(b.last_message_time).getTime() : 0;
    return tb - ta;
  });
}

export function filterVisibleChats(chats, includeArchived = false) {
  return includeArchived ? chats : filterActiveChats(chats);
}
