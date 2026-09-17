const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const ConnectionManager = require('../services/connectionManager');

// Helper to authenticate Xtream Codes client
function authenticateClient(username, password, clientIp) {
  if (ConnectionManager.isIpBlocked(clientIp)) {
    return { error: 'IP bloqueado pelo firewall' };
  }

  if (!username || !password) {
    return { error: 'Credenciais ausentes' };
  }

  const user = db.prepare("SELECT * FROM users WHERE username = ? AND role = 'client'").get(username);
  if (!user) {
    return { error: 'Usuário não encontrado' };
  }

  if (user.status === 'suspended') {
    return { error: 'Conta suspensa' };
  }

  if (user.expires_at && new Date(user.expires_at) < new Date()) {
    if (user.status !== 'expired') {
      db.prepare("UPDATE users SET status = 'expired' WHERE id = ?").run(user.id);
    }
    return { error: 'Conta expirada' };
  }

  const isMatch = bcrypt.compareSync(password, user.password_hash);
  if (!isMatch) {
    return { error: 'Senha incorreta' };
  }

  return { user };
}

// ==========================================
// 1. XTREAM CODES API (/player_api.php)
// ==========================================
router.get('/player_api.php', (req, res) => {
  const { username, password, action } = req.query;
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  const auth = authenticateClient(username, password, clientIp);
  if (auth.error) {
    return res.status(200).json({
      user_info: {
        auth: 0,
        status: 'Disabled',
        message: auth.error,
      }
    });
  }

  const user = auth.user;
  const serverDomainRow = db.prepare("SELECT value FROM system_settings WHERE key = 'server_domain'").get();
  const serverDomain = (serverDomainRow && serverDomainRow.value) || 'http://localhost:5000';
  const urlObj = new URL(serverDomain);

  const activeConsCount = db.prepare('SELECT COUNT(*) as total FROM active_connections WHERE user_id = ?').get(user.id).total;

  // If no action, return authentication handshake
  if (!action) {
    const expTimestamp = user.expires_at ? Math.floor(new Date(user.expires_at).getTime() / 1000) : null;
    const createdTimestamp = Math.floor(new Date(user.created_at).getTime() / 1000);

    return res.json({
      user_info: {
        username: user.username,
        password: user.plain_password || password,
        message: 'Acesso autorizado',
        auth: 1,
        status: user.status === 'active' ? 'Active' : 'Disabled',
        exp_date: expTimestamp ? String(expTimestamp) : '1900000000',
        is_trial: user.is_trial ? '1' : '0',
        active_cons: String(activeConsCount),
        created_at: String(createdTimestamp),
        max_connections: String(user.max_connections || 1),
        allowed_output_formats: ['m3u8', 'ts', 'mp4'],
      },
      server_info: {
        url: urlObj.hostname,
        port: urlObj.port || (urlObj.protocol === 'https:' ? '443' : '80'),
        https_port: '443',
        server_protocol: urlObj.protocol.replace(':', ''),
        rtmp_port: '1935',
        timezone: 'America/Sao_Paulo',
        timestamp_now: Math.floor(Date.now() / 1000),
        time_now: new Date().toISOString().replace('T', ' ').slice(0, 19),
        process: true,
      }
    });
  }

  // Handle actions
  switch (action) {
    case 'get_live_categories': {
      const categories = db.prepare("SELECT id as category_id, name as category_name, 0 as parent_id FROM categories WHERE type = 'live' ORDER BY order_num ASC").all();
      return res.json(categories);
    }

    case 'get_live_streams': {
      const categoryId = req.query.category_id;
      let query = "SELECT id as stream_id, name, 'live' as stream_type, icon_url as stream_icon, epg_channel_id, category_id, stream_url FROM streams WHERE type = 'live' AND status = 'online'";
      const params = [];
      if (categoryId) {
        query += ' AND category_id = ?';
        params.push(categoryId);
      }
      query += ' ORDER BY id ASC';

      const streams = db.prepare(query).all(...params).map((s, index) => ({
        num: index + 1,
        name: s.name,
        stream_type: 'live',
        stream_id: s.stream_id,
        stream_icon: s.stream_icon || '',
        epg_channel_id: s.epg_channel_id || '',
        added: '1700000000',
        category_id: String(s.category_id || ''),
        custom_sid: '',
        tv_archive: 0,
        direct_source: '',
        tv_archive_duration: 0,
      }));

      return res.json(streams);
    }

    case 'get_vod_categories': {
      const categories = db.prepare("SELECT id as category_id, name as category_name, 0 as parent_id FROM categories WHERE type = 'movie' ORDER BY order_num ASC").all();
      return res.json(categories);
    }

    case 'get_vod_streams': {
      const categoryId = req.query.category_id;
      let query = "SELECT id as stream_id, name, icon_url as stream_icon, rating, release_date, category_id FROM streams WHERE type = 'movie' AND status = 'online'";
      const params = [];
      if (categoryId) {
        query += ' AND category_id = ?';
        params.push(categoryId);
      }
      const movies = db.prepare(query).all(...params).map((m, index) => ({
        num: index + 1,
        name: m.name,
        stream_type: 'movie',
        stream_id: m.stream_id,
        stream_icon: m.stream_icon || '',
        rating: m.rating || '8.5',
        rating_5based: 4.2,
        added: '1700000000',
        category_id: String(m.category_id || ''),
        container_extension: 'mp4',
        custom_sid: '',
        direct_source: '',
      }));
      return res.json(movies);
    }

    case 'get_vod_info': {
      const vodId = req.query.vod_id;
      const movie = db.prepare("SELECT * FROM streams WHERE id = ? AND type = 'movie'").get(vodId);
      if (!movie) return res.status(404).json({ error: 'Movie not found' });

      return res.json({
        info: {
          name: movie.name,
          plot: movie.description,
          rating: movie.rating || '8.5',
          releasedate: movie.release_date || '2024',
          movie_image: movie.poster_url || movie.icon_url,
        },
        movie_data: {
          stream_id: movie.id,
          name: movie.name,
          container_extension: 'mp4',
        }
      });
    }

    case 'get_series_categories': {
      const categories = db.prepare("SELECT id as category_id, name as category_name, 0 as parent_id FROM categories WHERE type = 'series' ORDER BY order_num ASC").all();
      return res.json(categories);
    }

    case 'get_series': {
      const series = db.prepare("SELECT id as series_id, name, icon_url as cover, poster_url, description as plot, rating, release_date, category_id FROM streams WHERE type = 'series' AND status = 'online'").all();
      return res.json(series);
    }

    case 'get_series_info': {
      const seriesId = req.query.series_id;
      const series = db.prepare("SELECT * FROM streams WHERE id = ? AND type = 'series'").get(seriesId);
      if (!series) return res.status(404).json({ error: 'Series not found' });

      const episodes = db.prepare('SELECT * FROM series_episodes WHERE series_id = ? ORDER BY season_num ASC, episode_num ASC').all(seriesId);
      const episodesBySeason = {};

      episodes.forEach(ep => {
        let sNum = Number(ep.season_num) > 0 ? Number(ep.season_num) : null;
        if (!sNum) {
          const t = `${ep.title || ''}`;
          const m = t.match(/temporada\s*(\d+)|\bt\s*(\d+)\b|\bs0?(\d{1,2})\s*e\s*\d+/i);
          sNum = m ? parseInt(m[1] || m[2] || m[3], 10) : 1;
        }
        if (!episodesBySeason[sNum]) {
          episodesBySeason[sNum] = [];
        }
        episodesBySeason[sNum].push({
          id: ep.id,
          episode_num: ep.episode_num,
          title: ep.title,
          container_extension: 'mp4',
          info: {
            duration_secs: ep.duration_minutes * 60,
          }
        });
      });

      // Temporadas reais (agrupadas a partir dos episódios, deduzindo do título quando season_num é 0/nulo)
      const seasonMap = {};
      episodes.forEach((ep) => {
        let sNum = Number(ep.season_num) > 0 ? Number(ep.season_num) : null;
        if (!sNum) {
          const t = `${ep.title || ''}`;
          const m = t.match(/temporada\s*(\d+)|\bt\s*(\d+)\b|\bs0?(\d{1,2})\s*e\s*\d+/i);
          sNum = m ? parseInt(m[1] || m[2] || m[3], 10) : 1;
        }
        if (!seasonMap[sNum]) seasonMap[sNum] = [];
        seasonMap[sNum].push(ep);
      });

      const seasons = Object.keys(seasonMap)
        .map(Number)
        .sort((a, b) => a - b)
        .map((sNum) => ({
          season_number: sNum,
          name: `Temporada ${sNum}`,
          episode_count: seasonMap[sNum].length,
        }));

      return res.json({
        seasons,
        info: {
          name: series.name,
          cover: series.icon_url,
          plot: series.description,
          rating: series.rating,
          releaseDate: series.release_date,
        },
        episodes: episodesBySeason,
      });
    }

    case 'get_short_epg': {
      const streamId = req.query.stream_id;
      const programs = db.prepare('SELECT * FROM epg_programs WHERE stream_id = ? ORDER BY start_time ASC').all(streamId);
      return res.json({
        epg_listings: programs.map(p => ({
          id: String(p.id),
          title: p.title,
          start: p.start_time,
          end: p.end_time,
          description: p.description,
        }))
      });
    }

    default:
      return res.json([]);
  }
});

// ==========================================
// 2. M3U PLUS PLAYLIST EXPORT (/get.php)
// ==========================================
router.get('/get.php', (req, res) => {
  const { username, password } = req.query;
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  const auth = authenticateClient(username, password, clientIp);
  if (auth.error) {
    return res.status(401).send(`#EXTM3U\n#EXTINF:-1, ERRO: ${auth.error}`);
  }

  const serverDomainRow = db.prepare("SELECT value FROM system_settings WHERE key = 'server_domain'").get();
  const serverDomain = (serverDomainRow && serverDomainRow.value) || 'http://localhost:5000';

  let playlist = '#EXTM3U url-tvg="' + serverDomain + '/xmltv.php"\n';

  // Fetch all active streams
  const streams = db.prepare(`
    SELECT s.*, c.name as category_name 
    FROM streams s 
    LEFT JOIN categories c ON s.category_id = c.id 
    WHERE s.status = 'online'
    ORDER BY s.type ASC, s.id ASC
  `).all();

  streams.forEach((stream) => {
    const catName = stream.category_name || (stream.type === 'live' ? 'Canais Ao Vivo' : 'Filmes');
    const logo = stream.icon_url || '';
    const tvgId = stream.epg_channel_id || '';

    let streamPlayUrl = '';
    if (stream.type === 'live') {
      streamPlayUrl = `${serverDomain}/live/${username}/${password}/${stream.id}.m3u8`;
    } else if (stream.type === 'movie') {
      streamPlayUrl = `${serverDomain}/movie/${username}/${password}/${stream.id}.mp4`;
    } else {
      streamPlayUrl = `${serverDomain}/series/${username}/${password}/${stream.id}.mp4`;
    }

    playlist += `#EXTINF:-1 tvg-id="${tvgId}" tvg-name="${stream.name}" tvg-logo="${logo}" group-title="${catName}",${stream.name}\n`;
    playlist += `${streamPlayUrl}\n`;
  });

  res.setHeader('Content-Type', 'audio/x-mpegurl');
  res.setHeader('Content-Disposition', 'attachment; filename="playlist.m3u"');
  res.send(playlist);
});

// ==========================================
// 3. XMLTV EPG EXPORT (/xmltv.php)
// ==========================================
router.get('/xmltv.php', (req, res) => {
  const streams = db.prepare("SELECT id, name, epg_channel_id, icon_url FROM streams WHERE type = 'live' AND epg_channel_id IS NOT NULL").all();
  const programs = db.prepare('SELECT p.*, s.epg_channel_id FROM epg_programs p JOIN streams s ON p.stream_id = s.id').all();

  let xml = '<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE tv SYSTEM "xmltv.dtd">\n<tv generator-info-name="IPTV-Nexus-EPG">\n';

  streams.forEach(s => {
    xml += `  <channel id="${s.epg_channel_id}">\n`;
    xml += `    <display-name>${s.name}</display-name>\n`;
    if (s.icon_url) {
      xml += `    <icon src="${s.icon_url}" />\n`;
    }
    xml += `  </channel>\n`;
  });

  programs.forEach(p => {
    // Format: YYYYMMDDHHMMSS +0000
    const formatTime = (iso) => {
      const d = new Date(iso);
      return d.toISOString().replace(/[-:T]/g, '').slice(0, 14) + ' +0000';
    };
    xml += `  <programme start="${formatTime(p.start_time)}" stop="${formatTime(p.end_time)}" channel="${p.epg_channel_id}">\n`;
    xml += `    <title lang="pt">${p.title}</title>\n`;
    if (p.description) {
      xml += `    <desc lang="pt">${p.description}</desc>\n`;
    }
    xml += `  </programme>\n`;
  });

  xml += '</tv>';

  res.setHeader('Content-Type', 'application/xml');
  res.send(xml);
});

// ==========================================
// 4. STREAM GATEWAY (LIVE / VOD)
// ==========================================
router.get('/live/:username/:password/:streamId', (req, res) => {
  const { username, password, streamId } = req.params;
  const cleanStreamId = streamId.replace(/\.(m3u8|ts)$/, '');
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'IPTV Player';

  const auth = authenticateClient(username, password, clientIp);
  if (auth.error) {
    return res.status(403).json({ error: auth.error });
  }

  const user = auth.user;

  // Check simultaneous screens
  if (!ConnectionManager.canUserConnect(user.id, user.max_connections)) {
    return res.status(429).json({ error: 'Limite de telas simultâneas excedido para esta conta.' });
  }

  const stream = db.prepare('SELECT * FROM streams WHERE id = ?').get(cleanStreamId);
  if (!stream || !stream.stream_url) {
    return res.status(404).send('Stream offline ou não encontrado.');
  }

  // Register connection
  ConnectionManager.registerConnection({
    userId: user.id,
    streamId: stream.id,
    ipAddress: clientIp,
    userAgent,
    deviceType: 'External App / Smarters',
  });

      // Redirect to stream source via proxy (avoids mixed content on HTTPS)
  if (/^http:\/\//i.test(stream.stream_url)) {
    const proxyUrl = '/media/proxy?src=' + encodeURIComponent(stream.stream_url);
    return res.redirect(proxyUrl);
  }
  res.redirect(stream.stream_url);
});

router.get('/movie/:username/:password/:streamId', (req, res) => {
  const { username, password, streamId } = req.params;
  const cleanStreamId = streamId.replace(/\.(mp4|mkv)$/, '');
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'IPTV Player';

  const auth = authenticateClient(username, password, clientIp);
  if (auth.error) return res.status(403).json({ error: auth.error });

  const stream = db.prepare('SELECT * FROM streams WHERE id = ?').get(cleanStreamId);
  if (!stream || !stream.stream_url) return res.status(404).send('Filme não encontrado.');

  ConnectionManager.registerConnection({
    userId: auth.user.id,
    streamId: stream.id,
    ipAddress: clientIp,
    userAgent,
    deviceType: 'VOD Player',
  });

    // Redirect via proxy if http (avoids mixed content on HTTPS)
  if (/^http:\/\//i.test(stream.stream_url)) {
    const proxyUrl = '/media/proxy?src=' + encodeURIComponent(stream.stream_url);
    return res.redirect(proxyUrl);
  }
  res.redirect(stream.stream_url);
});

// Episódios de séries
router.get('/series/:username/:password/:episodeId', (req, res) => {
  const { username, password, episodeId } = req.params;
  const cleanEpId = episodeId.replace(/\.(mp4|mkv|m3u8)$/, '');
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;
  const userAgent = req.headers['user-agent'] || 'IPTV Player';

  const auth = authenticateClient(username, password, clientIp);
  if (auth.error) return res.status(403).json({ error: auth.error });

  // Check episode table first, then streams table
  let ep = db.prepare('SELECT * FROM series_episodes WHERE id = ?').get(cleanEpId);
  let playUrl = ep ? ep.stream_url : null;

  if (!playUrl) {
    const stream = db.prepare('SELECT * FROM streams WHERE id = ?').get(cleanEpId);
    if (stream) playUrl = stream.stream_url;
  }

  if (!playUrl) return res.status(404).send('Episódio não encontrado.');

  ConnectionManager.registerConnection({
    userId: auth.user.id,
    streamId: cleanEpId,
    ipAddress: clientIp,
    userAgent,
    deviceType: 'Series VOD Player',
  });

    // Redirect via proxy if http (avoids mixed content on HTTPS)
  if (/^http:\/\//i.test(playUrl)) {
    const proxyUrl = '/media/proxy?src=' + encodeURIComponent(playUrl);
    return res.redirect(proxyUrl);
  }
  res.redirect(playUrl);
});

module.exports = router;
