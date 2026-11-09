import { showToast } from './utils.js';

let deferredInstallPrompt = null;

function isStandaloneDisplay() {
  return window.matchMedia('(display-mode: standalone)').matches || window.navigator.standalone;
}

function syncInstallButton() {
  const btn = document.getElementById('install-app-btn');
  if (!btn) return;
  btn.classList.toggle('hidden', !deferredInstallPrompt || isStandaloneDisplay());
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  const secureContext = window.isSecureContext || ['localhost', '127.0.0.1'].includes(window.location.hostname);
  if (!secureContext) return;

  try {
    const registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          showToast('Update ready. Refresh to use the newest app.', 'info');
        }
      });
    });
  } catch (err) {
    console.warn('Service worker registration failed:', err);
  }
}

export function initPwaController() {
  registerServiceWorker();

  const installBtn = document.getElementById('install-app-btn');
  installBtn?.addEventListener('click', async () => {
    if (!deferredInstallPrompt) return;
    installBtn.disabled = true;
    deferredInstallPrompt.prompt();
    const choice = await deferredInstallPrompt.userChoice.catch(() => ({ outcome: 'dismissed' }));
    deferredInstallPrompt = null;
    installBtn.disabled = false;
    syncInstallButton();
    if (choice.outcome === 'accepted') showToast('App installed', 'success');
  });

  window.addEventListener('beforeinstallprompt', (event) => {
    event.preventDefault();
    deferredInstallPrompt = event;
    syncInstallButton();
  });

  window.addEventListener('appinstalled', () => {
    deferredInstallPrompt = null;
    syncInstallButton();
    showToast('App installed', 'success');
  });

  syncInstallButton();
}
