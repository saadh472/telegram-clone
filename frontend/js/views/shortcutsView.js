/** VIEW — Keyboard shortcuts help panel */
import { $, focusFirstIn, rememberFocus, restoreFocus } from '../utils.js';

const SHORTCUTS = [
  { keys: 'Ctrl+K', desc: 'Focus chat search' },
  { keys: 'Ctrl+F', desc: 'Search inside open chat' },
  { keys: 'Ctrl+N', desc: 'New chat' },
  { keys: 'Ctrl+/', desc: 'Show this guide' },
  { keys: 'Enter', desc: 'Send message' },
  { keys: 'Shift+Enter', desc: 'New line while composing' },
  { keys: 'Enter', desc: 'Next message search result' },
  { keys: 'Shift+Enter', desc: 'Previous message search result' },
  { keys: '↑ / ↓', desc: 'Navigate contacts in New Chat' },
  { keys: 'Esc', desc: 'Close panels, menus, and modals' },
  { keys: 'Long press', desc: 'Open message actions on touch screens' }
];

export function openShortcutsPanel() {
  const panel = $('#shortcuts-panel');
  if (!panel) return;
  rememberFocus(panel);
  panel.classList.remove('hidden');
  requestAnimationFrame(() => panel.classList.add('open'));
  focusFirstIn(panel, '#shortcuts-close-btn');
}

export function closeShortcutsPanel() {
  const panel = $('#shortcuts-panel');
  if (!panel || panel.classList.contains('hidden')) return;
  panel.classList.remove('open');
  setTimeout(() => {
    panel.classList.add('hidden');
    restoreFocus(panel, '#search-input');
  }, 220);
}

export function isShortcutsOpen() {
  const panel = $('#shortcuts-panel');
  return !!panel && !panel.classList.contains('hidden') && panel.classList.contains('open');
}

export function initShortcutsPanel() {
  const list = $('#shortcuts-list');
  if (list && !list.dataset.ready) {
    list.dataset.ready = '1';
    list.innerHTML = SHORTCUTS.map(({ keys, desc }) => `
      <li class="shortcuts-row">
        <kbd class="shortcuts-keys">${keys}</kbd>
        <span class="shortcuts-desc">${desc}</span>
      </li>`).join('');
  }
  $('#shortcuts-backdrop')?.addEventListener('click', closeShortcutsPanel);
  $('#shortcuts-close-btn')?.addEventListener('click', closeShortcutsPanel);
}
