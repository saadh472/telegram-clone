/** MODEL — Group permission toggles (localStorage demo). */
const PREFIX = 'telegram_group_perm_';

const DEFAULTS = {
  send_messages: true,
  send_media: true,
  add_members: true,
  pin_messages: false
};

function key(chatId, perm) {
  return `${PREFIX}${chatId}_${perm}`;
}

export function getGroupPerm(chatId, perm) {
  const stored = localStorage.getItem(key(chatId, perm));
  if (stored === null) return DEFAULTS[perm] ?? true;
  return stored === '1';
}

export function setGroupPerm(chatId, perm, enabled) {
  localStorage.setItem(key(chatId, perm), enabled ? '1' : '0');
}

export const GROUP_PERMS = [
  { id: 'send_messages', label: 'Send Messages', hint: 'Members can send text' },
  { id: 'send_media', label: 'Send Media', hint: 'Photos, files, voice' },
  { id: 'add_members', label: 'Add Members', hint: 'Invite new people' },
  { id: 'pin_messages', label: 'Pin Messages', hint: 'Pin for everyone' }
];
