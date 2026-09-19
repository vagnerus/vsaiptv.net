const http = require('http');
const https = require('https');
const zlib = require('zlib');

// Pool de alta performance para suportar dezenas/centenas de conexões concorrentes
const httpAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 500,
  maxFreeSockets: 100,
  timeout: 60000
});

const httpsAgent = new https.Agent({
  keepAlive: true,
  keepAliveMsecs: 30000,
  maxSockets: 500,
  maxFreeSockets: 100,
  timeout: 60000
});

// As validações de destino e DNS são obrigatórias e vêm do servidor.
module.exports = function createStreamProxy({ isBlockedTarget, safeDnsLookup, isHlsPlaylistResponse, rewriteHlsPlaylist, timeoutMs = 15000, maxPlaylistBytes = 2 * 1024 * 1024 }) {
  return function streamProxy(target, headers, res, hops = 0) {
    if (res.destroyed || res.writableEnded) return;
    const fail = (status, error) => {
      if (res.destroyed || res.writableEnded) return;
      if (res.headersSent) { res.destroy(); return; }
      res.setHeader('Access-Control-Allow-Origin', '*');
      res.setHeader('Access-Control-Allow-Headers', '*');
      res.setHeader('Access-Control-Allow-Methods', 'GET, HEAD, OPTIONS');
      res.status(status).json({ error });
    };
    if (hops > 6) return fail(502, 'Muitos redirecionamentos na origem.');
    if (isBlockedTarget(target.href)) return fail(403, 'Destino bloqueado por segurança.');
    const outgoing = { ...headers };
    if (/\.m3u8(\?|$)/i.test(target.href)) delete outgoing.range;
    // Não inventa Range para fluxos ao vivo; preserva o Range enviado pelo player.
    const mod = target.protocol === 'https:' ? https : http;
    const agent = target.protocol === 'https:' ? httpsAgent : httpAgent;
    let upstream;
    let deadline;
    const cleanup = () => {
      clearTimeout(deadline);
      res.removeListener('close', cancel);
    };
    const cancel = () => { req.destroy(); if (upstream) upstream.destroy(); cleanup(); };
    const req = mod.get(target, { headers: outgoing, family: 4, lookup: safeDnsLookup, agent }, (up) => {
      upstream = up;
      if ([301, 302, 303, 307, 308].includes(up.statusCode) && up.headers.location) {
        cleanup();
        up.destroy();
        try {
          const next = new URL(up.headers.location, target);
          if (isBlockedTarget(next.href)) return fail(403, 'Redirecionamento bloqueado por segurança.');
          return streamProxy(next, headers, res, hops + 1);
        } catch { return fail(502, 'Redirecionamento inválido.'); }
      }

      // Fallback adaptativo de User-Agent: se a origem recusar (401/403) com o UA padrão, tenta como navegador Chrome
      const chromeUA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';
      if ((up.statusCode === 401 || up.statusCode === 403) && hops === 0 && outgoing['user-agent'] !== chromeUA) {
        cleanup();
        up.destroy();
        const retryHeaders = { ...headers, 'user-agent': chromeUA };
        return streamProxy(target, retryHeaders, res, 1);
      }

      // Resiliência adaptativa a limites temporários de taxa na fonte (HTTP 429 upstream)
      if (up.statusCode === 429 && hops < 3) {
        cleanup();
        up.destroy();
        const backoffMs = 300 * (hops + 1) + Math.floor(Math.random() * 250);
        return setTimeout(() => {
          streamProxy(target, headers, res, hops + 1);
        }, backoffMs);
      }

      // Nunca repassa HTML de login/erro ou dados sensíveis da origem.
      if (up.statusCode < 200 || up.statusCode >= 300) {
        const status = up.statusCode;
        const message = status === 401 || status === 403
          ? 'A fonte recusou o acesso. Verifique a autorização com o fornecedor.'
          : status === 404 || status === 410
            ? 'Transmissão não encontrada na fonte. Atualize a URL autorizada.'
            : 'A fonte não conseguiu fornecer a transmissão.';
        cleanup(); up.destroy();
        return fail(status >= 400 && status <= 599 ? status : 502, message);
      }
      const contentType = String(up.headers['content-type'] || '').toLowerCase();
      if (/text\/html|application\/(?:json|xhtml\+xml)/i.test(contentType)) {
        cleanup(); up.destroy();
        return fail(502, 'A fonte retornou uma página ou dados inválidos em vez de mídia.');
      }
      const out = {
        'cache-control': 'no-store',
        'access-control-allow-origin': '*',
        'access-control-allow-headers': '*',
        'access-control-allow-methods': 'GET, HEAD, OPTIONS',
      };
      ['content-type', 'content-length', 'content-range', 'accept-ranges'].forEach(k => {
        if (up.headers[k]) out[k] = up.headers[k];
      });
      up.on('error', () => { cleanup(); fail(502, 'A conexão com a fonte foi interrompida.'); });
      if (isHlsPlaylistResponse(target, up.headers)) {
        const chunks = [];
        let bytes = 0;
        up.on('data', chunk => {
          bytes += chunk.length;
          if (bytes > maxPlaylistBytes) {
            cleanup(); up.destroy();
            fail(502, 'Playlist acima do limite permitido.');
          } else chunks.push(chunk);
        });
        up.on('end', () => {
          cleanup();
          if (res.destroyed || res.writableEnded) return;
          let rawBuf = Buffer.concat(chunks);
          const enc = String(up.headers['content-encoding'] || '').toLowerCase();
          if (enc.includes('gzip')) {
            try { rawBuf = zlib.gunzipSync(rawBuf); } catch (e) {}
          } else if (enc.includes('deflate')) {
            try { rawBuf = zlib.inflateSync(rawBuf); } catch (e) {}
          } else if (enc.includes('br')) {
            try { rawBuf = zlib.brotliDecompressSync(rawBuf); } catch (e) {}
          }
          const body = rawBuf.toString('utf8').replace(/^\uFEFF/, '').trim();
          if (!/#EXTM3U/i.test(body.slice(0, 300))) return fail(502, 'A fonte não retornou uma playlist HLS válida.');
          delete out['content-length'];
          delete out['content-range'];
          delete out['content-encoding'];
          out['content-type'] = 'application/vnd.apple.mpegurl; charset=utf-8';
          res.writeHead(up.statusCode, out);
          res.end(rewriteHlsPlaylist(body, target));
        });
      } else {
        // Fluxos contínuos não têm duração máxima, apenas limite de inatividade.
        clearTimeout(deadline);
        up.on('end', cleanup);
        res.writeHead(up.statusCode, out);
        up.pipe(res);
      }
    });
    const timedOut = () => { fail(504, 'A fonte demorou demais para responder.'); cancel(); };
    deadline = setTimeout(timedOut, timeoutMs);
    req.setTimeout(timeoutMs, timedOut);
    res.once('close', cancel);
    req.on('error', err => {
      cleanup();
      fail(err.code === 'ERR_SSRF_BLOCKED' ? 403 : 502,
        err.code === 'ERR_SSRF_BLOCKED' ? 'Destino bloqueado por segurança.' : 'Falha ao carregar o fluxo externo.');
    });
  };
};
