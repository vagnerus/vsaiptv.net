const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const fs = require('fs');
const path = require('path');
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
      u.id, u.username, u.name, u.email, u.phone, 
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
    VALUES (?, ?, NULL, 'reseller', ?, ?, ?, ?, 'active', ?)
  `).run(username.trim(), hash, name, email, phone, initialCredits, notes);

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
      SET name = ?, email = ?, phone = ?, status = ?, password_hash = ?, plain_password = NULL, notes = ?
      WHERE id = ?
    `).run(name, email, phone, status, hash, notes, id);
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
      c.id, c.username, c.name, c.email, c.phone, 
      c.reseller_id, r.username as reseller_username, r.name as reseller_name,
      c.max_connections, c.status, c.is_trial, c.trial_hours, c.expires_at, 
      c.created_at, c.notes, c.must_change_password,
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

// Create Client from Master Admin
router.post('/clients', (req, res) => {
  const { 
    username, password, name, email, phone, 
    reseller_id, duration_type = 'months', duration_value = 1, 
    max_connections = 1, notes 
  } = req.body;

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = LOWER(?)').get(username.trim());
  if (existing) {
    return res.status(400).json({ error: 'Este nome de usuário já está em uso.' });
  }

  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(password, salt);

  let expiresDate = new Date();
  let isTrial = 0;
  let trialHours = null;

  if (duration_type === 'hours') {
    const hours = parseInt(duration_value, 10) || 2;
    expiresDate.setHours(expiresDate.getHours() + hours);
    isTrial = 1;
    trialHours = hours;
  } else if (duration_type === 'lifetime') {
    expiresDate = new Date('2099-12-31T23:59:59Z');
    isTrial = 0;
  } else {
    // months
    const months = parseInt(duration_value, 10) || 1;
    expiresDate.setMonth(expiresDate.getMonth() + months);
    isTrial = 0;
  }

  const validResellerId = reseller_id ? parseInt(reseller_id, 10) : null;

  const result = db.prepare(`
    INSERT INTO users (
      username, password_hash, plain_password, role, name, email, phone, 
      reseller_id, max_connections, status, is_trial, trial_hours, expires_at, notes, created_at, must_change_password
    ) VALUES (?, ?, NULL, 'client', ?, ?, ?, ?, ?, 'active', ?, ?, ?, ?, datetime('now'), 0)
  `).run(
    username.trim(), hash, name || username.trim(), email, phone, 
    validResellerId, parseInt(max_connections, 10) || 1, isTrial, trialHours, expiresDate.toISOString(), notes
  );

  const clientId = result.lastInsertRowid;

  db.prepare('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)').run(
    req.user.id,
    'CREATE_CLIENT',
    `Master criou cliente '${username.trim()}' (Validade: ${expiresDate.toISOString().slice(0, 19).replace('T', ' ')}, Telas: ${max_connections})`
  );

  res.status(201).json({
    success: true,
    message: 'Cliente cadastrado com sucesso!',
    clientId,
    temporaryPassword: password, // Fornecido apenas no momento imediato da criação
    client: {
      id: clientId,
      username: username.trim(),
      name: name || username.trim(),
      expires_at: expiresDate.toISOString(),
      max_connections: parseInt(max_connections, 10) || 1,
      is_trial: isTrial,
    }
  });
});

// Update Client
router.put('/clients/:id', (req, res) => {
  const { id } = req.params;
  const { name, email, phone, status, password, max_connections, expires_at, notes, reseller_id } = req.body;

  const client = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'client'").get(id);
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado.' });
  }

  const validResellerId = reseller_id === '' || reseller_id === null ? null : parseInt(reseller_id, 10);
  const conns = parseInt(max_connections, 10) || client.max_connections;

  if (password && password.trim().length > 0) {
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(password, salt);
    db.prepare(`
      UPDATE users 
      SET name = ?, email = ?, phone = ?, status = ?, password_hash = ?, plain_password = NULL, 
          max_connections = ?, expires_at = COALESCE(?, expires_at), notes = ?, reseller_id = ?
      WHERE id = ?
    `).run(name, email, phone, status || client.status, hash, conns, expires_at, notes, validResellerId, id);
  } else {
    db.prepare(`
      UPDATE users 
      SET name = ?, email = ?, phone = ?, status = ?, 
          max_connections = ?, expires_at = COALESCE(?, expires_at), notes = ?, reseller_id = ?
      WHERE id = ?
    `).run(name, email, phone, status || client.status, conns, expires_at, notes, validResellerId, id);
  }

  res.json({ success: true, message: 'Dados do cliente atualizados com sucesso.' });
});

// Reset client password / Generate temporary password
router.post('/clients/:id/reset-password', (req, res) => {
  const { id } = req.params;
  const client = db.prepare("SELECT id, username FROM users WHERE id = ? AND role = 'client'").get(id);
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado.' });
  }

  const temporaryPassword = crypto.randomBytes(4).toString('hex').toUpperCase();
  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(temporaryPassword, salt);

  db.prepare(`
    UPDATE users 
    SET password_hash = ?, plain_password = NULL, must_change_password = 1 
    WHERE id = ?
  `).run(hash, id);

  db.prepare('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)').run(
    req.user.id,
    'RESET_PASSWORD',
    `Redefiniu senha do cliente '${client.username}'. Forçar troca no login ativado.`
  );

  res.json({
    success: true,
    temporaryPassword,
    message: 'Senha temporária gerada com sucesso! Guarde-a agora, ela NÃO será exibida novamente.'
  });
});

// Toggle force password change on next login
router.post('/clients/:id/toggle-force-password', (req, res) => {
  const { id } = req.params;
  const client = db.prepare("SELECT id, username, must_change_password FROM users WHERE id = ? AND role = 'client'").get(id);
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado.' });
  }

  const newVal = client.must_change_password ? 0 : 1;
  db.prepare('UPDATE users SET must_change_password = ? WHERE id = ?').run(newVal, id);

  db.prepare('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)').run(
    req.user.id,
    'TOGGLE_FORCE_PASSWORD',
    `Alterou 'forçar troca de senha' para ${newVal ? 'ATIVADO' : 'DESATIVADO'} para o cliente '${client.username}'.`
  );

  res.json({
    success: true,
    must_change_password: newVal,
    message: newVal ? 'O cliente será forçado a alterar a senha no próximo login.' : 'Exigência de troca de senha desativada.'
  });
});

// Create 30-Minute Test Client (Server-computed expiration)
router.post('/clients/test-30m', (req, res) => {
  const username = (req.body.username || `teste_${Math.floor(1000 + Math.random() * 9000)}`).trim().toLowerCase();
  const temporaryPassword = (req.body.password || crypto.randomBytes(3).toString('hex')).toLowerCase();

  const existing = db.prepare('SELECT id FROM users WHERE LOWER(username) = ?').get(username);
  if (existing) {
    return res.status(400).json({ error: 'Este nome de usuário de teste já existe. Tente outro.' });
  }

  const salt = bcrypt.genSaltSync(10);
  const hash = bcrypt.hashSync(temporaryPassword, salt);
  
  // 30 minutes from now (computed strictly on server)
  const expiresDate = new Date(Date.now() + 30 * 60 * 1000);

  const result = db.prepare(`
    INSERT INTO users (
      username, password_hash, plain_password, role, name, 
      max_connections, status, is_trial, trial_hours, expires_at, created_at, must_change_password
    ) VALUES (?, ?, NULL, 'client', ?, 1, 'active', 1, 0.5, ?, datetime('now'), 0)
  `).run(username, hash, `Teste 30m (${username})`, expiresDate.toISOString());

  const clientId = result.lastInsertRowid;

  db.prepare('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)').run(
    req.user.id,
    'CREATE_TEST_30M',
    `Criou teste rápido de 30 minutos para '${username}' com expiração em ${expiresDate.toISOString()}`
  );

  res.status(201).json({
    success: true,
    message: 'Conta de teste de 30 minutos criada com sucesso!',
    client: {
      id: clientId,
      username,
      temporaryPassword,
      expires_at: expiresDate.toISOString(),
      duration: '30 minutos'
    }
  });
});

// Renew Client
router.post('/clients/:id/renew', (req, res) => {
  const { id } = req.params;
  const { duration_type = 'months', duration_value = 1 } = req.body;

  const client = db.prepare("SELECT * FROM users WHERE id = ? AND role = 'client'").get(id);
  if (!client) {
    return res.status(404).json({ error: 'Cliente não encontrado.' });
  }

  let baseDate = client.expires_at ? new Date(client.expires_at) : new Date();
  if (isNaN(baseDate.getTime()) || baseDate < new Date()) {
    baseDate = new Date();
  }

  let newExpiresDate = new Date(baseDate);

  if (duration_type === 'hours') {
    const hours = parseInt(duration_value, 10) || 2;
    newExpiresDate.setHours(newExpiresDate.getHours() + hours);
  } else if (duration_type === 'lifetime') {
    newExpiresDate = new Date('2099-12-31T23:59:59Z');
  } else {
    // months
    const months = parseInt(duration_value, 10) || 1;
    newExpiresDate.setMonth(newExpiresDate.getMonth() + months);
  }

  db.prepare(`
    UPDATE users 
    SET expires_at = ?, status = 'active', is_trial = 0 
    WHERE id = ?
  `).run(newExpiresDate.toISOString(), id);

  db.prepare('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)').run(
    req.user.id,
    'RENEW_CLIENT',
    `Renovou assinatura do cliente ${client.username} até ${newExpiresDate.toISOString().slice(0, 19).replace('T', ' ')}`
  );

  res.json({
    success: true,
    message: `Cliente ${client.username} renovado com sucesso!`,
    expires_at: newExpiresDate.toISOString()
  });
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
  try {
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(250, Math.max(1, parseInt(req.query.limit, 10) || 50));
    const offset = (page - 1) * limit;

    const { type, category_id, search, health_status, image_filter } = req.query;

    let whereClauses = ['1=1'];
    const params = [];

    if (type && type !== 'all') {
      if (type === 'novelas') {
        whereClauses.push("(s.category_id IN (147, 163, 350, 454, 472, 477, 481, 488) OR LOWER(s.name) LIKE '%novela%')");
      } else {
        whereClauses.push('s.type = ?');
        params.push(type);
      }
    }

    if (category_id && category_id !== 'all') {
      whereClauses.push('s.category_id = ?');
      params.push(category_id);
    }

    if (search && search.trim().length > 0) {
      whereClauses.push('(LOWER(s.name) LIKE ? OR LOWER(s.stream_url) LIKE ?)');
      const term = `%${search.trim().toLowerCase()}%`;
      params.push(term, term);
    }

    if (health_status && health_status !== 'all') {
      whereClauses.push('s.health_status = ?');
      params.push(health_status);
    }

    if (image_filter === 'missing') {
      whereClauses.push("((s.icon_url IS NULL OR s.icon_url = '') AND (s.poster_url IS NULL OR s.poster_url = ''))");
    } else if (image_filter === 'has_image') {
      whereClauses.push("((s.icon_url IS NOT NULL AND s.icon_url != '') OR (s.poster_url IS NOT NULL AND s.poster_url != ''))");
    }

    const whereStr = whereClauses.join(' AND ');

    // Fast count
    const countRow = db.prepare(`
      SELECT COUNT(*) as total 
      FROM streams s 
      WHERE ${whereStr}
    `).get(...params);

    const total = countRow ? countRow.total : 0;

    // Paginated fetch
    const streams = db.prepare(`
      SELECT s.*, c.name as category_name 
      FROM streams s 
      LEFT JOIN categories c ON s.category_id = c.id
      WHERE ${whereStr}
      ORDER BY s.id DESC
      LIMIT ? OFFSET ?
    `).all(...params, limit, offset);

    res.json({
      streams,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit)
    });
  } catch (err) {
    console.error('[Admin] Erro ao buscar streams:', err);
    res.status(500).json({ error: 'Erro ao buscar catálogo: ' + err.message });
  }
});

router.get('/streams/:id', (req, res) => {
  const { id } = req.params;
  const stream = db.prepare(`
    SELECT s.*, c.name as category_name 
    FROM streams s 
    LEFT JOIN categories c ON s.category_id = c.id
    WHERE s.id = ?
  `).get(id);

  if (!stream) {
    return res.status(404).json({ error: 'Conteúdo não encontrado.' });
  }
  res.json(stream);
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

router.put('/streams/:id/image', (req, res) => {
  const { id } = req.params;
  const { icon_url, poster_url } = req.body;

  const stream = db.prepare('SELECT id, name FROM streams WHERE id = ?').get(id);
  if (!stream) {
    return res.status(404).json({ error: 'Conteúdo não encontrado.' });
  }

  const updates = [];
  const params = [];

  if (icon_url !== undefined) {
    updates.push('icon_url = ?');
    params.push(icon_url ? icon_url.trim() : '');
  }
  if (poster_url !== undefined) {
    updates.push('poster_url = ?');
    params.push(poster_url ? poster_url.trim() : '');
  }

  if (updates.length === 0) {
    return res.status(400).json({ error: 'Nenhuma URL de imagem fornecida.' });
  }

  params.push(id);
  db.prepare(`UPDATE streams SET ${updates.join(', ')} WHERE id = ?`).run(...params);

  db.prepare('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)').run(
    req.user.id,
    'UPDATE_IMAGE',
    `Atualizou imagem do conteúdo '${stream.name}' (ID: ${id})`
  );

  res.json({ success: true, message: 'Imagem atualizada com sucesso!' });
});

router.post('/streams/:id/image-upload', (req, res) => {
  const { id } = req.params;
  const stream = db.prepare('SELECT id, name, type FROM streams WHERE id = ?').get(id);
  if (!stream) {
    return res.status(404).json({ error: 'Conteúdo não encontrado.' });
  }

  let buffer = null;
  let targetField = (req.body && req.body.field === 'poster') ? 'poster_url' : 'icon_url';

  if (req.body && req.body.base64) {
    const raw = req.body.base64.replace(/^data:image\/\w+;base64,/, '');
    buffer = Buffer.from(raw, 'base64');
  } else if (Buffer.isBuffer(req.body)) {
    buffer = req.body;
  }

  if (!buffer || buffer.length < 8) {
    return res.status(400).json({ error: 'Arquivo de imagem inválido ou vazio.' });
  }

  // Validate Magic Bytes strictly (JPEG, PNG, WebP)
  const validation = imageManager.validateMagicBytes(buffer);
  if (!validation.valid) {
    return res.status(400).json({ error: `Formato de imagem rejeitado: ${validation.reason || 'Assinatura binária não permitida'}` });
  }

  const uploadsDir = path.join(__dirname, '../../data/uploads');
  if (!fs.existsSync(uploadsDir)) {
    fs.mkdirSync(uploadsDir, { recursive: true });
  }

  const hash = crypto.randomBytes(8).toString('hex');
  const filename = `content_${id}_${hash}.${validation.ext}`;
  const filePath = path.join(uploadsDir, filename);

  fs.writeFileSync(filePath, buffer);

  const publicUrl = `/uploads/${filename}`;

  db.prepare(`UPDATE streams SET ${targetField} = ? WHERE id = ?`).run(publicUrl, id);

  db.prepare('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)').run(
    req.user.id,
    'UPLOAD_IMAGE',
    `Fez upload de imagem para '${stream.name}' (${targetField} -> ${publicUrl})`
  );

  res.json({
    success: true,
    message: 'Imagem enviada e aplicada com sucesso!',
    url: publicUrl,
    field: targetField
  });
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

// ==========================================
// 8. CHANNEL AUTO-SYNC (WEB + LOCAL LISTS)
// ==========================================
const { syncAllChannels, getSyncStatus } = require('../services/channelListSyncService');

router.get('/channels/sync-status', (req, res) => {
  res.json(getSyncStatus());
});

router.post('/channels/sync-web', (req, res) => {
  const current = getSyncStatus();
  if (current.state === 'running') {
    return res.status(409).json({ error: 'Uma sincronização já está em andamento.' });
  }

  // Dispara em background para não travar a requisição HTTP
  syncAllChannels({ apply: true }).catch(err => {
    console.error('[Admin] Erro na sincronização:', err);
  });

  res.json({
    success: true,
    message: 'Sincronização com fontes da Web e listas locais iniciada com sucesso em segundo plano.',
  });
});

// ==========================================
// 9. IMAGE MANAGER & AUDITOR
// ==========================================
const imageManager = require('../services/imageManager');
const imageAuditor = require('../services/imageAuditor');

router.get('/images/stats', (req, res) => {
  try {
    const stats = imageManager.getStats();
    const auditorStatus = imageAuditor.getScanStatus();
    res.json({
      stats,
      auditorStatus,
      ...stats
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/images/scan', async (req, res) => {
  try {
    const { scope = 'all', repair = false, limit = 5000 } = req.body;
    const result = await imageAuditor.startScan({ scope, repair, limit });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/images/scan/status', (req, res) => {
  try {
    const status = imageAuditor.getScanStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/images/scan/cancel', (req, res) => {
  try {
    const result = imageAuditor.cancelScan();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/images/clean', (req, res) => {
  try {
    const result = imageManager.cleanExpiredCache();
    res.json({ success: true, ...result });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/images/repair-missing', (req, res) => {
  try {
    const { type = 'live' } = req.body;
    const result = imageAuditor.repairAllMissing(type);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 10. HEALTH CENTER & BACKUP (PHASE C & O)
// ==========================================
const healthCenter = require('../services/healthCenter');

router.get('/health', async (req, res) => {
  try {
    const health = await healthCenter.getSystemHealth();
    res.json(health);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/health/db-integrity', async (req, res) => {
  try {
    const result = await healthCenter.verifyDatabaseIntegrity();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/health/backup', async (req, res) => {
  try {
    const username = req.user?.username || 'admin';
    const backup = await healthCenter.createDatabaseBackup(username);
    res.json(backup);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/health/backups', (req, res) => {
  try {
    const backups = healthCenter.listBackups();
    res.json(backups);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/health/backups/:filename/download', (req, res) => {
  try {
    const { filename } = req.params;
    // Prevenção estrita de path traversal
    const safeFilename = path.basename(filename);
    const filePath = path.join(healthCenter.backupDir, safeFilename);

    if (!fs.existsSync(filePath)) {
      return res.status(404).json({ error: 'Arquivo de backup não encontrado no servidor.' });
    }

    res.download(filePath, safeFilename);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/health/backups/:filename', (req, res) => {
  try {
    const { filename } = req.params;
    const safeFilename = path.basename(filename);
    const filePath = path.join(healthCenter.backupDir, safeFilename);

    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }

    db.prepare('DELETE FROM database_backups WHERE filename = ?').run(safeFilename);
    res.json({ success: true, message: `Backup ${safeFilename} excluído com sucesso.` });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/health/backups/test-restore', (req, res) => {
  try {
    const { filename } = req.body;
    if (!filename) return res.status(400).json({ error: 'filename obrigatório' });
    const result = healthCenter.testRestore(filename);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// EPG (GUIA DE TV) ADMIN ROUTES
// ==========================================
const epgManager = require('../services/epgManager');

router.get('/epg/stats', (req, res) => {
  try {
    const stats = epgManager.getStats();
    res.json(stats);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/epg/channels', (req, res) => {
  try {
    const { page = 1, limit = 50, category_id = null, search = '' } = req.query;
    const result = epgManager.getAdminChannels({ page, limit, category_id, search });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/epg/generate-base', (req, res) => {
  try {
    const result = epgManager.generateBaseSchedule();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/epg/sync', async (req, res) => {
  try {
    const { xmlContent } = req.body;
    if (xmlContent) {
      const result = epgManager.importXmltv(xmlContent);
      return res.json(result);
    }
    const result = epgManager.generateBaseSchedule();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.put('/epg/channels/:streamId', (req, res) => {
  try {
    const { streamId } = req.params;
    const { epg_channel_id } = req.body;
    const result = epgManager.updateChannelEpg(streamId, epg_channel_id);
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/epg/cleanup', (req, res) => {
  try {
    const result = epgManager.cleanupExpired();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.delete('/epg/clear', (req, res) => {
  try {
    const result = epgManager.clearAll();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ==========================================
// 11. STREAM HEALTH MONITOR (PHASE D)
// ==========================================
const streamMonitor = require('../services/streamMonitor');

router.get('/streams/health/stats', (req, res) => {
  try {
    const rows = db.prepare(`
      SELECT 
        COALESCE(health_status, 'unknown') as health_status, 
        COUNT(*) as count 
      FROM streams 
      GROUP BY health_status
    `).all();

    const stats = { online: 0, unstable: 0, offline: 0, unknown: 0, total: 0 };
    rows.forEach(r => {
      stats.total += r.count;
      if (stats[r.health_status] !== undefined) {
        stats[r.health_status] = r.count;
      }
    });

    const scanStatus = streamMonitor.getScanStatus();

    res.json({ stats, scanStatus });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/streams/health/scan', async (req, res) => {
  try {
    const { type = 'live', limit = 500, categoryId = null, brokenOnly = false } = req.body;
    const result = await streamMonitor.startScan({ type, limit, categoryId, brokenOnly });
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.get('/streams/health/scan/status', (req, res) => {
  try {
    const status = streamMonitor.getScanStatus();
    res.json(status);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/streams/health/scan/cancel', (req, res) => {
  try {
    const result = streamMonitor.cancelScan();
    res.json(result);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;

