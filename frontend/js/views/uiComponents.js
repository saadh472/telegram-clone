/** VIEW — Shared UI building blocks (avatars, dropdowns, badges). */
import { escapeHtml, getInitials, userAvatarStyle, sanitizeImageDataUrl } from '../utils.js';

/** Unified avatar markup for lists, modals, and headers. */
export function buildAvatarHtml(entity, {
  sizeClass = '',
  online = false,
  showRing = false,
  photoUrl = null
} = {}) {
  const name = typeof entity === 'object' ? (entity.display_name || entity.username || '') : String(entity);
  const isGroup = typeof entity === 'object' && entity.type === 'group';
  const safePhoto = sanitizeImageDataUrl(photoUrl);
  const inner = safePhoto
    ? `<img src="${escapeHtml(safePhoto)}" alt="" class="avatar-img" loading="lazy" draggable="false">`
    : (isGroup ? '👥' : getInitials(name));
  const hasPhoto = !!safePhoto;
  const style = hasPhoto ? '' : ` style="background:${userAvatarStyle(entity)}"`;
  const ring = showRing
    ? `<span class="avatar-ring ${online ? 'online' : 'offline'}" aria-hidden="true"></span>`
    : '';
  return `
    <div class="avatar-wrap${sizeClass ? ` avatar-wrap-${sizeClass}` : ''}">
      <div class="avatar${sizeClass ? ` ${sizeClass}` : ''}${online ? ' online' : ''}${hasPhoto ? ' has-photo' : ''}"${style}>${inner}</div>
      ${ring}
    </div>`;
}

/** Accessible dropdown menu shell. */
export function buildDropdownHtml(id, items, { align = 'left' } = {}) {
  const rows = items.map((item) => {
    if (item.divider) return '<div class="dropdown-divider" role="separator"></div>';
    const danger = item.danger ? ' dropdown-item-danger' : '';
    const icon = item.icon ? `<span class="dropdown-item-icon" aria-hidden="true">${item.icon}</span>` : '';
    return `<button type="button" class="dropdown-item${danger}" data-action="${escapeHtml(item.action)}" role="menuitem">${icon}<span>${escapeHtml(item.label)}</span></button>`;
  }).join('');
  return `<div id="${id}" class="nav-dropdown hidden" role="menu" aria-label="Menu" data-align="${align}">${rows}</div>`;
}

/** Unread count badge pill. */
export function buildBadgeHtml(count, { max = 99, className = 'nav-badge' } = {}) {
  if (!count || count <= 0) return '';
  const label = count > max ? `${max}+` : String(count);
  return `<span class="${className}" aria-label="${count} unread">${label}</span>`;
}

/** Forwarded message ribbon inside bubble. */
export function buildForwardedRibbonHtml() {
  return `<span class="msg-forwarded-label" aria-label="Forwarded message">
    <svg width="14" height="14" viewBox="0 0 24 24" aria-hidden="true"><path fill="currentColor" d="M12 4V1L8 5l4 4V6c3.31 0 6 2.69 6 6 0 1.01-.25 1.97-.7 2.8l1.46 1.46C19.54 15.03 20 13.57 20 12c0-4.42-3.58-8-8-8zm0 14c-3.31 0-6-2.69-6-6 0-1.01.25-1.97.7-2.8L5.24 7.74C4.46 8.97 4 10.43 4 12c0 4.42 3.58 8 8 8v3l4-4-4-4v3z"/></svg>
    Forwarded
  </span>`;
}
