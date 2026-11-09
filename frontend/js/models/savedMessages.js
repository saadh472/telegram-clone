/** MODEL — Telegram-style Saved Messages helper. */
import { authState, chatState, uiState } from '../config.js';
import { createGroupChat, fetchChats } from './chatModel.js';
import { invalidateChatListCache, isSavedMessagesChat, SAVED_MESSAGES_NAME } from '../utils.js';

export function findSavedMessagesChat(chats = chatState.chats) {
  return chats.find((chat) => isSavedMessagesChat(chat)) || null;
}

export async function ensureSavedMessagesChat() {
  const existing = findSavedMessagesChat();
  if (existing) return existing;

  try {
    const fresh = await fetchChats();
    chatState.chats = fresh;
    const found = findSavedMessagesChat(fresh);
    if (found) return found;
  } catch {
    /* If refresh fails, try creating the local cloud chat below. */
  }

  if (!authState.user?.id) return null;
  const created = await createGroupChat(SAVED_MESSAGES_NAME, [authState.user.id]);
  invalidateChatListCache(uiState);

  try {
    const fresh = await fetchChats();
    chatState.chats = fresh;
    return findSavedMessagesChat(fresh) || created;
  } catch {
    const fallback = {
      id: created.id,
      type: 'group',
      name: SAVED_MESSAGES_NAME,
      display_name: SAVED_MESSAGES_NAME,
      avatar_color: '#2aabee'
    };
    chatState.chats = [fallback, ...chatState.chats.filter((chat) => chat.id !== fallback.id)];
    return fallback;
  }
}
