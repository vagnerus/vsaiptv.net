import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { 
  Users, Zap, Coins, Clock, AlertTriangle, 
  Plus, RefreshCw, Copy, Check, Trash2, Power, 
  MessageSquare, Share2, Tv, X, Wifi
} from 'lucide-react';

export default function ResellerDashboard({ user }) {
  const [profile, setProfile] = useState(null);
  const [clients, setClients] = useState([]);
  const [activeConnections, setActiveConnections] = useState([]);
  const [creditHistory, setCreditHistory] = useState([]);
  const [activeSubTab, setActiveSubTab] = useState('clients'); // clients, trials, connections, credits
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState({ message: '', type: '' });

  // Modals
  const [modalNewClient, setModalNewClient] = useState(false);
  const [modalNewTrial, setModalNewTrial] = useState(false);
  const [trialResult, setTrialResult] = useState(null); // Generated trial ready to copy
  const [modalRenew, setModalRenew] = useState(null); // client object
  const [modalLinks, setModalLinks] = useState(null); // client object

  // Forms
  const [clientForm, setClientForm] = useState({
    username: '',
    password: '',
    name: '',
    phone: '',
    months: 1,
    max_connections: 1,
  });

  const [trialForm, setTrialForm] = useState({
    hours: 4,
    name: 'Cliente Teste',
    phone: '',
    max_connections: 1,
  });

  const [renewMonths, setRenewMonths] = useState(1);

  const notify = (msg, type = 'success') => {
    setFeedback({ message: msg, type });
    setTimeout(() => setFeedback({ message: '', type: '' }), 4000);
  };

  const fetchData = async () => {
    setLoading(true);
    try {
      const [profRes, clRes, connRes, histRes] = await Promise.all([
        api.get('/api/reseller/profile'),
        api.get('/api/reseller/clients'),
        api.get('/api/reseller/active-connections'),
        api.get('/api/reseller/credit-history'),
      ]);

      setProfile(profRes.data);
      setClients(clRes.data);
      setActiveConnections(connRes.data);
      setCreditHistory(histRes.data);
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
    const interval = setInterval(fetchData, 15000); // 15s refresh
    return () => clearInterval(interval);
  }, []);

  const handleCreateClient = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/api/reseller/clients', clientForm);
      notify(res.data.message);
      setModalNewClient(false);
      setClientForm({ username: '', password: '', name: '', phone: '', months: 1, max_connections: 1 });
      fetchData();
    } catch (err) {
      notify(err.response?.data?.error || 'Erro ao criar cliente', 'error');
    }
  };

  const handleGenerateTrial = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/api/reseller/generate-trial', trialForm);
      setTrialResult(res.data.trial);
      setModalNewTrial(false);
      notify('Teste gerado com sucesso!');
      fetchData();
    } catch (err) {
      notify(err.response?.data?.error || 'Erro ao gerar teste', 'error');
    }
  };

  const handleRenewClient = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post(`/api/reseller/clients/${modalRenew.id}/renew`, { months: renewMonths });
      notify(res.data.message);
      setModalRenew(null);
      fetchData();
    } catch (err) {
      notify(err.response?.data?.error || 'Erro ao renovar cliente', 'error');
    }
  };

  const handleToggleStatus = async (client) => {
    const newStatus = client.status === 'active' ? 'suspended' : 'active';
    try {
      await api.post(`/api/reseller/clients/${client.id}/status`, { status: newStatus });
      notify(`Cliente ${newStatus === 'active' ? 'ativado' : 'suspenso'}!`);
      fetchData();
    } catch (err) {
      notify('Erro ao alterar status', 'error');
    }
  };

  const handleDeleteClient = async (id, username) => {
    if (!confirm(`Tem certeza que deseja excluir o cliente ${username}?`)) return;
    try {
      await api.delete(`/api/reseller/clients/${id}`);
      notify('Cliente excluído!');
      fetchData();
    } catch (err) {
      notify('Erro ao excluir cliente', 'error');
    }
  };

  const handleKillConnection = async (id) => {
    try {
      await api.delete(`/api/reseller/connections/${id}`);
      notify('Conexão encerrada com sucesso!');
      fetchData();
    } catch (err) {
      notify('Erro ao derrubar conexão', 'error');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    notify('Copiado para a área de transferência!');
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto' }}>
      
      {/* Toast Feedback */}
      {feedback.message && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 2000,
          background: feedback.type === 'error' ? '#ef4444' : '#10b981',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 8px 25px rgba(0,0,0,0.4)',
          display: 'flex',
          alignItems: 'center',
          gap: '8px',
          fontWeight: '600',
          fontSize: '0.9rem',
        }}>
          <Check size={18} />
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Low Credits Warning Banner */}
      {profile?.isLowCredit && (
        <div style={{
          background: 'rgba(239, 68, 68, 0.15)',
          border: '1px solid rgba(239, 68, 68, 0.35)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px 20px',
          marginBottom: '24px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
            <AlertTriangle size={24} color="#f87171" />
            <div>
              <strong style={{ color: '#f87171', fontSize: '0.95rem' }}>Atenção: Saldo de Créditos Baixo!</strong>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                Você possui apenas <strong>{profile.reseller.credits.toFixed(1)} créditos</strong>. Solicite uma recarga ao Administrador Master para não interromper novas ativações.
              </p>
            </div>
          </div>
          <span className="badge badge-expired">Alerta de Recarga</span>
        </div>
      )}

      {/* Top Metrics & Action Bar */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
        
        {/* Credits Card */}
        <div className="stat-card" style={{ borderLeft: '4px solid #6366f1' }}>
          <div>
            <span className="stat-label">Meu Saldo Atual</span>
            <div className="stat-value" style={{ color: '#818cf8' }}>
              {profile?.reseller?.credits?.toFixed(1) || '0.0'}
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
              1 crédito = 1 mês de ativação
            </span>
          </div>
          <div className="stat-icon-wrapper" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
            <Coins size={24} />
          </div>
        </div>

        {/* Active Clients */}
        <div className="stat-card">
          <div>
            <span className="stat-label">Clientes Ativos</span>
            <div className="stat-value" style={{ color: '#10b981' }}>
              {profile?.stats?.active_clients || 0}
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
              Total na carteira: {profile?.stats?.total_clients || 0}
            </span>
          </div>
          <div className="stat-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
            <Users size={24} />
          </div>
        </div>

        {/* Active Trials */}
        <div className="stat-card">
          <div>
            <span className="stat-label">Testes em Andamento</span>
            <div className="stat-value" style={{ color: '#f59e0b' }}>
              {profile?.stats?.active_trials || 0}
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
              Testes grátis temporários
            </span>
          </div>
          <div className="stat-icon-wrapper" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
            <Clock size={24} />
          </div>
        </div>

        {/* Active Streams */}
        <div className="stat-card">
          <div>
            <span className="stat-label">Telas Assistindo Agora</span>
            <div className="stat-value" style={{ color: '#06b6d4' }}>
              {activeConnections.length}
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
              Transmissões em tempo real
            </span>
          </div>
          <div className="stat-icon-wrapper" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#22d3ee' }}>
            <Wifi size={24} />
          </div>
        </div>

      </div>

      {/* Main Action Buttons */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '24px' }}>
        <div style={{ display: 'flex', gap: '10px' }}>
          <button 
            onClick={() => setModalNewTrial(true)} 
            className="btn"
            style={{ background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', color: '#fff', boxShadow: '0 4px 15px rgba(245, 158, 11, 0.3)' }}
          >
            <Zap size={16} /> ⚡ Gerar Teste Rápido
          </button>
          <button 
            onClick={() => setModalNewClient(true)} 
            className="btn btn-primary"
          >
            <Plus size={16} /> Ativar Novo Cliente
          </button>
        </div>

        {/* Subtabs */}
        <div style={{
          display: 'flex',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          padding: '4px',
          borderRadius: 'var(--radius-md)',
        }}>
          <button
            onClick={() => setActiveSubTab('clients')}
            className={`btn btn-sm ${activeSubTab === 'clients' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ border: 'none' }}
          >
            Meus Clientes ({clients.length})
          </button>
          <button
            onClick={() => setActiveSubTab('connections')}
            className={`btn btn-sm ${activeSubTab === 'connections' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ border: 'none' }}
          >
            Telas Conectadas ({activeConnections.length})
          </button>
          <button
            onClick={() => setActiveSubTab('credits')}
            className={`btn btn-sm ${activeSubTab === 'credits' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ border: 'none' }}
          >
            Extrato de Créditos
          </button>
        </div>
      </div>

      {/* ==================================================== */}
      {/* SUBTAB: CLIENTS LIST */}
      {/* ==================================================== */}
      {activeSubTab === 'clients' && (
        <div className="glass-card animate-fade" style={{ padding: '24px' }}>
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Senha</th>
                  <th>WhatsApp / Nome</th>
                  <th>Telas</th>
                  <th>Expiração</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {clients.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-dim)' }}>
                      Você ainda não cadastrou nenhum cliente. Clique em "Gerar Teste Rápido" ou "Ativar Novo Cliente" acima!
                    </td>
                  </tr>
                ) : (
                  clients.map((c) => (
                    <tr key={c.id}>
                      <td>
                        <strong>{c.username}</strong>
                        {c.is_trial === 1 && (
                          <span className="badge badge-trial" style={{ marginLeft: '6px', fontSize: '0.65rem' }}>
                            Teste ({c.trial_hours}h)
                          </span>
                        )}
                      </td>
                      <td>
                        <code style={{ fontSize: '0.82rem', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px' }}>
                          {c.plain_password || '••••••'}
                        </code>
                      </td>
                      <td>
                        <div>{c.name}</div>
                        <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{c.phone || 'Sem contato'}</div>
                      </td>
                      <td>
                        <span style={{ fontWeight: '600' }}>
                          {c.active_screens || 0} / {c.max_connections} tela(s)
                        </span>
                      </td>
                      <td style={{ fontSize: '0.82rem' }}>
                        {c.expires_at ? (
                          <span style={{ color: new Date(c.expires_at) < new Date() ? '#f87171' : '#34d399' }}>
                            {new Date(c.expires_at).toLocaleDateString('pt-BR')} {new Date(c.expires_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </span>
                        ) : 'Vitalício'}
                      </td>
                      <td>
                        <span className={`badge ${c.status === 'active' ? 'badge-active' : c.status === 'expired' ? 'badge-expired' : 'badge-suspended'}`}>
                          {c.status === 'active' ? 'Ativo' : c.status === 'expired' ? 'Expirado' : 'Suspenso'}
                        </span>
                      </td>
                      <td>
                        <div style={{ display: 'flex', gap: '6px' }}>
                          <button
                            onClick={() => setModalLinks(c)}
                            className="btn btn-secondary btn-sm"
                            title="Copiar dados / M3U"
                          >
                            <Copy size={13} /> Dados
                          </button>
                          <button
                            onClick={() => { setModalRenew(c); setRenewMonths(1); }}
                            className="btn btn-success btn-sm"
                            title="Renovar assinatura com créditos"
                          >
                            <RefreshCw size={13} /> Renovar
                          </button>
                          <button
                            onClick={() => handleToggleStatus(c)}
                            className="btn btn-secondary btn-sm"
                            title={c.status === 'active' ? 'Suspender cliente' : 'Reativar cliente'}
                          >
                            <Power size={13} color={c.status === 'active' ? '#f87171' : '#34d399'} />
                          </button>
                          <button
                            onClick={() => handleDeleteClient(c.id, c.username)}
                            className="btn btn-danger btn-sm"
                            title="Excluir"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* SUBTAB: CONNECTED STREAMS */}
      {/* ==================================================== */}
      {activeSubTab === 'connections' && (
        <div className="glass-card animate-fade" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '16px' }}>
            Telas Conectadas dos Meus Clientes
          </h3>
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Canal / Conteúdo</th>
                  <th>Dispositivo</th>
                  <th>IP Conectado</th>
                  <th>Conectado às</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {activeConnections.length === 0 ? (
                  <tr>
                    <td colSpan={6} style={{ textAlign: 'center', padding: '36px', color: 'var(--text-dim)' }}>
                      Nenhum dos seus clientes está assistindo no momento.
                    </td>
                  </tr>
                ) : (
                  activeConnections.map((conn) => (
                    <tr key={conn.id}>
                      <td><strong>{conn.username}</strong></td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <Tv size={14} color="#818cf8" />
                          <span>{conn.stream_name || 'Desconhecido'}</span>
                        </div>
                      </td>
                      <td>{conn.device_type}</td>
                      <td><code>{conn.ip_address}</code></td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {new Date(conn.connected_at).toLocaleTimeString('pt-BR')}
                      </td>
                      <td>
                        <button
                          onClick={() => handleKillConnection(conn.id)}
                          className="btn btn-danger btn-sm"
                        >
                          Derrubar Tela
                        </button>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* SUBTAB: CREDIT HISTORY */}
      {/* ==================================================== */}
      {activeSubTab === 'credits' && (
        <div className="glass-card animate-fade" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1.2rem', fontWeight: '700', marginBottom: '16px' }}>
            Histórico e Extrato da Carteira de Créditos
          </h3>
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Data & Hora</th>
                  <th>Descrição / Motivo</th>
                  <th>Cliente Envolvido</th>
                  <th>Movimentação</th>
                  <th>Saldo Resultante</th>
                </tr>
              </thead>
              <tbody>
                {creditHistory.map((h) => (
                  <tr key={h.id}>
                    <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                      {new Date(h.created_at).toLocaleString('pt-BR')}
                    </td>
                    <td>{h.reason}</td>
                    <td>{h.client_username ? <strong>@{h.client_username}</strong> : '-'}</td>
                    <td>
                      <span style={{ fontWeight: '700', color: h.amount > 0 ? '#34d399' : '#f87171' }}>
                        {h.amount > 0 ? `+${h.amount}` : h.amount}
                      </span>
                    </td>
                    <td>
                      <strong>{h.balance_after.toFixed(1)} créditos</strong>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: FAST TRIAL GENERATOR (2h, 4h, 6h) */}
      {/* ==================================================== */}
      {modalNewTrial && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={20} color="#f59e0b" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>Gerador Instantâneo de Teste Grátis</h3>
              </div>
              <button onClick={() => setModalNewTrial(false)} className="btn btn-secondary btn-sm"><X size={16} /></button>
            </div>
            <form onSubmit={handleGenerateTrial}>
              <div className="modal-body">
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                  Gere um teste temporário gratuito em 1 clique sem consumir o saldo de créditos da sua carteira.
                </p>

                <div className="input-group">
                  <label className="input-label">Duração do Teste</label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '8px' }}>
                    {[2, 4, 6].map((hrs) => (
                      <button
                        key={hrs}
                        type="button"
                        onClick={() => setTrialForm({ ...trialForm, hours: hrs })}
                        style={{
                          padding: '10px',
                          borderRadius: 'var(--radius-md)',
                          border: `1px solid ${trialForm.hours === hrs ? '#f59e0b' : 'var(--border-color)'}`,
                          background: trialForm.hours === hrs ? 'rgba(245, 158, 11, 0.15)' : 'var(--bg-input)',
                          color: trialForm.hours === hrs ? '#fbbf24' : 'var(--text-muted)',
                          fontWeight: '700',
                          cursor: 'pointer',
                        }}
                      >
                        ⚡ {hrs} Horas
                      </button>
                    ))}
                  </div>
                </div>

                <div className="input-group">
                  <label className="input-label">Nome do Contato (Opcional)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ex: Carlos Oliveira"
                    value={trialForm.name}
                    onChange={(e) => setTrialForm({ ...trialForm, name: e.target.value })}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">WhatsApp do Contato (Opcional)</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="+55 11 99999-9999"
                    value={trialForm.phone}
                    onChange={(e) => setTrialForm({ ...trialForm, phone: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setModalNewTrial(false)} className="btn btn-secondary">Cancelar</button>
                <button type="submit" className="btn" style={{ background: '#f59e0b', color: '#fff', fontWeight: '700' }}>
                  Gerar Teste Agora
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: TRIAL CREATED & WHATSAPP TEMPLATE */}
      {/* ==================================================== */}
      {trialResult && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Check size={20} color="#10b981" />
                <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>Teste Liberado com Sucesso!</h3>
              </div>
              <button onClick={() => setTrialResult(null)} className="btn btn-secondary btn-sm"><X size={16} /></button>
            </div>
            <div className="modal-body">
              
              {/* Quick credential cards */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '16px' }}>
                <div style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Usuário</span>
                  <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#818cf8' }}>{trialResult.username}</div>
                </div>
                <div style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', border: '1px solid var(--border-color)' }}>
                  <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)', textTransform: 'uppercase' }}>Senha</span>
                  <div style={{ fontSize: '1.1rem', fontWeight: '700', color: '#34d399' }}>{trialResult.password}</div>
                </div>
              </div>

              {/* Ready to send WhatsApp Message */}
              <div className="input-group">
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '6px' }}>
                  <label className="input-label" style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <MessageSquare size={14} color="#25D366" /> Mensagem Pronta para WhatsApp:
                  </label>
                  <button
                    onClick={() => copyToClipboard(trialResult.whatsappMessage)}
                    className="btn btn-secondary btn-sm"
                  >
                    <Copy size={13} /> Copiar Mensagem
                  </button>
                </div>
                <textarea
                  className="form-control"
                  rows={9}
                  readOnly
                  value={trialResult.whatsappMessage}
                  style={{ fontFamily: 'monospace', fontSize: '0.82rem', background: '#0a101d' }}
                />
              </div>

            </div>
            <div className="modal-footer">
              <button
                onClick={() => {
                  const url = `https://api.whatsapp.com/send?text=${encodeURIComponent(trialResult.whatsappMessage)}`;
                  window.open(url, '_blank');
                }}
                className="btn btn-success"
              >
                <Share2 size={16} /> Abrir no WhatsApp Web
              </button>
              <button onClick={() => setTrialResult(null)} className="btn btn-secondary">Concluir</button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: CREATE OFFICIAL CLIENT */}
      {/* ==================================================== */}
      {modalNewClient && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>Ativar Novo Cliente Oficial</h3>
              <button onClick={() => setModalNewClient(false)} className="btn btn-secondary btn-sm"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreateClient}>
              <div className="modal-body">
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                  Cada mês de ativação consumirá <strong>1 crédito</strong> do seu saldo. Seu saldo atual: <strong>{profile?.reseller?.credits?.toFixed(1)} créditos</strong>.
                </p>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="input-group">
                    <label className="input-label">Usuário de Acesso</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      placeholder="Ex: marcos_silva"
                      value={clientForm.username}
                      onChange={(e) => setClientForm({ ...clientForm, username: e.target.value })}
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Senha</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      placeholder="Ex: tv12345"
                      value={clientForm.password}
                      onChange={(e) => setClientForm({ ...clientForm, password: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="input-group">
                    <label className="input-label">Nome do Cliente</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Marcos Silva"
                      value={clientForm.name}
                      onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label">WhatsApp</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="+55 11 9..."
                      value={clientForm.phone}
                      onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="input-group">
                    <label className="input-label">Período de Validade</label>
                    <select
                      className="form-control"
                      value={clientForm.months}
                      onChange={(e) => setClientForm({ ...clientForm, months: parseInt(e.target.value) })}
                    >
                      <option value={1}>1 Mês (1 Crédito)</option>
                      <option value={3}>3 Meses (3 Créditos)</option>
                      <option value={6}>6 Meses (6 Créditos)</option>
                      <option value={12}>12 Meses (12 Créditos)</option>
                    </select>
                  </div>

                  <div className="input-group">
                    <label className="input-label">Telas Permitidas</label>
                    <select
                      className="form-control"
                      value={clientForm.max_connections}
                      onChange={(e) => setClientForm({ ...clientForm, max_connections: parseInt(e.target.value) })}
                    >
                      <option value={1}>1 Tela Simultânea</option>
                      <option value={2}>2 Telas Simultâneas</option>
                      <option value={3}>3 Telas Simultâneas</option>
                    </select>
                  </div>
                </div>

              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setModalNewClient(false)} className="btn btn-secondary">Cancelar</button>
                <button type="submit" className="btn btn-primary">
                  Confirmar & Debitar Crédito
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: RENEW CLIENT */}
      {/* ==================================================== */}
      {modalRenew && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>
                Renovar Assinatura: {modalRenew.username}
              </h3>
              <button onClick={() => setModalRenew(null)} className="btn btn-secondary btn-sm"><X size={16} /></button>
            </div>
            <form onSubmit={handleRenewClient}>
              <div className="modal-body">
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                  A renovação adicionará o período selecionado à data de validade atual do cliente e consumirá créditos do seu saldo.
                </p>

                <div className="input-group">
                  <label className="input-label">Período de Renovação</label>
                  <select
                    className="form-control"
                    value={renewMonths}
                    onChange={(e) => setRenewMonths(parseInt(e.target.value))}
                  >
                    <option value={1}>+ 1 Mês (1 Crédito)</option>
                    <option value={3}>+ 3 Meses (3 Créditos)</option>
                    <option value={6}>+ 6 Meses (6 Créditos)</option>
                    <option value={12}>+ 12 Meses (12 Créditos)</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setModalRenew(null)} className="btn btn-secondary">Cancelar</button>
                <button type="submit" className="btn btn-success">Renovar Cliente</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: ACCESS LINKS */}
      {/* ==================================================== */}
      {modalLinks && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>Dados de Acesso - {modalLinks.username}</h3>
              <button onClick={() => setModalLinks(null)} className="btn btn-secondary btn-sm"><X size={16} /></button>
            </div>
            <div className="modal-body">
              <div className="input-group">
                <label className="input-label">Link da Playlist M3U Plus</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    readOnly
                    className="form-control"
                    value={`${window.location.origin}/get.php?username=${modalLinks.username}&password=${modalLinks.plain_password || '******'}&type=m3u_plus&output=ts`}
                  />
                  <button
                    onClick={() => copyToClipboard(`${window.location.origin}/get.php?username=${modalLinks.username}&password=${modalLinks.plain_password || '******'}&type=m3u_plus&output=ts`)}
                    className="btn btn-secondary"
                  >
                    <Copy size={16} />
                  </button>
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">WebTV Player no Navegador</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    readOnly
                    className="form-control"
                    value={window.location.origin}
                  />
                  <button
                    onClick={() => copyToClipboard(window.location.origin)}
                    className="btn btn-secondary"
                  >
                    <Copy size={16} />
                  </button>
                </div>
              </div>

              <div style={{ background: 'var(--bg-input)', padding: '14px', borderRadius: '8px', fontSize: '0.85rem' }}>
                <div style={{ marginBottom: '4px' }}><strong>Host Xtream Codes:</strong> <code>{window.location.origin}</code></div>
                <div style={{ marginBottom: '4px' }}><strong>Usuário:</strong> <code>{modalLinks.username}</code></div>
                <div><strong>Senha:</strong> <code>{modalLinks.plain_password || '******'}</code></div>
              </div>
            </div>
            <div className="modal-footer">
              <button onClick={() => setModalLinks(null)} className="btn btn-secondary">Fechar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
