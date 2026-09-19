// ============================================================
// VSAIPTV IMAGE AUDITOR & BACKGROUND REPAIR
// Varredura de catálogo com concorrência controlada,
// Auto-Repair com alta confiança e relatórios em tempo real.
// ============================================================
const db = require('../db/database');
const imageManager = require('./imageManager');

function normalizeChannelName(rawName) {
  if (!rawName || typeof rawName !== 'string') return '';
  return rawName
    .replace(/\b(4k|uhd|fhd|full\s*hd|hd|sd|h265|hevc|leg|dub|legendado|dublado|alt|²|³)\b/gi, '')
    .replace(/[\[\]\(\)]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function extractRealResolution(name) {
  if (!name || typeof name !== 'string') return null;
  if (/\b(4k|uhd)\b/i.test(name)) return '4K';
  if (/\b(fhd|full\s*hd)\b/i.test(name)) return 'FHD';
  if (/\b(hd)\b/i.test(name)) return 'HD';
  if (/\b(sd)\b/i.test(name)) return 'SD';
  return null;
}

// Catálogo completo de regras confiáveis de canais (alta resolução oficial)
const KNOWN_CHANNEL_RULES = [
  // Band
  { match: (n) => /\bband\s*news\b|\bbandnews\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/1/1a/BandNews_TV_logo_2018.png/960px-BandNews_TV_logo_2018.png' },
  { match: (n) => /\bband\s*sports\b|\bbandsports\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/1/11/BandSports_logo_2018.png/960px-BandSports_logo_2018.png' },
  { match: (n) => /\bband\b|\bbandeirantes\b/i.test(n), logo: 'https://i.imgur.com/1r5T6Pw.png' },

  // Adult Swim
  { match: (n) => /\badult\s*swi[mn]\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e4/Adult_Swim_2003_logo.svg/960px-Adult_Swim_2003_logo.svg.png' },

  // Agro+ & Campo
  { match: (n) => /\bagro\s*\+|\bagromais\b|\bagro\s*mais\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/4/4b/AgroMais_logo_2020.png/960px-AgroMais_logo_2020.png' },
  { match: (n) => /\bcanal\s*do\s*boi\b/i.test(n), logo: 'https://i.imgur.com/K1P8e6J.png' },
  { match: (n) => /\bcanal\s*rural\b|\bcanal\s*do\s*criador\b/i.test(n), logo: 'https://i.imgur.com/bL15xG7.png' },
  { match: (n) => /\bterra\s*viva\b|\bterraviva\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/1/1a/Terraviva_logo_2018.png/960px-Terraviva_logo_2018.png' },

  // Globo
  { match: (n) => /\bglobo\s*news\b|\bglobonews\b/i.test(n), logo: 'https://i.imgur.com/3yZyaCm.png' },
  { match: (n) => /\bgloob\s*inho\b|\bgloobinho\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/9/90/Gloobinho_logo_2021.png/960px-Gloobinho_logo_2021.png' },
  { match: (n) => /\bgloob\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/d/df/Gloob_logo_2021.png/960px-Gloob_logo_2021.png' },
  { match: (n) => /\bgloboplay\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d4/Globoplay_logo.svg/960px-Globoplay_logo.svg.png' },
  { match: (n) => /\bglobo\b/i.test(n) && !/globonews|gloob|globoplay/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/bf/Globo_2024.svg/960px-Globo_2024.svg.png' },

  // SBT
  { match: (n) => /\bsbt\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/2/22/SBT_logo_2014.png/960px-SBT_logo_2014.png' },

  // Record (todas as regionais e RecordTV)
  { match: (n) => /\brecord\s*news\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/6/60/Record_News_2023.png/960px-Record_News_2023.png' },
  { match: (n) => /\brecord/i.test(n), logo: 'https://i.imgur.com/sz9gTTr.png' },

  // RedeTV, TV Cultura, TV Brasil, TV Gazeta
  { match: (n) => /\bredetv!?\b|\brede\s*tv\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/f/f7/RedeTV%21_logo_2014.png/960px-RedeTV%21_logo_2014.png' },
  { match: (n) => /\btv\s*cultura\b|\bcultura\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/b/b3/TV_Cultura_logo_2020.png/960px-TV_Cultura_logo_2020.png' },
  { match: (n) => /\btv\s*brasil\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/TV_Brasil_2023.svg/960px-TV_Brasil_2023.svg.png' },
  { match: (n) => /\btv\s*gazeta\b|\bgazeta\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/4/41/TV_Gazeta_logo_2017.png/960px-TV_Gazeta_logo_2017.png' },

  // CazéTV & Canal GOAT
  { match: (n) => /\bcaz[eé]\s*tv\b|\bcaze\s*\d+\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Caz%C3%A9TV_logo.svg/960px-Caz%C3%A9TV_logo.svg.png' },
  { match: (n) => /\bgoat\b|\bcanal\s*goat\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c9/Canal_GOAT_logo.svg/960px-Canal_GOAT_logo.svg.png' },

  // SporTV & Premiere
  { match: (n) => /\bspor\s*t?tv\s*2\b/i.test(n), logo: 'https://i.imgur.com/pBiUnb2.png' },
  { match: (n) => /\bspor\s*t?tv\s*3\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/1/1d/SporTV_3_logo_2021.png/960px-SporTV_3_logo_2021.png' },
  { match: (n) => /\bspor\s*t?tv\b/i.test(n), logo: 'https://i.postimg.cc/gr9x3z71/Spor-TV-2021.png' },
  { match: (n) => /\bpremiere\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/9/91/Premiere_logo_2021.png/960px-Premiere_logo_2021.png' },

  // Futebol Nacional & Copas
  { match: (n) => /\bbrasileir[aã]o\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a2/Brasileir%C3%A3o_S%C3%A9rie_A_logo_2023.svg/960px-Brasileir%C3%A3o_S%C3%A9rie_A_logo_2023.svg.png' },
  { match: (n) => /\bcopa\s*do\s*brasil\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Copa_do_Brasil_logo_2023.svg/960px-Copa_do_Brasil_logo_2023.svg.png' },
  { match: (n) => /\bfutsal\b|\bliga\s*futsal\b/i.test(n), logo: 'https://i.imgur.com/K1P8e6J.png' },
  { match: (n) => /\bonefootball\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/OneFootball_logo_2020.svg/960px-OneFootball_logo_2020.svg.png' },

  // ESPN, DAZN, Combate, UFC
  { match: (n) => /\bespn\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/2f/ESPN_wordmark.svg/960px-ESPN_wordmark.svg.png' },
  { match: (n) => /\bcombate\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/2/2b/Canal_Combate_logo_2021.png/960px-Canal_Combate_logo_2021.png' },
  { match: (n) => /\bufc\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/0d/UFC_logo.svg/960px-UFC_logo.svg.png' },
  { match: (n) => /\bdazn\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/07/DAZN_Logo.svg/960px-DAZN_Logo.svg.png' },

  // Telecine
  { match: (n) => /\btelecine\s*action\b/i.test(n), logo: 'https://i.imgur.com/BHYWG0h.png' },
  { match: (n) => /\btelecine\s*cult\b/i.test(n), logo: 'https://i.imgur.com/6GuHXnr.png' },
  { match: (n) => /\btelecine\s*fun\b/i.test(n), logo: 'https://i.imgur.com/MO2Ynki.png' },
  { match: (n) => /\btelecine\s*premium\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/5/58/Telecine_Premium_2021.png/960px-Telecine_Premium_2021.png' },
  { match: (n) => /\btelecine\s*touch\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/5/58/Telecine_Touch_2021.png/960px-Telecine_Touch_2021.png' },
  { match: (n) => /\btelecine\s*pipoca\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/7/7d/Telecine_Pipoca_2021.png/960px-Telecine_Pipoca_2021.png' },
  { match: (n) => /\btelecine\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/c/cb/Telecine_logo_2021.png/960px-Telecine_logo_2021.png' },
  { match: (n) => /\bmegapix\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/f/f1/Megapix_logo_2021.png/960px-Megapix_logo_2021.png' },

  // HBO & Warner & TNT
  { match: (n) => /\bhbo\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/de/HBO_logo.svg/960px-HBO_logo.svg.png' },
  { match: (n) => /\bmax\s*\d+\b|\bmax\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/ce/Max_logo.svg/960px-Max_logo.svg.png' },
  { match: (n) => /\bwarner\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/a0/Warner_Channel_2021.svg/960px-Warner_Channel_2021.svg.png' },
  { match: (n) => /\btnt\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/TNT_2016_logo.svg/960px-TNT_2016_logo.svg.png' },
  { match: (n) => /\bspace\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/5a/Space_Channel_2020.svg/960px-Space_Channel_2020.svg.png' },
  { match: (n) => /\bcinemax\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4e/Cinemax_2016_logo.svg/960px-Cinemax_2016_logo.svg.png' },
  { match: (n) => /\bcine\s*canal\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e5/Cinecanal_logo.svg/960px-Cinecanal_logo.svg.png' },

  // Canais de Séries e Filmes
  { match: (n) => /\buniversal\s*(tv)?\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e0/Universal_TV_logo_2018.svg/960px-Universal_TV_logo_2018.svg.png' },
  { match: (n) => /\bsony\s*(channel)?\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/9c/Sony_Channel_logo.svg/960px-Sony_Channel_logo.svg.png' },
  { match: (n) => /\baxn\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/36/AXN_2015_logo.svg/960px-AXN_2015_logo.svg.png' },
  { match: (n) => /\ba&e\b|\ba\s*e\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/A%26E_Network_logo_2021.svg/960px-A%26E_Network_logo_2021.svg.png' },
  { match: (n) => /\bamc\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1d/AMC_logo_2019.svg/960px-AMC_logo_2019.svg.png' },
  { match: (n) => /\bparamount\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/8a/Paramount_Network_2018.svg/960px-Paramount_Network_2018.svg.png' },
  { match: (n) => /\bfilm&arts\b|\bfilm\s*&\s*arts\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/3/35/Film%26Arts_2016_logo.svg/960px-Film%26Arts_2016_logo.svg.png' },
  { match: (n) => /\beurochannel\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e7/Eurochannel_2014_logo.svg/960px-Eurochannel_2014_logo.svg.png' },
  { match: (n) => /\bcurta\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/d/d1/Canal_Curta%21_logo.png/960px-Canal_Curta%21_logo.png' },
  { match: (n) => /\bprime\s*box\s*bra[sz]il\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/72/Prime_Box_Brazil_logo.png/960px-Prime_Box_Brazil_logo.png' },
  { match: (n) => /\blifetime\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/4b/Lifetime_2020_logo.svg/960px-Lifetime_2020_logo.svg.png' },
  { match: (n) => /\be!\b|\be\s*entertainment\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ab/E%21_2012_logo.svg/960px-E%21_2012_logo.svg.png' },

  // Estilo de Vida & Discovery
  { match: (n) => /\bdiscovery\s*kids\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/2/26/Discovery_Kids_logo_2021.png/960px-Discovery_Kids_logo_2021.png' },
  { match: (n) => /\bdiscovery\s*home\s*&\s*health\b|\bhome\s*&\s*health\b|\bh&h\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/5/52/Discovery_Home_%26_Health_2019.svg/960px-Discovery_Home_%26_Health_2019.svg.png' },
  { match: (n) => /\bdiscovery\s*turbo\b|\bturbo\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/1/1a/Discovery_Turbo_2019.svg/960px-Discovery_Turbo_2019.svg.png' },
  { match: (n) => /\bdiscovery\s*science\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/87/Discovery_Science_2017.svg/960px-Discovery_Science_2017.svg.png' },
  { match: (n) => /\bdiscovery\s*world\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/9/91/Discovery_World_2016.svg/960px-Discovery_World_2016.svg.png' },
  { match: (n) => /\bdiscovery\s*theater\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d1/Discovery_Theater_2016.svg/960px-Discovery_Theater_2016.svg.png' },
  { match: (n) => /\bdiscovery\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/25/Discovery_Channel_2019.svg/960px-Discovery_Channel_2019.svg.png' },
  { match: (n) => /\banimal\s*planet\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/77/Animal_Planet_2018_logo.svg/960px-Animal_Planet_2018_logo.svg.png' },
  { match: (n) => /\btlc\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/TLC_Logo_2020.svg/960px-TLC_Logo_2020.svg.png' },
  { match: (n) => /\bid\b|\binvestigation\s*discovery\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b5/Investigation_Discovery_2020.svg/960px-Investigation_Discovery_2020.svg.png' },
  { match: (n) => /\bfood\s*network\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/a/ad/Food_Network_logo.svg/960px-Food_Network_logo.svg.png' },
  { match: (n) => /\bhgtv\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/2/29/HGTV_2015_logo.svg/960px-HGTV_2015_logo.svg.png' },
  { match: (n) => /\bdog\s*tv\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/e/e0/DOGTV_Logo.png/960px-DOGTV_Logo.png' },
  { match: (n) => /\bmodo\s*viagem\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/d/d4/Modo_Viagem_logo.png/960px-Modo_Viagem_logo.png' },
  { match: (n) => /\boff\b|\bcanal\s*off\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/6/6f/Canal_Off_logo.png/960px-Canal_Off_logo.png' },

  // Infantil
  { match: (n) => /\bcartoon\s*network\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/80/Cartoon_Network_2010_logo.svg/960px-Cartoon_Network_2010_logo.svg.png' },
  { match: (n) => /\bcartoonito\b|\bboomerang\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/b/b3/Cartoonito_2021_logo.svg/960px-Cartoonito_2021_logo.svg.png' },
  { match: (n) => /\bnickelodeon\b|\bnick\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7a/Nickelodeon_2023.svg/960px-Nickelodeon_2023.svg.png' },
  { match: (n) => /\bnick\s*jr\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/c/c5/Nick_Jr._2023.svg/960px-Nick_Jr._2023.svg.png' },
  { match: (n) => /\bdisney\s*(channel|jr|junior)?\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/d/d2/Disney_Channel_logo.svg/960px-Disney_Channel_logo.svg.png' },
  { match: (n) => /\bbaby\s*tv\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/en/thumb/4/45/BabyTV.png/960px-BabyTV.png' },
  { match: (n) => /\bzoomoo\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/8/88/ZooMoo_Kids_logo_2020.png/960px-ZooMoo_Kids_logo_2020.png' },

  // Documentários & Ciência
  { match: (n) => /\bh2\b|\bhistory\s*2\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/4/47/History_2_logo_2021.svg/960px-History_2_logo_2021.svg.png' },
  { match: (n) => /\bhistory\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/f/f5/History_Logo.svg/960px-History_Logo.svg.png' },
  { match: (n) => /\bnational\s*geographic\b|\bnat\s*geo\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/6a/National_Geographic_Logo.svg/960px-National_Geographic_Logo.svg.png' },

  // Notícias
  { match: (n) => /\bcnn\s*brasil\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/CNN_Brasil_logo.svg/960px-CNN_Brasil_logo.svg.png' },
  { match: (n) => /\bcnn\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/66/CNN_International_logo.svg/960px-CNN_International_logo.svg.png' },
  { match: (n) => /\bjovem\s*pan\s*news\b|\bjovem\s*pan\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/c/c7/Jovem_Pan_News_logo_2021.png/960px-Jovem_Pan_News_logo_2021.png' },
  { match: (n) => /\bbbc\s*(news|world)?\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/6/62/BBC_News_2022.svg/960px-BBC_News_2022.svg.png' },
  { match: (n) => /\bbloomberg\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/Bloomberg_Television_logo.svg/960px-Bloomberg_Television_logo.svg.png' },
  { match: (n) => /\bcnbc\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/e/e3/CNBC_logo.svg/960px-CNBC_logo.svg.png' },

  // Variedades & Música
  { match: (n) => /\bviva\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/9/91/Canal_Viva_logo_2018.png/960px-Canal_Viva_logo_2018.png' },
  { match: (n) => /\bmultishow\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/2/27/Multishow_logo_2021.png/960px-Multishow_logo_2021.png' },
  { match: (n) => /\bgnt\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/a/ad/GNT_logo_2020.png/960px-GNT_logo_2020.png' },
  { match: (n) => /\bbis\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/8/81/Canal_Bis_logo_2020.png/960px-Canal_Bis_logo_2020.png' },
  { match: (n) => /\barte\s*1\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/9/95/Arte_1_logo_2017.png/960px-Arte_1_logo_2017.png' },
  { match: (n) => /\bcanal\s*brasil\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/3/3d/Canal_Brasil_logo_2018.png/960px-Canal_Brasil_logo_2018.png' },

  // Religiosos & Regionais
  { match: (n) => /\bcan[cç][aã]o\s*nova\b|\bcano\s*nova\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/d/d4/TV_Can%C3%A7%C3%A3o_Nova_logo_2021.png/960px-TV_Can%C3%A7%C3%A3o_Nova_logo_2021.png' },
  { match: (n) => /\brede\s*vida\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/0/0f/Rede_Vida_logo_2020.png/960px-Rede_Vida_logo_2020.png' },
  { match: (n) => /\baparecida\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/6/6d/TV_Aparecida_logo_2020.png/960px-TV_Aparecida_logo_2020.png' },
  { match: (n) => /\bnovo\s*tempo\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/pt/thumb/8/8f/TV_Novo_Tempo_logo_2020.png/960px-TV_Novo_Tempo_logo_2020.png' },
  { match: (n) => /\btve\s*bahia\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/TV_Brasil_2023.svg/960px-TV_Brasil_2023.svg.png' },
  { match: (n) => /\bideal\s*tv\b/i.test(n), logo: 'https://upload.wikimedia.org/wikipedia/commons/thumb/7/7b/TV_Brasil_2023.svg/960px-TV_Brasil_2023.svg.png' }
];

function findKnownLogo(channelName) {
  if (!channelName || typeof channelName !== 'string') return null;
  const clean = normalizeChannelName(channelName).toLowerCase();
  for (const rule of KNOWN_CHANNEL_RULES) {
    if (rule.match(clean) || rule.match(channelName)) {
      return rule.logo;
    }
  }
  return null;
}

// Gerador de Badge SVG Broadcaster para canais sem logotipo oficial
function generateBroadcasterBadge(item) {
  const name = (item && (item.name || item.title)) || 'Canal TV';
  const cleanName = normalizeChannelName(name);
  const realRes = extractRealResolution(name);

  let gradStart = '#111827';
  let gradEnd = '#07090e';
  let accentColor = '#6366f1';

  const lower = name.toLowerCase();
  if (/esporte|sport|espn|premiere|combate|dazn|futebol|ufc|copa|brasileir|bjj/i.test(lower)) {
    accentColor = '#0ea5e9';
  } else if (/filme|cinema|telecine|hbo|tnt|megapix|paramount|max/i.test(lower)) {
    accentColor = '#a855f7';
  } else if (/news|noticia|jornal|cnn|globonews|bandnews/i.test(lower)) {
    accentColor = '#ef4444';
  } else if (/kids|infantil|cartoon|disney|gloob|zoomoo/i.test(lower)) {
    accentColor = '#10b981';
  } else if (/24h/i.test(lower)) {
    accentColor = '#f59e0b';
  }

  const categoryTag = (item && item.category_name) ? item.category_name.split('|')[0].trim() : (/24h/i.test(lower) ? '24 HORAS' : 'TV AO VIVO');
  const displayTitle = cleanName.length > 22 ? cleanName.substring(0, 20) + '...' : cleanName;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="400" height="250" viewBox="0 0 400 250">
      <defs>
        <linearGradient id="bg_${item.id || 'x'}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="${gradStart}"/>
          <stop offset="100%" stop-color="${gradEnd}"/>
        </linearGradient>
      </defs>
      <rect width="400" height="250" rx="14" fill="url(#bg_${item.id || 'x'})"/>
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

// Estado da varredura em execução
const auditState = {
  status: 'idle', // 'idle' | 'running' | 'completed' | 'cancelled' | 'error'
  scope: 'all',
  totalItems: 0,
  currentIndex: 0,
  validCount: 0,
  cachedCount: 0,
  brokenCount: 0,
  repairedCount: 0,
  fallbackCount: 0,
  currentStream: '',
  startTime: null,
  elapsedSeconds: 0,
  lastError: null,
  cancelRequested: false,
};

// Execução em fila com concorrência controlada (5 workers)
const CONCURRENCY = 5;

async function scanWorker(items, isAutoRepair = false) {
  let idx = 0;

  async function next() {
    while (idx < items.length && !auditState.cancelRequested) {
      const current = items[idx++];
      auditState.currentIndex = idx;
      auditState.currentStream = current.name || '';
      auditState.elapsedSeconds = Math.round((Date.now() - auditState.startTime) / 1000);

      const streamId = current.id;
      const rawUrl = current.icon_url || current.poster_url;
      const mediaType = current.type === 'live' ? 'channel' : (current.type === 'series' ? 'series' : 'movie');

      // Se não tem URL de imagem
      if (!rawUrl || !rawUrl.trim() || rawUrl.includes('via.placeholder') || rawUrl.includes('placeholder')) {
        if (isAutoRepair && current.type === 'live') {
          const knownLogo = findKnownLogo(current.name);
          if (knownLogo) {
            db.prepare('UPDATE streams SET icon_url = ? WHERE id = ?').run(knownLogo, streamId);
            auditState.repairedCount++;
            imageManager.downloadAndValidate(knownLogo, 'channel').catch(() => {});
            continue;
          } else {
            // Gera badge broadcaster SVG oficial
            const badge = generateBroadcasterBadge(current);
            db.prepare('UPDATE streams SET icon_url = ? WHERE id = ?').run(badge, streamId);
            auditState.repairedCount++;
            continue;
          }
        }
        auditState.fallbackCount++;
        continue;
      }

      // Se já for badge SVG data URL
      if (rawUrl.startsWith('data:image/svg+xml')) {
        auditState.validCount++;
        continue;
      }

      const normUrl = imageManager.normalizeUrl(rawUrl);
      const urlHash = imageManager.getUrlHash(normUrl);

      // Checar se já está em cache
      const cached = imageManager.getCacheRecord ? db.prepare('SELECT * FROM image_cache WHERE url_hash = ?').get(urlHash) : null;
      if (cached && cached.status === 'cached') {
        auditState.cachedCount++;
        auditState.validCount++;
        continue;
      }

      if (cached && cached.status === 'broken') {
        auditState.brokenCount++;
        if (isAutoRepair && current.type === 'live') {
          const knownLogo = findKnownLogo(current.name);
          const replacement = knownLogo || generateBroadcasterBadge(current);
          if (replacement && replacement !== rawUrl) {
            db.prepare('UPDATE streams SET icon_url = ? WHERE id = ?').run(replacement, streamId);
            auditState.repairedCount++;
            if (knownLogo) imageManager.downloadAndValidate(knownLogo, 'channel').catch(() => {});
            continue;
          }
        }
        auditState.fallbackCount++;
        continue;
      }

      // Validar baixando com concorrência controlada
      try {
        const result = await imageManager.downloadAndValidate(normUrl, mediaType);
        if (result.success && result.buffer) {
          auditState.validCount++;
          auditState.cachedCount++;
        } else {
          auditState.brokenCount++;
          if (isAutoRepair && current.type === 'live') {
            const knownLogo = findKnownLogo(current.name);
            const replacement = knownLogo || generateBroadcasterBadge(current);
            if (replacement && replacement !== rawUrl) {
              db.prepare('UPDATE streams SET icon_url = ? WHERE id = ?').run(replacement, streamId);
              auditState.repairedCount++;
              if (knownLogo) imageManager.downloadAndValidate(knownLogo, 'channel').catch(() => {});
              continue;
            }
          }
          auditState.fallbackCount++;
        }
      } catch (e) {
        auditState.brokenCount++;
        auditState.fallbackCount++;
      }
    }
  }

  const workers = Array.from({ length: CONCURRENCY }, () => next());
  await Promise.all(workers);
}

// Iniciar Varredura de Imagens
async function startScan(options = {}) {
  if (auditState.status === 'running') {
    return { success: false, message: 'Já existe uma auditoria de imagens em andamento.' };
  }

  const scope = options.scope || 'all';
  const isAutoRepair = Boolean(options.repair);

  auditState.status = 'running';
  auditState.scope = scope;
  auditState.currentIndex = 0;
  auditState.validCount = 0;
  auditState.cachedCount = 0;
  auditState.brokenCount = 0;
  auditState.repairedCount = 0;
  auditState.fallbackCount = 0;
  auditState.currentStream = '';
  auditState.startTime = Date.now();
  auditState.elapsedSeconds = 0;
  auditState.lastError = null;
  auditState.cancelRequested = false;

  let query = 'SELECT id, name, type, icon_url, poster_url FROM streams WHERE 1=1';
  const params = [];

  if (scope === 'tv' || scope === 'live') {
    query += ' AND type = ?';
    params.push('live');
  } else if (scope === 'movies' || scope === 'movie') {
    query += ' AND type = ?';
    params.push('movie');
  } else if (scope === 'series') {
    query += ' AND type = ?';
    params.push('series');
  }

  // Se auto-repair estiver ativo, prioriza os itens sem imagem primeiro!
  if (isAutoRepair) {
    query += ' ORDER BY CASE WHEN (icon_url IS NULL OR icon_url = \'\' OR icon_url LIKE \'%placeholder%\') THEN 0 ELSE 1 END, id ASC';
  } else {
    query += ' ORDER BY id ASC';
  }

  const maxItems = options.limit || 15000;
  query += ' LIMIT ?';
  params.push(maxItems);

  const items = db.prepare(query).all(...params);
  auditState.totalItems = items.length;

  console.log(`[ImageAuditor] 🚀 Iniciando auditoria (${scope}): ${items.length} itens (reparo: ${isAutoRepair})...`);

  // Execução assíncrona não-bloqueante
  scanWorker(items, isAutoRepair)
    .then(() => {
      if (auditState.cancelRequested) {
        auditState.status = 'cancelled';
        console.log('[ImageAuditor] ⏹️ Auditoria cancelada pelo usuário.');
      } else {
        auditState.status = 'completed';
        console.log(`[ImageAuditor] ✅ Auditoria concluída: ${auditState.validCount} válidas, ${auditState.brokenCount} quebradas, ${auditState.repairedCount} reparadas.`);
      }
    })
    .catch((err) => {
      auditState.status = 'error';
      auditState.lastError = err.message;
      console.error('[ImageAuditor] ❌ Erro durante auditoria:', err.message);
    });

  return { success: true, message: 'Auditoria iniciada em segundo plano.', totalItems: items.length };
}

// Cancelar varredura
function cancelScan() {
  if (auditState.status === 'running') {
    auditState.cancelRequested = true;
    return { success: true, message: 'Solicitação de cancelamento enviada.' };
  }
  return { success: false, message: 'Nenhuma auditoria em execução.' };
}

// Obter status do scan formatado perfeitamente para o frontend
function getScanStatus() {
  if (auditState.status === 'running') {
    auditState.elapsedSeconds = Math.round((Date.now() - auditState.startTime) / 1000);
  }
  const pct = auditState.totalItems > 0 ? Math.round((auditState.currentIndex / auditState.totalItems) * 100) : 0;
  return {
    ...auditState,
    isScanning: auditState.status === 'running',
    scanned: auditState.currentIndex,
    total: auditState.totalItems,
    valid: auditState.validCount,
    broken: auditState.brokenCount,
    repaired: auditState.repairedCount,
    currentStream: auditState.currentStream || '',
    progressPercent: pct,
  };
}

function generateVodPoster(item) {
  const cleanName = (item.name || 'VSAIPTV')
    .replace(/[\[\(].*?[\]\)]/g, '')
    .trim();
  const isSeries = item.type === 'series';
  const accentColor = isSeries ? '#8b5cf6' : '#ec4899';
  const tag = isSeries ? 'SÉRIE' : 'FILME';
  const displayTitle = cleanName.length > 28 ? cleanName.substring(0, 26) + '...' : cleanName;

  const svg = `
    <svg xmlns="http://www.w3.org/2000/svg" width="300" height="450" viewBox="0 0 300 450">
      <defs>
        <linearGradient id="vod_bg_${item.id || 'x'}" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stop-color="#141824"/>
          <stop offset="100%" stop-color="#0a0d14"/>
        </linearGradient>
      </defs>
      <rect width="300" height="450" rx="16" fill="url(#vod_bg_${item.id || 'x'})"/>
      <rect x="1" y="1" width="298" height="448" rx="15" fill="none" stroke="rgba(255,255,255,0.08)"/>
      <path d="M 16 0 L 284 0" stroke="${accentColor}" stroke-width="3" stroke-linecap="round" opacity="0.9"/>
      
      <g transform="translate(150, 180)">
        <circle cx="0" cy="0" r="45" fill="${accentColor}" fill-opacity="0.12"/>
        <circle cx="0" cy="0" r="60" fill="none" stroke="${accentColor}" stroke-width="1.2" opacity="0.25"/>
        <rect x="-18" y="-14" width="36" height="28" rx="4" fill="none" stroke="${accentColor}" stroke-width="2.5"/>
        <polygon points="-4,-6 8,0 -4,6" fill="${accentColor}"/>
      </g>
      
      <text x="150" y="290" font-family="'Outfit', -apple-system, sans-serif" font-size="18" font-weight="700" fill="#f8fafc" text-anchor="middle">
        ${displayTitle}
      </text>
      
      <g transform="translate(150, 340)">
        <rect x="-55" y="-12" width="110" height="24" rx="12" fill="rgba(255,255,255,0.06)" stroke="rgba(255,255,255,0.12)"/>
        <text x="0" y="4" font-family="-apple-system, sans-serif" font-size="11" font-weight="700" fill="${accentColor}" text-anchor="middle" letter-spacing="1px">
          ${tag}
        </text>
      </g>
      <text x="150" y="420" font-family="-apple-system, sans-serif" font-size="11" font-weight="600" fill="#64748b" text-anchor="middle">
        VSAIPTV CINEMA
      </text>
    </svg>
  `.trim();

  return 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(svg);
}

// Ação de reparo direto e imediato em lote para todos os conteúdos sem imagem
function repairAllMissing(type = 'all') {
  let query;
  const params = [];

  if (!type || type === 'all') {
    query = `
      SELECT id, name, type, icon_url, poster_url 
      FROM streams 
      WHERE (icon_url IS NULL OR icon_url = '' OR icon_url LIKE '%placeholder%') 
         OR (type IN ('movie', 'series') AND (poster_url IS NULL OR poster_url = '' OR poster_url LIKE '%placeholder%'))
    `;
  } else if (type === 'live') {
    query = "SELECT id, name, type, icon_url, poster_url FROM streams WHERE type = 'live' AND (icon_url IS NULL OR icon_url = '' OR icon_url LIKE '%placeholder%')";
  } else {
    query = "SELECT id, name, type, icon_url, poster_url FROM streams WHERE type = ? AND ((icon_url IS NULL OR icon_url = '' OR icon_url LIKE '%placeholder%') OR (poster_url IS NULL OR poster_url = '' OR poster_url LIKE '%placeholder%'))";
    params.push(type);
  }

  const missing = db.prepare(query).all(...params);
  let officialRepaired = 0;
  let badgeRepaired = 0;
  let vodRepaired = 0;

  const updateChannelStmt = db.prepare('UPDATE streams SET icon_url = ? WHERE id = ?');
  const updateVodStmt = db.prepare('UPDATE streams SET poster_url = ?, icon_url = COALESCE(NULLIF(icon_url, \'\'), ?) WHERE id = ?');

  db.transaction(() => {
    for (const item of missing) {
      if (item.type === 'live') {
        const known = findKnownLogo(item.name);
        if (known) {
          updateChannelStmt.run(known, item.id);
          officialRepaired++;
        } else {
          const badge = generateBroadcasterBadge(item);
          updateChannelStmt.run(badge, item.id);
          badgeRepaired++;
        }
      } else {
        const poster = generateVodPoster(item);
        updateVodStmt.run(poster, poster, item.id);
        vodRepaired++;
      }
    }
  })();

  const totalRepaired = officialRepaired + badgeRepaired + vodRepaired;

  return {
    success: true,
    totalMissingEvaluated: missing.length,
    repairedCount: totalRepaired,
    officialRepaired,
    badgeRepaired,
    vodRepaired,
    remainingMissing: Math.max(0, missing.length - totalRepaired),
    message: `${totalRepaired} itens sem imagem foram corrigidos com sucesso (${officialRepaired} logos oficiais, ${badgeRepaired} badges de canais e ${vodRepaired} posters VOD)!`
  };
}

module.exports = {
  startScan,
  cancelScan,
  getScanStatus,
  findKnownLogo,
  generateBroadcasterBadge,
  generateVodPoster,
  repairAllMissing,
};
