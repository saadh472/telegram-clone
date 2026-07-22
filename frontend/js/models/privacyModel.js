/** MODEL — Privacy preferences (localStorage demo). */
const PREFIX = 'telegram_privacy_';

const DEFAULTS = {
  last_seen: 'everyone',
  profile_photo: 'everyone',
  phone: 'contacts',
  groups: 'contacts',
  forwards: 'everyone'
};

export function getPrivacyPref(key) {
  const stored = localStorage.getItem(`${PREFIX}${key}`);
  return stored || DEFAULTS[key] || 'everyone';
}

export function setPrivacyPref(key, value) {
  localStorage.setItem(`${PREFIX}${key}`, value);
}

export const PRIVACY_OPTIONS = [
  { value: 'everyone', label: 'Everybody' },
  { value: 'contacts', label: 'My Contacts' },
  { value: 'nobody', label: 'Nobody' }
];
