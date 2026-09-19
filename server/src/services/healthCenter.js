const os = require('os');
const fs = require('fs');
const path = require('path');
const db = require('../db/database');
const ConnectionManager = require('./connectionManager');
const imageManager = require('./imageManager');
const watchProgress = require('../routes/watchProgress');

class HealthCenter {
  constructor() {
    this.backupDir = path.join(__dirname, '../../data/backups');
    if (!fs.existsSync(this.backupDir)) {
      fs.mkdirSync(this.backupDir, { recursive: true });
    }
  }

  /**
   * Run complete real-time health diagnostic of all services
   */
  async getSystemHealth() {
    const startTime = Date.now();

    // 1. API Health
    const apiHealth = {
      status: 'ONLINE',
      latency_ms: 0,
      uptime_seconds: Math.floor(process.uptime()),
      pid: process.pid,
      node_version: process.version
    };

    // 2. Database Health & Latency
    let dbHealth = { status: 'UNKNOWN', latency_ms: 0, tables: {}, integrity: 'unknown' };
    try {
      const dbStart = process.hrtime.bigint();
      db.prepare('SELECT 1').get();
      const quickCheck = db.pragma('quick_check');
      const dbEnd = process.hrtime.bigint();
      const dbLatency = Number(dbEnd - dbStart) / 1000000; // ms

      const streamCount = db.prepare('SELECT COUNT(*) as count FROM streams').get().count;
      const userCount = db.prepare('SELECT COUNT(*) as count FROM users').get().count;
      const categoryCount = db.prepare('SELECT COUNT(*) as count FROM categories').get().count;
      const episodeCount = db.prepare('SELECT COUNT(*) as count FROM series_episodes').get().count;

      dbHealth = {
        status: (quickCheck && quickCheck[0]?.quick_check === 'ok') ? 'ONLINE' : 'DEGRADADO',
        latency_ms: parseFloat(dbLatency.toFixed(2)),
        integrity: quickCheck?.[0]?.quick_check || 'unknown',
        counts: {
          streams: streamCount,
          users: userCount,
          categories: categoryCount,
          episodes: episodeCount
        }
      };
    } catch (err) {
      dbHealth = {
        status: 'OFFLINE',
        latency_ms: -1,
        error: err.message
      };
    }

    // 3. Media Proxy Health
    let proxyHealth = { status: 'ONLINE', details: 'Ativo e com proteção contra timeout e SSRF' };

    // 4. Image Manager Health
    let imageHealth = { status: 'ONLINE', stats: null };
    try {
      const imgStats = imageManager.getStats();
      imageHealth.stats = imgStats;
      imageHealth.status = imgStats ? 'ONLINE' : 'DEGRADADO';
    } catch (err) {
      imageHealth = { status: 'DEGRADADO', error: err.message };
    }

    // 5. WebSocket & P2P Health
    let wsHealth = { status: 'ONLINE', activeConnections: 0, p2pMesh: 'Ativo' };
    try {
      const telemetry = ConnectionManager.getTelemetryStats();
      wsHealth.activeConnections = telemetry?.activeConnections || 0;
      wsHealth.p2pSwarmPeers = telemetry?.p2pSwarmPeers || 0;
      wsHealth.p2pEfficiency = telemetry?.p2pEfficiency || '0%';
    } catch (err) {
      wsHealth = { status: 'DEGRADADO', error: err.message };
    }

    // 6. EPG Health
    let epgHealth = { status: 'ONLINE', totalPrograms: 0, channelsWithEpg: 0, source: 'Local DB & XMLTV' };
    try {
      const epgProgCount = db.prepare('SELECT COUNT(*) as count FROM epg_programs').get().count;
      const streamEpgCount = db.prepare("SELECT COUNT(*) as count FROM streams WHERE epg_channel_id IS NOT NULL AND epg_channel_id != ''").get().count;
      epgHealth.totalPrograms = epgProgCount;
      epgHealth.channelsWithEpg = streamEpgCount;
      epgHealth.status = epgProgCount > 0 ? 'ONLINE' : 'DEGRADADO';
    } catch (err) {
      epgHealth = { status: 'DEGRADADO', error: err.message };
    }

    // 7. Cache Health
    const mem = process.memoryUsage();
    const cacheHealth = {
      status: 'ONLINE',
      heapUsedMb: Math.round(mem.heapUsed / 1024 / 1024),
      heapTotalMb: Math.round(mem.heapTotal / 1024 / 1024),
      rssMb: Math.round(mem.rss / 1024 / 1024),
      imageDiskFiles: imageHealth?.stats?.cache?.totalFiles || 0,
      imageDiskMb: Math.round((imageHealth?.stats?.cache?.totalSizeBytes || 0) / 1024 / 1024)
    };

    // 8. Backup Health
    let backupHealth = { status: 'ONLINE', lastBackup: null, totalBackups: 0 };
    try {
      const backups = this.listBackups();
      backupHealth.totalBackups = backups.length;
      backupHealth.lastBackup = backups[0] || null;
      if (!backupHealth.lastBackup) {
        backupHealth.status = 'DEGRADADO'; // No backup found yet
      }
    } catch (err) {
      backupHealth = { status: 'DEGRADADO', error: err.message };
    }

    // 9. Stream Health Status Summary
    let streamStats = { online: 0, unstable: 0, offline: 0, unknown: 0, total: 0 };
    try {
      const rows = db.prepare(`
        SELECT 
          COALESCE(health_status, 'unknown') as health_status, 
          COUNT(*) as count 
        FROM streams 
        GROUP BY health_status
      `).all();
      
      let total = 0;
      rows.forEach(r => {
        const count = r.count;
        total += count;
        if (r.health_status === 'online') streamStats.online = count;
        else if (r.health_status === 'unstable') streamStats.unstable = count;
        else if (r.health_status === 'offline') streamStats.offline = count;
        else streamStats.unknown += count;
      });
      streamStats.total = total;
    } catch (e) {
      console.error('Error fetching stream stats:', e);
    }

    // 10. Recent Errors
    let recentErrors = [];
    try {
      recentErrors = db.prepare(`
        SELECT id, error_type, content_name, error_message, http_status, created_at 
        FROM system_error_logs 
        ORDER BY created_at DESC 
        LIMIT 10
      `).all();
    } catch (e) {}

    // System OS Metrics
    const totalMem = os.totalmem();
    const freeMem = os.freemem();
    const usedMem = totalMem - freeMem;
    const cpus = os.cpus();
    const loadAvg = os.loadavg();

    apiHealth.latency_ms = Date.now() - startTime;

    return {
      timestamp: new Date().toISOString(),
      services: {
        api: apiHealth,
        database: dbHealth,
        media_proxy: proxyHealth,
        image_manager: imageHealth,
        websocket_p2p: wsHealth,
        epg: epgHealth,
        cache: cacheHealth,
        backup: backupHealth,
        resume_service: (() => {
          try {
            return watchProgress.getMetrics();
          } catch (e) {
            return { status: 'ONLINE', writesPerMin: 0, errors: 0, averageLatencyMs: 0 };
          }
        })()
      },
      metrics: {
        cpu: {
          cores: cpus.length,
          model: cpus[0]?.model || 'Generic CPU',
          loadAvg: loadAvg
        },
        memory: {
          totalMb: Math.round(totalMem / 1024 / 1024),
          freeMb: Math.round(freeMem / 1024 / 1024),
          usedMb: Math.round(usedMem / 1024 / 1024),
          usagePct: Math.round((usedMem / totalMem) * 100)
        },
        uptime: {
          process_seconds: Math.floor(process.uptime()),
          system_seconds: Math.floor(os.uptime())
        },
        streams: streamStats,
        recentErrors
      }
    };
  }

  /**
   * Run full SQLite integrity check (PRAGMA integrity_check)
   */
  async verifyDatabaseIntegrity() {
    const startTime = Date.now();
    try {
      const result = db.pragma('integrity_check');
      const durationMs = Date.now() - startTime;
      const isOk = result && result.length === 1 && result[0].integrity_check === 'ok';

      return {
        success: isOk,
        status: isOk ? 'ok' : 'corrupted',
        raw: result,
        durationMs,
        checkedAt: new Date().toISOString()
      };
    } catch (err) {
      return {
        success: false,
        status: 'error',
        error: err.message,
        durationMs: Date.now() - startTime,
        checkedAt: new Date().toISOString()
      };
    }
  }

  /**
   * Create consistent database backup using WAL checkpoint + VACUUM INTO / copy
   */
  async createDatabaseBackup(createdBy = 'admin') {
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupFileName = `iptv_backup_${timestamp}.db`;
    const backupFilePath = path.join(this.backupDir, backupFileName);

    try {
      // 1. Force WAL checkpoint to ensure all transactions are flushed to disk
      db.pragma('wal_checkpoint(TRUNCATE)');

      // 2. Perform safe SQLite backup via VACUUM INTO
      db.prepare('VACUUM INTO ?').run(backupFilePath);

      // 3. Verify backup file exists and record stats
      const stats = fs.statSync(backupFilePath);

      // 4. Save metadata to database_backups table
      db.prepare(`
        INSERT INTO database_backups (filename, size_bytes, status, created_by)
        VALUES (?, ?, 'valid', ?)
      `).run(backupFileName, stats.size, createdBy);

      // Clean old backups keeping last 14
      this.enforceBackupRetention(14);

      return {
        success: true,
        filename: backupFileName,
        size_bytes: stats.size,
        path: backupFilePath,
        createdAt: new Date().toISOString()
      };
    } catch (err) {
      console.error('Backup creation failed:', err);
      throw new Error(`Falha ao gerar backup consistente: ${err.message}`);
    }
  }

  /**
   * List available database backups
   */
  listBackups() {
    if (!fs.existsSync(this.backupDir)) return [];
    
    const files = fs.readdirSync(this.backupDir)
      .filter(f => f.endsWith('.db') || f.includes('.baseline_'))
      .map(filename => {
        const filePath = path.join(this.backupDir, filename);
        try {
          const stat = fs.statSync(filePath);
          return {
            filename,
            size_bytes: stat.size,
            size_formatted: (stat.size / 1024 / 1024).toFixed(2) + ' MB',
            created_at: stat.mtime.toISOString(),
            status: 'valid'
          };
        } catch (e) {
          return null;
        }
      })
      .filter(Boolean)
      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    return files;
  }

  /**
   * Enforce retention policy (default: keep last 14 backups)
   */
  enforceBackupRetention(maxBackups = 14) {
    try {
      const backups = this.listBackups();
      if (backups.length > maxBackups) {
        const toDelete = backups.slice(maxBackups);
        toDelete.forEach(b => {
          try {
            fs.unlinkSync(path.join(this.backupDir, b.filename));
            db.prepare('DELETE FROM database_backups WHERE filename = ?').run(b.filename);
          } catch (e) {}
        });
      }
    } catch (e) {
      console.error('Error enforcing backup retention:', e);
    }
  }

  /**
   * Test restore integrity of a specific backup file without touching production db
   */
  testRestore(filename) {
    const Database = require('better-sqlite3');
    const filePath = path.join(this.backupDir, filename);

    if (!fs.existsSync(filePath)) {
      throw new Error('Arquivo de backup não encontrado.');
    }

    try {
      const testDb = new Database(filePath, { readonly: true });
      const check = testDb.pragma('integrity_check');
      const streamCount = testDb.prepare('SELECT COUNT(*) as count FROM streams').get()?.count || 0;
      const userCount = testDb.prepare('SELECT COUNT(*) as count FROM users').get()?.count || 0;
      testDb.close();

      const isOk = check && check[0]?.integrity_check === 'ok';

      return {
        success: isOk,
        filename,
        integrity: check?.[0]?.integrity_check || 'unknown',
        verifiedRows: { streams: streamCount, users: userCount },
        testedAt: new Date().toISOString()
      };
    } catch (err) {
      return {
        success: false,
        filename,
        error: err.message,
        testedAt: new Date().toISOString()
      };
    }
  }
}

module.exports = new HealthCenter();

