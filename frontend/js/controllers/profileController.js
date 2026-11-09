/** CONTROLLER — Profile page interactions. */
import { $, showToast } from '../utils.js';
import { setTheme, getTheme } from '../theme.js';
import {
  setProfileBio,
  setEffectiveDisplayName,
  setStoredAvatar,
  setUserStatus
} from '../models/profileModel.js';
import { renderProfile, syncProfileThemeToggle, initProfilePrivacyDelegation } from '../views/profileView.js';
import { renderUserInfo } from '../views/authView.js';
import {
  openProfilePage,
  closeProfilePage,
  openSettingsPanel,
  isProfileOpen
} from '../views/chatListView.js';

const MAX_AVATAR_BYTES = 512 * 1024;
let logoutHandler = () => {};

export function setProfileLogoutHandler(fn) {
  logoutHandler = fn;
}

export function initProfileController() {
  initProfilePrivacyDelegation();
  $('#profile-back-btn')?.addEventListener('click', () => closeProfilePage());
  $('#profile-backdrop')?.addEventListener('click', () => closeProfilePage());

  document.addEventListener('click', (e) => {
    const settingsCard = e.target.closest('#settings-user-info');
    const settingsPanel = $('#settings-panel');
    if (settingsCard && settingsPanel?.classList.contains('open')) {
      e.preventDefault();
      e.stopPropagation();
      openProfilePage({ from: 'settings' });
    }
  });

  document.addEventListener('click', (e) => {
    if (!isProfileOpen()) return;
    if (e.target.closest('#profile-change-photo-btn')) {
      $('#profile-photo-input')?.click();
    }
  });

  $('#profile-photo-input')?.addEventListener('change', (e) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    if (!file.type.startsWith('image/')) {
      showToast('Please choose an image file', 'error');
      return;
    }
    if (file.size > MAX_AVATAR_BYTES) {
      showToast('Image must be under 512 KB for demo storage', 'error');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      setStoredAvatar(reader.result);
      renderProfile();
      renderUserInfo();
      showToast('Profile photo updated', 'success');
    };
    reader.onerror = () => showToast('Could not read image', 'error');
    reader.readAsDataURL(file);
  });

  document.addEventListener('click', (e) => {
    if (!isProfileOpen()) return;
    if (e.target.closest('#profile-edit-name-btn')) {
      const input = $('#profile-display-name');
      input?.focus();
      input?.select();
    }
    if (e.target.closest('#profile-open-settings-btn')) {
      closeProfilePage({ skipReturn: true });
      openSettingsPanel();
    }
    if (e.target.closest('#profile-logout-btn')) {
      logoutHandler();
    }
  });

  document.addEventListener('change', (e) => {
    if (e.target.id === 'profile-night-mode-switch') {
      setTheme(e.target.checked ? 'dark' : 'light');
      syncProfileThemeToggle();
    }
    if (e.target.id === 'profile-status-select') {
      setUserStatus(e.target.value);
      showToast('Status updated (demo)', 'success');
    }
  });

  document.addEventListener('blur', (e) => {
    if (e.target.id === 'profile-display-name') saveDisplayName();
    if (e.target.id === 'profile-bio-input') saveBio();
  }, true);

  document.addEventListener('keydown', (e) => {
    if (!isProfileOpen()) return;
    if (e.target.id === 'profile-display-name' && e.key === 'Enter') {
      e.preventDefault();
      e.target.blur();
    }
  });
}

function saveDisplayName() {
  const input = $('#profile-display-name');
  if (!input) return;
  const next = input.value.trim();
  if (!next) {
    showToast('Display name cannot be empty', 'error');
    input.focus();
    return;
  }
  setEffectiveDisplayName(next);
  renderUserInfo();
  showToast('Name updated', 'success');
}

function saveBio() {
  const input = $('#profile-bio-input');
  if (!input) return;
  setProfileBio(input.value);
}

export function refreshProfileIfOpen() {
  if (isProfileOpen()) {
    renderProfile();
    syncProfileThemeToggle();
  }
}

/** Re-sync profile night toggle when theme changes elsewhere. */
export function onThemeChangedExternally() {
  syncProfileThemeToggle();
  const sw = $('#profile-night-mode-switch');
  if (sw) sw.checked = getTheme() === 'dark';
}
