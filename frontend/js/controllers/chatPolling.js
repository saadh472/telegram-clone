/** CONTROLLER — Adaptive polling with visibility-aware intervals. */
import { authState, chatState, uiState, connectionState, POLL_MS, POLL_MS_HIDDEN } from '../config.js';
import { cancelMessageFetch, cancelChatsFetch } from '../models/chatModel.js';

let pollTickFn = null;
let visibilityBound = false;
let networkBound = false;
let failureCount = 0;

const POLL_MS_READING = 3500;
const POLL_MS_IDLE = 4500;
const POLL_MS_OFFLINE = 10000;
const POLL_MS_MAX_BACKOFF = 30000;
const POLL_MS_RESUME = 120;

function getPollDelay() {
  if (!authState.token) return POLL_MS_HIDDEN;

  let delay = document.hidden ? POLL_MS_HIDDEN : POLL_MS;
  if (!connectionState.online) delay = Math.max(delay, POLL_MS_OFFLINE);
  if (!chatState.activeChatId) delay = Math.max(delay, POLL_MS_IDLE);
  if (chatState.activeChatId && !uiState.userNearBottom) delay = Math.max(delay, POLL_MS_READING);

  if (failureCount > 0) {
    delay *= 2 ** Math.min(failureCount, 4);
  }
  return Math.min(delay, POLL_MS_MAX_BACKOFF);
}

function scheduleNextPoll(delay = getPollDelay()) {
  if (uiState.pollTimeout) clearTimeout(uiState.pollTimeout);
  uiState.pollDelay = delay;
  uiState.pollScheduledAt = Date.now();
  uiState.pollTimeout = setTimeout(runPollTick, delay);
}

async function runPollTick() {
  if (!authState.token || !connectionState.online) {
    scheduleNextPoll();
    return;
  }
  if (uiState.pollInFlight) {
    scheduleNextPoll();
    return;
  }

  uiState.pollInFlight = true;
  const startedAt = performance.now();
  try {
    await pollTickFn?.();
    failureCount = 0;
  } catch {
    failureCount += 1;
    /* polling must not crash the app */
  } finally {
    uiState.lastPollDuration = Math.round(performance.now() - startedAt);
    uiState.pollInFlight = false;
    scheduleNextPoll();
  }
}

function onVisibilityChange() {
  if (!uiState.pollTimeout) return;
  clearTimeout(uiState.pollTimeout);
  scheduleNextPoll(document.hidden ? getPollDelay() : POLL_MS_RESUME);
}

function onOnline() {
  failureCount = 0;
  if (uiState.pollTimeout) scheduleNextPoll(POLL_MS_RESUME);
}

function onOffline() {
  if (uiState.pollTimeout) scheduleNextPoll(getPollDelay());
}

export function startPolling(tickFn) {
  stopPolling();
  pollTickFn = tickFn;
  if (!visibilityBound) {
    document.addEventListener('visibilitychange', onVisibilityChange);
    visibilityBound = true;
  }
  if (!networkBound) {
    window.addEventListener('online', onOnline);
    window.addEventListener('offline', onOffline);
    networkBound = true;
  }
  scheduleNextPoll();
}

export function stopPolling() {
  if (uiState.pollTimeout) {
    clearTimeout(uiState.pollTimeout);
    uiState.pollTimeout = null;
  }
  uiState.pollInFlight = false;
  cancelMessageFetch();
  cancelChatsFetch();
}

export function destroyPolling() {
  stopPolling();
  if (visibilityBound) {
    document.removeEventListener('visibilitychange', onVisibilityChange);
    visibilityBound = false;
  }
  if (networkBound) {
    window.removeEventListener('online', onOnline);
    window.removeEventListener('offline', onOffline);
    networkBound = false;
  }
  pollTickFn = null;
  failureCount = 0;
}
