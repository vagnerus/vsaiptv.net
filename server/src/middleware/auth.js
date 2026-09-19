const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '../../.env') });
const jwt = require('jsonwebtoken');
const db = require('../db/database');

const JWT_SECRET = process.env.JWT_SECRET || 'iptv_ultra_secret_key_2026_secure!';

function verifyToken(req, res, next) {
  const authHeader = req.headers['authorization'];
  const token = authHeader && authHeader.split(' ')[1];

  if (!token) {
    return res.status(401).json({ error: 'Token de autenticação não fornecido' });
  }

  jwt.verify(token, JWT_SECRET, (err, decoded) => {
    if (err) {
      return res.status(403).json({ error: 'Token inválido ou expirado' });
    }

    const user = db.prepare('SELECT * FROM users WHERE id = ?').get(decoded.id);
    if (!user) {
      return res.status(404).json({ error: 'Usuário não encontrado' });
    }

    if (user.status === 'suspended') {
      return res.status(403).json({ error: 'Sua conta está suspensa. Entre em contato com o suporte.' });
    }

    if (user.status === 'expired' || (user.expires_at && new Date(user.expires_at) < new Date())) {
      // Auto-update status to expired if date passed
      if (user.status !== 'expired') {
        db.prepare("UPDATE users SET status = 'expired' WHERE id = ?").run(user.id);
      }
      return res.status(403).json({ error: 'Sua assinatura ou teste expirou.' });
    }

    req.user = user;
    next();
  });
}

function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ error: 'Usuário não autenticado' });
    }
    // Master role or user vagner has unrestricted access
    if (req.user.role === 'master' || req.user.username?.toLowerCase() === 'vagner') {
      return next();
    }
    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({ error: 'Acesso negado: permissão insuficiente para esta ação' });
    }
    next();
  };
}

module.exports = {
  JWT_SECRET,
  verifyToken,
  requireRole,
};
