/** VIEW — Forward message modal (delegated clicks). */

import { chatState, SELECTORS } from '../config.js';

import {
  $, escapeHtml, buildEmptyInlineHtml,
  formatMediaReplyPreview, isForwardedContent, stripForwardPrefix,
  focusFirstIn, rememberFocus, restoreFocus
} from '../utils.js';

import { buildAvatarHtml } from './uiComponents.js';



let forwardSelectHandler = null;



function buildMessagePreview(msg) {

  const raw = msg.plainContent || msg.content || '';

  const text = isForwardedContent(raw) ? stripForwardPrefix(raw) : raw;

  return formatMediaReplyPreview(text);

}



export function openForwardModal(message, onSelect) {

  const modal = $(SELECTORS.forwardModal);

  const list = $(SELECTORS.forwardChatList);

  const previewEl = $('#forward-message-preview');

  if (!modal || !list || !message) return;



  rememberFocus(modal);

  forwardSelectHandler = onSelect;

  const preview = buildMessagePreview(message);

  if (previewEl) {

    previewEl.innerHTML = `

      <div class="forward-preview-bubble">

        <span class="forward-preview-label">Message to forward</span>

        <span class="forward-preview-text">${escapeHtml(preview)}</span>

      </div>`;

    previewEl.classList.remove('hidden');

  }



  const targets = chatState.chats.filter((c) => c.id !== chatState.activeChatId);

  if (!targets.length) {

    list.innerHTML = buildEmptyInlineHtml({

      title: 'No other chats to forward to',

      hint: 'Start a conversation first, then try again',

      extraClass: 'modal-empty',

      icon: 'forward'

    });

  } else {

    list.innerHTML = targets.map((chat) => `

      <button type="button" class="forward-chat-item" data-id="${chat.id}">

        ${buildAvatarHtml(chat, { sizeClass: 'xs' })}

        <span class="forward-chat-name">${escapeHtml(chat.display_name)}</span>

        <svg class="forward-chat-arrow" width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M10 6 8.59 7.41 13.17 12l-4.58 4.59L10 18l6-6-6-6z"/></svg>

      </button>`).join('');

  }



  if (!list.dataset.delegation) {

    list.dataset.delegation = '1';

    list.addEventListener('click', (e) => {

      const btn = e.target.closest('.forward-chat-item');

      if (!btn || !forwardSelectHandler) return;

      forwardSelectHandler(Number(btn.dataset.id));

    });

  }



  modal.classList.remove('hidden', 'closing');

  requestAnimationFrame(() => modal.classList.add('open'));
  focusFirstIn(modal, '.forward-chat-item');

}



export function closeForwardModal() {

  const modal = $(SELECTORS.forwardModal);

  if (!modal || modal.classList.contains('hidden')) return;

  modal.classList.remove('open');

  modal.classList.add('closing');

  setTimeout(() => {

    modal.classList.add('hidden');

    modal.classList.remove('closing');

    forwardSelectHandler = null;

    $('#forward-message-preview')?.classList.add('hidden');
    restoreFocus(modal, SELECTORS.messageInput);

  }, 220);

}

