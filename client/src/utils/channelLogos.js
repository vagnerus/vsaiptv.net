/**
 * Mapeador seguro e gerador de logotipos oficiais para canais de TV
 * Respeita a ordem de prioridades:
 * 1. Mapeamento de logotipos oficiais de alta resolução (Band, Globo, SBT, Record, Adult Swim, Agro+, etc.)
 * 2. Imagens válidas da fonte/API (filtrando hosts mortos e ícones genéricos)
 * 3. Fallback elegante de broadcast VSAIPTV
 */

// Mapeamento normalizado de emissoras conhecidas com correspondência confiável
const SAFE_CHANNEL_RULES = [
  // Band (Rede Bandeirantes e todas as suas afiliadas e canais regionais)
  {
    match: (n) => /\bband\s*news\b|\bbandnews\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/1/1a/BandNews_TV_logo_2018.png/960px-BandNews_TV_logo_2018.png'
  },
  {
    match: (n) => /\bband\s*sports\b|\bbandsports\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/1/11/BandSports_logo_2018.png/960px-BandSports_logo_2018.png'
  },
  {
    // Cobre Band Nacional, Band SP, Band RJ, Band MG, Band RS, Band Vale, Band Curitiba, Band DF, etc.
    match: (n) => /\bband\b|\bbandeirantes\b/i.test(n),
    logo: 'https://i.imgur.com/1r5T6Pw.png'
  },

  // Adult Swim
  {
    match: (n) => /\badult\s*swi[mn]\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Adult_Swim_2003_logo.svg/960px-Adult_Swim_2003_logo.svg.png'
  },

  // Agro+ / AgroMais / Agronegócio
  {
    match: (n) => /\bagro\s*\+|\bagromais\b|\bagro\s*mais\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/4/4b/AgroMais_logo_2020.png/960px-AgroMais_logo_2020.png'
  },
  {
    match: (n) => /\bcanal\s*do\s*boi\b/i.test(n),
    logo: 'https://i.imgur.com/K1P8e6J.png'
  },
  {
    match: (n) => /\bcanal\s*rural\b|\bcanal\s*do\s*criador\b/i.test(n),
    logo: 'https://i.imgur.com/bL15xG7.png'
  },
  {
    match: (n) => /\bterra\s*viva\b|\bterraviva\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/1/1a/Terraviva_logo_2018.png/960px-Terraviva_logo_2018.png'
  },

  // Globo (Rede Globo e afiliadas: SP, RJ, Minas, Nordeste, Brasília, Bahia, etc.)
  {
    match: (n) => /\bglobo\s*news\b|\bglobonews\b/i.test(n),
    logo: 'https://i.imgur.com/3yZyaCm.png'
  },
  {
    match: (n) => /\bgloob\s*inho\b|\bgloobinho\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/9/90/Gloobinho_logo_2021.png/960px-Gloobinho_logo_2021.png'
  },
  {
    match: (n) => /\bgloob\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/d/df/Gloob_logo_2021.png/960px-Gloob_logo_2021.png'
  },
  {
    match: (n) => /\bglobo\b/i.test(n) && !/globonews|gloob|globoplay/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Globo_2024.svg/960px-Globo_2024.svg.png'
  },

  // SBT (Rede SBT e afiliadas)
  {
    match: (n) => /\bsbt\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/2/22/SBT_logo_2014.png/960px-SBT_logo_2014.png'
  },

  // Record (Record TV e afiliadas)
  {
    match: (n) => /\brecord\s*news\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/6/60/Record_News_2023.png/960px-Record_News_2023.png'
  },
  {
    match: (n) => /\brecord\b/i.test(n),
    logo: 'https://i.imgur.com/sz9gTTr.png'
  },

  // RedeTV, TV Cultura, TV Brasil, TV Gazeta
  {
    match: (n) => /\bredetv!?\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/f/f7/RedeTV%21_logo_2014.png/960px-RedeTV%21_logo_2014.png'
  },
  {
    match: (n) => /\btv\s*cultura\b|\bcultura\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/b/b3/TV_Cultura_logo_2020.png/960px-TV_Cultura_logo_2020.png'
  },
  {
    match: (n) => /\btv\s*brasil\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/TV_Brasil_2023.svg/960px-TV_Brasil_2023.svg.png'
  },
  {
    match: (n) => /\btv\s*gazeta\b|\bgazeta\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/4/41/TV_Gazeta_logo_2017.png/960px-TV_Gazeta_logo_2017.png'
  },

  // CazéTV
  {
    match: (n) => /\bcaz[eé]\s*tv\b|\bcaze\s*\d+\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Caz%C3%A9TV_logo.svg/960px-Caz%C3%A9TV_logo.svg.png'
  },

  // ESPN (ESPN, 2, 3, 4, 5, 6, Extra, Brasil, Premium)
  {
    match: (n) => /\bespn\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/ESPN_wordmark.svg/960px-ESPN_wordmark.svg.png'
  },

  // SporTV (SporTV 1, 2, 3)
  {
    match: (n) => /\bspor\s*t?tv\s*2\b/i.test(n),
    logo: 'https://i.imgur.com/pBiUnb2.png'
  },
  {
    match: (n) => /\bspor\s*t?tv\s*3\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/1/1d/SporTV_3_logo_2021.png/960px-SporTV_3_logo_2021.png'
  },
  {
    match: (n) => /\bspor\s*t?tv\b/i.test(n),
    logo: 'https://i.postimg.cc/gr9x3z71/Spor-TV-2021.png'
  },

  // Premiere Futebol
  {
    match: (n) => /\bpremiere\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/9/91/Premiere_logo_2021.png/960px-Premiere_logo_2021.png'
  },

  // Combate & Lutas
  {
    match: (n) => /\bcombate\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/2/2b/Canal_Combate_logo_2021.png/960px-Canal_Combate_logo_2021.png'
  },
  {
    match: (n) => /\bufc\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/UFC_logo.svg/960px-UFC_logo.svg.png'
  },
  {
    match: (n) => /\bdazn\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/DAZN_Logo.svg/960px-DAZN_Logo.svg.png'
  },

  // Telecine
  {
    match: (n) => /\btelecine\s*action\b/i.test(n),
    logo: 'https://i.imgur.com/BHYWG0h.png'
  },
  {
    match: (n) => /\btelecine\s*cult\b/i.test(n),
    logo: 'https://i.imgur.com/6GuHXnr.png'
  },
  {
    match: (n) => /\btelecine\s*fun\b/i.test(n),
    logo: 'https://i.imgur.com/MO2Ynki.png'
  },
  {
    match: (n) => /\btelecine\s*premium\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/5/58/Telecine_Premium_2021.png/960px-Telecine_Premium_2021.png'
  },
  {
    match: (n) => /\btelecine\s*touch\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/5/58/Telecine_Touch_2021.png/960px-Telecine_Touch_2021.png'
  },
  {
    match: (n) => /\btelecine\s*pipoca\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/7/7d/Telecine_Pipoca_2021.png/960px-Telecine_Pipoca_2021.png'
  },
  {
    match: (n) => /\btelecine\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/c/cb/Telecine_logo_2021.png/960px-Telecine_logo_2021.png'
  },
  {
    match: (n) => /\bmegapix\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/f/f1/Megapix_logo_2021.png/960px-Megapix_logo_2021.png'
  },

  // HBO
  {
    match: (n) => /\bhbo\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/HBO_logo.svg/960px-HBO_logo.svg.png'
  },

  // Warner & TNT
  {
    match: (n) => /\bwarner\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Warner_Channel_2021.svg/960px-Warner_Channel_2021.svg.png'
  },
  {
    match: (n) => /\btnt\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/TNT_2016_logo.svg/960px-TNT_2016_logo.svg.png'
  },
  {
    match: (n) => /\bspace\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Space_Channel_2020.svg/960px-Space_Channel_2020.svg.png'
  },
  {
    match: (n) => /\bcinemax\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Cinemax_2016_logo.svg/960px-Cinemax_2016_logo.svg.png'
  },
  {
    match: (n) => /\bcine\s*canal\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Cinecanal_logo.svg/960px-Cinecanal_logo.svg.png'
  },

  // Canais de Séries e Filmes (Universal, Sony, AXN, A&E, AMC, Paramount)
  {
    match: (n) => /\buniversal\s*(tv)?\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Universal_TV_logo_2018.svg/960px-Universal_TV_logo_2018.svg.png'
  },
  {
    match: (n) => /\bsony\s*(channel)?\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Sony_Channel_logo.svg/960px-Sony_Channel_logo.svg.png'
  },
  {
    match: (n) => /\baxn\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/AXN_2015_logo.svg/960px-AXN_2015_logo.svg.png'
  },
  {
    match: (n) => /\ba&e\b|\ba\s*e\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/A%26E_Network_logo_2021.svg/960px-A%26E_Network_logo_2021.svg.png'
  },
  {
    match: (n) => /\bamc\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/AMC_logo_2019.svg/960px-AMC_logo_2019.svg.png'
  },
  {
    match: (n) => /\bparamount\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Paramount_Network_2018.svg/960px-Paramount_Network_2018.svg.png'
  },

  // Discovery Family
  {
    match: (n) => /\bdiscovery\s*kids\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/2/26/Discovery_Kids_logo_2021.png/960px-Discovery_Kids_logo_2021.png'
  },
  {
    match: (n) => /\bdiscovery\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Discovery_Channel_2019.svg/960px-Discovery_Channel_2019.svg.png'
  },
  {
    match: (n) => /\banimal\s*planet\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Animal_Planet_2018_logo.svg/960px-Animal_Planet_2018_logo.svg.png'
  },

  // Infantil
  {
    match: (n) => /\bcartoon\s*network\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Cartoon_Network_2010_logo.svg/960px-Cartoon_Network_2010_logo.svg.png'
  },
  {
    match: (n) => /\bcartoonito\b|\bboomerang\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Cartoonito_2021_logo.svg/960px-Cartoonito_2021_logo.svg.png'
  },
  {
    match: (n) => /\bnickelodeon\b|\bnick\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Nickelodeon_2023.svg/960px-Nickelodeon_2023.svg.png'
  },
  {
    match: (n) => /\bdisney\s*(channel|jr|junior)?\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Disney_Channel_logo.svg/960px-Disney_Channel_logo.svg.png'
  },
  {
    match: (n) => /\bbaby\s*tv\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/4/45/BabyTV.png/960px-BabyTV.png'
  },

  // Documentários & Ciência
  {
    match: (n) => /\bhistory\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/History_Logo.svg/960px-History_Logo.svg.png'
  },
  {
    match: (n) => /\bnational\s*geographic\b|\bnat\s*geo\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/National_Geographic_Logo.svg/960px-National_Geographic_Logo.svg.png'
  },

  // Notícias
  {
    match: (n) => /\bcnn\s*brasil\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/CNN_Brasil_logo.svg/960px-CNN_Brasil_logo.svg.png'
  },
  {
    match: (n) => /\bcnn\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/CNN_International_logo.svg/960px-CNN_International_logo.svg.png'
  },
  {
    match: (n) => /\bjovem\s*pan\s*news\b|\bjovem\s*pan\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/c/c7/Jovem_Pan_News_logo_2021.png/960px-Jovem_Pan_News_logo_2021.png'
  },
  {
    match: (n) => /\bbbc\s*(news|world)?\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/BBC_News_2022.svg/960px-BBC_News_2022.svg.png'
  },
  {
    match: (n) => /\bbloomberg\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Bloomberg_Television_logo.svg/960px-Bloomberg_Television_logo.svg.png'
  },

  // Variedades & Música
  {
    match: (n) => /\bviva\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/9/91/Canal_Viva_logo_2018.png/960px-Canal_Viva_logo_2018.png'
  },
  {
    match: (n) => /\bmultishow\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/2/27/Multishow_logo_2021.png/960px-Multishow_logo_2021.png'
  },
  {
    match: (n) => /\bgnt\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/a/ad/GNT_logo_2020.png/960px-GNT_logo_2020.png'
  },
  {
    match: (n) => /\bbis\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/8/81/Canal_Bis_logo_2020.png/960px-Canal_Bis_logo_2020.png'
  },
  {
    match: (n) => /\barte\s*1\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/9/95/Arte_1_logo_2017.png/960px-Arte_1_logo_2017.png'
  },
  {
    match: (n) => /\bcanal\s*brasil\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/3/3d/Canal_Brasil_logo_2018.png/960px-Canal_Brasil_logo_2018.png'
  },

  // Religiosos
  {
    match: (n) => /\bcan[cç][aã]o\s*nova\b|\bcano\s*nova\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/d/d4/TV_Can%C3%A7%C3%A3o_Nova_logo_2021.png/960px-TV_Can%C3%A7%C3%A3o_Nova_logo_2021.png'
  },
  {
    match: (n) => /\brede\s*vida\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/0/0f/Rede_Vida_logo_2020.png/960px-Rede_Vida_logo_2020.png'
  },
  {
    match: (n) => /\baparecida\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/6/6d/TV_Aparecida_logo_2020.png/960px-TV_Aparecida_logo_2020.png'
  },
  {
    match: (n) => /\bnovo\s*tempo\b/i.test(n),
    logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/8/8f/TV_Novo_Tempo_logo_2020.png/960px-TV_Novo_Tempo_logo_2020.png'
  },
];

/**
 * Normaliza o nome do canal removendo marcadores técnicos (HD, FHD, 4K, [H265], etc.)
 */
function normalizeChannelName(rawName) {
  if (!rawName || typeof rawName !== 'string') return '';
  return rawName
    .replace(/\b(4k|uhd|fhd|full\s*hd|hd|sd|h265|hevc|leg|dub|legendado|dublado|alt|²|³)\b/gi, '')
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
  if (/\b(fhd|full\s*hd)\b/i.test(name)) return 'FHD';
  if (/\b(hd)\b/i.test(name)) return 'HD';
  if (/\b(sd)\b/i.test(name)) return 'SD';
  return null;
}

/**
 * Procura um logotipo oficial confiável pelo nome do canal
 */
export function getKnownChannelLogo(name) {
  if (!name || typeof name !== 'string') return null;
  const clean = normalizeChannelName(name).toLowerCase();
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
  const realRes = extractRealResolution(name);

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
      <rect width="400" height="250" rx="14" fill="url(#bg)"/>
      <rect x="0.5" y="0.5" width="399" height="249" rx="13.5" fill="none" stroke="rgba(255,255,255,0.08)"/>
      <path d="M 14 0 L 386 0" stroke="${accentColor}" stroke-width="2.5" stroke-linecap="round" opacity="0.85"/>
      <g transform="translate(200, 85)">
        <circle cx="0" cy="0" r="28" fill="${accentColor}" fill-opacity="0.12"/>
        <circle cx="0" cy="0" r="40" fill="none" stroke="${accentColor}" stroke-width="1.2" opacity="0.25"/>
        <circle cx="0" cy="0" r="54" fill="none" stroke="${accentColor}" stroke-width="1" opacity="0.12"/>
        <rect x="-12" y="-9" width="24" height="18" rx="3" fill="none" stroke="${accentColor}" stroke-width="2"/>
        <path d="M -5 -13 L -1 -9 M 5 -13 L 1 -9" stroke="${accentColor}" stroke-width="1.8" stroke-linecap="round"/>
        <circle cx="7" cy="0" r="1.5" fill="${accentColor}"/>
      </g>
      <text x="200" y="160" font-family="'Outfit', -apple-system, sans-serif" font-size="20" font-weight="700" fill="#f8fafc" text-anchor="middle" letter-spacing="-0.02em">
        ${displayTitle}
      </text>
      <g transform="translate(200, 198)">
        <rect x="${realRes ? '-85' : '-50'}" y="-11" width="${realRes ? '80' : '100'}" height="22" rx="11" fill="rgba(255,255,255,0.05)" stroke="rgba(255,255,255,0.1)"/>
        <text x="${realRes ? '-45' : '0'}" y="4" font-family="-apple-system, sans-serif" font-size="10" font-weight="600" fill="#94a3b8" text-anchor="middle">
          ${categoryTag.length > 12 ? categoryTag.substring(0, 10) + '..' : categoryTag}
        </text>
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
