import React, { useState, useEffect, useRef, useCallback } from 'react';
import { 
  Bot, Headphones, X, Send, Sparkles, AlertCircle, 
  Wrench, UserCheck, CheckCircle2, ChevronDown, Play
} from 'lucide-react';
import api from '../services/api';
import './SupportBubble.css';

export default function SupportBubble({ user, currentRoute = '', currentStream = null }) {
  const [isOpen, setIsOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [conversation, setConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [inputValue, setInputValue] = useState('');
  const [loading, setLoading] = useState(false);
  const [isTyping, setIsTyping] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const socketRef = useRef(null);
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);

  // ==========================================
  // REGRA OBRIGATÓRIA: FULLSCREEN DETECTION
  // Quando em fullscreen real, o suporte DEVE SUMIR.
  // ==========================================
  useEffect(() => {
    const handleFullscreenCheck = () => {
      const fsEl = document.fullscreenElement || 
                   document.webkitFullscreenElement || 
                   document.mozFullScreenElement || 
                   document.msFullscreenElement;
      setIsFullscreen(Boolean(fsEl));
    };

    document.addEventListener('fullscreenchange', handleFullscreenCheck);
    document.addEventListener('webkitfullscreenchange', handleFullscreenCheck);
    document.addEventListener('mozfullscreenchange', handleFullscreenCheck);
    document.addEventListener('msfullscreenchange', handleFullscreenCheck);

    handleFullscreenCheck();

    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenCheck);
      document.removeEventListener('webkitfullscreenchange', handleFullscreenCheck);
      document.removeEventListener('mozfullscreenchange', handleFullscreenCheck);
      document.removeEventListener('msfullscreenchange', handleFullscreenCheck);
    };
  }, []);

  // Carrega conversa ativa
  const fetchActiveConversation = useCallback(async () => {
    try {
      const res = await api.get('/api/support/active');
      setConversation(res.data.conversation);
      setMessages(res.data.messages || []);
    } catch (err) {
      console.error('[SupportBubble] Erro ao carregar conversa:', err);
    }
  }, []);

  useEffect(() => {
    if (user) {
      fetchActiveConversation();
    }
  }, [user, fetchActiveConversation]);

  // WebSocket connection para atualizações em tempo real
  useEffect(() => {
    if (!user) return;

    const token = localStorage.getItem('iptv_token');
    if (!token) return;

    let ws = null;
    let reconnectTimer = null;

    const connectWs = () => {
      const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
      const host = window.location.host;
      const wsUrl = `${protocol}//${host}/ws/support?token=${encodeURIComponent(token)}`;

      try {
        ws = new WebSocket(wsUrl);
        socketRef.current = ws;

        ws.onmessage = (event) => {
          try {
            const data = JSON.parse(event.data);
            if (data.type === 'NEW_SUPPORT_MESSAGE') {
              setMessages((prev) => {
                // Evita duplicatas se mensagem já foi adicionada otimisticamente
                if (prev.some(m => m.id && m.id === data.message.id)) return prev;
                return [...prev, data.message];
              });

              if (!isOpen) {
                setUnreadCount((c) => c + 1);
              }
            } else if (data.type === 'CONVERSATION_UPDATED') {
              if (data.data?.conversation) {
                setConversation(data.data.conversation);
              }
            } else if (data.type === 'TYPING_STATUS') {
              setIsTyping(Boolean(data.data?.isTyping));
              if (typingTimeoutRef.current) clearTimeout(typingTimeoutRef.current);
              typingTimeoutRef.current = setTimeout(() => setIsTyping(false), 3500);
            }
          } catch (e) {}
        };

        ws.onclose = () => {
          reconnectTimer = setTimeout(connectWs, 5000);
        };
      } catch (err) {
        reconnectTimer = setTimeout(connectWs, 5000);
      }
    };

    connectWs();

    return () => {
      if (ws) ws.close();
      if (reconnectTimer) clearTimeout(reconnectTimer);
    };
  }, [user, isOpen]);

  // Auto-scroll
  useEffect(() => {
    if (isOpen) {
      messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
      setUnreadCount(0);
    }
  }, [messages, isOpen]);

  // Enviar Mensagem
  const handleSendMessage = async (customText = null) => {
    const textToSend = customText || inputValue;
    if (!textToSend || !textToSend.trim()) return;

    const optimisticMsg = {
      id: `temp_${Date.now()}`,
      sender_type: 'USER',
      message: textToSend.trim(),
      created_at: new Date().toISOString()
    };

    setMessages((prev) => [...prev, optimisticMsg]);
    if (!customText) setInputValue('');
    setLoading(true);

    try {
      const clientContext = {
        route: currentRoute || window.location.pathname,
        streamId: currentStream?.id || null,
        streamName: currentStream?.name || null,
        screen: `${window.innerWidth}x${window.innerHeight}`
      };

      const res = await api.post('/api/support/message', {
        conversationId: conversation?.id,
        message: textToSend.trim(),
        clientContext
      });

      if (res.data.conversation) {
        setConversation(res.data.conversation);
      }
      if (res.data.messages) {
        setMessages(res.data.messages);
      }
    } catch (err) {
      console.error('[SupportBubble] Erro ao enviar mensagem:', err);
    } finally {
      setLoading(false);
    }
  };

  // Escalar para Suporte Humano
  const handleEscalate = async () => {
    if (!conversation) return;
    setLoading(true);
    try {
      const res = await api.post('/api/support/escalate', {
        conversationId: conversation.id,
        reason: 'Usuário solicitou atendimento com atendente humano.'
      });
      if (res.data.conversation) {
        setConversation(res.data.conversation);
      }
      fetchActiveConversation();
    } catch (err) {
      console.error('[SupportBubble] Erro ao escalonar chamado:', err);
    } finally {
      setLoading(false);
    }
  };

  // Executar Recuperação Segura do Player
  const handleRecoverPlayer = async () => {
    setLoading(true);
    try {
      await api.post('/api/support/action/recover', {
        streamId: currentStream?.id || null,
        action: 'RECOVER_MEDIA'
      });
      handleSendMessage('Executei o procedimento de recuperação. O player foi reiniciado.');
    } catch (err) {
      console.error('[SupportBubble] Erro na recuperação do player:', err);
    } finally {
      setLoading(false);
    }
  };

  // Reproduzir Conteúdo Direto do Chat
  const handlePlayContent = (item) => {
    if (!item || !item.id) return;
    setIsOpen(false);
    // Dispara evento customizado para o player global ou rotas
    window.dispatchEvent(new CustomEvent('vsa_play_content', { detail: item }));
  };

  // Se estiver em fullscreen real do vídeo: SUMIR COMPLETAMENTE
  if (isFullscreen) {
    return null;
  }

  const isModeHuman = conversation?.mode === 'HUMAN';

  return (
    <>
      {/* Botão Flutuante Discreto */}
      <div 
        className="vsa-support-bubble" 
        onClick={() => setIsOpen(!isOpen)}
        title="Assistente & Suporte VSAIPTV"
      >
        {isModeHuman ? <Headphones size={22} /> : <Sparkles size={22} />}
        {unreadCount > 0 && <span className="vsa-bubble-badge">{unreadCount}</span>}
      </div>

      {/* Janela Flutuante */}
      {isOpen && (
        <div className="vsa-support-window">
          {/* Cabeçalho */}
          <div className="vsa-support-header">
            <div className="vsa-header-info">
              <div className={`vsa-mode-badge ${isModeHuman ? 'vsa-mode-human' : 'vsa-mode-ai'}`}>
                {isModeHuman ? (
                  <>
                    <UserCheck size={12} />
                    <span>Suporte Humano (Dev)</span>
                  </>
                ) : (
                  <>
                    <Bot size={12} />
                    <span>Assistente VSAIPTV</span>
                  </>
                )}
              </div>
            </div>

            <div className="vsa-header-actions">
              {!isModeHuman && (
                <button 
                  className="vsa-header-btn" 
                  onClick={handleEscalate}
                  title="Falar com Suporte Humano"
                >
                  <Headphones size={15} />
                </button>
              )}
              <button 
                className="vsa-header-btn" 
                onClick={() => setIsOpen(false)}
                title="Fechar"
              >
                <X size={17} />
              </button>
            </div>
          </div>

          {/* Quick Action Chips */}
          <div className="vsa-quick-chips">
            <button className="vsa-chip" onClick={() => handleSendMessage('Quero encontrar um conteúdo')}>
              🔎 Encontrar conteúdo
            </button>
            <button className="vsa-chip" onClick={() => handleSendMessage('Estou com problema para assistir')}>
              📺 Problema ao assistir
            </button>
            <button className="vsa-chip" onClick={() => handleSendMessage('Tenho uma dúvida sobre a conta')}>
              🔐 Minha conta
            </button>
            <button className="vsa-chip" onClick={() => handleSendMessage('Como renovar meu plano?')}>
              💳 Pagamento
            </button>
          </div>

          {/* Área de Mensagens */}
          <div className="vsa-messages-area">
            {messages.length === 0 && (
              <div className="vsa-msg vsa-msg-ai">
                <div className="vsa-msg-bubble">
                  Olá 👋 Sou o assistente VSAIPTV! Como posso ajudar você agora?
                </div>
              </div>
            )}

            {messages.map((m, idx) => (
              <div key={m.id || idx} className={`vsa-msg vsa-msg-${(m.sender_type || 'AI').toLowerCase()}`}>
                <div className="vsa-msg-bubble">
                  {m.message}

                  {/* Renderização de Cards de Catálogo encontrados pela IA */}
                  {m.metadata?.result?.results && Array.isArray(m.metadata.result.results) && (
                    <div style={{ marginTop: '8px' }}>
                      {m.metadata.result.results.slice(0, 3).map((item) => (
                        <div key={item.id} className="vsa-content-card">
                          {item.poster && (
                            <img src={item.poster} alt={item.name} className="vsa-card-poster" loading="lazy" />
                          )}
                          <div className="vsa-card-details">
                            <span className="vsa-card-title">{item.name}</span>
                            <span className="vsa-card-sub">{item.category} • ⭐ {item.rating}</span>
                          </div>
                          <button 
                            className="vsa-card-watch-btn"
                            onClick={() => handlePlayContent(item)}
                          >
                            <Play size={11} style={{ marginRight: '3px', verticalAlign: 'middle' }} />
                            Assistir
                          </button>
                        </div>
                      ))}
                    </div>
                  )}

                  {/* Renderização de Cartão de Recuperação Determinística */}
                  {m.metadata?.actionCard === 'RECOVER_PLAYER_CARD' && (
                    <div className="vsa-repair-card">
                      <span style={{ fontSize: '0.78rem', color: '#c7d2fe', fontWeight: '600' }}>
                        {m.metadata.title}
                      </span>
                      <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                        {m.metadata.description}
                      </span>
                      <button className="vsa-repair-btn" onClick={handleRecoverPlayer} disabled={loading}>
                        <Wrench size={13} />
                        Corrigir Reprodução Agora
                      </button>
                    </div>
                  )}
                </div>
                <span className="vsa-msg-time">
                  {new Date(m.created_at || Date.now()).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </span>
              </div>
            ))}

            {isTyping && (
              <div className="vsa-typing-indicator">
                <Sparkles size={12} className="spin-slow" />
                <span>Atendente digitando...</span>
              </div>
            )}

            <div ref={messagesEndRef} />
          </div>

          {/* Barra de Envio */}
          <form 
            className="vsa-support-input-bar" 
            onSubmit={(e) => { e.preventDefault(); handleSendMessage(); }}
          >
            <input 
              type="text" 
              className="vsa-input" 
              placeholder="Digite sua dúvida ou problema..."
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              disabled={loading}
            />
            <button type="submit" className="vsa-send-btn" disabled={loading || !inputValue.trim()}>
              <Send size={16} />
            </button>
          </form>
        </div>
      )}
    </>
  );
}
