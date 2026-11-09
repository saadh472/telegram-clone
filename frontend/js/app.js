/** Telegram Web Clone — bootstrap. */
import { updateOfflineBanner } from './models/apiModel.js';
import { initAuthController, bootstrapAuth, setChatControllerHooks } from './controllers/authController.js';
import { enableScreenTransitions } from './views/authView.js';
import {
  initChatController, initConnectivityListeners, onShowApp, onShowAuth
} from './controllers/chatController.js';
import { initThemeController } from './theme.js';
import { initChatWallpaper } from './chatWallpaper.js';
import { initFocusGuards, initRippleButtons } from './utils.js';
import { initProfileController } from './controllers/profileController.js';
import { initPwaController } from './pwa.js';

async function init() {
  try {
    initThemeController();
    initChatWallpaper();
    initRippleButtons();
    initFocusGuards();
    setChatControllerHooks({ onShowApp, onShowAuth });
    initAuthController();
    initChatController();
    initProfileController();
    initPwaController();
    initConnectivityListeners();
    updateOfflineBanner();
    await bootstrapAuth();
    requestAnimationFrame(() => enableScreenTransitions());
  } catch (err) {
    console.error('App init failed:', err);
    const banner = document.getElementById('backend-status');
    if (banner) {
      banner.textContent = `App failed to start: ${err.message}`;
      banner.classList.remove('hidden');
    }
  }
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
