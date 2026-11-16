/** MODEL — Profile extras persisted in localStorage (demo). */
import { authState } from '../config.js';
import { getInitials, avatarGradient, userAvatarStyle } from '../utils.js';

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

export function buildAvatar({ sizeClass, ring = false, large = false, sidebar = false } = {}) {
  const avatar = document.createElement('div');
  avatar.className = 'avatar';
  if (sizeClass) avatar.classList.add(sizeClass);
  const photo = getStoredAvatar();
  if (photo && /^data:image\/(?:png|jpeg|gif|webp|avif|bmp|x-icon);base64,[A-Za-z0-9+/]+={0,2}$/i.test(photo)) {
    const img = document.createElement('img');
    img.src = photo;
    img.alt = '';
    img.className = 'avatar-img';
    img.draggable = false;
    avatar.classList.add('has-photo');
    avatar.append(img);
  } else {
    const user = authState.user;
    const color = /^#[0-9a-f]{6}$/i.test(user.avatar_color || '') ? user.avatar_color : undefined;
    avatar.style.background = sidebar
      ? userAvatarStyle(user.username || user.display_name, color)
      : avatarGradient(color);
    avatar.textContent = getInitials(getEffectiveDisplayName());
  }
  if (sidebar) return avatar;

  const wrap = document.createElement('div');
  wrap.className = large ? 'profile-avatar-wrap profile-avatar-wrap-lg' : 'profile-avatar-wrap';
  if (ring) {
    const outline = document.createElement('span');
    outline.className = large ? 'profile-avatar-ring profile-avatar-ring-lg' : 'profile-avatar-ring';
    wrap.append(outline);
  }
  wrap.append(avatar);
  return wrap;
}
