import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Headphones, Bot, Sparkles, Send, CheckCircle, Clock, 
  AlertTriangle, RotateCcw, UserCheck, Shield, ChevronDown, ChevronUp
} from 'lucide-react';
import api from '../../services/api';
import './MasterSupportInbox.css';

export default function MasterSupportInbox({ notify }) {
  const [conversations, setConversations] = useState([]);
  const [selectedConv, setSelectedConv] = useState(null);
  const [messages, setMessages] = useState([]);
  const [filter, setFilter] = useState('ALL');
  const [replyText, setReplyText] = useState('');
  const [loading, setLoading] = useState(false);
  const [copilotLoading, setCopilotLoading] = useState(false);
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);

  // Carrega lista de chamados
  const fetchInbox = useCallback(async () => {
    try {
      const res = await api.get('/api/support/admin/inbox');
      setConversations(res.data);
      if (!selectedConv && res.data.length > 0) {
        setSelectedConv(res.data[0]);
      }
    } catch (err) {
      console.error('[MasterInbox] Erro ao carregar inbox:', err);
    }
  }, [selectedConv]);

  // Carrega mensagens da conversa selecionada
  const fetchMessages = useCallback(async (convId) => {
    if (!convId) return;
    try {
      const res = await api.get('/api/support/active', {
        headers: { 'x-force-conv-id': convId }
      });
      // Fallback para carregar diretamente do banco via inbox se necessário
      const convData = conversations.find(c => c.id === convId);
      if (convData) {
        // Obter mensagens completas
        const msgRes = await api.get(`/api/support/active`);
        if (msgRes.data?.conversation?.id === convId) {
          setMessages(msgRes.data.messages || []);
        }
      }
    } catch (err) {
      console.error('[MasterInbox] Erro ao carregar mensagens:', err);
    }
  }, [conversations]);

  useEffect(() => {
    fetchInbox();
  }, [fetchInbox]);

  useEffect(() => {
    if (selectedConv) {
      // Busca mensagens da conversa selecionada
      api.get('/api/support/admin/inbox').then(res => {
        const found = res.data.find(c => c.id === selectedConv.id);
        if (found) setSelectedConv(found);
      });
    }
  }, [selectedConv?.id]);

  // Conexão WebSocket para receber mensagens em tempo real
  useEffect(() => {
    const token = localStorage.getItem('iptv_token');
    if (!token) return;

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/ws/support?token=${encodeURIComponent(token)}`;

    let ws = null;
    try {
      ws = new WebSocket(wsUrl);
      socketRef.current = ws;

      ws.onmessage = (event) => {
        try {
          const data = JSON.parse(event.data);
          if (data.type === 'NEW_SUPPORT_MESSAGE') {
            fetchInbox();
            if (selectedConv && selectedConv.id === data.conversationId) {
              setMessages(prev => [...prev, data.message]);
            }
          } else if (data.type === 'CONVERSATION_UPDATED') {
            fetchInbox();
          }
        } catch (e) {}
      };
    } catch (e) {}

    return () => {
      if (ws) ws.close();
    };
  }, [selectedConv, fetchInbox]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Enviar Resposta do Dev
  const handleSendReply = async () => {
    if (!selectedConv || !replyText.trim()) return;
    setLoading(true);
    try {
      await api.post(`/api/support/admin/${selectedConv.id}/reply`, {
        message: replyText.trim()
      });
      setReplyText('');
      if (notify) notify('Resposta enviada ao cliente com sucesso!');
      fetchInbox();
    } catch (err) {
      if (notify) notify('Erro ao enviar resposta', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Alternar Modo AI <-> HUMAN
  const handleToggleMode = async () => {
    if (!selectedConv) return;
    const nextMode = selectedConv.mode === 'AI' ? 'HUMAN' : 'AI';
    try {
      await api.post(`/api/support/admin/${selectedConv.id}/mode`, { mode: nextMode });
      if (notify) notify(`Conversa transferida para modo ${nextMode === 'AI' ? 'IA Automática' : 'Atendimento Humano'}`);
      fetchInbox();
    } catch (err) {
      if (notify) notify('Erro ao alterar modo da conversa', 'error');
    }
  };

  // Marcar como Resolvido
  const handleResolve = async () => {
    if (!selectedConv) return;
    try {
      await api.post(`/api/support/admin/${selectedConv.id}/status`, { status: 'RESOLVED' });
      if (notify) notify('Chamado marcado como resolvido!');
      fetchInbox();
    } catch (err) {
      if (notify) notify('Erro ao resolver chamado', 'error');
    }
  };

  // Copiloto IA: Sugerir Resposta
  const handleSuggestReply = async () => {
    if (!selectedConv) return;
    setCopilotLoading(true);
    try {
      const res = await api.post(`/api/support/admin/${selectedConv.id}/suggest`);
      if (res.data?.suggestedReply) {
        setReplyText(res.data.suggestedReply);
        if (notify) notify('Sugestão do Copiloto inserida no campo de resposta!');
      }
    } catch (err) {
      if (notify) notify('Erro ao gerar sugestão da IA', 'error');
    } finally {
      setCopilotLoading(false);
    }
  };

  // Filtros de conversa
  const filteredConversations = conversations.filter(c => {
    if (filter === 'WAITING_ADMIN') return c.status === 'WAITING_ADMIN';
    if (filter === 'HUMAN') return c.mode === 'HUMAN';
    if (filter === 'AI') return c.mode === 'AI';
    if (filter === 'RESOLVED') return c.status === 'RESOLVED' || c.status === 'CLOSED';
    return true;
  });

  return (
    <div className="master-support-container">
      {/* Coluna Esquerda: Lista de Chamados */}
      <div className="master-support-sidebar">
        <div className="master-support-filter-bar">
          <button 
            className={`master-filter-btn ${filter === 'ALL' ? 'active' : ''}`}
            onClick={() => setFilter('ALL')}
          >
            Todos ({conversations.length})
          </button>
          <button 
            className={`master-filter-btn ${filter === 'WAITING_ADMIN' ? 'active' : ''}`}
            onClick={() => setFilter('WAITING_ADMIN')}
          >
            Aguardando Dev
          </button>
          <button 
            className={`master-filter-btn ${filter === 'HUMAN' ? 'active' : ''}`}
            onClick={() => setFilter('HUMAN')}
          >
            Humano
          </button>
          <button 
            className={`master-filter-btn ${filter === 'AI' ? 'active' : ''}`}
            onClick={() => setFilter('AI')}
          >
            IA
          </button>
        </div>

        <div className="master-conv-list">
          {filteredConversations.length === 0 ? (
            <div style={{ padding: '30px 20px', textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>
              Nenhum chamado neste filtro.
            </div>
          ) : (
            filteredConversations.map(c => (
              <div 
                key={c.id} 
                className={`master-conv-card ${selectedConv?.id === c.id ? 'active' : ''}`}
                onClick={() => setSelectedConv(c)}
              >
                <div className="master-conv-header">
                  <span className="master-conv-user">{c.user_name || c.username}</span>
                  <span className="master-conv-time">
                    {new Date(c.last_message_at || c.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </span>
                </div>
                <div className="master-conv-preview">
                  {c.last_message_text || c.subject || 'Sem mensagens'}
                </div>
                <div className="master-conv-tags">
                  <span className={`tag-${(c.priority || 'p3').toLowerCase()}`}>{c.priority}</span>
                  <span className={`tag-${(c.mode || 'ai').toLowerCase()}`}>
                    {c.mode === 'AI' ? 'Modo IA' : 'Humano'}
                  </span>
                  {c.unread_count > 0 && (
                    <span style={{ background: '#ef4444', color: '#fff', fontSize: '0.65rem', padding: '1px 6px', borderRadius: '10px', fontWeight: '800' }}>
                      {c.unread_count} nova(s)
                    </span>
                  )}
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {/* Coluna Direita: Chat & Detalhes */}
      <div className="master-support-chat-area">
        {selectedConv ? (
          <>
            {/* Topo do Chat */}
            <div className="master-chat-header">
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: '800', color: '#f8fafc', margin: 0 }}>
                  {selectedConv.user_name || selectedConv.username} 
                  <span style={{ fontSize: '0.75rem', color: '#94a3b8', fontWeight: 'normal', marginLeft: '8px' }}>
                    ({selectedConv.user_role}) • ID #{selectedConv.id}
                  </span>
                </h2>
                <span style={{ fontSize: '0.72rem', color: '#64748b' }}>
                  Status: {selectedConv.status} • Prioridade: {selectedConv.priority}
                </span>
              </div>

              <div className="master-chat-actions">
                <button 
                  className="btn-mode-toggle"
                  onClick={() => setShowDiagnostics(!showDiagnostics)}
                >
                  Diagnóstico {showDiagnostics ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                </button>

                <button className="btn-mode-toggle" onClick={handleToggleMode}>
                  <RotateCcw size={13} />
                  {selectedConv.mode === 'AI' ? 'Assumir Atendimento' : 'Devolver para IA'}
                </button>

                <button 
                  className="btn-mode-toggle" 
                  style={{ background: 'rgba(34, 197, 94, 0.15)', borderColor: 'rgba(34, 197, 94, 0.3)', color: '#4ade80' }}
                  onClick={handleResolve}
                >
                  <CheckCircle size={13} />
                  Resolver
                </button>
              </div>
            </div>

            {/* Painel Expansível de Diagnóstico Técnico */}
            {showDiagnostics && selectedConv.latest_diagnostic && (
              <div className="master-diag-panel">
                <div><strong>Rota:</strong> {selectedConv.latest_diagnostic.route || 'N/A'}</div>
                <div><strong>Resolução/Tela:</strong> {selectedConv.latest_diagnostic.screen || 'N/A'}</div>
                <div><strong>Stream Ativo:</strong> {selectedConv.latest_diagnostic.streamName || 'Nenhum'}</div>
                {selectedConv.latest_diagnostic.event && (
                  <div><strong>Último Erro:</strong> {selectedConv.latest_diagnostic.event.type}</div>
                )}
              </div>
            )}

            {/* Histórico de Mensagens */}
            <div className="master-chat-messages">
              <div className="vsa-msg vsa-msg-system">
                <div className="vsa-msg-bubble">
                  Chamado aberto em {new Date(selectedConv.created_at).toLocaleString()} • Modo atual: {selectedConv.mode}
                </div>
              </div>

              {selectedConv.last_message_text && (
                <div className="vsa-msg vsa-msg-user">
                  <div className="vsa-msg-bubble">
                    {selectedConv.last_message_text}
                  </div>
                </div>
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Barra de Copiloto IA */}
            <div className="master-copilot-bar">
              <span style={{ fontSize: '0.74rem', color: '#818cf8', display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={14} />
                Copiloto do Desenvolvedor: Sugere resposta com base no diagnóstico e mensagens.
              </span>
              <button 
                className="btn-copilot" 
                onClick={handleSuggestReply} 
                disabled={copilotLoading}
              >
                {copilotLoading ? 'Analisando...' : '✨ Sugerir Resposta'}
              </button>
            </div>

            {/* Caixa de Envio */}
            <div className="master-reply-bar">
              <input 
                type="text" 
                className="master-reply-input"
                placeholder="Escreva sua resposta como Desenvolvedor/Master..."
                value={replyText}
                onChange={(e) => setReplyText(e.target.value)}
                onKeyDown={(e) => e.key === 'Enter' && handleSendReply()}
                disabled={loading}
              />
              <button 
                className="btn-master-send" 
                onClick={handleSendReply}
                disabled={loading || !replyText.trim()}
              >
                <Send size={15} />
                Responder
              </button>
            </div>
          </>
        ) : (
          <div style={{ flex: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#64748b' }}>
            Selecione uma conversa ao lado para visualizar os detalhes.
          </div>
        )}
      </div>
    </div>
  );
}
