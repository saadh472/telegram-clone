/** VIEW — Profile screen DOM. */

import { authState } from '../config.js';

import { $, escapeHtml } from '../utils.js';

import { getTheme } from '../theme.js';

import {

  getProfileBio,

  getEffectiveDisplayName,

  buildAvatarMarkup,

  getUserStatus,

  USER_STATUS_OPTIONS

} from '../models/profileModel.js';

import { getPrivacyPref, setPrivacyPref, PRIVACY_OPTIONS } from '../models/privacyModel.js';



function buildPrivacyRows() {

  const fields = [

    { key: 'last_seen', label: 'Last Seen', icon: '👁' },

    { key: 'profile_photo', label: 'Profile Photo', icon: '🖼' },

    { key: 'phone', label: 'Phone Number', icon: '📱' },

    { key: 'groups', label: 'Groups & Channels', icon: '👥' },

    { key: 'forwards', label: 'Forwarded Messages', icon: '↪' }

  ];

  return fields.map((f) => {

    const current = getPrivacyPref(f.key);

    const options = PRIVACY_OPTIONS.map((o) =>

      `<option value="${o.value}"${o.value === current ? ' selected' : ''}>${escapeHtml(o.label)}</option>`

    ).join('');

    return `

      <div class="profile-list-row profile-privacy-row">

        <div class="profile-list-icon" aria-hidden="true">${f.icon}</div>

        <div class="profile-list-text">

          <span class="profile-list-label">${escapeHtml(f.label)}</span>

        </div>

        <select class="profile-privacy-select" data-privacy="${f.key}" aria-label="${escapeHtml(f.label)} privacy">${options}</select>

      </div>`;

  }).join('');

}



function buildStatusOptions() {

  const current = getUserStatus();

  return USER_STATUS_OPTIONS.map((o) =>

    `<option value="${o.value}"${o.value === current ? ' selected' : ''}>${o.emoji} ${escapeHtml(o.label)}</option>`

  ).join('');

}



export function renderProfile() {

  const body = $('#profile-body');

  if (!body || !authState.user) return;



  const user = authState.user;

  const displayName = getEffectiveDisplayName();

  const bio = getProfileBio();

  const isDark = getTheme() === 'dark';



  body.innerHTML = `

    <section class="profile-hero">

      ${buildAvatarMarkup({ sizeClass: 'profile-avatar-lg', ring: true, large: true })}

      <div class="profile-name-row">

        <input type="text" id="profile-display-name" class="profile-display-name-input" value="${escapeHtml(displayName)}" aria-label="Display name" maxlength="64">

        <button type="button" id="profile-edit-name-btn" class="icon-btn profile-edit-btn" aria-label="Edit display name" title="Edit name">

          <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/></svg>

        </button>

      </div>

      <p class="profile-username">@${escapeHtml(user.username || 'user')}</p>

      <div class="profile-status-row">

        <label for="profile-status-select" class="profile-status-label">Status</label>

        <select id="profile-status-select" class="profile-status-select" aria-label="Online status">${buildStatusOptions()}</select>

      </div>

      <button type="button" id="profile-change-photo-btn" class="profile-change-photo-btn">Change Profile Photo</button>

    </section>



    <section class="profile-section">

      <span class="profile-section-label">Bio</span>

      <div class="profile-field-row">

        <textarea id="profile-bio-input" class="profile-bio-input" rows="2" placeholder="Add a few words about yourself" maxlength="140" aria-label="Bio">${escapeHtml(bio)}</textarea>

      </div>

    </section>



    <section class="profile-section">

      <span class="profile-section-label">Account</span>

      <div class="profile-list-row">

        <div class="profile-list-icon" aria-hidden="true">📱</div>

        <div class="profile-list-text">

          <span class="profile-list-label">Phone</span>

          <span class="profile-list-value">+92 ••• ••• 1234</span>

        </div>

        <span class="profile-list-hint">Demo</span>

      </div>

      <div class="profile-list-row">

        <div class="profile-list-icon" aria-hidden="true">✉️</div>

        <div class="profile-list-text">

          <span class="profile-list-label">Email</span>

          <span class="profile-list-value">${escapeHtml(user.username || 'user')}@telegram.demo</span>

        </div>

        <span class="profile-list-hint">Demo</span>

      </div>

      <div class="profile-list-row">

        <div class="profile-list-icon" aria-hidden="true">@</div>

        <div class="profile-list-text">

          <span class="profile-list-label">Username</span>

          <span class="profile-list-value">@${escapeHtml(user.username || 'user')}</span>

        </div>

      </div>

    </section>



    <section class="profile-section">

      <span class="profile-section-label">Privacy</span>

      ${buildPrivacyRows()}

    </section>



    <section class="profile-section">

      <span class="profile-section-label">Settings</span>

      <div class="profile-settings-row">

        <div class="profile-settings-text">

          <span id="profile-night-mode-label">${isDark ? 'Night Mode' : 'Day Mode'}</span>

          <span class="profile-settings-hint">Dark Telegram theme</span>

        </div>

        <label class="toggle-switch">

          <input type="checkbox" id="profile-night-mode-switch" aria-label="Night mode" ${isDark ? 'checked' : ''}>

          <span class="toggle-slider"></span>

        </label>

      </div>

      <button type="button" id="profile-open-settings-btn" class="profile-link-row">

        <span>All Settings</span>

        <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z"/></svg>

      </button>

    </section>



    <section class="profile-section profile-section-danger">

      <button type="button" id="profile-logout-btn" class="profile-logout-btn btn-danger">

        <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M17 7l-1.41 1.41L18.17 11H8v2h10.17l-2.58 2.58L17 17l5-5-5-5zM4 5h8V3H4c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h8v-2H4V5z"/></svg>

        Log Out

      </button>

    </section>`;

}



export function syncProfileThemeToggle() {

  const isDark = getTheme() === 'dark';

  const sw = $('#profile-night-mode-switch');

  if (sw) sw.checked = isDark;

  const label = $('#profile-night-mode-label');

  if (label) label.textContent = isDark ? 'Night Mode' : 'Day Mode';

}



export function initProfilePrivacyDelegation() {
  if (document.body.dataset.profilePrivacyBound) return;
  document.body.dataset.profilePrivacyBound = '1';
  document.addEventListener('change', (e) => {
    const sel = e.target.closest('.profile-privacy-select');
    if (!sel) return;
    setPrivacyPref(sel.dataset.privacy, sel.value);
  });
}

