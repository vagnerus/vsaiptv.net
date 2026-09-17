const db = require('../db/database');

function startScheduler() {
  console.log('⏰ Starting background task scheduler (Expiration & Audit worker)...');

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
}

module.exports = { startScheduler };
