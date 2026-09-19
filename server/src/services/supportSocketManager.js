const WebSocket = require('ws');
const jwt = require('jsonwebtoken');
const db = require('../db/database');
const eventBus = require('./agentEventBus');

/**
 * SupportSocketManager — WebSocket em Tempo Real para Suporte e Central Dev
 * Opera em /ws/support compartilhado no servidor HTTP.
 * Fornece sincronização instantânea de mensagens, digitação e alertas operacionais.
 */
class SupportSocketManager {
  constructor() {
    this.wss = new WebSocket.Server({ noServer: true });
    this.adminSockets = new Set(); // conexões de administradores (Master)
    this.userSockets = new Map(); // userId -> Set of ws sockets
    this.typingUsers = new Map(); // convId -> Set of usernames
    this.init();
  }

  init() {
    this.wss.on('connection', (ws, req, user) => {
      ws.user = user;
      ws.isAlive = true;

      if (user.role === 'master' || user.role === 'admin') {
        this.adminSockets.add(ws);
      } else {
        if (!this.userSockets.has(user.id)) {
          this.userSockets.set(user.id, new Set());
        }
        this.userSockets.get(user.id).add(ws);
      }

      ws.on('pong', () => { ws.isAlive = true; });

      ws.on('message', (raw) => {
        try {
          const data = JSON.parse(raw);
          this.handleSocketMessage(ws, data);
        } catch (e) {
          console.error('[SupportSocket] Erro ao processar mensagem ws:', e.message);
        }
      });

      ws.on('close', () => {
        if (ws.user?.role === 'master' || ws.user?.role === 'admin') {
          this.adminSockets.delete(ws);
        } else if (ws.user?.id) {
          const set = this.userSockets.get(ws.user.id);
          if (set) {
            set.delete(ws);
            if (set.size === 0) this.userSockets.delete(ws.user.id);
          }
        }
      });
    });

    // Keepalive ping
    setInterval(() => {
      this.wss.clients.forEach((ws) => {
        if (!ws.isAlive) return ws.terminate();
        ws.isAlive = false;
        ws.ping();
      });
    }, 30000).unref();

    // Escuta eventos do EventBus para repassar ao painel Master em tempo real
    eventBus.on('GLOBAL_INCIDENT_DETECTED', (data) => {
      this.broadcastToAdmins('GLOBAL_INCIDENT', data);
    });

    eventBus.on('SECURITY_ACTION_TAKEN', (data) => {
      this.broadcastToAdmins('SECURITY_ALERT', data);
    });

    eventBus.on('SENTINEL_RECOVERY_INSTRUCTION', (data) => {
      if (data.targetUserId) {
        this.sendToUser(data.targetUserId, 'SENTINEL_INSTRUCTION', data);
      }
    });
  }

  handleUpgrade(request, socket, head) {
    const url = new URL(request.url, `http://${request.headers.host || 'localhost'}`);
    const token = url.searchParams.get('token') || (request.headers['sec-websocket-protocol'] || '').split(',')[0].trim();

    if (!token) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
      return;
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET || 'your_strong_jwt_secret_here');
      const user = db.prepare("SELECT id, username, role FROM users WHERE id = ?").get(decoded.id);
      if (!user) {
        socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
        socket.destroy();
        return;
      }

      this.wss.handleUpgrade(request, socket, head, (ws) => {
        this.wss.emit('connection', ws, request, user);
      });
    } catch (err) {
      socket.write('HTTP/1.1 401 Unauthorized\r\n\r\n');
      socket.destroy();
    }
  }

  handleSocketMessage(ws, data) {
    switch (data.action) {
      case 'typing': {
        const { conversationId, isTyping } = data;
        const payload = {
          type: 'TYPING_STATUS',
          conversationId,
          userId: ws.user.id,
          username: ws.user.username,
          isTyping: Boolean(isTyping)
        };

        if (ws.user.role === 'master' || ws.user.role === 'admin') {
          // Admin digitando -> notificar usuário dono da conversa
          const conv = db.prepare("SELECT user_id FROM support_conversations WHERE id = ?").get(conversationId);
          if (conv?.user_id) {
            this.sendToUser(conv.user_id, 'TYPING_STATUS', payload);
          }
        } else {
          // Usuário digitando -> notificar Master
          this.broadcastToAdmins('TYPING_STATUS', payload);
        }
        break;
      }

      case 'client_telemetry_event': {
        // Recebe eventos direto do player do navegador para alimentar o Sentinela
        if (data.event) {
          data.event.userId = ws.user.id;
          data.event.sessionId = data.sessionId || `ws_${ws.user.id}`;
          eventBus.publish(data.event);
        }
        break;
      }
    }
  }

  notifyNewMessage(conversationId, messageObj, targetUserId = null) {
    const payload = {
      type: 'NEW_SUPPORT_MESSAGE',
      conversationId,
      message: messageObj
    };

    // Sempre notifica o Master Inbox
    this.broadcastToAdmins('NEW_SUPPORT_MESSAGE', payload);

    // Se houver usuário alvo específico
    if (targetUserId) {
      this.sendToUser(targetUserId, 'NEW_SUPPORT_MESSAGE', payload);
    } else {
      // Descobre dono da conversa
      const conv = db.prepare("SELECT user_id FROM support_conversations WHERE id = ?").get(conversationId);
      if (conv?.user_id) {
        this.sendToUser(conv.user_id, 'NEW_SUPPORT_MESSAGE', payload);
      }
    }
  }

  notifyConversationUpdated(conversation) {
    this.broadcastToAdmins('CONVERSATION_UPDATED', { conversation });
    if (conversation.user_id) {
      this.sendToUser(conversation.user_id, 'CONVERSATION_UPDATED', { conversation });
    }
  }

  broadcastToAdmins(type, data) {
    const payload = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
    for (const ws of this.adminSockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }

  sendToUser(userId, type, data) {
    const sockets = this.userSockets.get(Number(userId));
    if (!sockets) return;
    const payload = JSON.stringify({ type, data, timestamp: new Date().toISOString() });
    for (const ws of sockets) {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(payload);
      }
    }
  }
}

const supportSocketManagerInstance = new SupportSocketManager();
module.exports = supportSocketManagerInstance;
