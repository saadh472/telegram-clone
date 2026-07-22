/** VIEW — Auth screen DOM. */
import { authState } from '../config.js';
import { $, $$, escapeHtml, getInitials, userAvatarStyle } from '../utils.js';
import { getEffectiveDisplayName, getStoredAvatar, buildAvatarMarkup } from '../models/profileModel.js';

function sidebarAvatarHtml(user) {
  const stored = getStoredAvatar();
  const name = getEffectiveDisplayName();
  if (stored) {
    return `<div class="avatar xs has-photo"><img src="${stored}" alt="" class="avatar-img" draggable="false"></div>`;
  }
  return `<div class="avatar xs" style="background:${userAvatarStyle(user)}">${getInitials(name)}</div>`;
}

let screenTransitionReady = false;

function updateSkipLink(href) {
  const skip = $('#skip-link');
  if (skip) skip.setAttribute('href', href);
}

function transitionScreens(showSel, hideSel) {
  const showEl = $(showSel);
  const hideEl = $(hideSel);
  if (!showEl || !hideEl) return;
  if (!screenTransitionReady) {
    hideEl.classList.add('hidden');
    showEl.classList.remove('hidden');
    updateSkipLink(showSel === '#app' ? '#chat-panel' : '#login-form');
    return;
  }
  hideEl.classList.add('screen-leaving');
  hideEl.classList.remove('screen-entering', 'screen-entered');
  setTimeout(() => {
    hideEl.classList.add('hidden');
    hideEl.classList.remove('screen-leaving');
    showEl.classList.remove('hidden');
    showEl.classList.add('screen-entering');
    updateSkipLink(showSel === '#app' ? '#chat-panel' : '#login-form');
    requestAnimationFrame(() => showEl.classList.add('screen-entered'));
    setTimeout(() => showEl.classList.remove('screen-entering', 'screen-entered'), 420);
  }, 260);
}

export function showAuthScreen() {
  transitionScreens('#auth-screen', '#app');
}

export function showAppScreen() {
  transitionScreens('#app', '#auth-screen');
}

export function enableScreenTransitions() {
  screenTransitionReady = true;
}

export function renderUserInfo() {
  const el = $('#user-info');
  const settingsEl = $('#settings-user-info');
  if (!authState.user) return;
  const sidebarHtml = `
    ${sidebarAvatarHtml(authState.user)}
    <div class="user-info-text">
      <span class="user-display-name">${escapeHtml(getEffectiveDisplayName())}</span>
      <span class="user-username">@${escapeHtml(authState.user.username || 'user')}</span>
    </div>`;
  const settingsHtml = `
    <button type="button" class="settings-user-btn" aria-label="Open profile">
      ${buildAvatarMarkup({ sizeClass: 'settings-profile-avatar', ring: true })}
      <div class="user-info-text">
        <span class="user-display-name">${escapeHtml(getEffectiveDisplayName())}</span>
        <span class="user-username">@${escapeHtml(authState.user.username || 'user')}</span>
        <span class="settings-edit-photo">Tap to change photo</span>
      </div>
    </button>`;
  if (el) el.innerHTML = sidebarHtml;
  if (settingsEl) settingsEl.innerHTML = settingsHtml;
}

export function setAuthTab(tab) {
  $$('.auth-tab').forEach((btn) => {
    const active = btn.dataset.tab === tab;
    btn.classList.toggle('active', active);
    btn.setAttribute('aria-selected', active ? 'true' : 'false');
  });
  $('#login-form')?.classList.toggle('hidden', tab !== 'login');
  $('#register-form')?.classList.toggle('hidden', tab !== 'register');
  hideAuthErrors();
}

const AUTH_INPUT_IDS = [
  'login-username',
  'login-password',
  'register-name',
  'register-username',
  'register-password'
];

function setFieldErrorState(ids, errorId) {
  ids.forEach((id) => {
    const input = $(`#${id}`);
    if (!input) return;
    input.classList.add('input-error');
    input.setAttribute('aria-invalid', 'true');
    input.setAttribute('aria-describedby', errorId);
  });
}

function clearFieldErrorState(input) {
  input.classList.remove('input-error');
  input.removeAttribute('aria-invalid');
  input.removeAttribute('aria-describedby');
}

function focusFirstInvalid(ids) {
  const first = ids.map((id) => $(`#${id}`)).find(Boolean);
  requestAnimationFrame(() => first?.focus({ preventScroll: true }));
}

export function hideAuthErrors() {
  $('#login-error')?.classList.add('hidden');
  $('#register-error')?.classList.add('hidden');
  AUTH_INPUT_IDS.forEach((id) => {
    const input = $(`#${id}`);
    if (input) clearFieldErrorState(input);
  });
}

export function showLoginError(msg, fields = ['login-username', 'login-password']) {
  const el = $('#login-error');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  setFieldErrorState(fields, 'login-error');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  el.scrollIntoView({ block: 'nearest', behavior: motion });
  focusFirstInvalid(fields);
}

export function showRegisterError(msg, fields = ['register-name', 'register-username', 'register-password']) {
  const el = $('#register-error');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
  setFieldErrorState(fields, 'register-error');
  const motion = window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
  el.scrollIntoView({ block: 'nearest', behavior: motion });
  focusFirstInvalid(fields);
}

export function setLoginLoading(loading) {
  const btn = $('#login-btn');
  if (!btn) return;
  btn.disabled = loading;
  btn.setAttribute('aria-busy', loading ? 'true' : 'false');
  btn.querySelector('.btn-text')?.classList.toggle('hidden', loading);
  btn.querySelector('.btn-spinner')?.classList.toggle('hidden', !loading);
}

export function setRegisterLoading(loading) {
  const btn = $('#register-btn');
  if (!btn) return;
  btn.disabled = loading;
  btn.setAttribute('aria-busy', loading ? 'true' : 'false');
  btn.querySelector('.btn-text')?.classList.toggle('hidden', loading);
  btn.querySelector('.btn-spinner')?.classList.toggle('hidden', !loading);
}

export function showSessionExpired() {
  $('#session-expired-msg')?.classList.remove('hidden');
}

export function showBackendStatus(msg) {
  const el = $('#backend-status');
  if (!el) return;
  el.textContent = msg;
  el.classList.remove('hidden');
}

export function initPasswordToggles() {
  $$('.password-toggle').forEach((btn) => {
    btn.addEventListener('click', () => {
      const input = $(`#${btn.dataset.target}`);
      if (!input) return;
      const show = input.type === 'password';
      input.type = show ? 'text' : 'password';
      btn.querySelector('.icon-eye')?.classList.toggle('hidden', show);
      btn.querySelector('.icon-eye-off')?.classList.toggle('hidden', !show);
      btn.setAttribute('aria-label', show ? 'Hide password' : 'Show password');
    });
  });
}

export function initAuthFieldValidation() {
  AUTH_INPUT_IDS.forEach((id) => {
    const input = $(`#${id}`);
    if (!input || input.dataset.authValidationReady) return;
    input.dataset.authValidationReady = '1';
    input.addEventListener('input', () => {
      clearFieldErrorState(input);
      const error = input.closest('form')?.querySelector('.form-error');
      if (error && !input.closest('form')?.querySelector('[aria-invalid="true"]')) {
        error.classList.add('hidden');
      }
    });
  });
}
