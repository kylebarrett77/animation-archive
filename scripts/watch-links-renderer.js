/**
 * watch-links-renderer.js
 *
 * Drop-in replacement for the parseWatchLinks() and generateWatchLinksSection()
 * functions in build-site.js. Consumes the new structured watchLinks array format
 * instead of parsing a single URL string.
 *
 * INTEGRATION:
 *   In build-site.js, replace the existing parseWatchLinks() and
 *   generateWatchLinksSection() with these functions, or require this module:
 *
 *     import { generateWatchLinksHTML } from './watch-links-renderer.js';
 *
 *   Then in the film detail page template, replace:
 *     ${generateWatchLinksSection(film.watchLinks)}
 *   with:
 *     ${generateWatchLinksHTML(film.watchLinks, film.watchLinksLegacy)}
 */

// Platform icons/emojis for display
const PLATFORM_ICONS = {
  'YouTube': '▶️',
  'Vimeo': '🎬',
  'Internet Archive': '🏛️',
  'Criterion Channel': '🎞️',
  'MUBI': '🎞️',
  'Netflix': '📺',
  'Tubi': '📺',
  'Bilibili': '📺',
  'NFB': '🇨🇦',
  'Amazon Prime': '📦',
  'Apple TV': '🍎',
  'Google Play': '▶️',
  'Crunchyroll': '🍥',
  'Hulu': '📺',
  'Pluto TV': '📺',
  'Plex': '📺',
  'Kanopy': '🎓',
  'Animatsiya.net': '🇷🇺',
  'Dailymotion': '▶️',
  'Vudu': '📺',
  'Peacock': '🦚',
  'Disney+': '✨',
  'HBO Max': '📺',
  'Paramount+': '⛰️',
  'Other': '🔗',
};

// Access type badge colors
const ACCESS_BADGES = {
  'FREE': { label: 'Free', class: 'badge-free', color: '#22c55e' },
  'ADS': { label: 'Free w/Ads', class: 'badge-ads', color: '#eab308' },
  'SUB': { label: 'Subscription', class: 'badge-sub', color: '#3b82f6' },
  'RENT': { label: 'Rent', class: 'badge-rent', color: '#f97316' },
  'BUY': { label: 'Buy', class: 'badge-buy', color: '#ef4444' },
  'DISC': { label: 'Physical', class: 'badge-disc', color: '#6b7280' },
  'REGION': { label: 'Region-Locked', class: 'badge-region', color: '#8b5cf6' },
};

// Status indicators. Vocabulary lives in the Notion Watch Links DB
// (collection://081a1b55-8709-423d-8320-fb977b9819e0); legacy statuses
// 'Dead' and 'Redirect' are migrating to 'Broken' (see
// scripts/lib/platform-trust.js → normalizeLegacyStatus).
const STATUS_ICONS = {
  'Verified':    '✅',
  'Restricted':  '🔒',
  'Unavailable': '🚫',
  'Broken':      '❌',
  // legacy — kept so older snapshots still render cleanly
  'Unverified':  '⚠️',
  'Dead':        '❌',
  'Redirect':    '🔄',
};

// Status partitions. Mirrors WATCHABLE_STATUSES / GATED_STATUSES /
// HIDDEN_STATUSES in build-site.js — keep in sync.
const HIDDEN_STATUSES_RENDERER = new Set(['Broken', 'Unavailable', 'Dead', 'Redirect']);
const GATED_STATUSES_RENDERER  = new Set(['Restricted', 'Unverified']);
function isLinkVisible(link) {
  return link && link.url && !HIDDEN_STATUSES_RENDERER.has(link.status);
}
function isLinkGated(link) {
  return link && link.url && GATED_STATUSES_RENDERER.has(link.status);
}

/**
 * Generate the complete Watch Links HTML section for a film detail page.
 *
 * @param {Array} watchLinks - Structured array of watch link objects
 * @returns {string} HTML string
 */
function generateWatchLinksHTML(watchLinks) {
  // Handle empty state — uses shared .empty-state pattern from build-site.js
  // CSS so all five "nothing here" surfaces (404, no-results, no-content,
  // no watch links, all-broken watch links) share one visual treatment.
  if (!watchLinks || watchLinks.length === 0) {
    return `
      <div class="watch-links-section">
        <h3>Watch</h3>
        <div class="empty-state">
          <p class="empty-state-message">No watch links available yet.</p>
          <a href="#report-form" class="empty-state-cta">Help us find one →</a>
        </div>
      </div>`;
  }

  // Filter using the centralized status partitions instead of a single
  // hardcoded 'Dead' check — this catches Broken, Unavailable, Redirect.
  const activeLinks = watchLinks.filter(isLinkVisible);
  const hiddenCount = watchLinks.length - activeLinks.length;

  if (activeLinks.length === 0) {
    return `
      <div class="watch-links-section">
        <h3>Watch</h3>
        <div class="empty-state">
          <p class="empty-state-message">All watch links are currently unavailable.${hiddenCount > 0 ? ` (${hiddenCount} broken or unavailable link${hiddenCount > 1 ? 's' : ''})` : ''}</p>
          <a href="#report-form" class="empty-state-cta">Help us find a working link →</a>
        </div>
      </div>`;
  }

  // Group by access type for organized display
  const freeLinks = activeLinks.filter(l => l.accessType === 'FREE' || l.accessType === 'ADS');
  const subLinks = activeLinks.filter(l => l.accessType === 'SUB');
  const paidLinks = activeLinks.filter(l => l.accessType === 'RENT' || l.accessType === 'BUY');
  const otherLinks = activeLinks.filter(l => !['FREE', 'ADS', 'SUB', 'RENT', 'BUY'].includes(l.accessType));

  let html = `<div class="watch-links-section">\n  <h3>Watch</h3>\n  <div class="watch-links-grid">`;

  // Render each group
  if (freeLinks.length > 0) {
    html += renderLinkGroup('Free', freeLinks);
  }
  if (subLinks.length > 0) {
    html += renderLinkGroup('Subscription', subLinks);
  }
  if (paidLinks.length > 0) {
    html += renderLinkGroup('Rent / Buy', paidLinks);
  }
  if (otherLinks.length > 0) {
    html += renderLinkGroup('Other', otherLinks);
  }

  html += `\n  </div>`;

  // Hidden-link notice (broken / unavailable / redirect / legacy dead).
  if (hiddenCount > 0) {
    html += `\n  <p class="dead-links-notice">${hiddenCount} link${hiddenCount > 1 ? 's' : ''} currently unavailable</p>`;
  }

  html += `\n</div>`;
  return html;
}

function renderLinkGroup(groupLabel, links) {
  let html = `\n    <div class="watch-link-group">`;
  // Don't add group label if there's only one group
  // html += `\n      <h4 class="group-label">${groupLabel}</h4>`;

  for (const link of links) {
    html += renderSingleLink(link);
  }

  html += `\n    </div>`;
  return html;
}

function renderSingleLink(link) {
  const icon = PLATFORM_ICONS[link.platform] || '🔗';
  const badge = ACCESS_BADGES[link.accessType] || ACCESS_BADGES['FREE'];
  const status = STATUS_ICONS[link.status] || '';
  const gated = isLinkGated(link);
  // Gated links get a distinct CSS modifier so the stylesheet can dim
  // them and surface the lock icon, without losing the platform badge.
  const cardClass = gated ? 'watch-link-card watch-link-card-gated' : 'watch-link-card';
  const ariaSuffix = gated
    ? ' — sign-in or subscription may be required'
    : '';
  const ariaLabel = `Open on ${link.platform || 'platform'}${ariaSuffix} (opens in new tab)`;

  // Build metadata chips
  const chips = [];
  if (link.videoQuality) chips.push(link.videoQuality);
  if (link.audio && link.audio !== 'Original') chips.push(link.audio);
  if (link.subtitles && link.subtitles.length > 0 && !link.subtitles.includes('None')) {
    chips.push(`Subs: ${link.subtitles.join(', ')}`);
  }
  if (link.completeness && link.completeness !== 'Complete') {
    chips.push(link.completeness);
  }
  if (link.region && link.region.length > 0 && !link.region.includes('Global')) {
    chips.push(`🌐 ${link.region.join(', ')}`);
  }

  const chipsHTML = chips.length > 0
    ? `<span class="link-chips">${chips.map(c => `<span class="chip">${c}</span>`).join('')}</span>`
    : '';

  const notesHTML = link.notes
    ? `<span class="link-notes">${escapeHtml(link.notes)}</span>`
    : '';

  const verifiedHTML = link.lastVerified
    ? `<span class="verified-date" title="Last verified ${link.lastVerified}">${status}</span>`
    : (link.status ? `<span class="status-icon">${status}</span>` : '');

  return `
      <a href="${escapeHtml(link.url)}" class="${cardClass}" target="_blank" rel="noopener noreferrer" aria-label="${escapeHtml(ariaLabel)}">
        <span class="link-icon">${icon}</span>
        <span class="link-info">
          <span class="link-platform">${escapeHtml(link.platform)}${gated ? ' <svg class="link-gate-icon" width="11" height="11" viewBox="0 0 12 12" fill="none" stroke="currentColor" stroke-width="1.5" aria-hidden="true"><rect x="2.5" y="6" width="7" height="5" rx="0.5"/><path d="M4 6V4a2 2 0 014 0v2"/></svg>' : ''}</span>
          <span class="link-badge" style="background:${badge.color}">${badge.label}</span>
          ${chipsHTML}
          ${notesHTML}
        </span>
        ${verifiedHTML}
      </a>`;
}

function generateLegacyHTML(legacyValue) {
  // Fallback: parse legacy "[TYPE] Platform: URL" format
  const match = legacyValue.match(/\[(\w+)\]\s*([^:]+):\s*(https?:\/\/\S+)/);
  if (match) {
    const accessType = match[1].toUpperCase();
    const platform = match[2].trim();
    const url = match[3].trim();
    const badge = ACCESS_BADGES[accessType] || ACCESS_BADGES['FREE'];
    const icon = PLATFORM_ICONS[platform] || '🔗';

    return `
      <div class="watch-links-section">
        <h3>Watch</h3>
        <div class="watch-links-grid">
          <a href="${escapeHtml(url)}" class="watch-link-card" target="_blank" rel="noopener noreferrer">
            <span class="link-icon">${icon}</span>
            <span class="link-info">
              <span class="link-platform">${escapeHtml(platform)}</span>
              <span class="link-badge" style="background:${badge.color}">${badge.label}</span>
            </span>
          </a>
        </div>
      </div>`;
  }

  // Bare URL
  if (legacyValue.startsWith('http')) {
    return `
      <div class="watch-links-section">
        <h3>Watch</h3>
        <div class="watch-links-grid">
          <a href="${escapeHtml(legacyValue)}" class="watch-link-card" target="_blank" rel="noopener noreferrer">
            <span class="link-icon">🔗</span>
            <span class="link-info">
              <span class="link-platform">Watch Link</span>
            </span>
          </a>
        </div>
      </div>`;
  }

  return `
    <div class="watch-links-section">
      <h3>Watch</h3>
      <p class="no-links">Watch link data needs migration.</p>
    </div>`;
}

function escapeHtml(str) {
  if (!str) return '';
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/**
 * CSS for watch links cards. Add to your main stylesheet or inline.
 */
const WATCH_LINKS_CSS = `
/* Watch Links Section */
.watch-links-section {
  margin: 2rem 0;
}

.watch-links-section h3 {
  font-family: 'Playfair Display', Georgia, serif;
  font-size: 1.3rem;
  margin-bottom: 1rem;
  color: #1a1a1a;
}

.watch-links-grid {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.watch-link-card {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem 1rem;
  border: 1px solid #e5e1d8;
  border-radius: 8px;
  text-decoration: none;
  color: #1a1a1a;
  background: #faf8f4;
  transition: all 0.15s ease;
}

.watch-link-card:hover {
  border-color: #c4b99a;
  background: #f5f0e6;
  transform: translateY(-1px);
  box-shadow: 0 2px 8px rgba(0,0,0,0.06);
}

/* Gated card — Restricted/Unverified status. URL resolves but playback
   needs login, region access, or paid sub. Slightly desaturated so the
   primary "▶ WATCH" CTA still draws the eye on rows with multiple links. */
.watch-link-card-gated {
  background: #f1ede4;
  border-color: #d8d0bd;
  opacity: 0.92;
}
.watch-link-card-gated:hover {
  opacity: 1;
}
.link-gate-icon {
  display: inline-block;
  margin-left: 0.25rem;
  font-size: 0.85em;
  vertical-align: baseline;
}

.link-icon {
  font-size: 1.3rem;
  flex-shrink: 0;
  width: 2rem;
  text-align: center;
}

.link-info {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 0.4rem;
  flex: 1;
}

.link-platform {
  font-weight: 600;
  font-size: 0.95rem;
}

.link-badge {
  display: inline-block;
  padding: 0.15rem 0.5rem;
  border-radius: 9999px;
  font-size: 0.7rem;
  font-weight: 600;
  color: white;
  text-transform: uppercase;
  letter-spacing: 0.03em;
}

.link-chips {
  display: flex;
  gap: 0.3rem;
  flex-wrap: wrap;
}

.chip {
  display: inline-block;
  padding: 0.1rem 0.4rem;
  border-radius: 4px;
  font-size: 0.7rem;
  background: #e8e4da;
  color: #5a5548;
}

.link-notes {
  font-size: 0.75rem;
  color: #8a8578;
  font-style: italic;
  width: 100%;
}

.verified-date,
.status-icon {
  flex-shrink: 0;
  font-size: 0.85rem;
}

.no-links {
  color: #8a8578;
  font-style: italic;
  font-size: 0.9rem;
}

.dead-links-notice {
  margin-top: 0.5rem;
  font-size: 0.75rem;
  color: #b5a99a;
}

/* Watch Link Group */
.watch-link-group {
  display: flex;
  flex-direction: column;
  gap: 0.5rem;
}

.group-label {
  font-size: 0.8rem;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: #8a8578;
  margin: 0.5rem 0 0.25rem;
}

/* Responsive */
@media (max-width: 600px) {
  .watch-link-card {
    padding: 0.6rem 0.75rem;
  }
  .link-chips {
    display: none;
  }
}
`;

export {
  generateWatchLinksHTML,
  renderSingleLink,
  renderLinkGroup,
  WATCH_LINKS_CSS,
  PLATFORM_ICONS,
  ACCESS_BADGES,
};
