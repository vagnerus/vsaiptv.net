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

  const user = db.prepare("SELECT * FROM users WHERE username = ? AND role IN ('master', 'reseller')").get(username.trim());
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

  const token = jwt.sign(
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '7d' }
  );

  // Log action
  db.prepare('INSERT INTO audit_logs (user_id, action, details, ip_address) VALUES (?, ?, ?, ?)').run(
    user.id,
    'LOGIN',
    `Login efetuado com sucesso no painel (${user.role.toUpperCase()})`,
    clientIp
  );

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      email: user.email,
      phone: user.phone,
      role: user.role,
      credits: user.credits,
      max_connections: user.max_connections,
      status: user.status,
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

  const user = db.prepare("SELECT * FROM users WHERE username = ?").get(username.trim());
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
    { id: user.id, username: user.username, role: user.role },
    JWT_SECRET,
    { expiresIn: '3d' }
  );

  // Get reseller info if any
  const reseller = user.reseller_id ? db.prepare('SELECT name, phone FROM users WHERE id = ?').get(user.reseller_id) : null;

  res.json({
    token,
    user: {
      id: user.id,
      username: user.username,
      name: user.name,
      role: 'client',
      is_trial: user.is_trial,
      max_connections: user.max_connections,
      status: user.status,
      expires_at: user.expires_at,
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
  });
});

module.exports = router;
