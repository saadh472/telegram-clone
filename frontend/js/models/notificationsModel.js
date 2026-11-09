/** MODEL — Demo notifications derived from chat activity (client-side). */
import { chatState } from '../config.js';
import { getChatPref } from './chatPrefs.js';
import { formatMessagePreview } from '../utils.js';

const READ_KEY = 'telegram_notifications_read_at';

export function getNotificationsReadAt() {
  return Number(localStorage.getItem(READ_KEY) || 0);
}

export function markAllNotificationsRead() {
  localStorage.setItem(READ_KEY, String(Date.now()));
}

function isNotificationUnread(time, readAt = getNotificationsReadAt()) {
  return new Date(time).getTime() > readAt;
}

/** Build notification items from unread chats and recent activity. */
export function buildNotifications() {
  const items = [];
  const now = Date.now();
  const readAt = getNotificationsReadAt();

  chatState.chats.forEach((chat) => {
    const pref = getChatPref(chat.id);
    if (pref.muted || pref.archived) return;
    if (chat.unread_count > 0) {
      const preview = formatMessagePreview(chat.last_message);
      const time = chat.last_message_time || new Date(now).toISOString();
      items.push({
        id: `unread-${chat.id}`,
        chatId: chat.id,
        type: 'message',
        title: chat.display_name || 'Chat',
        body: preview.label,
        icon: preview.icon || '💬',
        time,
        unread: isNotificationUnread(time, readAt)
      });
    }
  });

  items.sort((a, b) => new Date(b.time) - new Date(a.time));
  return items.slice(0, 20);
}

export function unreadNotificationCount() {
  return buildNotifications().filter((n) => n.unread).length;
}

export function hasUnreadNotifications() {
  return unreadNotificationCount() > 0;
}
