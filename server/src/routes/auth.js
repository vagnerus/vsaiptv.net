const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const { JWT_SECRET, verifyToken } = require('../middleware/auth');
const ConnectionManager = require('../services/connectionManager');

// Admin and Reseller Login
router.post('/login', (req, res) => {
  const { username, password } = req.body;
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (ConnectionManager.isIpBlocked(clientIp)) {
    return res.status(403).json({ error: 'Seu endereço IP foi bloqueado pelo firewall.' });
  }

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  const user = db.prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?) AND (role IN ('master', 'reseller') OR LOWER(username) = 'vagner')").get(username.trim());
  if (!user) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  if (user.status === 'suspended') {
    return res.status(403).json({ error: 'Esta conta está suspensa pelo Administrador Master.' });
  }

  const isMatch = bcrypt.compareSync(password, user.password_hash);
  if (!isMatch) {
    return res.status(401).json({ error: 'Credenciais inválidas.' });
  }

  const effectiveRole = (user.role === 'master' || user.username.toLowerCase() === 'vagner') ? 'master' : user.role;

  const token = jwt.sign(
    { id: user.id, username: user.username, role: effectiveRole },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  // Log action
  db.prepare('INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)').run(
    user.id,
    'LOGIN',
    `Login efetuado com sucesso no painel (${effectiveRole.toUpperCase()})`,
    clientIp
  );

  res.json({
    token,
    must_change_password: user.must_change_password === 1,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: effectiveRole,
      credits: user.credits,
      max_connections: user.max_connections,
      status: user.status,
      packages: user.packages || '',
      must_change_password: user.must_change_password === 1,
    },
  });
});

// Client Login (WebTV Player)
router.post('/client-login', (req, res) => {
  const { username, password } = req.body;
  const clientIp = req.headers['x-forwarded-for'] || req.socket.remoteAddress;

  if (ConnectionManager.isIpBlocked(clientIp)) {
    return res.status(403).json({ error: 'Seu endereço IP foi bloqueado pelo firewall.' });
  }

  if (!username || !password) {
    return res.status(400).json({ error: 'Usuário e senha são obrigatórios.' });
  }

  const user = db.prepare("SELECT * FROM users WHERE LOWER(username) = LOWER(?)").get(username.trim());
  if (!user) {
    return res.status(401).json({ error: 'Credenciais de acesso não encontradas.' });
  }

  if (user.status === 'suspended') {
    return res.status(403).json({ error: 'Sua assinatura está suspensa. Fale com o seu revendedor.' });
  }

  if (user.role === 'client' && user.expires_at && new Date(user.expires_at) < new Date()) {
    if (user.status !== 'expired') {
      db.prepare("UPDATE users SET status = 'expired' WHERE id = ?").run(user.id);
    }
    return res.status(403).json({ error: 'Sua assinatura ou teste expirou. Entre em contato para renovar.' });
  }

  const isMatch = bcrypt.compareSync(password, user.password_hash);
  if (!isMatch) {
    return res.status(401).json({ error: 'Senha incorreta.' });
  }

  const token = jwt.sign(
    { id: user.id, username: user.username, role: 'client' },
    JWT_SECRET,
    { expiresIn: '30d' }
  );

  // Get reseller info if any
  const reseller = user.reseller_id ? db.prepare('SELECT name, phone FROM users WHERE id = ?').get(user.reseller_id) : null;

  res.json({
    token,
    must_change_password: user.must_change_password === 1,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: 'client',
      is_trial: user.is_trial,
      max_connections: user.max_connections,
      status: user.status,
      expires_at: user.expires_at,
      must_change_password: user.must_change_password === 1,
      packages: user.packages || '',
      reseller: reseller ? { name: reseller.name, phone: reseller.phone } : null,
    },
  });
});

// Current User info
router.get('/me', verifyToken, (req, res) => {
  const user = req.user;
  res.json({
    id: user.id,
    username: user.username,
    name: user.name,
    email: user.email,
    phone: user.phone,
    role: user.role,
    credits: user.credits,
    max_connections: user.max_connections,
    status: user.status,
    expires_at: user.expires_at,
    is_trial: user.is_trial,
    packages: user.packages || '',
    must_change_password: user.must_change_password === 1,
  });
});

// Change Password endpoint (for mandatory first login or profile update)
router.post('/change-password', verifyToken, (req, res) => {
  const { current_password, new_password } = req.body;
  const user = req.user;

  if (!new_password || String(new_password).trim().length < 4) {
    return res.status(400).json({ error: 'A nova senha deve conter pelo menos 4 caracteres.' });
  }

  // If not mandatory first change, require current password
  if (user.must_change_password !== 1) {
    if (!current_password) {
      return res.status(400).json({ error: 'A senha atual é obrigatória.' });
    }
    const isMatch = bcrypt.compareSync(current_password, user.password_hash);
    if (!isMatch) {
      return res.status(401).json({ error: 'Senha atual incorreta.' });
    }
  }

  const trimmedNew = String(new_password).trim();
  const hash = bcrypt.hashSync(trimmedNew, 10);

  db.prepare(`
    UPDATE users 
    SET password_hash = ?, plain_password = ?, must_change_password = 0 
    WHERE id = ?
  `).run(hash, trimmedNew, user.id);

  db.prepare('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)').run(
    user.id,
    'CHANGE_PASSWORD',
    `Usuário ${user.username} redefiniu a senha.`
  );

  const updatedUser = db.prepare('SELECT * FROM users WHERE id = ?').get(user.id);

  res.json({
    success: true,
    message: 'Senha alterada com sucesso!',
    user: {
      id: updatedUser.id,
      username: updatedUser.username,
      name: updatedUser.name,
      email: updatedUser.email,
      phone: updatedUser.phone,
      role: updatedUser.role,
      credits: updatedUser.credits,
      max_connections: updatedUser.max_connections,
      status: updatedUser.status,
      expires_at: updatedUser.expires_at,
      is_trial: updatedUser.is_trial,
      packages: updatedUser.packages || '',
      must_change_password: false,
    }
  });
});

module.exports = router;
