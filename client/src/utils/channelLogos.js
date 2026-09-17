/**
 * Mapeador seguro e gerador de insígnias para canais de TV
 * Respeita a ordem de prioridades:
 * 1. Imagem fornecida pela fonte/API
 * 2. Mapeamento normalizado confiável (sem falso-positivo em afiliadas)
 * 3. Fallback VSAIPTV limpo e elegante (sem inventar resoluções como 4K ou Full HD)
 */

// Mapeamento normalizado de emissoras conhecidas com correspondência confiável
const SAFE_CHANNEL_RULES = [
  // ESPN (exclusivo para canais da rede ESPN)
  { match: (n) => /^espn\s*brasil\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/2/2f/ESPN_Brasil_logo.png' },
  { match: (n) => /^espn\s*extra\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/ESPN_Extra_logo.svg/512px-ESPN_Extra_logo.svg.png' },
  { match: (n) => /^espn\s*2\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/be/ESPN2_logo.svg/512px-ESPN2_logo.svg.png' },
  { match: (n) => /^espn\s*3\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/ESPN3_logo.svg/512px-ESPN3_logo.svg.png' },
  { match: (n) => /^espn\s*4\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/ESPN4_logo.svg/512px-ESPN4_logo.svg.png' },
  { match: (n) => /^espn\s*5\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/cf/ESPN5_logo.svg/512px-ESPN5_logo.svg.png' },
  { match: (n) => /^espn\s*6\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/ESPN6_logo.svg/512px-ESPN6_logo.svg.png' },
  { match: (n) => /^espn\s*(\+|\b)/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/ESPN_logo.svg/512px-ESPN_logo.svg.png' },

  // SporTV (canais 1, 2 e 3)
  { match: (n) => /^spor\s*t?tv\s*2\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/d/d4/SporTV_2_logo_2021.png/512px-SporTV_2_logo_2021.png' },
  { match: (n) => /^spor\s*t?tv\s*3\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/1/1d/SporTV_3_logo_2021.png/512px-SporTV_3_logo_2021.png' },
  { match: (n) => /^spor\s*t?tv\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/2/25/SporTV_logo_2021.png/512px-SporTV_logo_2021.png' },

  // Premiere Futebol
  { match: (n) => /^premiere\s*clubes?\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/9/91/Premiere_logo_2021.png/512px-Premiere_logo_2021.png' },
  { match: (n) => /^premiere\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/9/91/Premiere_logo_2021.png/512px-Premiere_logo_2021.png' },

  // Combate & Lutas
  { match: (n) => /^combate\b|canal\s*combate\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/2/2b/Canal_Combate_logo_2021.png/512px-Canal_Combate_logo_2021.png' },
  { match: (n) => /^ufc\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/UFC_logo.svg/512px-UFC_logo.svg.png' },

  // Outros Esportes
  { match: (n) => /^dazn\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/DAZN_Logo.svg/512px-DAZN_Logo.svg.png' },
  { match: (n) => /^band\s*sports\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/1/11/BandSports_logo_2018.png/512px-BandSports_logo_2018.png' },
  { match: (n) => /^fox\s*sports\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Fox_Sports_logo.svg/512px-Fox_Sports_logo.svg.png' },

  // Telecine (canais da rede)
  { match: (n) => /^telecine\s*premium\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/5/58/Telecine_Premium_2021.png/512px-Telecine_Premium_2021.png' },
  { match: (n) => /^telecine\s*action\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/0/0a/Telecine_Action_2021.png/512px-Telecine_Action_2021.png' },
  { match: (n) => /^telecine\s*touch\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/5/58/Telecine_Touch_2021.png/512px-Telecine_Touch_2021.png' },
  { match: (n) => /^telecine\s*pipoca\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/7/7d/Telecine_Pipoca_2021.png/512px-Telecine_Pipoca_2021.png' },
  { match: (n) => /^telecine\s*cult\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/9/91/Telecine_Cult_2021.png/512px-Telecine_Cult_2021.png' },
  { match: (n) => /^telecine\s*fun\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/9/96/Telecine_Fun_2021.png/512px-Telecine_Fun_2021.png' },
  { match: (n) => /^telecine\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/c/cb/Telecine_logo_2021.png/512px-Telecine_logo_2021.png' },
  { match: (n) => /^megapix\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/f/f1/Megapix_logo_2021.png/512px-Megapix_logo_2021.png' },

  // HBO
  { match: (n) => /^hbo\s*2\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/HBO_2_logo_2014.svg/512px-HBO_2_logo_2014.svg.png' },
  { match: (n) => /^hbo\s*plus\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ca/HBO_Plus_logo.svg/512px-HBO_Plus_logo.svg.png' },
  { match: (n) => /^hbo\s*family\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8c/HBO_Family_2014.svg/512px-HBO_Family_2014.svg.png' },
  { match: (n) => /^hbo\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/HBO_logo.svg/512px-HBO_logo.svg.png' },

  // Warner & TNT (apenas se for canal de TV oficial, não filmes aleatórios)
  { match: (n) => /^warner(\s*channel)?\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Warner_Channel_2021.svg/512px-Warner_Channel_2021.svg.png' },
  { match: (n) => /^tnt\s*novelas\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/TNT_Novelas_logo.svg/512px-TNT_Novelas_logo.svg.png' },
  { match: (n) => /^tnt\s*series\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/TNT_Series_logo.svg/512px-TNT_Series_logo.svg.png' },
  { match: (n) => /^tnt\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/TNT_2016_logo.svg/512px-TNT_2016_logo.svg.png' },

  // Grandes Redes Abertas (apenas se começar com o nome da rede para evitar falsos positivos em afiliadas divergentes)
  { match: (n) => /^globo\s*(sp|rj|df|minas|nordeste|fhd|hd|4k|sd)?(\s|$)/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/TV_Globo_logo_2021.svg/512px-TV_Globo_logo_2021.svg.png' },
  { match: (n) => /^sbt\s*(sp|rj|brasil|fhd|hd|sd)?(\s|$)/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/2/22/SBT_logo_2014.png/512px-SBT_logo_2014.png' },
  { match: (n) => /^record\s*news\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/6/60/Record_News_2023.png/512px-Record_News_2023.png' },
  { match: (n) => /^record(\s*tv)?\s*(sp|rj|brasil|fhd|hd|sd)?(\s|$)/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/c/c9/RecordTV_logo_2023.png/512px-RecordTV_logo_2023.png' },
  { match: (n) => /^(rede\s*)?bandeirantes\b|^band\s*(sp|hd|fhd|sd)?(\s|$)/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/5/52/Rede_Bandeirantes_logo_2018.png/512px-Rede_Bandeirantes_logo_2018.png' },
  { match: (n) => /^redetv!?\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/f/f7/RedeTV%21_logo_2014.png/512px-RedeTV%21_logo_2014.png' },
  { match: (n) => /^tv\s*cultura\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/b/b3/TV_Cultura_logo_2020.png/512px-TV_Cultura_logo_2020.png' },

  // Notícias
  { match: (n) => /^cnn\s*brasil\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/CNN_Brasil_logo.svg/512px-CNN_Brasil_logo.svg.png' },
  { match: (n) => /^globonews\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/f/fa/GloboNews_logo_2021.png/512px-GloboNews_logo_2021.png' },
  { match: (n) => /^jovem\s*pan\s*news\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/c/c7/Jovem_Pan_News_logo_2021.png/512px-Jovem_Pan_News_logo_2021.png' },
  { match: (n) => /^bandnews\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/1/1a/BandNews_TV_logo_2018.png/512px-BandNews_TV_logo_2018.png' },

  // Infantil
  { match: (n) => /^cartoon\s*network\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Cartoon_Network_2010_logo.svg/512px-Cartoon_Network_2010_logo.svg.png' },
  { match: (n) => /^nickelodeon\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Nickelodeon_2023.svg/512px-Nickelodeon_2023.svg.png' },
  { match: (n) => /^disney\s*channel\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Disney_Channel_logo.svg/512px-Disney_Channel_logo.svg.png' },
  { match: (n) => /^gloob\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/d/df/Gloob_logo_2021.png/512px-Gloob_logo_2021.png' },
];

/**
 * Normaliza o nome do canal removendo marcadores técnicos (HD, FHD, 4K, [H265], etc.)
 */
function normalizeChannelName(rawName) {
  if (!rawName || typeof rawName !== 'string') return '';
  return rawName
    .replace(/\b(4k|uhd|fhd|full\s*hd|hd|sd|h265|hevc|leg|dub|²|³)\b/gi, '')
    .replace(/[\[\]\(\)]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

/**
 * Extrai resolução real SE E SOMENTE SE constar expressamente no título do canal
 */
export function extractRealResolution(name) {
  if (!name || typeof name !== 'string') return null;
  if (/\b(4k|uhd)\b/i.test(name)) return '4K';
  if (/\b(fhd|1080p?)\b/i.test(name)) return 'FHD';
  if (/\b(hd|720p?)\b/i.test(name)) return 'HD';
  if (/\b(sd)\b/i.test(name)) return 'SD';
  return null; // Não inventar!
}

/**
 * Tenta encontrar um logotipo oficial apenas por correspondência segura
 */
export function getKnownChannelLogo(name) {
  if (!name || typeof name !== 'string') return null;
  const clean = normalizeChannelName(name);
  if (!clean) return null;

  for (const rule of SAFE_CHANNEL_RULES) {
    if (rule.match(clean) || rule.match(name)) {
      return rule.logo;
    }
  }
  return null;
}

/**
 * Gera um Badge SVG elegante para canais sem logotipo oficial.
 * NUNCA inventa resoluções. Mostra o nome real e categoria.
 */
export function generateBroadcasterBadge(item) {
  const name = (item && (item.name || item.title)) || 'Canal TV';
  const cleanName = normalizeChannelName(name);

  // Detecção estrita de resolução: só exibe se existir no nome
  const realRes = extractRealResolution(name);

  // Paleta sóbria de broadcast
  let gradStart = '#111827';
  let gradEnd = '#07090e';
  let accentColor = '#6366f1';

  const lower = name.toLowerCase();
  if (/esporte|sport|espn|premiere|combate|dazn|futebol|ufc/i.test(lower)) {
    accentColor = '#0ea5e9';
  } else if (/filme|cinema|telecine|hbo|tnt|megapix|paramount/i.test(lower)) {
    accentColor = '#a855f7';
  } else if (/news|noticia|jornal|cnn/i.test(lower)) {
    accentColor = '#ef4444';
  } else if (/kids|infantil|cartoon|disney|gloob/i.test(lower)) {
    accentColor = '#10b981';
  }

  // Categoria real (sem inventar)
  const categoryTag = (item && item.category_name) ? item.category_name.split('|')[0].trim() : 'TV';
  const displayTitle = cleanName.length > 22 ? cleanName.substring(0, 20) + '...' : cleanName;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="400" height="250" viewBox="0 0 400 250">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${gradStart}"/>
          <stop offset="100%" stop-color="${gradEnd}"/>
        </linearGradient>
      </defs>

      <!-- Fundo do Card -->
      <rect width="400" height="250" rx="14" fill="url(#bg)"/>
      <rect x="0.5" y="0.5" width="399" height="249" rx="13.5" fill="none" stroke="rgba(255,255,255,0.08)"/>

      <!-- Linha de acento no topo -->
      <path d="M 14 0 L 386 0" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" opacity="0.85"/>

      <!-- Ícone Broadcast Minimalista -->
      <g transform="translate(200, 85)">
        <circle cx="0" cy="0" r="28" fill="${accentColor}" fill-opacity="0.12"/>
        <circle cx="0" cy="0" r="40" fill="none" stroke="${accentColor}" stroke-width="1.2" opacity="0.25"/>
        <circle cx="0" cy="0" r="54" fill="none" stroke="${accentColor}" stroke-width="1" opacity="0.12"/>
        <!-- Antena / Tela de TV -->
        <rect x="-12" y="-9" width="24" height="18" rx="3" fill="none" stroke="${accentColor}" stroke-width="2"/>
        <path d="M -5 -13 L -1 -9 M 5 -13 L 1 -9" stroke="${accentColor}" stroke-width="1.8" stroke-linecap="round"/>
        <circle cx="7" cy="0" r="1.5" fill="${accentColor}"/>
      </g>

      <!-- Nome do Canal -->
      <text x="200" y="160" font-family="'Outfit', -apple-system, sans-serif" font-size="20" font-weight="700" fill="#f8fafc" text-anchor="middle" letter-spacing="-0.02em">
        ${displayTitle}
      </text>

      <!-- Metadados Reais -->
      <g transform="translate(200, 198)">
        <!-- Categoria Real -->
        <rect x="${realRes ? '-85' : '-50'}" y="-11" width="${realRes ? '80' : '100'}" height="22" rx="11" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)"/>
        <text x="${realRes ? '-45' : '0'}" y="4" font-family="-apple-system, sans-serif" font-size="10" font-weight="600" fill="#94a3b8" text-anchor="middle">
          ${categoryTag.length > 12 ? categoryTag.substring(0, 10) + '..' : categoryTag}
        </text>

        <!-- Selo de Resolução SOMENTE se real -->
        ${realRes ? `
          <rect x="10" y="-11" width="65" height="22" rx="11" fill="rgba(99,102,241,0.15)" stroke="rgba(99,102,241,0.3)"/>
          <text x="42.5" y="4" font-family="-apple-system, sans-serif" font-size="10" font-weight="800" fill="#818cf8" text-anchor="middle">
            ${realRes}
          </text>
        ` : ''}
      </g>
    </svg>
  `.trim();

  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}
