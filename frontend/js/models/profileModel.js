/** MODEL — Profile extras persisted in localStorage (demo). */
import { authState } from '../config.js';
import { getInitials, avatarGradient } from '../utils.js';

const BIO_KEY = 'telegram_profile_bio';
const AVATAR_KEY = 'telegram_profile_avatar';
const DISPLAY_NAME_KEY = 'telegram_profile_display_name';
const STATUS_KEY = 'telegram_profile_status';

export const USER_STATUS_OPTIONS = [
  { value: 'online', label: 'Online', emoji: '🟢' },
  { value: 'away', label: 'Away', emoji: '🟡' },
  { value: 'busy', label: 'Do not disturb', emoji: '🔴' },
  { value: 'offline', label: 'Appear offline', emoji: '⚫' }
];

export function getProfileBio() {
  return localStorage.getItem(BIO_KEY) || '';
}

export function setProfileBio(bio) {
  localStorage.setItem(BIO_KEY, bio.trim());
}

export function getStoredAvatar() {
  return localStorage.getItem(AVATAR_KEY) || null;
}

export function setStoredAvatar(dataUrl) {
  if (dataUrl) localStorage.setItem(AVATAR_KEY, dataUrl);
  else localStorage.removeItem(AVATAR_KEY);
}

export function getEffectiveDisplayName() {
  const override = localStorage.getItem(DISPLAY_NAME_KEY);
  if (override?.trim()) return override.trim();
  return authState.user?.display_name || '';
}

export function getUserStatus() {
  return localStorage.getItem(STATUS_KEY) || 'online';
}

export function setUserStatus(status) {
  localStorage.setItem(STATUS_KEY, status);
}

export function getUserStatusLabel() {
  const opt = USER_STATUS_OPTIONS.find((o) => o.value === getUserStatus());
  return opt ? `${opt.emoji} ${opt.label}` : 'Online';
}

export function setEffectiveDisplayName(name) {
  const trimmed = name.trim();
  if (trimmed) localStorage.setItem(DISPLAY_NAME_KEY, trimmed);
  else localStorage.removeItem(DISPLAY_NAME_KEY);
  if (authState.user) {
    authState.user = { ...authState.user, display_name: trimmed || authState.user.display_name };
    localStorage.setItem('user', JSON.stringify(authState.user));
  }
}

export function buildAvatarMarkup({ sizeClass = '', ring = false, large = false } = {}) {
  const user = authState.user;
  if (!user) return '';
  const stored = getStoredAvatar();
  const name = getEffectiveDisplayName();
  const ringHtml = ring
    ? `<span class="profile-avatar-ring${large ? ' profile-avatar-ring-lg' : ''}"></span>`
    : '';
  const inner = stored
    ? `<img src="${stored}" alt="" class="avatar-img" draggable="false">`
    : getInitials(name);
  const style = stored ? '' : ` style="background:${avatarGradient(user.avatar_color)}"`;
  return `
    <div class="profile-avatar-wrap${large ? ' profile-avatar-wrap-lg' : ''}">
      ${ringHtml}
      <div class="avatar${sizeClass ? ` ${sizeClass}` : ''}${stored ? ' has-photo' : ''}"${style}>${inner}</div>
    </div>`;
}
