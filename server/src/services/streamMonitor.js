const db = require('../db/database');

class StreamMonitor {
  constructor() {
    this.isScanning = false;
    this.shouldCancel = false;
    this.concurrency = 4;
    this.scanStats = {
      total: 0,
      checked: 0,
      online: 0,
      unstable: 0,
      offline: 0,
      currentStream: '',
      startTime: null,
      endTime: null
    };
  }

  getScanStatus() {
    return {
      isScanning: this.isScanning,
      ...this.scanStats,
      progressPct: this.scanStats.total > 0 
        ? Math.round((this.scanStats.checked / this.scanStats.total) * 100) 
        : 0
    };
  }

  cancelScan() {
    if (this.isScanning) {
      this.shouldCancel = true;
      return { success: true, message: 'Cancelamento do monitor de streams solicitado.' };
    }
    return { success: false, message: 'Nenhuma varredura em andamento.' };
  }

  /**
   * Test a single stream URL with controlled timeout and minimal byte transfer
   */
  async checkStream(streamUrl) {
    if (!streamUrl || typeof streamUrl !== 'string' || !streamUrl.startsWith('http')) {
      return { status: 'offline', error: 'INVALID_URL', latency: 0 };
    }

    const startTime = Date.now();
    try {
      const isHls = streamUrl.includes('.m3u8');
      const headers = {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36 VSAIPTV/1.0',
        'Accept': '*/*'
      };

      if (isHls) {
        headers['Range'] = 'bytes=0-2048';
      }

      const response = await fetch(streamUrl, {
        method: 'GET',
        headers,
        signal: AbortSignal.timeout(6000),
        redirect: 'follow'
      });

      const latency = Date.now() - startTime;
      const statusCode = response.status;

      if (statusCode === 200 || statusCode === 206) {
        if (isHls) {
          const text = await response.text();
          if (!text.includes('#EXTM3U')) {
            return { status: 'unstable', error: 'INVALID_MANIFEST', latency };
          }
        }
        const status = latency > 3000 ? 'unstable' : 'online';
        return { status, error: null, latency };
      }

      if (statusCode === 401 || statusCode === 403) {
        return { status: 'offline', error: `AUTH_EXPIRED_${statusCode}`, latency };
      }

      if (statusCode === 404) {
        return { status: 'offline', error: 'STREAM_404', latency };
      }

      if (statusCode >= 500) {
        return { status: 'unstable', error: `SERVER_ERROR_${statusCode}`, latency };
      }

      return { status: 'offline', error: `HTTP_${statusCode}`, latency };
    } catch (err) {
      const latency = Date.now() - startTime;
      const name = err.name || 'Error';
      const msg = err.message || '';

      if (name === 'TimeoutError' || msg.includes('timeout') || msg.includes('aborted')) {
        return { status: 'offline', error: 'TIMEOUT', latency };
      }
      if (msg.includes('ENOTFOUND') || msg.includes('getaddrinfo')) {
        return { status: 'offline', error: 'DNS_FAILED', latency };
      }
      if (msg.includes('ECONNREFUSED')) {
        return { status: 'offline', error: 'CONN_REFUSED', latency };
      }

      return { status: 'offline', error: name, latency };
    }
  }

  /**
   * Start background stream verification queue
   */
  async startScan({ type = 'live', limit = 500, categoryId = null, brokenOnly = false } = {}) {
    if (this.isScanning) {
      return { success: false, message: 'Uma verificação de streams já está em andamento.' };
    }

    this.isScanning = true;
    this.shouldCancel = false;

    // Fetch candidate streams
    let query = `
      SELECT id, name, stream_url, type, health_status 
      FROM streams 
      WHERE 1=1
    `;
    const params = [];

    if (type && type !== 'all') {
      query += ` AND type = ?`;
      params.push(type);
    }

    if (categoryId) {
      query += ` AND category_id = ?`;
      params.push(categoryId);
    }

    if (brokenOnly) {
      query += ` AND (health_status = 'offline' OR health_status = 'unstable')`;
    }

    query += ` ORDER BY health_last_checked ASC NULLS FIRST LIMIT ?`;
    params.push(Math.min(limit, 5000));

    const streams = db.prepare(query).all(...params);

    this.scanStats = {
      total: streams.length,
      checked: 0,
      online: 0,
      unstable: 0,
      offline: 0,
      currentStream: '',
      startTime: new Date().toISOString(),
      endTime: null
    };

    // Run async queue without blocking response
    this.runQueue(streams);

    return {
      success: true,
      message: `Verificação iniciada para ${streams.length} streams.`,
      total: streams.length
    };
  }

  async runQueue(streams) {
    const updateStmt = db.prepare(`
      UPDATE streams 
      SET 
        health_status = ?,
        health_latency_ms = ?,
        health_last_checked = CURRENT_TIMESTAMP,
        health_error_type = ?,
        health_attempts = health_attempts + 1
      WHERE id = ?
    `);

    let index = 0;

    const worker = async () => {
      while (index < streams.length && !this.shouldCancel) {
        const stream = streams[index++];
        if (!stream) break;

        this.scanStats.currentStream = stream.name;
        const result = await this.checkStream(stream.stream_url);

        try {
          updateStmt.run(result.status, result.latency, result.error, stream.id);
        } catch (e) {
          console.error(`Error saving health for stream ${stream.id}:`, e);
        }

        this.scanStats.checked++;
        if (result.status === 'online') this.scanStats.online++;
        else if (result.status === 'unstable') this.scanStats.unstable++;
        else if (result.status === 'offline') this.scanStats.offline++;

        // Rate limiting between checks: 150ms delay
        await new Promise((r) => setTimeout(r, 150));
      }
    };

    const workers = [];
    for (let i = 0; i < this.concurrency; i++) {
      workers.push(worker());
    }

    await Promise.all(workers);

    this.isScanning = false;
    this.scanStats.endTime = new Date().toISOString();
  }
}

module.exports = new StreamMonitor();
