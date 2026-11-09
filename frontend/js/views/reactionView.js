/** VIEW — Message reaction picker and chip rendering. */
import { authState, chatState, REACTION_EMOJIS, SELECTORS } from '../config.js';
import { $, escapeHtml } from '../utils.js';
import { getReactionsForMessage, hasUserReacted } from '../models/messageReactions.js';

let activeMessageId = null;
let onReactionSelect = null;

export function setReactionSelectHandler(fn) {
  onReactionSelect = fn;
}

function reactionNamesTooltip(userIds) {
  const names = userIds.map((id) => {
    if (id === authState.user?.id) return 'You';
    const fromMsg = chatState.messages.find((m) => m.sender_id === id);
    return fromMsg?.sender_name || `User ${id}`;
  });
  return [...new Set(names)].join(', ');
}

function clearPickerOpenRow() {
  document.querySelector('.msg-row.picker-open')?.classList.remove('picker-open');
}

function positionReactionPicker(picker, anchorEl) {
  const rect = anchorEl.getBoundingClientRect();
  const row = anchorEl.closest('.msg-row');
  const isSent = row?.classList.contains('sent');
  const margin = 8;
  const pw = picker.offsetWidth || 280;
  const ph = picker.offsetHeight || 52;

  picker.classList.remove('above', 'below', 'sent-side', 'recv-side');
  picker.classList.add(isSent ? 'sent-side' : 'recv-side');

  let top = rect.top - ph - margin;
  let placement = 'above';
  if (top < margin) {
    top = rect.bottom + margin;
    placement = 'below';
  }
  if (top + ph > window.innerHeight - margin) {
    top = Math.max(margin, window.innerHeight - ph - margin);
  }

  let left = rect.left + rect.width / 2 - pw / 2;
  if (isSent) left = Math.min(left, rect.right - pw + 12);
  else left = Math.max(left, rect.left - 4);
  left = Math.max(margin, Math.min(left, window.innerWidth - pw - margin));

  picker.style.left = `${left}px`;
  picker.style.top = `${top}px`;
  picker.classList.add(placement);
}

export function isPickerOpenFor(messageId) {
  return activeMessageId != null && String(activeMessageId) === String(messageId);
}

export function initReactionPicker() {
  const picker = $(SELECTORS.reactionPicker);
  if (!picker || picker.dataset.ready) return;
  picker.dataset.ready = '1';
  picker.innerHTML = REACTION_EMOJIS.map((emoji) =>
    `<button type="button" class="reaction-picker-btn" data-emoji="${emoji}" aria-label="React with ${emoji}">${emoji}</button>`
  ).join('');
  picker.addEventListener('click', (e) => {
    const btn = e.target.closest('.reaction-picker-btn');
    if (!btn || !activeMessageId) return;
    e.preventDefault();
    e.stopPropagation();
    btn.classList.add('picked');
    const msgId = activeMessageId;
    const emoji = btn.dataset.emoji;
    setTimeout(() => btn.classList.remove('picked'), 320);
    onReactionSelect?.(msgId, emoji);
  });
  picker.addEventListener('mousedown', (e) => e.stopPropagation());
  picker.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
}

export function showReactionPicker(messageId, anchorEl) {
  const picker = $(SELECTORS.reactionPicker);
  if (!picker || !anchorEl) return;

  clearPickerOpenRow();
  activeMessageId = messageId;
  picker.classList.remove('hidden');

  const row = anchorEl.closest('.msg-row') || $(`.msg-row[data-id="${messageId}"]`);
  row?.classList.add('picker-open');

  requestAnimationFrame(() => positionReactionPicker(picker, anchorEl));
}

export function hideReactionPicker() {
  clearPickerOpenRow();
  $(SELECTORS.reactionPicker)?.classList.add('hidden');
  activeMessageId = null;
}

export function buildReactionChipsHtml(messageId) {
  const reactions = getReactionsForMessage(messageId);
  const entries = Object.entries(reactions).filter(([, users]) => users.length > 0);
  if (!entries.length) return '';

  const chips = entries.map(([emoji, users]) => {
    const active = hasUserReacted(messageId, emoji);
    const tooltip = reactionNamesTooltip(users);
    const label = `${emoji}, ${users.length} reaction${users.length === 1 ? '' : 's'} — ${tooltip}`;
    return `<button type="button" class="reaction-chip${active ? ' active' : ''}" data-emoji="${emoji}" title="${escapeHtml(tooltip)}" aria-label="${escapeHtml(label)}">${emoji}<span class="reaction-count">${users.length}</span></button>`;
  }).join('');

  return `<div class="msg-reactions">${chips}</div>`;
}

export function updateReactionChipsInRow(row, messageId) {
  if (!row) return;
  const existing = row.querySelector('.msg-reactions');
  const html = buildReactionChipsHtml(messageId);
  if (!html) {
    existing?.remove();
    return;
  }
  if (existing) {
    existing.outerHTML = html;
  } else {
    row.insertAdjacentHTML('beforeend', html);
  }
}
