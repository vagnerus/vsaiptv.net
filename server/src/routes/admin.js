const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { verifyToken, requireRole } = require('../middleware/auth');
const ConnectionManager = require('../services/connectionManager');

// Enforce Master role for all routes in this file
router.use(verifyToken, requireRole('master'));

// ==========================================
// 1. TELEMETRY & SYSTEM MONITORING
// ==========================================
router.get('/telemetry', (req, res) => {
  const stats = ConnectionManager.getTelemetryStats();
  res.json(stats);
});

router.get('/connections', (req, res) => {
  const connections = ConnectionManager.getActiveConnections();
  res.json(connections);
});

router.delete('/connections/:id', (req, res) => {
  const { id } = req.params;
  ConnectionManager.killConnectionById(id);
  res.json({ success: true, message: 'Conexão encerrada com sucesso.' });
});

// ==========================================
// 2. RESELLERS MANAGEMENT
// ==========================================
router.get('/resellers', (req, res) => {
  const resellers = db.prepare(`
    SELECT 
      u.id, u.username, u.plain_password, u.name, u.email, u.phone, 
      u.credits, u.max_connections, u.status, u.created_at, u.notes,
      (SELECT COUNT(*) FROM users c WHERE c.reseller_id = u.id AND c.role = 'client') as total_clients,
      (SELECT COUNT(*) FROM users c WHERE c.reseller_id = u.id AND c.status = 'active') as active_clients
    FROM users u
    WHERE u.role = 'reseller'
    ORDER BY u.created_at DESC
  `).all();

  res.json(resellers);
});

router.post('/resellers', (req, res) => {
  const { username, password, name, email, phone, credits = 0, notes } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
  if (existing) {
    return res.status(400).json({ error: 'Este nome de usuário já está em uso.' });
  }

  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(password, salt);
  const initialCredits = parseFloat(credits) || 0;

  const result = db.prepare(`
    INSERT INTO users (username, password_hash, plain_password, role, name, email, phone, credits, status, notes)
    VALUES (?, ?, ?, 'reseller', ?, ?, ?, ?, 'active', ?)
  `).run(username.trim(), hash, password, name, email, phone, initialCredits, notes);

  const resellerId = result.lastInsertRowid;

  if (initialCredits > 0) {
    db.prepare(`
      INSERT INTO credit_transactions (reseller_id, amount, balance_after, reason)
      VALUES (?, ?, ?, ?)
    `).run(resellerId, initialCredits, initialCredits, 'Crédito inicial atribuído pelo Administrador Master');
  }

  db.prepare('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)').run(
    req.user.id,
    'CREATE_RESELLER',
    `Criou o revendedor ${username} com ${initialCredits} créditos.`
  );

  res.status(201).json({ success: true, message: 'Revendedor criado com sucesso!', id: resellerId });
});

router.put('/resellers/:id', (req, res) => {
  const { id } = req.params;
  const { name, email, phone, status, password, notes } = req.body;

  const reseller = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'reseller'").get(id);
  if (!reseller) {
    return res.status(404).json({ error: 'Revendedor não encontrado.' });
  }

  if (password && password.trim().length > 0) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);
    db.prepare(`
      UPDATE users 
      SET name = ?, email = ?, phone = ?, status = ?, password_hash = ?, plain_password = ?, notes = ?
      WHERE id = ?
    `).run(name, email, phone, status, hash, password, notes, id);
  } else {
    db.prepare(`
      UPDATE users 
      SET name = ?, email = ?, phone = ?, status = ?, notes = ?
      WHERE id = ?
    `).run(name, email, phone, status, notes, id);
  }

  res.json({ success: true, message: 'Dados do revendedor atualizados com sucesso.' });
});

// Recharge / Adjust Reseller Credits
router.post('/resellers/:id/credits', (req, res) => {
  const { id } = req.params;
  const { amount, reason } = req.body;

  const numAmount = parseFloat(amount);
  if (isNaN(numAmount) || numAmount === 0) {
    return res.status(400).json({ error: 'Valor de créditos inválido.' });
  }

  const reseller = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'reseller'").get(id);
  if (!reseller) {
    return res.status(404).json({ error: 'Revendedor não encontrado.' });
  }

  const newBalance = reseller.credits + numAmount;
  if (newBalance < 0) {
    return res.status(400).json({ error: 'O saldo de créditos do revendedor não pode ficar negativo.' });
  }

  db.transaction(() => {
    db.prepare('UPDATE users SET credits = ? WHERE id = ?').run(newBalance, id);
    db.prepare(`
      INSERT INTO credit_transactions (reseller_id, amount, balance_after, reason)
      VALUES (?, ?, ?, ?)
    `).run(id, numAmount, newBalance, reason || (numAmount > 0 ? 'Recarga Master' : 'Ajuste Master'));

    db.prepare('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)').run(
      req.user.id,
      'UPDATE_CREDITS',
      `${numAmount > 0 ? 'Adicionou' : 'Removeu'} ${Math.abs(numAmount)} créditos de ${reseller.username}. Novo saldo: ${newBalance}`
    );
  })();

  res.json({ success: true, message: 'Créditos atualizados com sucesso!', balance: newBalance });
});

router.delete('/resellers/:id', (req, res) => {
  const { id } = req.params;
  db.prepare("DELETE FROM users WHERE id = ? AND role = 'reseller'").run(id);
  res.json({ success: true, message: 'Revendedor excluído com sucesso.' });
});

// ==========================================
// 3. GLOBAL CLIENTS & TRANSFER
// ==========================================
router.get('/clients', (req, res) => {
  const clients = db.prepare(`
    SELECT 
      c.id, c.username, c.plain_password, c.name, c.email, c.phone, 
      c.reseller_id, r.username as reseller_username, r.name as reseller_name,
      c.max_connections, c.status, c.is_trial, c.trial_hours, c.expires_at, 
      c.created_at, c.notes,
      (SELECT COUNT(*) FROM active_connections ac WHERE ac.user_id = c.id) as active_screens
    FROM users c
    LEFT JOIN users r ON c.reseller_id = r.id
    WHERE c.role = 'client'
    ORDER BY c.created_at DESC
  `).all();

  res.json(clients);
});

// Transfer client to another reseller
router.post('/clients/transfer', (req, res) => {
  const { clientId, targetResellerId } = req.body;

  const client = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'client'").get(clientId);
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado.' });
  }

  const targetReseller = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'reseller'").get(targetResellerId);
  if (!targetReseller) {
    return res.status(404).json({ error: 'Revendedor de destino não encontrado.' });
  }

  db.prepare('UPDATE users SET reseller_id = ? WHERE id = ?').run(targetResellerId, clientId);

  db.prepare('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)').run(
    req.user.id,
    'TRANSFER_CLIENT',
    `Transferiu cliente ${client.username} para o revendedor ${targetReseller.username}`
  );

  res.json({ success: true, message: `Cliente ${client.username} transferido para ${targetReseller.username} com sucesso!` });
});

router.delete('/clients/:id', (req, res) => {
  const { id } = req.params;
  db.prepare("DELETE FROM users WHERE id = ? AND role = 'client'").run(id);
  res.json({ success: true, message: 'Cliente excluído com sucesso.' });
});

// ==========================================
// 4. CONTENT / STREAMS / VOD / CATEGORIES
// ==========================================
router.get('/categories', (req, res) => {
  const categories = db.prepare(`
    SELECT c.*, (SELECT COUNT(*) FROM streams s WHERE s.category_id = c.id) as streams_count
    FROM categories c
    ORDER BY c.order_num ASC, c.name ASC
  `).all();
  res.json(categories);
});

router.post('/categories', (req, res) => {
  const { name, type, order_num = 0 } = req.body;
  if (!name || !type) {
    return res.status(400).json({ error: 'Nome e tipo são obrigatórios.' });
  }
  const result = db.prepare('INSERT INTO categories (name, type, order_num) VALUES (?, ?, ?)').run(name, type, order_num);
  res.status(201).json({ success: true, id: result.lastInsertRowid });
});

router.put('/categories/:id', (req, res) => {
  const { id } = req.params;
  const { name, type, order_num } = req.body;
  db.prepare('UPDATE categories SET name = ?, type = ?, order_num = ? WHERE id = ?').run(name, type, order_num, id);
  res.json({ success: true });
});

router.delete('/categories/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM categories WHERE id = ?').run(id);
  res.json({ success: true });
});

router.get('/streams', (req, res) => {
  const { type, category_id } = req.query;
  let query = `
    SELECT s.*, c.name as category_name 
    FROM streams s 
    LEFT JOIN categories c ON s.category_id = c.id
    WHERE 1=1
  `;
  const params = [];

  if (type) {
    query += ' AND s.type = ?';
    params.push(type);
  }
  if (category_id) {
    query += ' AND s.category_id = ?';
    params.push(category_id);
  }

  query += ' ORDER BY s.id DESC';
  const streams = db.prepare(query).all(...params);
  res.json(streams);
});

router.post('/streams', (req, res) => {
  const { name, category_id, type, stream_url, icon_url, poster_url, description, rating, release_date } = req.body;
  if (!name || !type) {
    return res.status(400).json({ error: 'Nome e tipo de conteúdo são obrigatórios.' });
  }

  const result = db.prepare(`
    INSERT INTO streams (name, category_id, type, stream_url, icon_url, poster_url, description, rating, release_date, status)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'online')
  `).run(name, category_id || null, type, stream_url || '', icon_url || '', poster_url || '', description || '', rating || '8.5', release_date || '2024');

  res.status(201).json({ success: true, id: result.lastInsertRowid });
});

router.put('/streams/:id', (req, res) => {
  const { id } = req.params;
  const { name, category_id, type, stream_url, icon_url, poster_url, description, rating, release_date, status } = req.body;

  db.prepare(`
    UPDATE streams 
    SET name = ?, category_id = ?, type = ?, stream_url = ?, icon_url = ?, poster_url = ?, description = ?, rating = ?, release_date = ?, status = ?
    WHERE id = ?
  `).run(name, category_id, type, stream_url, icon_url, poster_url, description, rating, release_date, status || 'online', id);

  res.json({ success: true });
});

router.delete('/streams/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM streams WHERE id = ?').run(id);
  res.json({ success: true });
});

// Import M3U Playlist in Bulk
router.post('/streams/import-m3u', (req, res) => {
  const { m3uContent, defaultCategoryId } = req.body;
  if (!m3uContent) {
    return res.status(400).json({ error: 'Conteúdo M3U vazio.' });
  }

  const lines = m3uContent.split(/\r?\n/);
  let importedCount = 0;
  let currentInfo = null;

  const insertStmt = db.prepare(`
    INSERT INTO streams (name, category_id, type, stream_url, icon_url, epg_channel_id, status)
    VALUES (?, ?, 'live', ?, ?, ?, 'online')
  `);

  db.transaction(() => {
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (line.startsWith('#EXTINF:')) {
        const logoMatch = line.match(/tvg-logo="([^"]*)"/i);
        const nameMatch = line.match(/,(.*)$/);
        const tvgIdMatch = line.match(/tvg-id="([^"]*)"/i);

        currentInfo = {
          name: nameMatch ? nameMatch[1].trim() : 'Canal Importado',
          icon_url: logoMatch ? logoMatch[1] : '',
          epg_channel_id: tvgIdMatch ? tvgIdMatch[1] : '',
        };
      } else if (line.length > 0 && !line.startsWith('#') && currentInfo) {
        insertStmt.run(
          currentInfo.name,
          defaultCategoryId || null,
          line,
          currentInfo.icon_url,
          currentInfo.epg_channel_id
        );
        importedCount++;
        currentInfo = null;
      }
    }
  })();

  res.json({ success: true, message: `${importedCount} canais importados com sucesso!`, count: importedCount });
});

// ==========================================
// 5. FIREWALL & SECURITY
// ==========================================
router.get('/firewall', (req, res) => {
  const rules = db.prepare('SELECT * FROM firewall_rules ORDER BY created_at DESC').all();
  res.json(rules);
});

router.post('/firewall', (req, res) => {
  const { ip_address, reason, rule_type = 'block' } = req.body;
  if (!ip_address) {
    return res.status(400).json({ error: 'Endereço IP é obrigatório.' });
  }

  try {
    db.prepare('INSERT INTO firewall_rules (ip_address, rule_type, reason) VALUES (?, ?, ?)').run(
      ip_address.trim(),
      rule_type,
      reason || 'Bloqueio administrativo'
    );
    res.status(201).json({ success: true, message: `IP ${ip_address} adicionado ao firewall.` });
  } catch (err) {
    res.status(400).json({ error: 'IP já cadastrado no firewall.' });
  }
});

router.delete('/firewall/:id', (req, res) => {
  const { id } = req.params;
  db.prepare('DELETE FROM firewall_rules WHERE id = ?').run(id);
  res.json({ success: true, message: 'Regra removida.' });
});

// ==========================================
// 6. REPORTS, TRANSACTIONS & AUDIT LOGS
// ==========================================
router.get('/reports', (req, res) => {
  const transactions = db.prepare(`
    SELECT ct.*, u.username as reseller_username, u.name as reseller_name
    FROM credit_transactions ct
    JOIN users u ON ct.reseller_id = u.id
    ORDER BY ct.created_at DESC
    LIMIT 100
  `).all();

  const totalCreditsInCirculation = db.prepare("SELECT SUM(credits) as total FROM users WHERE role = 'reseller'").get().total || 0;
  const totalActiveClients = db.prepare("SELECT COUNT(*) as total FROM users WHERE role = 'client' AND status = 'active'").get().total || 0;
  const totalTrialsGenerated = db.prepare("SELECT COUNT(*) as total FROM users WHERE role = 'client' AND is_trial = 1").get().total || 0;

  res.json({
    totalCreditsInCirculation,
    totalActiveClients,
    totalTrialsGenerated,
    recentTransactions: transactions,
  });
});

router.get('/audit-logs', (req, res) => {
  const logs = db.prepare(`
    SELECT al.*, u.username, u.role
    FROM audit_logs al
    LEFT JOIN users u ON al.user_id = u.id
    ORDER BY al.created_at DESC
    LIMIT 100
  `).all();
  res.json(logs);
});

// ==========================================
// 7. SYSTEM SETTINGS
// ==========================================
router.get('/settings', (req, res) => {
  const rows = db.prepare('SELECT * FROM system_settings').all();
  const settings = {};
  rows.forEach(r => { settings[r.key] = r.value; });
  res.json(settings);
});

router.put('/settings', (req, res) => {
  const settings = req.body;
  const updateStmt = db.prepare('INSERT OR REPLACE INTO system_settings (key, value) VALUES (?, ?)');

  db.transaction(() => {
    for (const [k, v] of Object.entries(settings)) {
      updateStmt.run(k, String(v));
    }
  })();

  res.json({ success: true, message: 'Configurações atualizadas com sucesso!' });
});

module.exports = router;
