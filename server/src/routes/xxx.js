const express = require('express');
const router = express.Router();
const bcrypt = require('bcryptjs');
const db = require('../db/database');
const { verifyToken, requireRole } = require('../middleware/auth');
const {
  canAccessXxx,
  normalizeXXXUrl,
  importXxxSources,
  countXxxCatalog,
} = require('../services/xxxImporter');

// Only client, master or reseller may access this module
router.use(verifyToken, requireRole('client', 'master', 'reseller'));

// ===================================================================
// 1. Access check & menu status
//    A visibilidade do menu XXX é decidida aqui: admin sempre,
//    cliente apenas quando o pacote XXX foi marcado na conta.
// ===================================================================
router.get('/menu', (req, res) => {
  try {
    const allowed = canAccessXxx(req.user);
    res.json({
      allowed,
      userRole: req.user.role,
      username: req.user.username,
      hasXxxPackage: allowed && req.user.role === 'client',
      xxxPasswordSet: allowed && !!(req.user.xxx_password_hash),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================================================================
// 2. XXX session password (set / verify)
// ===================================================================
router.get('/password/status', (req, res) => {
  try {
    const user = req.user;
    if (!canAccessXxx(user)) {
      return res.status(403).json({ error: 'Pacote XXX não permitido para este usuário.' });
    }
    res.json({
      set: !!(user.xxx_password_hash),
      requiredForPlay: true,
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/password/set', (req, res) => {
  try {
    const user = req.user;
    if (!canAccessXxx(user)) {
      return res.status(403).json({ error: 'Pacote XXX não permitido para este usuário.' });
    }
    const { password } = req.body || {};
    if (!password || String(password).trim().length < 4) {
      return res.status(400).json({ error: 'A senha XXX deve ter pelo menos 4 caracteres.' });
    }
    if (user.xxx_password_hash) {
      return res.status(400).json({ error: 'A senha XXX já foi criada. Use a tela de desbloqueio.' });
    }
    const hash = bcrypt.hashSync(String(password).trim(), 10);
    db.prepare('UPDATE users SET xxx_password_hash = ? WHERE id = ?').run(hash, user.id);
    db.prepare('INSERT INTO audit_logs (user_id, action, details) VALUES (?, ?, ?)').run(
      user.id,
      'XXX_PASSWORD_SET',
      `Usuário ${user.username} criou a senha da área XXX.`
    );
    res.json({ success: true, message: 'Senha XXX configurada com sucesso.' });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/password/verify', (req, res) => {
  try {
    const user = req.user;
    if (!canAccessXxx(user)) {
      return res.status(403).json({ error: 'Pacote XXX não permitido para este usuário.' });
    }
    const { password } = req.body || {};
    if (!user.xxx_password_hash) {
      return res.json({ valid: false, reason: 'sem_senha' });
    }
    if (!password) {
      return res.json({ valid: false, reason: 'invalido' });
    }
    const valid = bcrypt.compareSync(String(password).trim(), user.xxx_password_hash);
    res.json({ valid });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================================================================
// 3. XXX catalog (channels vs movies)
// ===================================================================
router.get('/catalog', (req, res) => {
  try {
    const user = req.user;
    if (!canAccessXxx(user)) {
      return res.status(403).json({ error: 'Pacote XXX não permitido para este usuário.' });
    }

    const { type, category, search, page, limit } = req.query;
    const pageNum = parseInt(page, 10) || 1;
    const limitNum = Math.min(parseInt(limit, 10) || 120, 500);

    let query = `
      SELECT s.*, c.name as category_name
      FROM streams s
      LEFT JOIN categories c ON s.category_id = c.id
      WHERE s.type IN ('live', 'movie') AND s.status = 'online'
    `;
    const params = [];

    // Somente itens da(s) categoria(s) adulta(s)
    query += " AND (c.name = 'XXX' OR c.name LIKE '%XXX%' OR c.name LIKE '%Adulto%' OR c.name LIKE '%+18%')";

    if (type) {
      query += ' AND s.type = ?';
      params.push(type);
    }
    if (category) {
      query += ' AND s.category_id = ?';
      params.push(category);
    }
    if (search) {
      query += ' AND (s.name LIKE ? OR c.name LIKE ?)';
      params.push(`%${search}%`, `%${search}%`);
    }

    if (pageNum > 1) {
      const offset = (pageNum - 1) * limitNum;
      query += ' LIMIT ? OFFSET ?';
      params.push(limitNum, offset);
    } else {
      query += ' LIMIT ?';
      params.push(limitNum);
    }

    const items = db.prepare(query).all(...params);
    res.json(items);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================================================================
// 4. XXX stream session (password-gated playback)
// ===================================================================
router.get('/stream/:id', (req, res) => {
  try {
    const user = req.user;
    if (!canAccessXxx(user)) {
      return res.status(403).json({ error: 'Pacote XXX não permitido para este usuário.' });
    }

    // A senha da área XXX é obrigatória para reproduzir
    if (!user.xxx_password_hash) {
      return res.status(403).json({ error: 'Você ainda não definiu a senha da área XXX. Crie uma senha para liberar a reprodução.' });
    }

    const stream = db.prepare('SELECT * FROM streams WHERE id = ?').get(req.params.id);
    if (!stream || !['live', 'movie'].includes(stream.type)) {
      return res.status(404).json({ error: 'Conteúdo não encontrado.' });
    }

    const url = normalizeXXXUrl(stream.stream_url);
    if (!url) {
      return res.status(404).json({ error: 'Conteúdo sem URL válida.' });
    }

    // Token de sessão simples (curto prazo) para o player
    const sessionToken = Buffer.from(`xxx:${user.id}:${Date.now()}:${Math.random().toString(36).slice(2)}`).toString('base64url');

    res.json({
      sessionToken,
      stream: {
        id: stream.id,
        name: stream.name,
        type: stream.type,
        stream_url: url,
        icon_url: stream.icon_url || '',
        poster_url: stream.poster_url || '',
        description: stream.description || '',
      },
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

// ===================================================================
// 5. XXX admin: import from local folder + remote URLs
// ===================================================================
router.get('/admin/status', (req, res) => {
  try {
    const user = req.user;
    if (!user || (user.role !== 'master' && (user.username || '').toLowerCase() !== 'vagner')) {
      return res.status(403).json({ error: 'Apenas o administrador Master pode ver o status da importação XXX.' });
    }
    const lastSyncRow = db.prepare("SELECT * FROM system_settings WHERE key = 'xxx_last_import_at'").get();
    res.json({
      lastSync: lastSyncRow ? lastSyncRow.value : null,
      totalCatalog: countXxxCatalog(),
    });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

router.post('/admin/import', async (req, res) => {
  try {
    const user = req.user;
    if (!user || (user.role !== 'master' && (user.username || '').toLowerCase() !== 'vagner')) {
      return res.status(403).json({ error: 'Apenas o administrador Master pode importar a lista XXX.' });
    }

    const body = req.body || {};
    const extraUrls = Array.isArray(body.urls) ? body.urls.filter(Boolean) : [];

    const report = await importXxxSources({
      extraUrls,
      dryRun: !!body.dryRun,
      includeDefaults: body.includeDefaults !== false,
      localDir: body.localDir || undefined,
    });

    if (!report.ok) {
      return res.status(400).json(report);
    }

    res.json({ success: true, ...report });
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;