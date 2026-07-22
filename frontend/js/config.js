/** Shared config and application state. API uses same host as the page (works on LAN). */
function normalizeApiBase(value) {
  return String(value || '').trim().replace(/\/+$/, '');
}

function resolveApiBase() {
  const params = new URLSearchParams(window.location.search);
  const override = normalizeApiBase(params.get('api') || window.TELEGRAM_API_BASE);
  if (override) return override;

  if (window.location.protocol === 'file:') {
    return 'http://127.0.0.1:3000/api';
  }

  const { protocol, hostname, port, origin } = window.location;
  const localHosts = ['localhost', '127.0.0.1', '0.0.0.0'];
  const isLanHost = /^(192\.168\.|10\.|172\.(1[6-9]|2\d|3[0-1])\.)/.test(hostname);
  const isLocalDevHost = localHosts.includes(hostname) || isLanHost;

  if (isLocalDevHost && port && port !== '3000') {
    return `${protocol}//${hostname}:3000/api`;
  }

  return `${origin}/api`;
}

export const API_BASE = resolveApiBase();

export const POLL_MS = 2000;
export const POLL_MS_HIDDEN = 8000;
export const HEALTH_MS = 30000;
export const DEBOUNCE_MS = 250;
export const SEARCH_DEBOUNCE_MS = 150;
export const SCROLL_THROTTLE_MS = 100;
export const TYPING_HIDE_MS = 2000;
export const STATUS_DELIVERED_MS = 800;
export const FLASH_CHAT_MS = 1200;
export const VIEW_FLIP_MS = 300;
export const MAX_DOM_MESSAGES = 500;
export const SCROLL_NEAR_BOTTOM_THRESHOLD = 80;
export const MESSAGE_GROUP_MS = 300000;
export const MESSAGE_EDIT_MS = 48 * 60 * 60 * 1000;
export const INPUT_MAX_HEIGHT = 120;
export const OPTIMISTIC_MATCH_MS = 120000;
export const MAX_TEXT_LENGTH = 10000;
export const MAX_FILE_SIZE_BYTES = 1024 * 1024 * 1024; // 1 GB raw file
export const MAX_MEDIA_BASE64_LENGTH = 1_400_000_000; // base64 of 1 GB (~4/3 expansion; NVARCHAR(MAX) cap)
export const MAX_FILE_SIZE_LABEL = '1 GB';

export const RECEIVER_VIEW_KEY = 'telegram_receiver_view';
export const THEME_KEY = 'telegram-theme';
export const CHAT_WALLPAPER_KEY = 'telegram-chat-wallpaper';
export const SENDER_COLORS = ['#e17076', '#7bc862', '#e5ca77', '#65aadd', '#a695e7'];

export const EMOJIS = ['😀', '😂', '❤️', '👍', '🙏', '🔥', '✨', '🎉', '👋', '😊', '🤔', '👏', '💯', '🚀', '☕', '📚', '✅', '❌', '💬', '📎'];
export const STICKERS = ['🎭', '🤡', '👻', '🦄', '🐸', '🍕', '🚀', '💎', '🌈', '⚡', '🔥', '🎉', '😎', '🥳', '🐱', '🐶', '🦊', '🐼', '🎸', '🏆'];
export const REACTION_EMOJIS = ['👍', '❤️', '😂', '😮', '😢', '🙏'];
export const STICKER_PREFIX = '[sticker] ';
export const REACTIONS_STORAGE_KEY = 'telegram_message_reactions';

/** DOM selectors — single source for query targets. */
export const SELECTORS = {
  app: '#app',
  chatList: '#chat-list',
  chatPanel: '#chat-panel',
  messagesContainer: '#messages-container',
  messageInput: '#message-input',
  messageInputWrap: '#message-input-wrap',
  composeMeta: '#compose-meta',
  composeCount: '#compose-count',
  actionBtn: '#action-btn',
  emojiBtn: '#emoji-btn',
  emojiPicker: '#emoji-picker',
  stickerBtn: '#sticker-btn',
  stickerPicker: '#sticker-picker',
  attachBtn: '#attach-btn',
  fileInput: '#file-input',
  voiceRecordingBar: '#voice-recording-bar',
  voiceRecordingTimer: '#voice-recording-timer',
  voiceRecordingCancel: '#voice-recording-cancel',
  voiceRecordingSend: '#voice-recording-send',
  messageInputRow: '.message-input-row',
  voiceCallBtn: '#voice-call-btn',
  videoCallBtn: '#video-call-btn',
  callOverlay: '#call-overlay',
  reactionPicker: '#reaction-picker',
  scrollBottomBtn: '#scroll-bottom-btn',
  scrollBottomBadge: '#scroll-bottom-badge',
  replyBar: '#reply-bar',
  cancelReplyBtn: '#cancel-reply-btn',
  editBar: '#edit-bar',
  cancelEditBtn: '#cancel-edit-btn',
  typingIndicator: '#typing-indicator',
  chatHeaderInfo: '#chat-header-info',
  chatStatus: '#chat-status',
  chatTitle: '#chat-title',
  chatAvatar: '#chat-avatar',
  viewToggleBtn: '.view-toggle-pill',
  backBtn: '#back-btn',
  searchInput: '#search-input',
  searchClearBtn: '#search-clear-btn',
  chatListStatus: '#chat-list-status',
  chatFilterTabs: '#chat-filter-tabs',
  userSearch: '#user-search',
  userList: '#user-list',
  msgContextMenu: '#msg-context-menu',
  forwardModal: '#forward-modal',
  forwardChatList: '#forward-chat-list',
  deleteMessageModal: '#delete-message-modal',
  deleteForEveryoneBtn: '#delete-for-everyone-btn',
  deleteForMeBtn: '#delete-for-me-btn',
  deleteForEveryoneHint: '#delete-for-everyone-hint',
  deleteMessageCancelBtn: '#delete-message-cancel-btn',
  chatInfoPanel: '#chat-info-panel',
  chatInfoBackdrop: '#chat-info-backdrop',
  closeChatInfoBtn: '#close-chat-info-btn',
  chatInfoPinBtn: '#chat-info-pin-btn',
  chatInfoMuteBtn: '#chat-info-mute-btn',
  newChatBtn: '#new-chat-btn',
  emptyNewChatBtn: '#empty-new-chat-btn',
  emptyShortcutsBtn: '#empty-shortcuts-btn',
  closeModalBtn: '#close-modal-btn',
  sidebarOverlay: '#sidebar-overlay',
  offlineBanner: '#offline-banner',
  connectionBanner: '#connection-banner',
  chatSearchBar: '#chat-search-bar',
  chatSearchInput: '#chat-search-input',
  chatSearchCloseBtn: '#chat-search-close-btn',
  chatSearchMeta: '#chat-search-meta',
  chatSearchPrevBtn: '#chat-search-prev-btn',
  chatSearchNextBtn: '#chat-search-next-btn',
  loadMoreBtn: '#load-more-messages-btn',
  toastContainer: '#toast-container',
  emptyState: '#empty-state',
  activeChat: '#active-chat',
  sidebar: '#sidebar',
  settingsPanel: '#settings-panel',
  profilePanel: '#profile-panel',
  messagesTyping: '#messages-typing',
  pickerPanel: '#picker-panel',
  pickerSearch: '#picker-search'
};

export const authState = { token: null, user: null, sessionExpired: false };
export const chatState = {
  chats: [],
  users: [],
  activeChatId: null,
  activeChat: null,
  messages: [],
  messageMeta: {},
  lastReadCount: 0,
  replyTo: null,
  editingId: null,
  editingPlainText: null,
  messageSearch: '',
  messageSearchIndex: -1,
  messageTotal: 0,
  messageOffset: 0,
  hasMoreMessages: false
};
export const uiState = {
  chatSearchQuery: '',
  userSearchQuery: '',
  chatsLoading: false,
  sending: false,
  recording: false,
  userNearBottom: true,
  newBelowCount: 0,
  receiverView: false,
  pollTimeout: null,
  healthInterval: null,
  typingTimeout: null,
  remoteTyping: false,
  remoteTypingName: '',
  lastChatListFingerprint: '',
  renderedChatId: null,
  renderedMessageIds: new Set(),
  renderedMessageOrder: [],
  pollInFlight: false,
  knownChatIds: new Set(),
  userListFocusIndex: -1,
  loadingOlder: false,
  archivedSectionOpen: true,
  userListMode: 'newChat',
  chatFilter: 'all'
};
export const connectionState = {
  online: navigator.onLine,
  backendReachable: true,
  reconnecting: false
};

export const ICONS = {
  check: '<svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>',
  doubleCheck: '<svg width="16" height="16" viewBox="0 0 24 24"><path fill="currentColor" d="M18 7l-1.41-1.41-6.34 6.34 1.41 1.41L18 7zm4.24-1.41L11.66 16.17 7.05 11.56 5.64 12.97 11.66 19l12-12-1.42-1.41zM.41 13.41 6 19l1.41-1.41L1.83 12 .41 13.41z"/></svg>',
  clock: '<svg width="14" height="14" viewBox="0 0 24 24"><path fill="currentColor" d="M11.99 2C6.47 2 2 6.48 2 12s4.47 10 9.99 10C17.52 22 22 17.52 22 12S17.52 2 11.99 2zM12 20c-4.42 0-8-3.58-8-8s3.58-8 8-8 8 3.58 8 8-3.58 8-8 8zm.5-13H11v6l5.25 3.15.75-1.23-4.5-2.67z"/></svg>'
};
