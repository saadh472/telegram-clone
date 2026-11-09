/** VIEW — Simulated voice/video call overlay. */
import { chatState, SELECTORS } from '../config.js';
import { $, focusFirstIn, getInitials, rememberFocus, restoreFocus, userAvatarStyle, showToast } from '../utils.js';

let callTimer = null;
let callType = 'voice';

export function openCallOverlay(type = 'voice') {
  const overlay = $(SELECTORS.callOverlay);
  const chat = chatState.activeChat;
  if (!overlay || !chat) return;
  rememberFocus(overlay);

  callType = type;
  const name = chat.display_name || chat.title || chat.name || 'Contact';
  const avatarEl = overlay.querySelector('.call-avatar');
  const nameEl = overlay.querySelector('.call-name');
  const statusEl = overlay.querySelector('.call-status');
  const typeLabel = overlay.querySelector('.call-type-label');

  if (nameEl) nameEl.textContent = name;
  if (statusEl) statusEl.textContent = `Calling ${name}… (Demo)`;
  if (typeLabel) typeLabel.textContent = type === 'video' ? 'Video call (Demo)' : 'Voice call (Demo)';
  if (avatarEl) {
    avatarEl.textContent = chat.type === 'group' ? '👥' : getInitials(name);
    avatarEl.style.background = userAvatarStyle(chat, chat.avatar_color || chat.other_color);
  }

  overlay.classList.remove('hidden');
  overlay.dataset.state = 'ringing';
  overlay.classList.toggle('video-call', type === 'video');
  focusFirstIn(overlay, '#call-end-btn');

  if (callTimer) clearTimeout(callTimer);
  callTimer = setTimeout(() => {
    if (overlay.dataset.state === 'ringing') endCall(true);
  }, 25000);
}

export function endCall(noAnswer = false) {
  const overlay = $(SELECTORS.callOverlay);
  if (!overlay) return;

  if (callTimer) {
    clearTimeout(callTimer);
    callTimer = null;
  }

  const wasRinging = overlay.dataset.state === 'ringing';
  overlay.dataset.state = 'ended';
  overlay.classList.add('hidden');
  restoreFocus(overlay, callType === 'video' ? '#video-call-btn' : '#voice-call-btn');

  const name = chatState.activeChat?.display_name || chatState.activeChat?.title || 'Contact';
  if (noAnswer && wasRinging) showToast(`No answer from ${name}`, 'info');
  else if (!noAnswer) showToast('Call ended', 'info');
}

export function initCallView() {
  $('#call-end-btn')?.addEventListener('click', () => endCall(false));
  $('#call-mute-btn')?.addEventListener('click', (e) => {
    e.currentTarget.classList.toggle('active');
  });
  $('.call-overlay-backdrop')?.addEventListener('click', () => endCall(false));
}
