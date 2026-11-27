/**
 * platform-trust.js
 *
 * Policy-based watch-link classification. The HTTP-only validator in
 * validate-watch-links.js has poor signal on platforms that:
 *
 *   - return 200 for catalog misses (Netflix, Disney+, MUBI, Amazon Prime)
 *   - block bot UAs with 403 (Crunchyroll, HIDIVE)
 *   - require login walls behind 200 (Plex, Kanopy, HBO Max)
 *   - serve canonical, schema-stable URLs that are trustworthy without a
 *     network round-trip (Internet Archive, NFB, Animatsiya, YouTube IDs,
 *     Vimeo IDs, Bilibili)
 *
 * Output statuses use the EXISTING Notion 'Link Status' select schema —
 * confirmed live in the Watch Links DB on 2026-04-25:
 *
 *   - 'Verified'    — schema-stable URL pattern matches; trustable
 *   - 'Restricted'  — "Region-locked, paywall changed, or auth wall blocks
 *                     verification" (per Notion option description). Used
 *                     for both auth-gated platforms (Plex, Disney+, etc.)
 *                     AND catalog-volatile platforms (Netflix, MUBI, Tubi)
 *                     where we can't tell if the title is still present.
 *   - null          — no policy applies; fall through to HTTP validator
 *
 * Notes:
 *   - The legacy statuses 'Dead' and 'Redirect' are being migrated to
 *     'Broken' (per Notion option descriptions). validate-watch-links.js
 *     handles that mapping at write time.
 *   - 'Unavailable' is reserved for "platform confirmed not to carry
 *     this title" — only set by humans, never by this classifier.
 */

export const PLATFORM_TIERS = {
  /**
   * Tier A: archival / canonical URL schemas.
   * If the URL matches the pattern, the link is trustable without an HTTP
   * check. These platforms have stable URL → resource mappings; pattern
   * match is a stronger signal than a 200 response.
   */
  TRUST_PATTERN: {
    'Internet Archive': /^https?:\/\/archive\.org\/details\/[\w.\-]+\/?(\?.*)?$/i,
    'NFB':              /^https?:\/\/www\.nfb\.ca\/film\/[\w-]+\/?(\?.*)?$/i,
    'Animatsiya.net':   /^https?:\/\/www\.animatsiya\.net\/film\.phtml\?id=\d+$/i,
    'Vimeo':            /^https?:\/\/(www\.)?vimeo\.com\/\d+\/?(\?.*)?$/i,
    'YouTube':          /^https?:\/\/(www\.)?youtube\.com\/watch\?v=[\w-]{11}([&].*)?$/i,
    'Bilibili':         /^https?:\/\/www\.bilibili\.com\/video\/[\w]+\/?(\?.*)?$/i,
    'Criterion Channel':/^https?:\/\/(www\.)?criterionchannel\.com\/[\w-]+\/?(\?.*)?$/i,
    'Short of the Week':/^https?:\/\/(www\.)?shortoftheweek\.com\/\d{4}\/\d{2}\/\d{2}\/[\w-]+\/?$/i,
  },

  /**
   * Tier B: platforms where automated verification is unreliable.
   * Two sub-cases collapsed into one Notion status ('Restricted') because
   * the schema doesn't distinguish them and the operational outcome is
   * the same: don't trust an HTTP 200, don't auto-mark Dead, defer to
   * human or platform-specific DOM check.
   *
   *   B1 — auth-gated: URL is reachable but playback requires login or a
   *        paid subscription. The platform badge is still useful to the
   *        user (they may have an account); UI should render with a lock
   *        icon.
   *
   *   B2 — catalog-volatile: 200 responses lie — the title may have been
   *        removed from the catalog but the URL pattern still resolves.
   *        UI should de-emphasize until a human confirms.
   */
  RESTRICTED: [
    // B1 — auth-gated
    'Plex',
    'Kanopy',
    'HBO Max',
    'Disney+',
    'Apple TV',
    'Hulu',
    'Paramount+',
    'Peacock',
    'Crunchyroll',
    'HIDIVE',
    'Shahid',
    'iQIYI',
    'Korean Streaming',
    'Giloo',
    'Fawesome',
    'Google Play',
    'U-NEXT',
    'dアニメストア',
    'Bandai Channel',
    'ABEMA',
    'Niconico',
    'Tencent Video',
    'Youku',
    'FOD',
    'Hoopla',
    'RetroCrush',
    'Vudu',

    // B2 — catalog-volatile (200 lies)
    'Netflix',
    'Amazon Prime',
    'MUBI',
    'Tubi',
    'Pluto TV',
    'Dailymotion',
    'UNIT9 Archive',
    'Other',
    'Odyssey',
    'Kinopoisk',
    'ivi',
    'ARTE',
  ],
};

/**
 * Classify a (platform, url) pair using the trust tiers above.
 *
 * @param {string} platform  — Notion 'Platform' select value
 * @param {string} url
 * @returns {{ status: string, source: string } | null}
 *   `null` means no policy applies; caller should fall through to HTTP check.
 *
 *   `status` is always one of the canonical Notion 'Link Status' options:
 *   'Verified', 'Restricted', 'Broken'. Caller is responsible for any
 *   additional mapping (e.g. legacy 'Dead' → 'Broken').
 */
export function classifyByPolicy(platform, url) {
  if (!url) return { status: 'Broken', source: 'no-url' };

  const pattern = PLATFORM_TIERS.TRUST_PATTERN[platform];
  if (pattern && pattern.test(url)) {
    return { status: 'Verified', source: 'pattern' };
  }

  if (PLATFORM_TIERS.RESTRICTED.includes(platform)) {
    return { status: 'Restricted', source: 'policy' };
  }

  return null;
}

/**
 * Notion 'Link Status' option vocabulary, confirmed live in the Watch Links
 * DB schema (collection://081a1b55-8709-423d-8320-fb977b9819e0) on
 * 2026-04-25. Kept here so validate-watch-links.js can sanity-check before
 * issuing a write.
 */
export const NOTION_LINK_STATUSES = [
  'Verified',     // pattern match or human-confirmed live
  'Unverified',   // legacy — convention is now: leave Last Verified empty
  'Dead',         // legacy — migrate to Broken
  'Redirect',     // legacy — migrate to Broken
  'Broken',       // 404, removed, homepage redirect, redirects to wrong title
  'Restricted',   // region-locked, paywall changed, auth wall blocks check
  'Unavailable',  // platform confirmed not to carry this title (human only)
];

/**
 * Map legacy statuses to their replacements.
 * validate-watch-links.js should run every outbound write through this so
 * we eventually drain Dead + Redirect from the DB.
 */
export function normalizeLegacyStatus(status) {
  if (status === 'Dead' || status === 'Redirect') return 'Broken';
  return status;
}

/**
 * Decide the status to write, given the automated verdict and what a person
 * (or the research skill) already recorded in Notion.
 *
 * Automated checks may upgrade a link or report a definitive miss, but must
 * never overwrite curation they cannot see:
 *   - 'Unavailable' is a human "not in this catalog" verdict: always kept.
 *   - 'Verified' with a Last Verified date was checked by someone who could
 *     see inside the paywall; a platform policy ("Netflix pings are
 *     meaningless") is weaker evidence than that, so it is kept.
 *   - Only a real 404/410 response demotes a link. Timeouts, connection
 *     errors, redirects and odd status codes are inconclusive (datacenter
 *     IPs get blocked, shortlinks redirect) and leave the status unchanged.
 *
 * The first scheduled run without these rules (2026-11-27) demoted 478
 * hand-verified links and 98 'Unavailable' ones; see ops/CRON-DIAGNOSIS.md.
 */
export function reconcileStatus(entry, verdict) {
  const current = entry.currentStatus;
  if (current === 'Unavailable') return current;

  if (verdict.source === 'policy') {
    if (current === 'Verified' && entry.lastVerified) return current;
    return verdict.status;
  }
  if (verdict.source === 'pattern' || verdict.source === 'no-url') return verdict.status;

  // HTTP check
  if (verdict.status === 'Verified') return 'Verified';
  const definitive = verdict.code === 404 || verdict.code === 410;
  if (definitive) return 'Broken';
  // Inconclusive: keep the recorded status, but still drain the legacy
  // 'Dead' / 'Redirect' options into 'Broken' on the way through.
  return normalizeLegacyStatus(current);
}
