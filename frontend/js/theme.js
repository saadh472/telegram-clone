/** Theme — dark/light mode with localStorage persistence. */
import { THEME_KEY } from './config.js';
import { $ } from './utils.js';

export function getTheme() {
  const saved = localStorage.getItem(THEME_KEY);
  return saved === 'light' ? 'light' : 'dark';
}

export function setTheme(theme) {
  const next = theme === 'light' ? 'light' : 'dark';
  const root = document.documentElement;
  root.classList.add('theme-transitioning');
  root.setAttribute('data-theme', next);
  document.body?.setAttribute('data-theme', next);
  localStorage.setItem(THEME_KEY, next);
  updateToggleIcons(next);
  updateMetaThemeColor(next);
  window.setTimeout(() => root.classList.remove('theme-transitioning'), 300);
}

function updateMetaThemeColor(theme) {
  let meta = document.querySelector('meta[name="theme-color"]:not([media])');
  if (!meta) {
    meta = document.createElement('meta');
    meta.name = 'theme-color';
    document.head.appendChild(meta);
  }
  meta.content = theme === 'light' ? '#fafbfc' : '#0c1117';
}

export function toggleTheme() {
  setTheme(getTheme() === 'dark' ? 'light' : 'dark');
}

export function initTheme() {
  setTheme(getTheme());
}

/** Sun visible in dark mode (click → light); moon visible in light mode (click → dark). */
export function updateToggleIcons(theme) {
  const isDark = theme === 'dark';

  document.querySelectorAll('.theme-toggle-btn').forEach((btn) => {
    btn.querySelector('.icon-sun')?.classList.toggle('hidden', !isDark);
    btn.querySelector('.icon-moon')?.classList.toggle('hidden', isDark);
    const label = isDark ? 'Switch to light mode' : 'Switch to dark mode';
    btn.setAttribute('aria-label', label);
    btn.title = isDark ? 'Light mode' : 'Dark mode';
  });

  const nightSwitch = $('#night-mode-switch');
  if (nightSwitch) nightSwitch.checked = isDark;

  const nightLabel = $('#night-mode-label');
  if (nightLabel) nightLabel.textContent = isDark ? 'Night Mode' : 'Day Mode';
}

/** Sync fixed top-right toggle and settings quick-toggle icons. */
export function updateThemeToggleIcons(theme) {
  updateToggleIcons(theme ?? getTheme());
}

/** @deprecated Use updateThemeToggleIcons */
export function updateThemeFabIcon(theme) {
  updateThemeToggleIcons(theme);
}

export function initThemeToggle() {
  updateThemeToggleIcons(getTheme());
}

/** @deprecated Use initThemeToggle */
export function initThemeFab() {
  initThemeToggle();
}

export function initThemeController() {
  initTheme();
  initThemeToggle();

  document.addEventListener('click', (e) => {
    if (e.target.closest('.theme-toggle-btn')) {
      e.preventDefault();
      toggleTheme();
    }
  });

  $('#night-mode-switch')?.addEventListener('change', (e) => {
    setTheme(e.target.checked ? 'dark' : 'light');
  });
}
