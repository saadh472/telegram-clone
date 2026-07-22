/** VIEW — Chat info panel (members, pin, mute, encryption, shared media). */
import { chatState } from '../config.js';
import { getChatPref } from '../models/chatPrefs.js';
import {
  isE2eEnabledForChat, setE2eEnabledForChat, updateE2eToggleButton
} from '../models/e2eCrypto.js';
import { GROUP_PERMS, getGroupPerm, setGroupPerm } from '../models/groupPrefs.js';
import {
  $, escapeHtml, getInitials, userAvatarStyle, formatLastSeen,
  isPhotoMessage, isFileMessage, isVoiceMessage, isMessageDeleted,
  getPhotoThumbnail, parsePhotoFilename, buildEmptyInlineHtml, sanitizeImageDataUrl,
  focusFirstIn, rememberFocus, restoreFocus
} from '../utils.js';
import { buildAvatarHtml } from './uiComponents.js';

function extractSharedMedia(messages) {
  const items = [];
  messages.forEach((msg) => {
    if (isMessageDeleted(msg)) return;
    const c = msg.content;
    if (isPhotoMessage(c)) {
      const thumb = getPhotoThumbnail(msg.id, c);
      items.push({ type: 'photo', id: msg.id, thumb, label: parsePhotoFilename(c) });
    } else if (isFileMessage(c)) {
      items.push({ type: 'file', id: msg.id, label: msg.content });
    } else if (isVoiceMessage(c)) {
      items.push({ type: 'voice', id: msg.id, label: 'Voice' });
    }
  });
  return items.slice(-12).reverse();
}

function buildSharedMediaHtml(messages) {
  const media = extractSharedMedia(messages);
  if (!media.length) {
    return buildEmptyInlineHtml({
      title: 'No shared media',
      hint: 'Photos, files, and voice messages appear here',
      extraClass: 'shared-media-empty',
      icon: 'messages',
      svg: false
    });
  }
  const tiles = media.map((m) => {
    if (m.type === 'photo' && m.thumb) {
      const safeThumb = sanitizeImageDataUrl(m.thumb);
      if (!safeThumb) {
        return `<button type="button" class="shared-media-tile photo" data-msg-id="${m.id}" aria-label="Photo: ${escapeHtml(m.label)}">
          <span class="shared-media-icon" aria-hidden="true">📷</span>
        </button>`;
      }
      return `<button type="button" class="shared-media-tile photo" data-msg-id="${m.id}" aria-label="Photo: ${escapeHtml(m.label)}">
        <img src="${escapeHtml(safeThumb)}" alt="" loading="lazy" draggable="false">
      </button>`;
    }
    const icon = m.type === 'file' ? '📎' : m.type === 'voice' ? '🎤' : '📷';
    return `<button type="button" class="shared-media-tile ${m.type}" data-msg-id="${m.id}" aria-label="${escapeHtml(m.label)}">
      <span class="shared-media-icon" aria-hidden="true">${icon}</span>
    </button>`;
  }).join('');
  return `<div class="shared-media-grid" role="list">${tiles}</div>`;
}

function buildGroupPermissionsHtml(chatId) {
  const rows = GROUP_PERMS.map((perm) => {
    const checked = getGroupPerm(chatId, perm.id);
    return `
      <div class="group-perm-row">
        <div class="group-perm-text">
          <span class="group-perm-label">${escapeHtml(perm.label)}</span>
          <span class="group-perm-hint">${escapeHtml(perm.hint)}</span>
        </div>
        <label class="toggle-switch toggle-switch-sm">
          <input type="checkbox" data-perm="${perm.id}" ${checked ? 'checked' : ''} aria-label="${escapeHtml(perm.label)}">
          <span class="toggle-slider"></span>
        </label>
      </div>`;
  }).join('');
  return `<div class="group-permissions" id="group-permissions">${rows}</div>`;
}

export function openChatInfoPanel(chat, members, messages = chatState.messages) {
  const panel = $('#chat-info-panel');
  if (!panel || !chat) return;
  rememberFocus(panel);

  const profile = $('#chat-info-profile');
  if (profile) {
    const online = chat.type !== 'group' && chat.other_online;
    const statusText = chat.type === 'group'
      ? `${members.length} members`
      : (online ? 'online' : formatLastSeen(chat.other_last_seen, false));
    profile.innerHTML = `
      ${buildAvatarHtml(chat, { sizeClass: 'large', online, showRing: chat.type !== 'group' })}
      <h2>${escapeHtml(chat.display_name || 'Chat')}</h2>
      <p class="chat-info-sub ${online ? 'online' : ''}">${escapeHtml(statusText)}</p>`;
  }

  updatePinMuteButtons(chat.id);
  updateE2eSection(chat);

  const addMemberBtn = $('#chat-info-add-member-btn');
  if (addMemberBtn) {
    addMemberBtn.classList.toggle('hidden', chat.type !== 'group');
  }

  const list = $('#chat-info-members-list');
  if (list) {
    if (chat.type === 'group' && members.length) {
      list.innerHTML = members.map((m) => `
        <div class="chat-info-member">
          ${buildAvatarHtml(m, { sizeClass: 'xs' })}
          <div class="chat-info-member-text">
            <span class="member-name">${escapeHtml(m.display_name)}</span>
            <span class="member-user">@${escapeHtml(m.username)}</span>
          </div>
          <span class="member-role">${m.id === chat.created_by ? 'Admin' : 'Member'}</span>
        </div>`).join('');
    } else if (chat.type === 'private') {
      list.innerHTML = `<p class="chat-info-hint">Private chat with ${escapeHtml(chat.display_name)}</p>`;
    } else {
      list.innerHTML = '<p class="chat-info-hint">No members</p>';
    }
  }

  const sharedEl = $('#chat-info-shared-media');
  if (sharedEl) sharedEl.innerHTML = buildSharedMediaHtml(messages);

  const permsSection = $('#chat-info-permissions-section');
  const permsEl = $('#chat-info-permissions');
  if (permsSection && permsEl) {
    const isGroup = chat.type === 'group';
    permsSection.classList.toggle('hidden', !isGroup);
    if (isGroup) permsEl.innerHTML = buildGroupPermissionsHtml(chat.id);
  }

  panel.classList.remove('hidden', 'closing');
  requestAnimationFrame(() => panel.classList.add('open'));
  focusFirstIn(panel, '#close-chat-info-btn');
}

export function initGroupPermissionsDelegation(onChange) {
  const panel = $('#chat-info-panel');
  if (!panel || panel.dataset.permDelegation) return;
  panel.dataset.permDelegation = '1';
  panel.addEventListener('change', (e) => {
    const input = e.target.closest('#group-permissions input[data-perm]');
    if (!input || !chatState.activeChatId) return;
    setGroupPerm(chatState.activeChatId, input.dataset.perm, input.checked);
    onChange?.(input.dataset.perm, input.checked);
  });
}

export function updateE2eSection(chat) {
  const section = $('#chat-info-encryption');
  const status = $('#chat-info-e2e-status');
  if (!section || !chat) return;

  const enabled = isE2eEnabledForChat(chat);
  section.classList.toggle('e2e-active', enabled);
  if (status) {
    status.textContent = enabled
      ? 'Demo E2E: client-side AES encryption (not Signal protocol)'
      : 'Encryption is off for this chat';
  }
  updateE2eToggleButton(chat);
}

export function toggleChatE2e(chat) {
  const next = !isE2eEnabledForChat(chat);
  setE2eEnabledForChat(chat.id, next);
  updateE2eSection(chat);
  return next;
}

export function closeChatInfoPanel() {
  const panel = $('#chat-info-panel');
  if (!panel || panel.classList.contains('hidden')) return;
  panel.classList.remove('open');
  panel.classList.add('closing');
  setTimeout(() => {
    panel.classList.add('hidden');
    panel.classList.remove('closing');
    restoreFocus(panel, '#chat-header-info');
  }, 260);
}

export function updatePinMuteButtons(chatId) {
  const pref = getChatPref(chatId);
  const pinBtn = $('#chat-info-pin-btn');
  const muteBtn = $('#chat-info-mute-btn');
  const archiveBtn = $('#chat-info-archive-btn');
  if (pinBtn) {
    pinBtn.classList.toggle('active', pref.pinned);
    const label = pinBtn.querySelector('.chat-info-action-label');
    if (label) label.textContent = pref.pinned ? 'Unpin chat' : 'Pin chat';
  }
  if (muteBtn) {
    muteBtn.classList.toggle('active', pref.muted);
    const label = muteBtn.querySelector('.chat-info-action-label');
    if (label) label.textContent = pref.muted ? 'Unmute' : 'Mute';
  }
  if (archiveBtn) {
    archiveBtn.classList.toggle('active', pref.archived);
    const label = archiveBtn.querySelector('.chat-info-action-label');
    if (label) label.textContent = pref.archived ? 'Unarchive' : 'Archive';
  }
}
