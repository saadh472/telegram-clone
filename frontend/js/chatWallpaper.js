/** Chat wallpaper selection — persisted in localStorage. */
import { CHAT_WALLPAPER_KEY } from './config.js';
import { $ } from './utils.js';

export const WALLPAPERS = [
  { id: 'default', label: 'Default' },
  { id: 'dots', label: 'Dots' },
  { id: 'gradient', label: 'Gradient' }
];

const VALID_IDS = new Set(WALLPAPERS.map((w) => w.id));

export function getChatWallpaper() {
  const saved = localStorage.getItem(CHAT_WALLPAPER_KEY);
  return VALID_IDS.has(saved) ? saved : 'default';
}

export function setChatWallpaper(id) {
  const next = VALID_IDS.has(id) ? id : 'default';
  document.documentElement.setAttribute('data-chat-wallpaper', next);
  localStorage.setItem(CHAT_WALLPAPER_KEY, next);
  syncWallpaperPickerUI(next);
}

export function syncWallpaperPickerUI(activeId = getChatWallpaper()) {
  document.querySelectorAll('.wallpaper-option').forEach((btn) => {
    const id = btn.dataset.wallpaper;
    const selected = id === activeId;
    btn.classList.toggle('active', selected);
    btn.setAttribute('aria-selected', selected ? 'true' : 'false');
  });
}

function bindWallpaperOptions(root) {
  root?.querySelectorAll('.wallpaper-option').forEach((btn) => {
    btn.addEventListener('click', () => {
      setChatWallpaper(btn.dataset.wallpaper);
      $('#wallpaper-popover')?.classList.add('hidden');
    });
  });
}

export function initChatWallpaper() {
  setChatWallpaper(getChatWallpaper());

  bindWallpaperOptions($('#wallpaper-picker'));
  bindWallpaperOptions($('#wallpaper-popover'));

  const headerBtn = $('#chat-wallpaper-btn');
  const popover = $('#wallpaper-popover');

  headerBtn?.addEventListener('click', (e) => {
    e.stopPropagation();
    if (!popover) {
      $('#settings-panel')?.classList.remove('hidden');
      return;
    }
    popover.classList.toggle('hidden');
  });

  document.addEventListener('click', (e) => {
    if (popover?.classList.contains('hidden')) return;
    if (e.target.closest('#chat-wallpaper-btn') || e.target.closest('#wallpaper-popover')) return;
    popover.classList.add('hidden');
  });
}
