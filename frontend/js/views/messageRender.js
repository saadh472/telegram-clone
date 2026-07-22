/** VIEW — Message thread DOM rendering (incremental, no poll flicker). */
import {
  authState, chatState, uiState, SENDER_COLORS, ICONS, MAX_DOM_MESSAGES,
  SELECTORS, SCROLL_NEAR_BOTTOM_THRESHOLD, MESSAGE_GROUP_MS
} from '../config.js';
import { $, $$, escapeHtml, formatBubbleTime, formatDateDivider, senderColor, isStickerMessage, parseStickerEmoji, isPhotoMessage, isFileMessage, isVoiceMessage, parsePhotoFilename, parseFileFilename, parseVoiceDuration, getPhotoThumbnail, formatMediaReplyPreview, linkifyContent, extractFirstUrl, buildLinkPreviewHtml, parseFileBase64, highlightMatch, canEditMessage, isMessageDeleted, DELETED_MESSAGE_TEXT, buildEmptyInlineHtml, isForwardedContent, stripForwardPrefix, initLazyMediaObserver, sanitizeImageDataUrl, sanitizeFileDataUrl } from '../utils.js';
import { buildReactionChipsHtml } from './reactionView.js';
import { buildForwardedRibbonHtml } from './uiComponents.js';
import { messagesPrefixUnchanged } from '../models/chatModel.js';
import { e2eLockBadgeHtml, isE2eEnabledForChat, e2eChatBannerHtml } from '../models/e2eCrypto.js';

const messageRowCache = new Map();
const messageSearchTextCache = new Map();
const VIRTUAL_MESSAGE_THRESHOLD = 220;
const VIRTUAL_WINDOW_SIZE = 150;
const VIRTUAL_BUFFER_ROWS = 50;
const VIRTUAL_ROW_ESTIMATE = 76;
const VIRTUAL_METRIC_SAMPLE_SIZE = 24;

let virtualScrollRaf = 0;
let searchIndexState = createEmptySearchIndex();
let lastStatusSignature = '';

function escapeAttrValue(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function messageRowSelector(id) {
  return `.msg-row[data-id="${escapeAttrValue(id)}"]`;
}

function cacheMessageRow(row) {
  if (row?.dataset?.id) messageRowCache.set(String(row.dataset.id), row);
  return row;
}

function getMessageRow(id) {
  const key = String(id);
  const cached = messageRowCache.get(key);
  if (cached?.isConnected && cached.dataset.id === key) return cached;
  const row = $(messageRowSelector(key));
  if (row) cacheMessageRow(row);
  else messageRowCache.delete(key);
  return row;
}

function indexRenderedMessageRows(container) {
  messageRowCache.clear();
  container?.querySelectorAll('.msg-row[data-id]').forEach(cacheMessageRow);
}

function clearMessageRenderCaches() {
  messageRowCache.clear();
  messageSearchTextCache.clear();
  resetSearchIndex();
  resetVirtualState();
  lastStatusSignature = '';
}

function createEmptySearchIndex() {
  return {
    key: '',
    allText: [],
    charMap: new Map(),
    bigramMap: new Map(),
    idToIndex: new Map(),
    matchesByQuery: new Map()
  };
}

function resetSearchIndex() {
  searchIndexState = createEmptySearchIndex();
}

function getSearchCorpusKey() {
  const messages = chatState.messages;
  const first = messages[0];
  const last = messages[messages.length - 1];
  return [
    chatState.activeChatId || '',
    messages.length,
    first?.id || '',
    first?.edited_at || '',
    first?.is_deleted ? 1 : 0,
    last?.id || '',
    last?.edited_at || '',
    last?.is_deleted ? 1 : 0,
    last?.plainContent || last?.content || ''
  ].join('|');
}

function addIndexHit(map, key, index) {
  if (!key) return;
  const list = map.get(key);
  if (list) list.push(index);
  else map.set(key, [index]);
}

function ensureMessageSearchIndex() {
  const key = getSearchCorpusKey();
  if (searchIndexState.key === key) return searchIndexState;

  const next = createEmptySearchIndex();
  next.key = key;
  chatState.messages.forEach((msg, index) => {
    const id = String(msg.id);
    const text = getSearchableMessageText(msg);
    next.idToIndex.set(id, index);
    next.allText[index] = text;

    const chars = new Set(text);
    chars.forEach((ch) => addIndexHit(next.charMap, ch, index));

    const grams = new Set();
    for (let i = 0; i < text.length - 1; i += 1) {
      grams.add(text.slice(i, i + 2));
    }
    grams.forEach((gram) => addIndexHit(next.bigramMap, gram, index));
  });
  searchIndexState = next;
  return searchIndexState;
}

function candidateIndicesForQuery(index, query) {
  if (!query) return [];
  if (query.length === 1) return index.charMap.get(query) || [];

  let best = null;
  for (let i = 0; i < query.length - 1; i += 1) {
    const gram = query.slice(i, i + 2);
    const hits = index.bigramMap.get(gram);
    if (!hits) return [];
    if (!best || hits.length < best.length) best = hits;
  }
  return best || [];
}

function getMessageIndexById(id) {
  const index = ensureMessageSearchIndex();
  const found = index.idToIndex.get(String(id));
  if (found != null) return found;
  return chatState.messages.findIndex((m) => String(m.id) === String(id));
}

function resetVirtualState() {
  if (virtualScrollRaf) {
    cancelAnimationFrame(virtualScrollRaf);
    virtualScrollRaf = 0;
  }
  uiState.messageVirtual = {
    enabled: false,
    start: 0,
    end: 0,
    total: 0,
    avgRowHeight: VIRTUAL_ROW_ESTIMATE
  };
}

function getVirtualState() {
  if (!uiState.messageVirtual) resetVirtualState();
  return uiState.messageVirtual;
}

function shouldVirtualizeMessages() {
  return chatState.messages.length > VIRTUAL_MESSAGE_THRESHOLD;
}

function isVirtualActive() {
  const state = getVirtualState();
  return state.enabled && shouldVirtualizeMessages();
}

export function showMessagesSkeleton() {
  resetMessagesView();
  const c = $(SELECTORS.messagesContainer);
  if (!c) return;
  c.classList.add('loading');
  c.innerHTML = `<div class="skeleton-list messages-skeleton">${[1, 2, 3].map(() =>
    `<div class="skeleton-item"><div class="skeleton-line sent-line"></div></div><div class="skeleton-item"><div class="skeleton-line recv-line"></div></div>`
  ).join('')}</div>`;
}

export function showMessagesError(onRetry) {
  resetMessagesView();
  const container = $(SELECTORS.messagesContainer);
  if (!container) return;
  container.innerHTML = buildEmptyInlineHtml({
    title: "Couldn't load messages",
    extraClass: 'messages-error',
    icon: false,
    extra: '<button type="button" class="btn-secondary btn-sm" id="retry-messages-btn">Retry</button>'
  });
  $('#retry-messages-btn')?.addEventListener('click', onRetry);
}

export function resetMessagesView() {
  uiState.renderedChatId = null;
  uiState.renderedMessageOrder = [];
  uiState.renderedMessageIds = new Set();
  clearMessageRenderCaches();
}

function groupMessages(messages) {
  const groups = [];
  let current = null;
  messages.forEach((msg, i) => {
    const prev = messages[i - 1];
    const sameSender = prev && prev.sender_id === msg.sender_id;
    const closeInTime = prev && (new Date(msg.created_at) - new Date(prev.created_at)) < MESSAGE_GROUP_MS;
    const sameDay = prev && new Date(msg.created_at).toDateString() === new Date(prev.created_at).toDateString();
    if (current && sameSender && closeInTime && sameDay) {
      current.messages.push(msg);
    } else {
      current = { messages: [msg], senderId: msg.sender_id };
      groups.push(current);
    }
  });
  return groups;
}

function posClass(count, mi) {
  if (count === 1) return 'single';
  if (mi === 0) return 'first';
  if (mi === count - 1) return 'last';
  return 'middle';
}

function statusHtml(msg, isSent) {
  if (!isSent) return '';
  const meta = chatState.messageMeta[msg.id] || { status: msg.is_read ? 'read' : 'sent' };
  let st = meta.status || (msg.is_read ? 'read' : 'sent');
  if (meta.failed) {
    const title = meta.error ? `Retry send — ${meta.error}` : 'Retry send';
    return `<button type="button" class="msg-retry-btn" data-action="retry" title="${escapeHtml(title)}">↻ Retry</button>`;
  }
  if (st === 'delivered' && msg.is_read) st = 'read';
  const icon = st === 'sending' ? ICONS.clock : st === 'sent' ? ICONS.check : ICONS.doubleCheck;
  let title = 'Sending';
  if (st === 'sent') title = 'Sent';
  else if (st === 'delivered') title = 'Delivered';
  else if (st === 'read') title = 'Read';
  return `<span class="msg-status ${st}" title="${title}">${icon}</span>`;
}

function messageMatchesSearch(msg) {
  const q = chatState.messageSearch;
  if (!q) return true;
  if (isMessageDeleted(msg)) return false;
  return getSearchableMessageText(msg).includes(q);
}

function searchHighlightClass(msg) {
  return chatState.messageSearch && messageMatchesSearch(msg) ? ' search-hit' : '';
}

function searchHiddenClass(msg) {
  return chatState.messageSearch && !messageMatchesSearch(msg) ? ' search-hidden' : '';
}

export function updateMessageSearchMeta() {
  const meta = $(SELECTORS.chatSearchMeta);
  const input = $(SELECTORS.chatSearchInput);
  const bar = $(SELECTORS.chatSearchBar);
  const prevBtn = $(SELECTORS.chatSearchPrevBtn);
  const nextBtn = $(SELECTORS.chatSearchNextBtn);
  if (!meta) return;
  const q = chatState.messageSearch;
  bar?.classList.toggle('has-query', !!q);
  if (input && input.value.trim().toLowerCase() !== q) input.value = q;
  if (!q) {
    meta.textContent = 'Type to search';
    meta.classList.remove('no-results');
    chatState.messageSearchIndex = -1;
    if (prevBtn) prevBtn.disabled = true;
    if (nextBtn) nextBtn.disabled = true;
    return;
  }
  const matches = getMessageSearchMatches();
  const count = matches.length;
  if (count && (chatState.messageSearchIndex < 0 || chatState.messageSearchIndex >= count)) {
    chatState.messageSearchIndex = 0;
  }
  if (!count) chatState.messageSearchIndex = -1;
  meta.textContent = count ? `${chatState.messageSearchIndex + 1} of ${count}` : 'No matches';
  meta.classList.toggle('no-results', count === 0);
  if (prevBtn) prevBtn.disabled = count === 0;
  if (nextBtn) nextBtn.disabled = count === 0;
}

export function getMessageSearchMatches() {
  const query = chatState.messageSearch;
  if (!query) return [];
  const index = ensureMessageSearchIndex();
  const cached = index.matchesByQuery.get(query);
  if (cached) return cached;

  const candidates = candidateIndicesForQuery(index, query);
  const matches = [];
  for (let i = 0; i < candidates.length; i += 1) {
    const messageIndex = candidates[i];
    if (index.allText[messageIndex]?.includes(query)) {
      const msg = chatState.messages[messageIndex];
      if (msg && !isMessageDeleted(msg)) matches.push(msg);
    }
  }
  index.matchesByQuery.set(query, matches);
  return matches;
}

export function focusMessageSearchResult(step = 1) {
  const matches = getMessageSearchMatches();
  if (!matches.length) {
    updateMessageSearchMeta();
    return false;
  }
  const count = matches.length;
  const current = chatState.messageSearchIndex < 0 ? 0 : chatState.messageSearchIndex;
  chatState.messageSearchIndex = (current + step + count) % count;
  const msg = matches[chatState.messageSearchIndex];
  $$('.msg-row.search-current').forEach((el) => el.classList.remove('search-current'));
  let row = getMessageRow(msg.id);
  if (!row && shouldVirtualizeMessages()) {
    const container = $(SELECTORS.messagesContainer);
    const centerIndex = getMessageIndexById(msg.id);
    if (container && centerIndex >= 0) {
      renderVirtualMessages(container, { centerIndex, focusId: msg.id });
      row = getMessageRow(msg.id);
    }
  }
  if (row) {
    row.classList.add('search-current');
    row.scrollIntoView({ block: 'center', behavior: 'smooth' });
  }
  updateMessageSearchMeta();
  return true;
}

function getMessageDisplayContent(msg) {
  const rawContent = msg?.plainContent || msg?.content || '';
  return isForwardedContent(rawContent) ? stripForwardPrefix(rawContent) : rawContent;
}

function getSearchableMessageContent(msg) {
  if (!msg || isMessageDeleted(msg)) return '';
  const content = msg.plainContent || msg.content || '';
  if (isStickerMessage(content) || isPhotoMessage(content) || isFileMessage(content) || isVoiceMessage(content)) {
    return formatMediaReplyPreview(content);
  }
  return getMessageDisplayContent(msg);
}

function getSearchableMessageText(msg) {
  const id = String(msg?.id ?? '');
  const key = `${msg?.edited_at || ''}|${msg?.is_deleted || ''}|${msg?.plainContent || msg?.content || ''}`;
  const cached = messageSearchTextCache.get(id);
  if (cached?.key === key) return cached.text;
  const text = getSearchableMessageContent(msg).toLowerCase();
  messageSearchTextCache.set(id, { key, text });
  return text;
}

function renderMessageContentHtml(msg, query = chatState.messageSearch) {
  const displayContent = getMessageDisplayContent(msg);
  return query ? highlightMatch(displayContent, query) : linkifyContent(displayContent);
}

function syncRowSearchState(row, msg, query) {
  if (!row || !msg) return false;
  const searching = !!query;
  const matched = !searching || messageMatchesSearch(msg);
  row.classList.toggle('search-hidden', searching && !matched);
  row.classList.toggle('search-hit', searching && matched);

  const contentEl = row.querySelector('.msg-content');
  if (contentEl) {
    const contentKey = `${query}|${msg.edited_at || ''}|${msg.plainContent || msg.content || ''}`;
    if (contentEl.dataset.renderKey !== contentKey) {
      contentEl.innerHTML = searching && matched
        ? renderMessageContentHtml(msg, query)
        : renderMessageContentHtml(msg, '');
      contentEl.dataset.renderKey = contentKey;
    }
  }
  return matched;
}

export function applyMessageSearchToRenderedRows({ focus = true } = {}) {
  const container = $(SELECTORS.messagesContainer);
  if (!container) return 0;

  indexRenderedMessageRows(container);
  const query = chatState.messageSearch;
  const matches = query ? getMessageSearchMatches() : [];
  const matchCount = matches.length;

  container.querySelectorAll('.msg-row[data-id]').forEach((row) => {
    const index = getMessageIndexById(row.dataset.id);
    if (index >= 0) syncRowSearchState(row, chatState.messages[index], query);
  });

  if (!query) {
    container.querySelectorAll('.msg-row.search-current').forEach((el) => el.classList.remove('search-current'));
    chatState.messageSearchIndex = -1;
    updateMessageSearchMeta();
    return 0;
  }

  if (chatState.messageSearchIndex < 0 || chatState.messageSearchIndex >= matchCount) {
    chatState.messageSearchIndex = matchCount ? 0 : -1;
  }
  updateMessageSearchMeta();
  if (focus && matchCount) requestAnimationFrame(() => focusMessageSearchResult(0));
  return matchCount;
}

function failedReasonHtml(msg) {
  const meta = chatState.messageMeta[msg.id] || {};
  if (!meta.failed || !meta.error) return '';
  return `<span class="msg-failed-reason" title="${escapeHtml(meta.error)}">${escapeHtml(meta.error)}</span>`;
}

const BUBBLE_REACT_BTN = `
  <button type="button" class="msg-bubble-react-btn" data-action="react" aria-label="Add reaction" title="React">
    <svg width="18" height="18" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.41 0-8-3.59-8-8s3.59-8 8-8 8 3.59 8 8-3.59 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>
  </button>`;

const HOVER_EDIT_BTN = `
      <button type="button" class="msg-hover-btn" data-action="edit" aria-label="Edit" title="Edit">
        <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04a1.003 1.003 0 0 0 0-1.42l-2.34-2.34a1.003 1.003 0 0 0-1.42 0l-1.83 1.83 3.75 3.75 1.84-1.82z"/></svg>
      </button>`;

function buildHoverBar(msg) {
  const editBtn = canEditMessage(msg) ? HOVER_EDIT_BTN : '';
  return `
    <div class="msg-hover-bar">
      <button type="button" class="msg-hover-btn" data-action="react" aria-label="React" title="React">
        <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm3.5-9c.83 0 1.5-.67 1.5-1.5S16.33 8 15.5 8 14 8.67 14 9.5s.67 1.5 1.5 1.5zm-7 0c.83 0 1.5-.67 1.5-1.5S9.33 8 8.5 8 7 8.67 7 9.5 7.67 11 8.5 11zm3.5 6.5c2.33 0 4.31-1.46 5.11-3.5H6.89c.8 2.04 2.78 3.5 5.11 3.5z"/></svg>
      </button>
      <button type="button" class="msg-hover-btn" data-action="reply" aria-label="Reply" title="Reply">
        <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M10 9V5l-7 7 7 7v-4.1c5 0 8.5 1.6 11 5.1-1-5-4-10-11-11z"/></svg>
      </button>
      <button type="button" class="msg-hover-btn" data-action="copy" aria-label="Copy" title="Copy">
        <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M16 1H4c-1.1 0-2 .9-2 2v14h2V3h12V1zm3 4H8c-1.1 0-2 .9-2 2v14c0 1.1.9 2 2 2h11c1.1 0 2-.9 2-2V7c0-1.1-.9-2-2-2zm0 16H8V7h11v14z"/></svg>
      </button>
      <button type="button" class="msg-hover-btn" data-action="forward" aria-label="Forward" title="Forward">
        <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
      </button>${editBtn}
      <button type="button" class="msg-hover-btn danger" data-action="delete" aria-label="Delete" title="Delete">
        <svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M6 19c0 1.1.9 2 2 2h8c1.1 0 2-.9 2-2V7H6v12zM19 4h-3.5l-1-1h-5l-1 1H5v2h14V4z"/></svg>
      </button>
    </div>`;
}

function buildMessageRowHtml(msg, pos, isGroup, highlightNew = false) {
  const isSent = msg.sender_id === authState.user?.id;
  const meta = chatState.messageMeta[msg.id] || {};
  const isOptimistic = String(msg.id).startsWith('temp-');
  const isNew = highlightNew && msg.id === chatState.messages[chatState.messages.length - 1]?.id;
  const justSent = isOptimistic ? ' msg-just-sent' : '';

  if (isMessageDeleted(msg)) {
    return `
    <div class="msg-row msg-deleted-row ${isSent ? 'sent' : 'received'} ${pos} ${isNew ? 'new-incoming' : ''}${justSent}${searchHiddenClass(msg)}" data-id="${msg.id}">
      <div class="msg-bubble msg-deleted">
        <span class="msg-deleted-text">${escapeHtml(DELETED_MESSAGE_TEXT)}</span>
      </div>
    </div>`;
  }

  const senderHtml = !isSent && isGroup && (pos === 'single' || pos === 'first')
    ? `<span class="msg-sender" style="color:${msg.sender_color || senderColor(msg.sender_id, SENDER_COLORS)}">${escapeHtml(msg.sender_name)}</span>`
    : '';

  const replyHtml = msg.reply_to_content
    ? `<div class="msg-reply-preview"><span class="reply-name">${escapeHtml(msg.reply_to_sender || 'Reply')}</span><span>${escapeHtml(formatMediaReplyPreview(msg.reply_to_content))}</span></div>`
    : '';

  const editedHtml = msg.edited_at ? '<span class="msg-edited">edited</span>' : '';
  const hoverBar = buildHoverBar(msg);
  const editingClass = String(chatState.editingId) === String(msg.id) ? ' editing-target' : '';

  const reactionsHtml = buildReactionChipsHtml(msg.id);
  const stickerEmoji = isStickerMessage(msg.content) ? parseStickerEmoji(msg.content) : null;

  if (stickerEmoji) {
    return `
    <div class="msg-row sticker-msg ${isSent ? 'sent' : 'received'} ${pos} ${isOptimistic ? 'optimistic' : ''} ${meta.failed ? 'failed' : ''} ${isNew ? 'new-incoming' : ''}${justSent}${searchHighlightClass(msg)}${searchHiddenClass(msg)}" data-id="${msg.id}">
      ${hoverBar}
      ${BUBBLE_REACT_BTN}
      ${senderHtml}
      <div class="sticker-content" aria-label="Sticker">${stickerEmoji}</div>
      <span class="sticker-time">${formatBubbleTime(msg.created_at)}${isSent ? statusHtml(msg, isSent) : ''}</span>
      ${reactionsHtml}
    </div>`;
  }

  if (isPhotoMessage(msg.content)) {
    const filename = parsePhotoFilename(msg.content);
    const thumb = sanitizeImageDataUrl(getPhotoThumbnail(msg.id, msg.content));
    const imgHtml = thumb
      ? `<img class="photo-thumb" src="${escapeHtml(thumb)}" alt="${escapeHtml(filename)}" loading="lazy" decoding="async" fetchpriority="low">`
      : `<div class="photo-placeholder" aria-hidden="true">📷</div>`;
    return `
    <div class="msg-row media-msg photo-msg ${isSent ? 'sent' : 'received'} ${pos} ${isOptimistic ? 'optimistic' : ''} ${meta.failed ? 'failed' : ''} ${isNew ? 'new-incoming' : ''}${justSent}${searchHighlightClass(msg)}${searchHiddenClass(msg)}" data-id="${msg.id}">
      ${hoverBar}
      ${senderHtml}
      <div class="msg-bubble media-bubble photo-bubble">
        ${replyHtml}
        ${imgHtml}
        <span class="photo-caption">📷 ${escapeHtml(filename)}</span>
        ${failedReasonHtml(msg)}
        <span class="msg-bubble-footer">
          ${editedHtml}
          <span class="msg-time">${formatBubbleTime(msg.created_at)}</span>
          ${statusHtml(msg, isSent)}
        </span>
        ${BUBBLE_REACT_BTN}
      </div>
      ${reactionsHtml}
    </div>`;
  }

  if (isFileMessage(msg.content)) {
    const filename = parseFileFilename(msg.content);
    const fileData = sanitizeFileDataUrl(parseFileBase64(msg.content));
    const downloadHtml = fileData
      ? `<a class="file-download-link" href="${escapeHtml(fileData)}" download="${escapeHtml(filename)}">Download</a>`
      : '';
    return `
    <div class="msg-row media-msg file-msg ${isSent ? 'sent' : 'received'} ${pos} ${isOptimistic ? 'optimistic' : ''} ${meta.failed ? 'failed' : ''} ${isNew ? 'new-incoming' : ''}${justSent}${searchHighlightClass(msg)}${searchHiddenClass(msg)}" data-id="${msg.id}">
      ${hoverBar}
      ${senderHtml}
      <div class="msg-bubble media-bubble file-bubble">
        ${replyHtml}
        <div class="file-attachment">
          <span class="file-icon" aria-hidden="true">📎</span>
          <span class="file-name">${escapeHtml(filename)}</span>
          ${downloadHtml}
        </div>
        ${failedReasonHtml(msg)}
        <span class="msg-bubble-footer">
          ${editedHtml}
          <span class="msg-time">${formatBubbleTime(msg.created_at)}</span>
          ${statusHtml(msg, isSent)}
        </span>
        ${BUBBLE_REACT_BTN}
      </div>
      ${reactionsHtml}
    </div>`;
  }

  if (isVoiceMessage(msg.content)) {
    const duration = parseVoiceDuration(msg.content);
    return `
    <div class="msg-row media-msg voice-msg ${isSent ? 'sent' : 'received'} ${pos} ${isOptimistic ? 'optimistic' : ''} ${meta.failed ? 'failed' : ''} ${isNew ? 'new-incoming' : ''}${justSent}${searchHighlightClass(msg)}${searchHiddenClass(msg)}" data-id="${msg.id}">
      ${hoverBar}
      ${senderHtml}
      <div class="msg-bubble media-bubble voice-bubble">
        ${replyHtml}
        <div class="voice-message">
          <button type="button" class="voice-play-btn" aria-label="Play voice message" title="Play">
            <svg width="18" height="18" viewBox="0 0 24 24"><path fill="currentColor" d="M8 5v14l11-7z"/></svg>
          </button>
          <div class="voice-waveform" aria-hidden="true">
            <span></span><span></span><span></span><span></span><span></span><span></span><span></span><span></span>
          </div>
          <span class="voice-duration">${escapeHtml(duration)}</span>
        </div>
        ${failedReasonHtml(msg)}
        <span class="msg-bubble-footer">
          ${editedHtml}
          <span class="msg-time">${formatBubbleTime(msg.created_at)}</span>
          ${statusHtml(msg, isSent)}
        </span>
        ${BUBBLE_REACT_BTN}
      </div>
      ${reactionsHtml}
    </div>`;
  }

  const linkUrl = extractFirstUrl(msg.content);
  const linkPreviewHtml = linkUrl ? buildLinkPreviewHtml(linkUrl) : '';
  const rawContent = msg.plainContent || msg.content;
  const isForwarded = isForwardedContent(rawContent);
  const displayContent = getMessageDisplayContent(msg);
  const forwardedHtml = isForwarded ? buildForwardedRibbonHtml() : '';
  const contentHtml = chatState.messageSearch && messageMatchesSearch(msg)
    ? highlightMatch(displayContent, chatState.messageSearch)
    : linkifyContent(displayContent);
  const e2eBadge = msg.e2e ? e2eLockBadgeHtml() : '';

  return `
    <div class="msg-row ${isSent ? 'sent' : 'received'} ${pos} ${isOptimistic ? 'optimistic' : ''} ${meta.failed ? 'failed' : ''} ${isNew ? 'new-incoming' : ''}${justSent}${searchHighlightClass(msg)}${searchHiddenClass(msg)}${editingClass}${isForwarded ? ' forwarded' : ''}" data-id="${msg.id}">
      ${hoverBar}
      ${senderHtml}
      <div class="msg-bubble">
        ${forwardedHtml}
        ${replyHtml}
        ${linkPreviewHtml}
        <span class="msg-content">${contentHtml}</span>
        ${failedReasonHtml(msg)}
        <span class="msg-bubble-footer">
          ${e2eBadge}
          ${editedHtml}
          <span class="msg-time">${formatBubbleTime(msg.created_at)}</span>
          ${statusHtml(msg, isSent)}
        </span>
        ${BUBBLE_REACT_BTN}
      </div>
      ${reactionsHtml}
    </div>`;
}

function sameMessageCluster(prev, msg) {
  if (!prev || !msg) return false;
  const sameSender = prev.sender_id === msg.sender_id;
  const closeInTime = (new Date(msg.created_at) - new Date(prev.created_at)) < MESSAGE_GROUP_MS;
  const sameDay = new Date(msg.created_at).toDateString() === new Date(prev.created_at).toDateString();
  return sameSender && closeInTime && sameDay;
}

function positionForMessage(messages, idx) {
  const msg = messages[idx];
  const samePrev = sameMessageCluster(messages[idx - 1], msg);
  const sameNext = sameMessageCluster(msg, messages[idx + 1]);
  if (!samePrev && !sameNext) return 'single';
  if (!samePrev && sameNext) return 'first';
  if (samePrev && sameNext) return 'middle';
  return 'last';
}

function buildMessageRangeHtml(messages, start, end, highlightNew) {
  let html = '';
  let lastDate = start > 0 && messages[start - 1]
    ? new Date(messages[start - 1].created_at).toDateString()
    : '';
  const unreadFrom = chatState.lastReadCount;
  const isGroup = chatState.activeChat?.type === 'group';

  for (let idx = start; idx < end; idx += 1) {
    const msg = messages[idx];
    if (!msg) continue;
    const msgDate = new Date(msg.created_at).toDateString();
    if (msgDate !== lastDate) {
      html += `<div class="date-divider" data-date="${msgDate}"><span>${formatDateDivider(msg.created_at)}</span></div>`;
      lastDate = msgDate;
    }
    if (idx === unreadFrom && unreadFrom > 0 && unreadFrom < messages.length) {
      html += '<div class="unread-divider"><span>Unread messages</span></div>';
    }
    html += buildMessageRowHtml(msg, positionForMessage(messages, idx), isGroup, highlightNew);
  }
  return html;
}

function buildFullHtml(messages, highlightNew) {
  let html = '';
  if (chatState.hasMoreMessages) {
    html += '<button type="button" id="load-more-messages-btn" class="load-more-btn">Load older messages</button>';
  }
  if (isE2eEnabledForChat(chatState.activeChat)) {
    html += e2eChatBannerHtml();
  }
  html += buildMessageRangeHtml(messages, 0, messages.length, highlightNew);
  return html;
}

function clampVirtualStart(start) {
  const total = chatState.messages.length;
  const maxStart = Math.max(0, total - VIRTUAL_WINDOW_SIZE);
  return Math.max(0, Math.min(maxStart, start));
}

function virtualStartFromScroll(container) {
  const state = getVirtualState();
  const estimatedIndex = Math.floor(container.scrollTop / Math.max(1, state.avgRowHeight));
  return clampVirtualStart(estimatedIndex - VIRTUAL_BUFFER_ROWS);
}

function updateVirtualMetrics(container) {
  const state = getVirtualState();
  const rows = container.querySelectorAll('.msg-row');
  if (!rows.length) return;
  const step = Math.max(1, Math.floor(rows.length / VIRTUAL_METRIC_SAMPLE_SIZE));
  let totalHeight = 0;
  let measuredRows = 0;
  for (let i = 0; i < rows.length && measuredRows < VIRTUAL_METRIC_SAMPLE_SIZE; i += step) {
    totalHeight += rows[i].getBoundingClientRect().height;
    measuredRows += 1;
  }
  const measured = Math.max(48, totalHeight / Math.max(1, measuredRows));
  state.avgRowHeight = Math.round((state.avgRowHeight * 0.7) + (measured * 0.3));
}

function buildVirtualHtml(start, end, highlightNew) {
  const state = getVirtualState();
  const total = chatState.messages.length;
  const topHeight = Math.max(0, Math.round(start * state.avgRowHeight));
  const bottomHeight = Math.max(0, Math.round((total - end) * state.avgRowHeight));
  let html = '';
  if (start === 0 && chatState.hasMoreMessages) {
    html += '<button type="button" id="load-more-messages-btn" class="load-more-btn">Load older messages</button>';
  }
  if (start === 0 && isE2eEnabledForChat(chatState.activeChat)) {
    html += e2eChatBannerHtml();
  }
  html += `<div class="message-virtual-spacer top" style="height:${topHeight}px" aria-hidden="true"></div>`;
  html += buildMessageRangeHtml(chatState.messages, start, end, highlightNew);
  html += `<div class="message-virtual-spacer bottom" style="height:${bottomHeight}px" aria-hidden="true"></div>`;
  return html;
}

function renderVirtualMessages(container, {
  centerIndex = null,
  focusId = null,
  highlightNew = false,
  preserveScroll = true,
  scrollBottom = false
} = {}) {
  const state = getVirtualState();
  const total = chatState.messages.length;
  const previousTop = container.scrollTop;
  const shouldTail = scrollBottom || uiState.userNearBottom || !state.enabled;
  let start = shouldTail ? total - VIRTUAL_WINDOW_SIZE : virtualStartFromScroll(container);
  if (centerIndex != null) {
    start = centerIndex - Math.floor(VIRTUAL_WINDOW_SIZE / 2);
  }
  start = clampVirtualStart(start);
  const end = Math.min(total, start + VIRTUAL_WINDOW_SIZE);

  state.enabled = true;
  state.start = start;
  state.end = end;
  state.total = total;
  container.dataset.virtualized = '1';
  container.innerHTML = buildVirtualHtml(start, end, highlightNew);
  uiState.renderedMessageOrder = chatState.messages.slice(start, end).map((m) => String(m.id));
  uiState.renderedMessageIds = new Set(uiState.renderedMessageOrder);
  indexRenderedMessageRows(container);
  lastStatusSignature = '';

  if (chatState.messageSearch) applyMessageSearchToRenderedRows({ focus: false });

  requestAnimationFrame(() => {
    updateVirtualMetrics(container);
    initLazyMediaObserver(container);
    if (scrollBottom) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'auto' });
    } else if (centerIndex != null && focusId != null) {
      getMessageRow(focusId)?.scrollIntoView({ block: 'center', behavior: 'auto' });
    } else if (preserveScroll) {
      container.scrollTop = previousTop;
    }
  });
}

function scheduleVirtualWindowUpdate(container) {
  if (!isVirtualActive() || virtualScrollRaf) return;
  virtualScrollRaf = requestAnimationFrame(() => {
    virtualScrollRaf = 0;
    if (!isVirtualActive()) return;
    const state = getVirtualState();
    const nextStart = virtualStartFromScroll(container);
    if (Math.abs(nextStart - state.start) >= Math.floor(VIRTUAL_BUFFER_ROWS / 2)) {
      renderVirtualMessages(container, { preserveScroll: true });
    }
  });
}

function ensureVirtualScrollBinding(container) {
  if (container.dataset.virtualScrollBound) return;
  container.dataset.virtualScrollBound = '1';
  container.addEventListener('scroll', () => scheduleVirtualWindowUpdate(container), { passive: true });
}

function trimDomIfNeeded(container) {
  const rows = container.querySelectorAll('.msg-row');
  if (rows.length <= MAX_DOM_MESSAGES) return;
  const remove = rows.length - MAX_DOM_MESSAGES;
  const removedIds = new Set();
  for (let i = 0; i < remove; i++) {
    const id = rows[i].dataset.id;
    uiState.renderedMessageIds.delete(id);
    messageRowCache.delete(String(id));
    removedIds.add(String(id));
    rows[i].remove();
  }
  if (removedIds.size) {
    uiState.renderedMessageOrder = uiState.renderedMessageOrder.filter((x) => !removedIds.has(x));
  }
}

export function updateStatusesInPlace() {
  const userId = authState.user?.id;
  const state = getVirtualState();
  const statusCandidates = isVirtualActive()
    ? chatState.messages.slice(state.start, state.end)
    : chatState.messages;
  const signature = statusCandidates
    .filter((msg) => msg.sender_id === userId)
    .map((msg) => {
      const meta = chatState.messageMeta[msg.id] || {};
      return `${msg.id}:${msg.is_read ? 1 : 0}:${meta.status || ''}:${meta.failed ? 1 : 0}:${meta.error || ''}`;
    })
    .join('|');
  if (signature === lastStatusSignature) return;
  lastStatusSignature = signature;

  statusCandidates.forEach((msg) => {
    if (msg.sender_id !== userId) return;
    const row = getMessageRow(msg.id);
    if (!row) return;
    const footer = row.querySelector('.msg-bubble-footer');
    if (!footer) return;
    const existing = footer.querySelector('.msg-status');
    const html = statusHtml(msg, true);
    if (existing) {
      if (existing.outerHTML === html) return;
      const wrap = document.createElement('span');
      wrap.innerHTML = html;
      existing.replaceWith(wrap.firstElementChild);
    } else {
      footer.insertAdjacentHTML('beforeend', html);
    }
  });
}

function appendMessages(appendSlice, highlightNew) {
  const container = $(SELECTORS.messagesContainer);
  if (!container || !appendSlice.length) return;
  if (shouldVirtualizeMessages()) {
    renderVirtualMessages(container, { highlightNew, scrollBottom: isNearBottom(container) || uiState.userNearBottom });
    return;
  }

  const isGroup = chatState.activeChat?.type === 'group';
  const allMsgs = chatState.messages;
  const frag = document.createDocumentFragment();
  let lastDate = '';
  const lastDivider = container.querySelector('.date-divider:last-of-type');
  if (lastDivider) lastDate = lastDivider.dataset.date || '';

  const startIdx = allMsgs.length - appendSlice.length;
  appendSlice.forEach((msg, ai) => {
    const globalIdx = startIdx + ai;
    const msgDate = new Date(msg.created_at).toDateString();
    if (msgDate !== lastDate) {
      const div = document.createElement('div');
      div.className = 'date-divider';
      div.dataset.date = msgDate;
      div.innerHTML = `<span>${formatDateDivider(msg.created_at)}</span>`;
      frag.appendChild(div);
      lastDate = msgDate;
    }
    if (globalIdx === chatState.lastReadCount && chatState.lastReadCount > 0) {
      const ud = document.createElement('div');
      ud.className = 'unread-divider';
      ud.innerHTML = '<span>Unread messages</span>';
      frag.appendChild(ud);
    }

    const prev = allMsgs[globalIdx - 1];
    const sameSender = prev && prev.sender_id === msg.sender_id;
    const closeInTime = prev && (new Date(msg.created_at) - new Date(prev.created_at)) < MESSAGE_GROUP_MS;
    const sameDay = prev && new Date(msg.created_at).toDateString() === new Date(prev.created_at).toDateString();

    let pos = 'single';
    if (sameSender && closeInTime && sameDay) {
      const prevRow = container.querySelector(`.msg-row[data-id="${prev.id}"]`);
      if (prevRow) {
        prevRow.classList.remove('single', 'last');
        prevRow.classList.add(prevRow.classList.contains('first') ? 'first' : 'middle');
        pos = 'last';
      }
    }

    const wrap = document.createElement('div');
    wrap.innerHTML = buildMessageRowHtml(msg, pos, isGroup, highlightNew);
    const row = cacheMessageRow(wrap.firstElementChild);
    if (row) {
      frag.appendChild(row);
      uiState.renderedMessageIds.add(String(msg.id));
      uiState.renderedMessageOrder.push(String(msg.id));
    }
  });

  container.appendChild(frag);
  trimDomIfNeeded(container);
  requestAnimationFrame(() => initLazyMediaObserver(container));
}

export function isNearBottom(el, threshold = SCROLL_NEAR_BOTTOM_THRESHOLD) {
  return el.scrollHeight - el.scrollTop - el.clientHeight < threshold;
}

/**
 * Render messages — incremental when possible to avoid poll flicker.
 * @param {boolean|object} opts - highlightNew flag or { highlightNew, full }
 */
export function renderMessages(opts = false) {
  const highlightNew = typeof opts === 'boolean' ? opts : !!opts?.highlightNew;
  let forceFull = typeof opts === 'object' && opts.full;

  const container = $(SELECTORS.messagesContainer);
  if (!container) return;
  container.classList.remove('loading');
  container.classList.add('chat-bg');
  ensureVirtualScrollBinding(container);

  if (chatState.activeChatId !== uiState.renderedChatId) {
    uiState.renderedChatId = chatState.activeChatId;
    uiState.renderedMessageOrder = [];
    uiState.renderedMessageIds = new Set();
    resetVirtualState();
    resetSearchIndex();
  }

  if (!chatState.messages.length) {
    const banner = isE2eEnabledForChat(chatState.activeChat) ? e2eChatBannerHtml() : '';
    container.innerHTML = `${banner}${buildEmptyInlineHtml({
      title: 'No messages yet',
      hint: 'Say hello to start the conversation',
      extraClass: 'messages-empty',
      icon: 'messages'
    })}`;
    uiState.renderedMessageOrder = [];
    uiState.renderedMessageIds = new Set();
    clearMessageRenderCaches();
    container.dataset.virtualized = '0';
    chatState.messageSearchIndex = -1;
    updateMessageSearchMeta();
    return;
  }

  const emptyEl = container.querySelector('.messages-empty, .messages-error, .messages-skeleton');
  if (emptyEl) emptyEl.remove();
  if (forceFull) resetSearchIndex();

  if (shouldVirtualizeMessages()) {
    const wasAtBottom = isNearBottom(container) || uiState.userNearBottom;
    renderVirtualMessages(container, {
      highlightNew,
      scrollBottom: wasAtBottom,
      preserveScroll: true
    });
    if (!wasAtBottom && highlightNew) {
      uiState.newBelowCount += 1;
      updateScrollFab();
    }
    updateMessageSearchMeta();
    return;
  }

  if (getVirtualState().enabled) {
    resetVirtualState();
    container.dataset.virtualized = '0';
  }

  const prevOrder = uiState.renderedMessageOrder;
  const canIncremental = !forceFull && prevOrder.length > 0;

  if (canIncremental) {
    const { full, append } = messagesPrefixUnchanged(prevOrder, chatState.messages);
    if (!full && !append.length) {
      updateStatusesInPlace();
      return;
    }
    if (!full && append.length) {
      const wasAtBottom = isNearBottom(container);
      appendMessages(append, highlightNew);
      if (wasAtBottom || uiState.userNearBottom) {
        requestAnimationFrame(() => scrollToBottom(false));
      } else if (highlightNew) {
        uiState.newBelowCount += append.length;
        updateScrollFab();
      }
      updateMessageSearchMeta();
      return;
    }
    forceFull = true;
  }

  const wasAtBottom = isNearBottom(container) || uiState.userNearBottom;
  container.innerHTML = buildFullHtml(chatState.messages, highlightNew);
  uiState.renderedMessageOrder = chatState.messages.map((m) => String(m.id));
  uiState.renderedMessageIds = new Set(uiState.renderedMessageOrder);
  indexRenderedMessageRows(container);
  lastStatusSignature = '';

  if (wasAtBottom) requestAnimationFrame(() => scrollToBottom(false));
  else if (highlightNew) {
    uiState.newBelowCount++;
    updateScrollFab();
  }
  requestAnimationFrame(() => initLazyMediaObserver(container));
  if (chatState.messageSearch) {
    applyMessageSearchToRenderedRows({ focus: false });
    requestAnimationFrame(() => focusMessageSearchResult(0));
  } else {
    updateMessageSearchMeta();
  }
}

/** Append a single optimistic message without full re-render. */
export function appendOrUpdateMessage(msg, highlightNew = false) {
  const id = String(msg.id);
  const existing = $(`.msg-row[data-id="${id}"]`);
  if (existing) {
    updateStatusesInPlace();
    return;
  }
  if (shouldVirtualizeMessages()) {
    renderMessages({ highlightNew });
    requestAnimationFrame(() => scrollToBottom(false));
    return;
  }
  appendMessages([msg], highlightNew);
  requestAnimationFrame(() => scrollToBottom(false));
}

/** Swap temp optimistic row id with confirmed server message. */
export function promoteOptimisticMessage(tempId, realMsg) {
  const tempKey = String(tempId);
  const row = getMessageRow(tempKey);
  if (row) {
    row.dataset.id = String(realMsg.id);
    messageRowCache.delete(tempKey);
    cacheMessageRow(row);
  }
  const orderIdx = uiState.renderedMessageOrder.indexOf(tempKey);
  if (orderIdx !== -1) uiState.renderedMessageOrder[orderIdx] = String(realMsg.id);
  uiState.renderedMessageIds.delete(tempKey);
  uiState.renderedMessageIds.add(String(realMsg.id));
  updateStatusesInPlace();
}

export function removeMessageFromDom(messageId) {
  getMessageRow(messageId)?.remove();
  messageRowCache.delete(String(messageId));
  uiState.renderedMessageIds.delete(String(messageId));
  uiState.renderedMessageOrder = uiState.renderedMessageOrder.filter((x) => x !== String(messageId));
}

export function scrollToBottom(smooth = true) {
  const c = $(SELECTORS.messagesContainer);
  if (!c) return;
  const doScroll = () => {
    if (shouldVirtualizeMessages()) {
      renderVirtualMessages(c, { scrollBottom: true, preserveScroll: false });
      uiState.userNearBottom = true;
      uiState.newBelowCount = 0;
      updateScrollFab();
      return;
    }
    c.scrollTo({ top: c.scrollHeight, behavior: smooth ? 'smooth' : 'auto' });
    uiState.userNearBottom = true;
    uiState.newBelowCount = 0;
    updateScrollFab();
    const btn = $(SELECTORS.scrollBottomBtn);
    if (btn && smooth) {
      btn.classList.add('bounce');
      setTimeout(() => btn.classList.remove('bounce'), 600);
    }
  };
  requestAnimationFrame(() => requestAnimationFrame(doScroll));
}

export function updateEditedMessageInPlace(messageId) {
  resetSearchIndex();
  const msg = chatState.messages.find((m) => String(m.id) === String(messageId));
  const row = getMessageRow(messageId);
  if (!msg || !row) return;
  if (isMessageDeleted(msg)) {
    updateDeletedMessageInPlace(messageId);
    return;
  }
  const contentEl = row.querySelector('.msg-content');
  if (contentEl) {
    contentEl.innerHTML = chatState.messageSearch && messageMatchesSearch(msg)
      ? renderMessageContentHtml(msg, chatState.messageSearch)
      : renderMessageContentHtml(msg, '');
    contentEl.dataset.renderKey = `${chatState.messageSearch}|${msg.edited_at || ''}|${msg.plainContent || msg.content || ''}`;
  }
  const footer = row.querySelector('.msg-bubble-footer');
  if (footer && msg.edited_at && !footer.querySelector('.msg-edited')) {
    const time = footer.querySelector('.msg-time');
    if (time) {
      time.insertAdjacentHTML('beforebegin', '<span class="msg-edited">edited</span>');
    } else {
      footer.insertAdjacentHTML('afterbegin', '<span class="msg-edited">edited</span>');
    }
  }
  row.classList.remove('editing-target');
}

export function updateDeletedMessageInPlace(messageId) {
  resetSearchIndex();
  const msg = chatState.messages.find((m) => String(m.id) === String(messageId));
  const row = getMessageRow(messageId);
  if (!msg || !row || !isMessageDeleted(msg)) return;

  const isSent = msg.sender_id === authState.user?.id;
  const posMatch = row.className.match(/\b(single|first|middle|last)\b/);
  const pos = posMatch?.[1] || 'single';
  const isGroup = chatState.activeChat?.type === 'group';
  const wrap = document.createElement('div');
  wrap.innerHTML = buildMessageRowHtml(msg, pos, isGroup, false);
  const fresh = wrap.firstElementChild;
  if (fresh) {
    row.replaceWith(fresh);
    cacheMessageRow(fresh);
  }
}

export function updateReactionChipsForMessage(messageId) {
  const msg = chatState.messages.find((m) => String(m.id) === String(messageId));
  if (isMessageDeleted(msg)) {
    getMessageRow(messageId)?.querySelector('.msg-reactions')?.remove();
    return;
  }
  const row = getMessageRow(messageId);
  if (!row) return;
  const existing = row.querySelector('.msg-reactions');
  const html = buildReactionChipsHtml(messageId);
  if (!html) {
    existing?.remove();
    return;
  }
  if (existing) existing.outerHTML = html;
  else row.insertAdjacentHTML('beforeend', html);
}

/** Show or hide the in-thread E2E banner without a full message re-render. */
export function syncE2eChatBanner() {
  const container = $(SELECTORS.messagesContainer);
  if (!container || container.classList.contains('loading')) return;

  const show = isE2eEnabledForChat(chatState.activeChat);
  const existing = container.querySelector('#e2e-chat-banner');

  if (!show) {
    existing?.remove();
    return;
  }
  if (existing) return;

  const wrap = document.createElement('div');
  wrap.innerHTML = e2eChatBannerHtml();
  const banner = wrap.firstElementChild;
  const anchor = container.querySelector('.date-divider, .unread-divider, .msg-row, .messages-empty, .messages-error, .empty-inline');
  if (anchor) container.insertBefore(banner, anchor);
  else container.prepend(banner);
}

export function updateScrollFab() {
  const btn = $(SELECTORS.scrollBottomBtn);
  const badge = $(SELECTORS.scrollBottomBadge);
  if (!btn) return;
  const show = !uiState.userNearBottom && chatState.activeChatId;
  btn.classList.toggle('hidden', !show);
  const hasNew = uiState.newBelowCount > 0;
  btn.classList.toggle('pulse-new', show && hasNew);
  if (hasNew) {
    badge.textContent = uiState.newBelowCount > 9 ? '9+' : uiState.newBelowCount;
    badge.classList.remove('hidden');
  } else {
    badge.classList.add('hidden');
  }
}
