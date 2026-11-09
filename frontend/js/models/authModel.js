/** MODEL — Auth API and session persistence. */
import { authState } from '../config.js';
import { apiFetch } from './apiModel.js';

const TOKEN_KEY = 'token';
const USER_KEY = 'user';

export function loadSession() {
  const token = localStorage.getItem(TOKEN_KEY);
  const userRaw = localStorage.getItem(USER_KEY);
  if (!token || !userRaw) return false;
  try {
    authState.token = token;
    authState.user = JSON.parse(userRaw);
    return true;
  } catch {
    clearSession();
    return false;
  }
}

export function saveSession(token, user) {
  authState.token = token;
  authState.user = user;
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(user));
}

export function clearSession() {
  authState.token = null;
  authState.user = null;
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}

export async function login(username, password) {
  const data = await apiFetch('/auth/login', {
    method: 'POST',
    body: JSON.stringify({ username, password }),
    skipAuthRedirect: true
  });
  saveSession(data.token, data.user);
  return data;
}

export async function register(username, password, displayName) {
  const data = await apiFetch('/auth/register', {
    method: 'POST',
    body: JSON.stringify({ username, display_name: displayName, password }),
    skipAuthRedirect: true
  });
  saveSession(data.token, data.user);
  return data;
}

export async function logout() {
  try {
    await apiFetch('/auth/logout', { method: 'POST' });
  } catch { /* ignore */ }
  clearSession();
}

export async function validateSession() {
  if (!authState.token) return false;
  const tokenAtStart = authState.token;
  try {
    const user = await apiFetch('/users/me', { skipAuthRedirect: true });
    if (authState.token !== tokenAtStart) {
      return Boolean(authState.token);
    }
    authState.user = user;
    localStorage.setItem(USER_KEY, JSON.stringify(user));
    return true;
  } catch (err) {
    if (authState.token !== tokenAtStart) {
      return Boolean(authState.token);
    }
    clearSession();
    return false;
  }
}
