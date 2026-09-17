const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { verifyToken, requireRole } = require('../middleware/auth');
const ConnectionManager = require('../services/connectionManager');

// Enforce Reseller role
router.use(verifyToken, requireRole('reseller'));

// ==========================================
// 1. RESELLER PROFILE & STATS
// ==========================================
router.get('/profile', (req, res) => {
  const reseller = db.prepare('SELECT id, username, name, email, phone, credits, status FROM users WHERE id = ?').get(req.user.id);
  
  // Reseller client metrics
  const stats = db.prepare(`
    SELECT 
      COUNT(*) as total_clients,
      SUM(CASE WHEN status = 'active' THEN 1 ELSE 0 END) as active_clients,
      SUM(CASE WHEN status = 'expired' THEN 1 ELSE 0 END) as expired_clients,
      SUM(CASE WHEN status = 'suspended' THEN 1 ELSE 0 END) as suspended_clients,
      SUM(CASE WHEN is_trial = 1 AND status = 'active' THEN 1 ELSE 0 END) as active_trials
    FROM users 
    WHERE reseller_id = ? AND role = 'client'
  `).get(req.user.id);

  // Check alert settings
  const alertThresholdRow = db.prepare("SELECT value FROM system_settings WHERE key = 'reseller_min_credits_alert'").get();
  const alertThreshold = alertThresholdRow ? parseFloat(alertThresholdRow.value) : 5.0;
  const isLowCredit = (reseller.credits <= alertThreshold);

  res.json({
    reseller,
    stats,
    isLowCredit,
    alertThreshold,
  });
});

// ==========================================
// 2. RESELLER'S CLIENTS (STRICTLY ISOLATED)
// ==========================================
router.get('/clients', (req, res) => {
  const clients = db.prepare(`
    SELECT 
      c.id, c.username, c.plain_password, c.name, c.email, c.phone, 
      c.max_connections, c.status, c.is_trial, c.trial_hours, c.expires_at, 
      c.created_at, c.notes,
      (SELECT COUNT(*) FROM active_connections ac WHERE ac.user_id = c.id) as active_screens
    FROM users c
    WHERE c.reseller_id = ? AND c.role = 'client'
    ORDER BY c.created_at DESC
  `).all(req.user.id);

  res.json(clients);
});

// Create Official Client (Debits credits)
router.post('/clients', (req, res) => {
  const { username, password, name, email, phone, months = 1, max_connections = 1, notes } = req.body;
  const resellerId = req.user.id;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE username = ?').get(username.trim());
  if (existing) {
    return res.status(400).json({ error: 'Este nome de usuário já está cadastrado no sistema.' });
  }

  const monthsNum = parseInt(months) || 1;
  const costPerMonthRow = db.prepare("SELECT value FROM system_settings WHERE key = 'credit_cost_per_month'").get();
  const costPerMonth = costPerMonthRow ? parseFloat(costPerMonthRow.value) : 1.0;
  const requiredCredits = monthsNum * costPerMonth;

  // Check reseller balance
  const reseller = db.prepare('SELECT credits FROM users WHERE id = ?').get(resellerId);
  if (reseller.credits < requiredCredits) {
    return res.status(400).json({
      error: `Saldo insuficiente. Necessário: ${requiredCredits} créditos. Seu saldo atual é: ${reseller.credits.toFixed(1)} créditos.`
    });
  }

  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(password, salt);

  const expiresDate = new Date();
  expiresDate.setMonth(expiresDate.getMonth() + monthsNum);

  let newClientId = null;
  const newBalance = reseller.credits - requiredCredits;

  db.transaction(() => {
    // 1. Deduct credits
    db.prepare('UPDATE users SET credits = ? WHERE id = ?').run(newBalance, resellerId);

    // 2. Create client
    const result = db.prepare(`
      INSERT INTO users (username, password_hash, plain_password, role, name, email, phone, reseller_id, max_connections, status, is_trial, expires_at, notes)
      VALUES (?, ?, ?, 'client', ?, ?, ?, ?, ?, 'active', 0, ?, ?)
    `).run(username.trim(), hash, password, name, email, phone, resellerId, max_connections, expiresDate.toISOString(), notes);

    newClientId = result.lastInsertRowid;

    // 3. Record transaction
    db.prepare(`
      INSERT INTO credit_transactions (reseller_id, amount, balance_after, reason, target_user_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(resellerId, -requiredCredits, newBalance, `Ativação de ${monthsNum} mês(es) para ${username.trim()}`, newClientId);
  })();

  res.status(201).json({
    success: true,
    message: `Cliente ${username} ativado com sucesso por ${monthsNum} mês(es)!`,
    clientId: newClientId,
    remainingCredits: newBalance,
  });
});

// Generate Free Trial (2h, 4h, 6h) - No credits consumed
router.post('/generate-trial', (req, res) => {
  const { hours = 4, name = 'Cliente Teste', phone, max_connections = 1 } = req.body;
  const resellerId = req.user.id;

  const hoursNum = parseInt(hours) || 4;

  // Generate friendly random credentials
  const randomSuffix = Math.floor(1000 + Math.random() * 9000);
  const username = `teste_${randomSuffix}`;
  const password = `t${Math.floor(100000 + Math.random() * 900000)}`;

  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(password, salt);

  const expiresDate = new Date(Date.now() + hoursNum * 60 * 60 * 1000);

  const result = db.prepare(`
    INSERT INTO users (username, password_hash, plain_password, role, name, phone, reseller_id, max_connections, status, is_trial, trial_hours, expires_at, notes)
    VALUES (?, ?, ?, 'client', ?, ?, ?, ?, 'active', 1, ?, ?, 'Teste rápido gerado pelo revendedor')
  `).run(username, hash, password, name, phone, resellerId, max_connections, hoursNum, expiresDate.toISOString());

  const serverDomainRow = db.prepare("SELECT value FROM system_settings WHERE key = 'server_domain'").get();
  const serverDomain = (serverDomainRow && serverDomainRow.value) || 'http://localhost:5000';

  const m3uUrl = `${serverDomain}/get.php?username=${username}&password=${password}&type=m3u_plus&output=ts`;
  const webPlayerUrl = `${serverDomain}/player/index.html`;

  // Pre-formatted WhatsApp Message
  const whatsappMessage = `*🔥 SEU TESTE DE IPTV ESTÁ PRONTO!*

Olá *${name}*, seu acesso de teste de *${hoursNum} HORAS* já foi liberado com sucesso!

👤 *Usuário:* \`${username}\`
🔑 *Senha:* \`${password}\`
⏳ *Duração:* ${hoursNum} horas
📺 *Telas Permitidas:* ${max_connections}

🌐 *Assistir no Navegador (WebTV):*
${webPlayerUrl}

📥 *Link da Lista M3U:*
\`${m3uUrl}\`

⚙️ *Dados para Aplicativos (IPTV Smarters / XCIPTV / TiviMate):*
• *Servidor:* \`${serverDomain}\`
• *Usuário:* \`${username}\`
• *Senha:* \`${password}\`

Aproveite e nos chame para assinar o plano completo!`;

  res.status(201).json({
    success: true,
    trial: {
      id: result.lastInsertRowid,
      username,
      password,
      hours: hoursNum,
      expires_at: expiresDate.toISOString(),
      m3uUrl,
      webPlayerUrl,
      whatsappMessage,
    },
  });
});

// Renew Client Subscription (Debits credits)
router.post('/clients/:id/renew', (req, res) => {
  const { id } = req.params;
  const { months = 1 } = req.body;
  const resellerId = req.user.id;

  const client = db.prepare("SELECT * FROM users WHERE id = ? AND reseller_id = ? AND role = 'client'").get(id, resellerId);
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado em sua revenda.' });
  }

  const monthsNum = parseInt(months) || 1;
  const costPerMonthRow = db.prepare("SELECT value FROM system_settings WHERE key = 'credit_cost_per_month'").get();
  const costPerMonth = costPerMonthRow ? parseFloat(costPerMonthRow.value) : 1.0;
  const requiredCredits = monthsNum * costPerMonth;

  const reseller = db.prepare('SELECT credits FROM users WHERE id = ?').get(resellerId);
  if (reseller.credits < requiredCredits) {
    return res.status(400).json({
      error: `Saldo insuficiente. Necessário: ${requiredCredits} créditos. Seu saldo atual é: ${reseller.credits.toFixed(1)} créditos.`
    });
  }

  // Calculate new expiration
  let baseDate = new Date();
  if (client.expires_at && new Date(client.expires_at) > baseDate) {
    // If still active, extend from existing expiration date
    baseDate = new Date(client.expires_at);
  }
  baseDate.setMonth(baseDate.getMonth() + monthsNum);

  const newBalance = reseller.credits - requiredCredits;

  db.transaction(() => {
    db.prepare('UPDATE users SET credits = ? WHERE id = ?').run(newBalance, resellerId);
    db.prepare("UPDATE users SET expires_at = ?, status = 'active', is_trial = 0 WHERE id = ?").run(baseDate.toISOString(), id);
    db.prepare(`
      INSERT INTO credit_transactions (reseller_id, amount, balance_after, reason, target_user_id)
      VALUES (?, ?, ?, ?, ?)
    `).run(resellerId, -requiredCredits, newBalance, `Renovação de ${monthsNum} mês(es) para ${client.username}`, id);
  })();

  res.json({
    success: true,
    message: `Assinatura de ${client.username} renovada por ${monthsNum} mês(es)!`,
    expires_at: baseDate.toISOString(),
    remainingCredits: newBalance,
  });
});

// Toggle Client Status (active / suspended)
router.post('/clients/:id/status', (req, res) => {
  const { id } = req.params;
  const { status } = req.body;
  const resellerId = req.user.id;

  if (!['active', 'suspended'].includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }

  const client = db.prepare("SELECT * FROM users WHERE id = ? AND reseller_id = ? AND role = 'client'").get(id, resellerId);
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado.' });
  }

  db.prepare('UPDATE users SET status = ? WHERE id = ?').run(status, id);

  if (status === 'suspended') {
    // Disconnect any active streams
    db.prepare('DELETE FROM active_connections WHERE user_id = ?').run(id);
  }

  res.json({ success: true, message: `Status de ${client.username} alterado para ${status}.` });
});

// Update Client Details
router.put('/clients/:id', (req, res) => {
  const { id } = req.params;
  const { name, email, phone, max_connections, password, notes } = req.body;
  const resellerId = req.user.id;

  const client = db.prepare("SELECT * FROM users WHERE id = ? AND reseller_id = ? AND role = 'client'").get(id, resellerId);
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado.' });
  }

  if (password && password.trim().length > 0) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);
    db.prepare(`
      UPDATE users 
      SET name = ?, email = ?, phone = ?, max_connections = ?, password_hash = ?, plain_password = ?, notes = ?
      WHERE id = ?
    `).run(name, email, phone, max_connections || 1, hash, password, notes, id);
  } else {
    db.prepare(`
      UPDATE users 
      SET name = ?, email = ?, phone = ?, max_connections = ?, notes = ?
      WHERE id = ?
    `).run(name, email, phone, max_connections || 1, notes, id);
  }

  res.json({ success: true, message: 'Dados do cliente atualizados com sucesso.' });
});

// Delete Client
router.delete('/clients/:id', (req, res) => {
  const { id } = req.params;
  const resellerId = req.user.id;

  const client = db.prepare("SELECT * FROM users WHERE id = ? AND reseller_id = ? AND role = 'client'").get(id, resellerId);
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado.' });
  }

  db.prepare('DELETE FROM users WHERE id = ?').run(id);
  res.json({ success: true, message: 'Cliente excluído com sucesso.' });
});

// Credit History
router.get('/credit-history', (req, res) => {
  const history = db.prepare(`
    SELECT ct.*, u.username as client_username 
    FROM credit_transactions ct
    LEFT JOIN users u ON ct.target_user_id = u.id
    WHERE ct.reseller_id = ?
    ORDER BY ct.created_at DESC
    LIMIT 50
  `).all(req.user.id);

  res.json(history);
});

// Reseller's Active Connections
router.get('/active-connections', (req, res) => {
  const connections = db.prepare(`
    SELECT 
      ac.id,
      ac.session_token,
      ac.user_id,
      u.username,
      u.name as user_name,
      ac.stream_id,
      s.name as stream_name,
      ac.ip_address,
      ac.device_type,
      ac.connected_at,
      ac.bytes_transferred
    FROM active_connections ac
    JOIN users u ON ac.user_id = u.id
    LEFT JOIN streams s ON ac.stream_id = s.id
    WHERE u.reseller_id = ?
    ORDER BY ac.connected_at DESC
  `).all(req.user.id);

  res.json(connections);
});

// Kill client connection
router.delete('/connections/:id', (req, res) => {
  const { id } = req.params;
  const resellerId = req.user.id;

  const connection = db.prepare(`
    SELECT ac.id 
    FROM active_connections ac 
    JOIN users u ON ac.user_id = u.id 
    WHERE ac.id = ? AND u.reseller_id = ?
  `).get(id, resellerId);

  if (!connection) {
    return res.status(403).json({ error: 'Conexão não encontrada ou não pertence aos seus clientes.' });
  }

  ConnectionManager.killConnectionById(id);
  res.json({ success: true, message: 'Conexão do cliente desconectada com sucesso.' });
});

module.exports = router;
