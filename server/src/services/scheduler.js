const db = require('../db/database');
const { syncAllChannels } = require('./channelListSyncService');

function startScheduler() {
  console.log('⏰ Starting background task scheduler (Expiration, Audit & Channel Auto-Sync worker)...');

  const checkExpirations = () => {
    try {
      const now = new Date().toISOString();

      // Find accounts that should expire
      const expiredUsers = db.prepare(`
        SELECT id, username, role, is_trial, expires_at 
        FROM users 
        WHERE status = 'active' 
          AND expires_at IS NOT NULL 
          AND expires_at < ?
      `).all(now);

      if (expiredUsers.length > 0) {
        console.log(`[Scheduler] Expiring ${expiredUsers.length} account(s)...`);
        const updateStmt = db.prepare("UPDATE users SET status = 'expired' WHERE id = ?");
        const deleteConnStmt = db.prepare("DELETE FROM active_connections WHERE user_id = ?");

        db.transaction(() => {
          for (const u of expiredUsers) {
            updateStmt.run(u.id);
            deleteConnStmt.run(u.id);
            console.log(`[Scheduler] User ${u.username} (${u.is_trial ? 'Trial' : 'Subscription'}) expired.`);
          }
        })();
      }

      // Cleanup stale connections older than 60 seconds
      const cutoff = new Date(Date.now() - 60000).toISOString();
      db.prepare('DELETE FROM active_connections WHERE last_ping_at < ?').run(cutoff);
    } catch (err) {
      console.error('[Scheduler] Error in expiration check:', err.message);
    }
  };

  // Run immediately and every 30 seconds
  checkExpirations();
  setInterval(checkExpirations, 30000);

  // Sincronização automática contínua de canais da web a cada 24 horas (primeira após 2 minutos de boot)
  const runAutoChannelSync = () => {
    console.log('📡 [Scheduler] Disparando auto-sincronização periódica de canais via Web...');
    syncAllChannels({ apply: true })
      .then((res) => {
        if (res.ok) {
          console.log(`📡 [Scheduler] Auto-sincronização concluída: ${res.report.totalAtivos} streams ativos.`);
        } else {
          console.warn(`📡 [Scheduler] Aviso na auto-sincronização:`, res.message || res.error);
        }
      })
      .catch((err) => {
        console.error('📡 [Scheduler] Erro na auto-sincronização de canais:', err.message);
      });
  };

  setTimeout(runAutoChannelSync, 2 * 60 * 1000); // 2 minutos após o boot
  setInterval(runAutoChannelSync, 24 * 60 * 60 * 1000); // A cada 24 horas
}

module.exports = { startScheduler };
