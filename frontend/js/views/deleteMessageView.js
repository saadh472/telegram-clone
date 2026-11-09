/** VIEW — Delete message modal (Telegram-style scope picker). */
import { SELECTORS } from '../config.js';
import { $, $$, focusFirstIn, rememberFocus, restoreFocus } from '../utils.js';

let pendingMessageId = null;
let onDeleteEveryone = null;
let onDeleteMe = null;

export function openDeleteModal(messageId, isSender, handlers = {}) {
  const modal = $(SELECTORS.deleteMessageModal);
  if (!modal) return;

  rememberFocus(modal);
  pendingMessageId = messageId;
  onDeleteEveryone = handlers.onEveryone || null;
  onDeleteMe = handlers.onMe || null;

  const everyoneBtn = $(SELECTORS.deleteForEveryoneBtn);
  const everyoneHint = $(SELECTORS.deleteForEveryoneHint);
  if (everyoneBtn) {
    everyoneBtn.disabled = !isSender;
    everyoneBtn.title = isSender ? '' : 'Only the sender can delete for everyone';
  }
  if (everyoneHint) {
    everyoneHint.classList.toggle('hidden', isSender);
  }

  modal.classList.remove('hidden');
  requestAnimationFrame(() => modal.classList.add('open'));
  focusFirstIn(modal, isSender ? SELECTORS.deleteForEveryoneBtn : SELECTORS.deleteForMeBtn);
}

export function closeDeleteModal() {
  const modal = $(SELECTORS.deleteMessageModal);
  if (!modal || modal.classList.contains('hidden')) return;
  modal.classList.remove('open');
  modal.classList.add('closing');
  setTimeout(() => {
    modal.classList.add('hidden');
    modal.classList.remove('closing');
    pendingMessageId = null;
    onDeleteEveryone = null;
    onDeleteMe = null;
    restoreFocus(modal, SELECTORS.messageInput);
  }, 200);
}

function handleScope(scope) {
  const messageId = pendingMessageId;
  closeDeleteModal();
  if (!messageId) return;
  if (scope === 'everyone') onDeleteEveryone?.(messageId);
  else if (scope === 'me') onDeleteMe?.(messageId);
}

export function initDeleteModal() {
  const modal = $(SELECTORS.deleteMessageModal);
  if (!modal || modal.dataset.delegation) return;
  modal.dataset.delegation = '1';

  $$(`${SELECTORS.deleteMessageModal} [data-close="delete-message-modal"]`).forEach((el) => {
    el.addEventListener('click', closeDeleteModal);
  });

  $(SELECTORS.deleteForEveryoneBtn)?.addEventListener('click', () => handleScope('everyone'));
  $(SELECTORS.deleteForMeBtn)?.addEventListener('click', () => handleScope('me'));
  $(SELECTORS.deleteMessageCancelBtn)?.addEventListener('click', closeDeleteModal);
}
