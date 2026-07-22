/** MODEL — HTTP client, health checks, and fetch utilities. */

import { API_BASE, HEALTH_MS, connectionState } from '../config.js';
import { $, showToast } from '../utils.js';

let onUnauthorized = () => {};

export function setUnauthorizedHandler(fn) {
  onUnauthorized = fn;
}

export function formatBackendUnreachable() {
  const desktopMode = new URLSearchParams(window.location.search).get('desktop') === '1';
  if (desktopMode) {
    return 'Cannot reach the local desktop backend. Restart the app and verify SQL Server is running.';
  }
  const host = window.location.hostname || '127.0.0.1';
  return `Cannot reach backend. Run start.cmd and open http://${host}:5500 (not file://)`;
}

function setReconnecting(reconnecting) {
  connectionState.reconnecting = reconnecting && navigator.onLine;
  updateConnectionBanner();
}

function markBackendHealthy() {
  connectionState.backendReachable = true;
  connectionState.reconnecting = false;
  updateConnectionBanner();
}

function markBackendUnreachable() {
  connectionState.backendReachable = false;
  if (navigator.onLine) setReconnecting(true);
}

export async function apiFetch(path, options = {}) {
  const { skipAuthRedirect = false, retries = 0, signal, ...fetchOpts } = options;
  const headers = { 'Content-Type': 'application/json', ...(fetchOpts.headers || {}) };
  const token = localStorage.getItem('token');
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...fetchOpts, headers, signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    connectionState.backendReachable = false;
    if (retries > 0) {
      await new Promise((r) => setTimeout(r, Math.min(1000 * (4 - retries), 4000)));
      return apiFetch(path, { ...options, retries: retries - 1 });
    }
    markBackendUnreachable();
    const error = new Error(formatBackendUnreachable());
    error.isNetworkError = true;
    throw error;
  }

  markBackendHealthy();

  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    if (res.status === 401 && !skipAuthRedirect) onUnauthorized();
    const fallback = res.status === 413
      ? 'Upload too large for server (restart backend after limit changes)'
      : res.status === 429
        ? 'Too many requests. Please wait and try again.'
        : `Request failed (${res.status})`;
    const error = new Error(data.error || fallback);
    error.status = res.status;
    throw error;
  }
  return data;
}

export async function checkBackendHealth(silent = false) {
  try {
    const res = await fetch(`${API_BASE}/health`);
    const data = await res.json();
    const ok = res.ok && data.status === 'ok';
    if (ok) {
      markBackendHealthy();
    } else {
      connectionState.backendReachable = false;
      setReconnecting(true);
    }
    return ok;
  } catch {
    connectionState.backendReachable = false;
    setReconnecting(true);
    if (!silent) showToast(formatBackendUnreachable(), 'error');
    return false;
  }
}

export function startHealthCheck(uiState) {
  stopHealthCheck(uiState);
  uiState.healthInterval = setInterval(() => checkBackendHealth(true), HEALTH_MS);
}

export function stopHealthCheck(uiState) {
  if (uiState.healthInterval) {
    clearInterval(uiState.healthInterval);
    uiState.healthInterval = null;
  }
}

export function updateOfflineBanner() {
  const banner = $('#offline-banner');
  if (!banner) return;
  const offline = !navigator.onLine;
  banner.classList.toggle('hidden', !offline);
  const span = banner.querySelector('span');
  if (span && offline) {
    span.textContent = 'You are offline. Cannot send messages until connection returns.';
  }
  if (offline) {
    connectionState.reconnecting = false;
    updateConnectionBanner();
  }
}

export function updateConnectionBanner() {
  const banner = $('#connection-banner');
  if (!banner) return;
  const show = connectionState.reconnecting && navigator.onLine && !connectionState.backendReachable;
  banner.classList.toggle('hidden', !show);
}
