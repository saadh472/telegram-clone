/** CONTROLLER — Authentication flow. */
import { authState } from '../config.js';
import { $, $$, showToast, confirmAction } from '../utils.js';
import { setUnauthorizedHandler, checkBackendHealth, formatBackendUnreachable } from '../models/apiModel.js';
import { loadSession, login, register, logout, clearSession, validateSession } from '../models/authModel.js';
import { clearRouteHash } from '../router.js';
import {
  showAuthScreen, showAppScreen, renderUserInfo, setAuthTab, hideAuthErrors,
  showLoginError, showRegisterError, setLoginLoading, setRegisterLoading,
  showSessionExpired, showBackendStatus, initPasswordToggles, initAuthFieldValidation
} from '../views/authView.js';
import { setProfileLogoutHandler } from './profileController.js';

let hooks = { onShowApp: () => {}, onShowAuth: () => {} };
let authBootstrapPromise = null;
let appEntered = false;
let loginInFlight = false;
let registerInFlight = false;

function isAppScreenVisible() {
  const app = $('#app');
  return app && !app.classList.contains('hidden');
}

export function setChatControllerHooks(h) {
  hooks = { ...hooks, ...h };
}

function enterApp() {
  appEntered = true;
  showAppScreen();
  renderUserInfo();
  try {
    hooks.onShowApp();
  } catch (err) {
    console.error('onShowApp failed:', err);
    appEntered = false;
    showAuthScreen();
    showLoginError(err.message || 'Could not load chat after login');
    throw err;
  }
}

function enterAuth(expired = false) {
  appEntered = false;
  hooks.onShowAuth();
  clearSession();
  showAuthScreen();
  if (expired) showSessionExpired();
}

async function handleLogin(e) {
  e.preventDefault();
  if (loginInFlight) return;
  loginInFlight = true;
  if (authBootstrapPromise) {
    try {
      await authBootstrapPromise;
    } catch {
      /* bootstrap failed; login may still work */
    }
  }
  hideAuthErrors();
  const username = $('#login-username')?.value.trim();
  const password = $('#login-password')?.value;
  const invalid = [];
  if (!username) invalid.push('login-username');
  if (!password) invalid.push('login-password');
  if (invalid.length) {
    showLoginError(
      invalid.length === 2 ? 'Enter username and password' : 'Complete the highlighted field',
      invalid
    );
    loginInFlight = false;
    return;
  }
  setLoginLoading(true);
  try {
    const data = await login(username, password);
    showToast(`Welcome back, ${data.user.display_name}!`, 'success');
    enterApp();
  } catch (err) {
    showLoginError(err.isNetworkError ? formatBackendUnreachable() : err.message);
  } finally {
    loginInFlight = false;
    setLoginLoading(false);
  }
}

async function handleRegister(e) {
  e.preventDefault();
  if (registerInFlight) return;
  registerInFlight = true;
  if (authBootstrapPromise) {
    try {
      await authBootstrapPromise;
    } catch {
      /* ignore */
    }
  }
  hideAuthErrors();
  const displayName = $('#register-name')?.value.trim();
  const username = $('#register-username')?.value.trim();
  const password = $('#register-password')?.value;
  const invalid = [];
  if (!displayName) invalid.push('register-name');
  if (!username) invalid.push('register-username');
  if (!password) invalid.push('register-password');
  if (invalid.length) {
    showRegisterError(
      invalid.length === 3 ? 'Fill in all fields' : 'Complete the highlighted field',
      invalid
    );
    registerInFlight = false;
    return;
  }
  if (password.length < 6) {
    showRegisterError('Password must be at least 6 characters', ['register-password']);
    registerInFlight = false;
    return;
  }
  setRegisterLoading(true);
  try {
    const data = await register(username, password, displayName);
    showToast(`Account created — welcome, ${data.user.display_name}!`, 'success');
    enterApp();
  } catch (err) {
    showRegisterError(err.isNetworkError ? formatBackendUnreachable() : err.message);
  } finally {
    registerInFlight = false;
    setRegisterLoading(false);
  }
}

async function handleLogout() {
  const ok = await confirmAction('Log out of Telegram Web on this device?', {
    title: 'Log out?',
    confirmLabel: 'Log out',
    cancelLabel: 'Stay'
  });
  if (!ok) return;
  await logout();
  clearRouteHash();
  enterAuth();
  showToast('Logged out', 'info');
}

export function initAuthController() {
  setUnauthorizedHandler(() => enterAuth(true));

  setProfileLogoutHandler(handleLogout);

  $$('.auth-tab').forEach((btn) => {
    btn.addEventListener('click', () => setAuthTab(btn.dataset.tab));
  });

  $('#login-form')?.addEventListener('submit', handleLogin);
  $('#register-form')?.addEventListener('submit', handleRegister);
  $('#logout-btn')?.addEventListener('click', handleLogout);
  $('#settings-logout-btn')?.addEventListener('click', handleLogout);
  initPasswordToggles();
  initAuthFieldValidation();
}

export async function bootstrapAuth() {
  authBootstrapPromise = (async () => {
    const ok = await checkBackendHealth(true);
    if (!ok) showBackendStatus(formatBackendUnreachable());

    if (loadSession()) {
      const valid = await validateSession();
      if (appEntered || isAppScreenVisible()) return;
      if (valid) enterApp();
      else showAuthScreen();
    } else if (!appEntered && !isAppScreenVisible()) {
      showAuthScreen();
    }
  })();

  try {
    await authBootstrapPromise;
  } finally {
    authBootstrapPromise = null;
  }
}
