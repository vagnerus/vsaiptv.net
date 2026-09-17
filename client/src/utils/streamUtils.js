import { getKnownChannelLogo, generateBroadcasterBadge, extractRealResolution } from './channelLogos';
export { extractRealResolution };

/**
 * Safe utility to extract playable stream URL, poster/images and subtitles
 * from any content item (live, movie, series, episode).
 */

const IMG_FIELDS = [
  'poster_url', 'posterUrl', 'poster',
  'cover', 'coverUrl', 'cover_url',
  'stream_icon', 'icon_url', 'iconUrl', 'icon',
  'movie_image', 'movieImage',
  'series_image', 'seriesImage',
  'tmdb_cover', 'tmdbCover', 'tmdb_poster', 'tmdbPoster',
  'image', 'imageUrl', 'image_url',
  'img', 'logo', 'logoUrl', 'logo_url',
  'thumbnail', 'thumbnailUrl', 'thumbnail_url', 'thumb',
  'backdrop', 'backdropUrl', 'backdrop_url',
  'screenshot_uri', 'background',
];

const INVALID_VALUES = ['', 'null', 'undefined', 'none', '0', 'no-image.png', 'n/a'];

function isValidImageValue(value) {
  if (!value || typeof value !== 'string') return false;
  const v = value.trim();
  if (!v || INVALID_VALUES.includes(v.toLowerCase())) return false;
  return true;
}

/** Resolve an image candidate into an absolute, safe URL (or empty string). */
function resolveImageUrl(raw) {
  if (!isValidImageValue(raw)) return '';
  let v = String(raw).trim();
  // Some sources double-encode; try one decode round-trip safely
  try {
    const decoded = decodeURIComponent(v);
    if (decoded !== v && /^https?:\/\//i.test(decoded)) v = decoded;
  } catch (e) { /* keep original */ }

  if (/^data:image\//i.test(v)) return v;
  if (/^https?:\/\//i.test(v)) return v;
  if (/^\/\//i.test(v)) return window.location.protocol + v;
  if (/^\.?\//i.test(v)) return window.location.origin + v;
  // Bare path like "images/foo.jpg" — treat as relative to API origin
  if (/^[\w\-./]+\.(jpg|jpeg|png|webp|gif|avif|svg)(\?.*)?$/i.test(v)) {
    return window.location.origin + '/' + v.replace(/^\.?\//, '');
  }
  return '';
}


/**
 * Robust image resolver — searches every common poster/cover field,
 * resolves absolute URLs and returns '' when nothing valid is found.
 * Imagens externas passam pelo proxy do servidor (/api/img) para
 * garantir que baixem e carreguem mesmo com hotlink bloqueado,
 * mixed content ou restrições de WebView.
 */
export function getImageUrl(item) {
  if (!item || typeof item !== 'object') return '';
  
  const isLive = item.type === 'live' || item.stream_type === 'live' || (!item.type && !item.season_count && !item.episode_count);

  for (const field of IMG_FIELDS) {
    const rawVal = item[field];
    // Ignora URLs conhecidas por estarem mortas (como unsplash de teste)
    if (rawVal && typeof rawVal === 'string' && rawVal.includes('unsplash.com/photo-1504208434341')) {
      continue;
    }
    const url = resolveImageUrl(rawVal);
    if (url) return proxyImageUrl(url);
  }
  
  // Nested objects (e.g. { info: { cover: '...' } })
  for (const key of ['info', 'movie', 'series', 'stream']) {
    const nested = item[key];
    if (nested && typeof nested === 'object') {
      const url = getImageUrl(nested);
      if (url) return url;
    }
  }

  // Se for canal ao vivo, busca no catálogo de logos conhecidos ou gera insígnia oficial
  if (isLive) {
    const known = getKnownChannelLogo(item.name || item.title);
    if (known) return proxyImageUrl(known);
    return generateBroadcasterBadge(item);
  }

  return '';
}

/** Encaminha imagens externas pelo proxy do backend (mesma origem/HTTPS). */
export function proxyImageUrl(url) {
  if (!url || typeof url !== 'string') return '';
  if (url.startsWith('data:') || url.startsWith('blob:')) return url;
  if (url.startsWith(window.location.origin)) return url;
  if (/^https?:\/\//i.test(url)) {
    return `${window.location.origin}/api/img?url=${encodeURIComponent(url)}`;
  }
  return url;
}

// Backwards-compatible alias
export const getPosterUrl = getImageUrl;

/** Pretty SVG placeholder (data URI) with the item's initials or live TV broadcaster badge. */
export function getPlaceholder(item) {
  const isLive = item && (item.type === 'live' || item.stream_type === 'live');
  if (isLive) {
    const known = getKnownChannelLogo(item.name || item.title);
    if (known) return proxyImageUrl(known);
    return generateBroadcasterBadge(item);
  }

  const name = (item && (item.name || item.title)) || 'VSA';
  const initials = name
    .replace(/[^\p{L}\p{N} ]/gu, '')
    .split(' ').filter(Boolean).slice(0, 2)
    .map((w) => w[0].toUpperCase()).join('') || 'VSA';
  const svg =
    `<svg xmlns="http://www.w3.org/2000/svg" width="300" height="450">` +
    `<defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1">` +
    `<stop offset="0" stop-color="#181e2e"/><stop offset="1" stop-color="#080b11"/>` +
    `</linearGradient></defs>` +
    `<rect width="300" height="450" fill="url(#g)"/>` +
    `<text x="150" y="235" font-family="'Outfit', sans-serif" font-size="64" font-weight="800" ` +
    `fill="#6366f1" text-anchor="middle" opacity="0.9">${initials}</text></svg>`;
  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

/** Image error handler for <img> tags: swap to known logo or broadcaster badge. */
export function onImageError(e, item) {
  const img = e.currentTarget || e.target;
  if (!img) return;
  if (img.dataset.fallbackApplied) {
    img.src = generateBroadcasterBadge(item);
    return;
  }
  img.dataset.fallbackApplied = '1';
  const isLive = item && (item.type === 'live' || item.stream_type === 'live');
  if (isLive) {
    const known = getKnownChannelLogo(item.name || item.title);
    if (known) {
      img.src = proxyImageUrl(known);
      return;
    }
    img.src = generateBroadcasterBadge(item);
    return;
  }
  img.src = getPlaceholder(item);
}

const SUBTITLE_FIELDS = ['subtitles', 'subtitle', 'subtitleUrl', 'subtitle_url', 'captions', 'caption', 'tracks', 'legendas', 'vtt', 'srt', 'subtitle_tracks'];

/**
 * Extract subtitle track list from an item.
 * Returns [{ label, url }] with normalized absolute URLs.
 */
export function getSubtitles(item) {
  if (!item || typeof item !== 'object') return [];
  const out = [];
  for (const field of SUBTITLE_FIELDS) {
    let value = item[field];
    if (!value) continue;
    if (typeof value === 'string') value = [value];
    if (!Array.isArray(value)) continue;
    value.forEach((entry) => {
      let label = `Legenda ${out.length + 1}`;
      let url = '';
      if (typeof entry === 'string') {
        url = entry;
      } else if (entry && typeof entry === 'object') {
        url = entry.url || entry.src || entry.file || entry.link || '';
        label = entry.label || entry.lang || entry.language || `Legenda ${out.length + 1}`;
      }
      if (url && typeof url === 'string') {
        const abs = resolveMediaUrl(url);
        if (abs) out.push({ label, url: abs });
      }
    });
  }
  return out;
}

function resolveMediaUrl(raw) {
  if (!raw || typeof raw !== 'string') return '';
  const v = raw.trim();
  if (/^https?:\/\//i.test(v)) return v;
  if (/^\//i.test(v)) return window.location.origin + v;
  return '';
}

/** Convert SRT content to WebVTT (frontend conversion, no backend needed). */
export function srtToVtt(srt) {
  if (!srt || typeof srt !== 'string') return '';
  const body = srt
    .replace(/\r+/g, '')
    .replace(/^\uFEFF/, '')
    .replace(/^\s*(WEBVTT.*\n?)?/i, '')
    .replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
  return 'WEBVTT\n\n' + body.trim() + '\n';
}

export function getPlayableUrl(item) {
  if (!item) return null;

  const candidates = [
    item.stream_url,
    item.streamUrl,
    item.url,
    item.source,
    item.movie_url,
    item.episode_url,
    item.live_url,
    item.direct_source,
    item.playbackUrl,
  ];

  for (const candidate of candidates) {
    if (candidate && typeof candidate === 'string') {
      const trimmed = candidate.trim();
      if (trimmed.startsWith('http://') || trimmed.startsWith('https://') || trimmed.startsWith('/') || trimmed.startsWith('blob:')) {
        return trimmed;
      }
    }
  }

  if (import.meta.env?.DEV) {
    console.warn('[streamUtils] Nenhuma URL de reprodução válida encontrada para o item:', item);
  }

  return null;
}

export function formatDuration(seconds) {
  if (!seconds || isNaN(seconds) || seconds < 0) return '00:00';
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);

  if (h > 0) {
    return `${h}:${m < 10 ? '0' : ''}${m}:${s < 10 ? '0' : ''}${s}`;
  }
  return `${m}:${s < 10 ? '0' : ''}${s}`;
}

