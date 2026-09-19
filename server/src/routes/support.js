const express = require('express');
const router = express.Router();
const { verifyToken, requireRole } = require('../middleware/auth');
const db = require('../db/database');
const supportAgent = require('../services/supportAgent');
const socketManager = require('../services/supportSocketManager');
const actionEngine = require('../services/actionEngine');
const vsaiRouter = require('../services/vsaiRouterClient');

// ==========================================
// CLIENT ROUTES (Autenticado)
// ==========================================

/**
 * Obtém ou cria a conversa ativa do usuário
 */
router.get('/active', verifyToken, (req, res) => {
  try {
    const userId = req.user.id;
    let conv = db.prepare(`
      SELECT * FROM support_conversations 
      WHERE user_id = ? AND status NOT IN ('RESOLVED', 'CLOSED')
      ORDER BY updated_at DESC LIMIT 1
    `).get(userId);

    if (!conv) {
      const ins = db.prepare(`
        INSERT INTO support_conversations (user_id, status, priority, mode, subject)
        VALUES (?, 'AI_HANDLING', 'P3', 'AI', 'Atendimento Inicial')
      `).run(userId);
      conv = db.prepare("SELECT * FROM support_conversations WHERE id = ?").get(ins.lastInsertRowid);
    }

    const messages = db.prepare(`
      SELECT id, sender_type, message, metadata, created_at, read_at 
      FROM support_messages 
      WHERE conversation_id = ? 
      ORDER BY created_at ASC
    `).all(conv.id);

    // Formata metadata JSON
    const parsedMessages = messages.map(m => {
      let meta = null;
      try { meta = m.metadata ? JSON.parse(m.metadata) : null; } catch (e) {}
      return { ...m, metadata: meta };
    });

    res.json({
      conversation: conv,
      messages: parsedMessages
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter conversa ativa: ' + err.message });
  }
});

/**
 * Envia uma mensagem do usuário na conversa ativa
 */
router.post('/message', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId, message, clientContext } = req.body;

    if (!message || typeof message !== 'string' || !message.trim()) {
      return res.status(400).json({ error: 'Mensagem vazia' });
    }

    let conv = null;
    if (conversationId) {
      conv = db.prepare("SELECT * FROM support_conversations WHERE id = ? AND user_id = ?").get(conversationId, userId);
    }
    if (!conv) {
      const ins = db.prepare(`
        INSERT INTO support_conversations (user_id, status, priority, mode, subject)
        VALUES (?, 'AI_HANDLING', 'P3', 'AI', 'Novo Atendimento')
      `).run(userId);
      conv = db.prepare("SELECT * FROM support_conversations WHERE id = ?").get(ins.lastInsertRowid);
    }

    // Processa pelo SupportAgent
    const result = await supportAgent.processUserMessage({
      conversationId: conv.id,
      userId,
      userMessage: message.trim(),
      clientContext: clientContext || {}
    });

    // Notifica via WebSocket
    socketManager.notifyNewMessage(conv.id, {
      sender_type: 'USER',
      message: message.trim(),
      metadata: clientContext
    }, userId);

    if (result.handledBy === 'AI' || result.handledBy === 'AI_FALLBACK') {
      socketManager.notifyNewMessage(conv.id, {
        sender_type: 'AI',
        message: result.message,
        metadata: result.metadata
      }, userId);
    }

    // Busca lista atualizada de mensagens
    const updatedMessages = db.prepare(`
      SELECT id, sender_type, message, metadata, created_at, read_at 
      FROM support_messages 
      WHERE conversation_id = ? 
      ORDER BY created_at ASC
    `).all(conv.id).map(m => {
      let meta = null;
      try { meta = m.metadata ? JSON.parse(m.metadata) : null; } catch (e) {}
      return { ...m, metadata: meta };
    });

    const updatedConv = db.prepare("SELECT * FROM support_conversations WHERE id = ?").get(conv.id);

    res.json({
      success: true,
      conversation: updatedConv,
      messages: updatedMessages,
      aiResponse: result
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao processar mensagem: ' + err.message });
  }
});

/**
 * Escala o atendimento para suporte humano (Dev/Master)
 */
router.post('/escalate', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { conversationId, diagnostics, reason } = req.body;

    const conv = db.prepare("SELECT * FROM support_conversations WHERE id = ? AND user_id = ?").get(conversationId, userId);
    if (!conv) {
      return res.status(404).json({ error: 'Conversa não encontrada' });
    }

    db.prepare(`
      UPDATE support_conversations 
      SET mode = 'HUMAN', status = 'WAITING_ADMIN', priority = 'P2', updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(conv.id);

    if (diagnostics) {
      db.prepare(`
        INSERT INTO support_diagnostics (conversation_id, snapshot_json) 
        VALUES (?, ?)
      `).run(conv.id, JSON.stringify(diagnostics));
    }

    const systemMsg = reason || 'Chamado transferido para a equipe de suporte humano.';
    db.prepare(`
      INSERT INTO support_messages (conversation_id, sender_type, message) 
      VALUES (?, 'SYSTEM', ?)
    `).run(conv.id, systemMsg);

    const updatedConv = db.prepare("SELECT * FROM support_conversations WHERE id = ?").get(conv.id);
    socketManager.notifyConversationUpdated(updatedConv);
    socketManager.notifyNewMessage(conv.id, {
      sender_type: 'SYSTEM',
      message: systemMsg
    }, userId);

    res.json({
      success: true,
      mode: 'HUMAN',
      conversation: updatedConv
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao escalonar chamado: ' + err.message });
  }
});

/**
 * Ação rápida de recuperação solicitada pelo usuário no chat
 */
router.post('/action/recover', verifyToken, async (req, res) => {
  try {
    const userId = req.user.id;
    const { streamId, action = 'RECOVER_MEDIA' } = req.body;

    const result = await actionEngine.executeAction('recoverPlayer', {
      action,
      streamId,
      userId
    }, 'support');

    res.json(result);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao executar recuperação: ' + err.message });
  }
});

// ==========================================
// MASTER / ADMIN ROUTES
// ==========================================

/**
 * Inbox do Master: Lista todas as conversas de suporte com detalhes e status
 */
router.get('/admin/inbox', verifyToken, requireRole('master', 'admin'), (req, res) => {
  try {
    const conversations = db.prepare(`
      SELECT 
        c.*, 
        u.username, u.name as user_name, u.role as user_role,
        (SELECT COUNT(*) FROM support_messages m WHERE m.conversation_id = c.id AND m.read_at IS NULL AND m.sender_type = 'USER') as unread_count,
        (SELECT message FROM support_messages m WHERE m.conversation_id = c.id ORDER BY m.created_at DESC LIMIT 1) as last_message_text,
        (SELECT snapshot_json FROM support_diagnostics d WHERE d.conversation_id = c.id ORDER BY d.created_at DESC LIMIT 1) as latest_diagnostic
      FROM support_conversations c
      JOIN users u ON c.user_id = u.id
      ORDER BY 
        CASE c.status
          WHEN 'WAITING_ADMIN' THEN 1
          WHEN 'OPEN' THEN 2
          WHEN 'ADMIN_HANDLING' THEN 3
          WHEN 'AI_HANDLING' THEN 4
          WHEN 'WAITING_USER' THEN 5
          ELSE 6
        END,
        c.last_message_at DESC
    `).all();

    const formatted = conversations.map(c => {
      let diag = null;
      try { diag = c.latest_diagnostic ? JSON.parse(c.latest_diagnostic) : null; } catch (e) {}
      return { ...c, latest_diagnostic: diag };
    });

    res.json(formatted);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao listar inbox de suporte: ' + err.message });
  }
});

/**
 * Resposta do Dev/Admin
 */
router.post('/admin/:id/reply', verifyToken, requireRole('master', 'admin'), (req, res) => {
  try {
    const convId = req.params.id;
    const adminId = req.user.id;
    const { message } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Mensagem vazia' });
    }

    const conv = db.prepare("SELECT * FROM support_conversations WHERE id = ?").get(convId);
    if (!conv) return res.status(404).json({ error: 'Conversa não encontrada' });

    // Salva mensagem do admin
    db.prepare(`
      INSERT INTO support_messages (conversation_id, sender_type, sender_user_id, message)
      VALUES (?, 'ADMIN', ?, ?)
    `).run(convId, adminId, message.trim());

    // Marca mensagens do usuário como lidas
    db.prepare(`
      UPDATE support_messages 
      SET read_at = CURRENT_TIMESTAMP 
      WHERE conversation_id = ? AND sender_type = 'USER' AND read_at IS NULL
    `).run(convId);

    // Atualiza conversa para ADMIN_HANDLING e modo HUMAN
    db.prepare(`
      UPDATE support_conversations 
      SET status = 'ADMIN_HANDLING', mode = 'HUMAN', assigned_admin_id = ?, updated_at = CURRENT_TIMESTAMP, last_message_at = CURRENT_TIMESTAMP
      WHERE id = ?
    `).run(adminId, convId);

    const updatedConv = db.prepare("SELECT * FROM support_conversations WHERE id = ?").get(convId);

    socketManager.notifyNewMessage(convId, {
      sender_type: 'ADMIN',
      message: message.trim(),
      admin_name: req.user.name || req.user.username
    }, conv.user_id);

    socketManager.notifyConversationUpdated(updatedConv);

    res.json({ success: true, conversation: updatedConv });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao enviar resposta de suporte: ' + err.message });
  }
});

/**
 * Alterna modo da conversa (AI <-> HUMAN) "[Devolver para IA]"
 */
router.post('/admin/:id/mode', verifyToken, requireRole('master', 'admin'), (req, res) => {
  try {
    const convId = req.params.id;
    const { mode } = req.body; // 'AI' ou 'HUMAN'

    if (!['AI', 'HUMAN'].includes(mode)) {
      return res.status(400).json({ error: 'Modo inválido' });
    }

    const newStatus = mode === 'AI' ? 'AI_HANDLING' : 'ADMIN_HANDLING';
    db.prepare(`
      UPDATE support_conversations 
      SET mode = ?, status = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(mode, newStatus, convId);

    const systemMsg = mode === 'AI' 
      ? 'O atendimento foi devolvido para o Assistente Virtual VSAIPTV.' 
      : 'Você agora está em atendimento com a equipe de suporte humano.';

    db.prepare(`
      INSERT INTO support_messages (conversation_id, sender_type, message)
      VALUES (?, 'SYSTEM', ?)
    `).run(convId, systemMsg);

    const updatedConv = db.prepare("SELECT * FROM support_conversations WHERE id = ?").get(convId);
    socketManager.notifyConversationUpdated(updatedConv);
    socketManager.notifyNewMessage(convId, { sender_type: 'SYSTEM', message: systemMsg }, updatedConv.user_id);

    res.json({ success: true, conversation: updatedConv });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao alterar modo da conversa: ' + err.message });
  }
});

/**
 * Atualiza status da conversa (ex: RESOLVED, CLOSED)
 */
router.post('/admin/:id/status', verifyToken, requireRole('master', 'admin'), (req, res) => {
  try {
    const convId = req.params.id;
    const { status } = req.body;

    const allowed = ['OPEN', 'AI_HANDLING', 'WAITING_USER', 'WAITING_ADMIN', 'ADMIN_HANDLING', 'RESOLVED', 'CLOSED'];
    if (!allowed.includes(status)) {
      return res.status(400).json({ error: 'Status inválido' });
    }

    db.prepare(`
      UPDATE support_conversations 
      SET status = ?, updated_at = CURRENT_TIMESTAMP 
      WHERE id = ?
    `).run(status, convId);

    const updatedConv = db.prepare("SELECT * FROM support_conversations WHERE id = ?").get(convId);
    socketManager.notifyConversationUpdated(updatedConv);

    res.json({ success: true, conversation: updatedConv });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao atualizar status: ' + err.message });
  }
});

/**
 * Copiloto Dev: Sugere resposta inteligente analisando mensagens e diagnósticos
 */
router.post('/admin/:id/suggest', verifyToken, requireRole('master', 'admin'), async (req, res) => {
  try {
    const convId = req.params.id;
    const suggestion = await supportAgent.suggestDevReply({ conversationId: convId });
    res.json(suggestion);
  } catch (err) {
    res.status(500).json({ error: 'Erro ao sugerir resposta: ' + err.message });
  }
});

/**
 * Central de Observabilidade dos Agentes: Status, Kill Switches e Métricas
 */
router.get('/admin/agents/status', verifyToken, requireRole('master', 'admin'), async (req, res) => {
  try {
    const sentinelSetting = db.prepare("SELECT value FROM system_settings WHERE key = 'sentinel_auto_heal'").get();
    const securitySetting = db.prepare("SELECT value FROM system_settings WHERE key = 'security_auto_action'").get();
    const aiSupportSetting = db.prepare("SELECT value FROM system_settings WHERE key = 'ai_support_enabled'").get();

    const vsaiHealth = await vsaiRouter.checkHealth();

    const recentRuns = db.prepare(`
      SELECT * FROM agent_runs 
      ORDER BY created_at DESC LIMIT 15
    `).all();

    const activeIncidents = db.prepare(`
      SELECT * FROM agent_global_incidents 
      WHERE status = 'ACTIVE' 
      ORDER BY created_at DESC LIMIT 10
    `).all();

    const stats = {
      totalRecovered24h: db.prepare("SELECT COUNT(*) as c FROM agent_runs WHERE status = 'recovered' AND created_at >= datetime('now', '-1 day')").get().c,
      totalIncidents24h: db.prepare("SELECT COUNT(*) as c FROM agent_global_incidents WHERE created_at >= datetime('now', '-1 day')").get().c,
      openTickets: db.prepare("SELECT COUNT(*) as c FROM support_conversations WHERE status IN ('WAITING_ADMIN', 'OPEN', 'ADMIN_HANDLING')").get().c
    };

    res.json({
      agents: {
        sentinel: { status: 'ONLINE', autoHeal: sentinelSetting?.value !== 'false' },
        security: { status: 'ONLINE', autoAction: securitySetting?.value !== 'false' },
        support: { status: 'ONLINE', enabled: aiSupportSetting?.value !== 'false' },
        vsairouter: vsaiHealth
      },
      stats,
      activeIncidents,
      recentRuns
    });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao obter status dos agentes: ' + err.message });
  }
});

/**
 * Ativa/desativa kill switches de automação
 */
router.post('/admin/agents/toggle', verifyToken, requireRole('master', 'admin'), (req, res) => {
  try {
    const { key, value } = req.body;
    const allowed = ['sentinel_auto_heal', 'security_auto_action', 'ai_support_enabled'];
    if (!allowed.includes(key)) {
      return res.status(400).json({ error: 'Chave de automação inválida' });
    }

    const valStr = value ? 'true' : 'false';
    db.prepare(`
      INSERT INTO system_settings (key, value) VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value
    `).run(key, valStr);

    res.json({ success: true, key, value: value });
  } catch (err) {
    res.status(500).json({ error: 'Erro ao alternar kill switch: ' + err.message });
  }
});

module.exports = router;
