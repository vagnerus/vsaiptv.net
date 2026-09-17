import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { 
  Activity, Users, Tv, ShieldAlert, Settings, FileText, 
  Plus, Edit, Trash2, Coins, ArrowRightLeft, Radio, 
  Wifi, Cpu, HardDrive, RefreshCw, X, Check, Copy, AlertCircle, UploadCloud
} from 'lucide-react';

export default function MasterDashboard({ user }) {
  const [activeTab, setActiveTab] = useState('telemetry'); // telemetry, resellers, clients, catalog, firewall, reports, settings
  const [telemetry, setTelemetry] = useState(null);
  const [connections, setConnections] = useState([]);
  const [resellers, setResellers] = useState([]);
  const [clients, setClients] = useState([]);
  const [streams, setStreams] = useState([]);
  const [categories, setCategories] = useState([]);
  const [firewallRules, setFirewallRules] = useState([]);
  const [reports, setReports] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [settings, setSettings] = useState({});

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState({ message: '', type: '' });

  // Modals
  const [modalReseller, setModalReseller] = useState(false);
  const [modalCredits, setModalCredits] = useState(null); // reseller object
  const [modalStream, setModalStream] = useState(false);
  const [modalM3UImport, setModalM3UImport] = useState(false);
  const [modalTransfer, setModalTransfer] = useState(null); // client object
  const [modalFirewall, setModalFirewall] = useState(false);
  const [modalLinks, setModalLinks] = useState(null); // client object for M3U links

  // Form states
  const [resellerForm, setResellerForm] = useState({ username: '', password: '', name: '', email: '', phone: '', credits: 10 });
  const [creditForm, setCreditForm] = useState({ amount: 10, reason: 'Recarga administrativa' });
  const [streamForm, setStreamForm] = useState({ name: '', type: 'live', category_id: '', stream_url: '', icon_url: '', description: '' });
  const [m3uText, setM3uText] = useState('');
  const [targetResellerId, setTargetResellerId] = useState('');
  const [firewallForm, setFirewallForm] = useState({ ip_address: '', reason: 'Abuso de conexões' });

  const notify = (msg, type = 'success') => {
    setFeedback({ message: msg, type });
    setTimeout(() => setFeedback({ message: '', type: '' }), 4000);
  };

  // Fetch telemetry & active connections
  const fetchTelemetry = async () => {
    try {
      const [tRes, cRes] = await Promise.all([
        api.get('/api/admin/telemetry'),
        api.get('/api/admin/connections')
      ]);
      setTelemetry(tRes.data);
      setConnections(cRes.data);
    } catch (err) {
      console.error(err);
    }
  };

  // Fetch specific tab data
  const fetchData = async () => {
    setLoading(true);
    try {
      if (activeTab === 'telemetry') {
        await fetchTelemetry();
      } else if (activeTab === 'resellers') {
        const res = await api.get('/api/admin/resellers');
        setResellers(res.data);
      } else if (activeTab === 'clients') {
        const [cRes, rRes] = await Promise.all([
          api.get('/api/admin/clients'),
          api.get('/api/admin/resellers')
        ]);
        setClients(cRes.data);
        setResellers(rRes.data);
      } else if (activeTab === 'catalog') {
        const [sRes, catRes] = await Promise.all([
          api.get('/api/admin/streams'),
          api.get('/api/admin/categories')
        ]);
        setStreams(sRes.data);
        setCategories(catRes.data);
      } else if (activeTab === 'firewall') {
        const res = await api.get('/api/admin/firewall');
        setFirewallRules(res.data);
      } else if (activeTab === 'reports') {
        const [repRes, logRes] = await Promise.all([
          api.get('/api/admin/reports'),
          api.get('/api/admin/audit-logs')
        ]);
        setReports(repRes.data);
        setAuditLogs(logRes.data);
      } else if (activeTab === 'settings') {
        const res = await api.get('/api/admin/settings');
        setSettings(res.data);
      }
    } catch (err) {
      console.error(err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  // Telemetry real-time polling every 6 seconds when on telemetry tab
  useEffect(() => {
    if (activeTab === 'telemetry') {
      const interval = setInterval(fetchTelemetry, 6000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  // Actions
  const handleKillConnection = async (id) => {
    if (!confirm('Deseja realmente derrubar esta transmissão ativa?')) return;
    try {
      await api.delete(`/api/admin/connections/${id}`);
      notify('Transmissão encerrada!');
      fetchTelemetry();
    } catch (err) {
      notify('Erro ao derrubar conexão', 'error');
    }
  };

  const handleCreateReseller = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/admin/resellers', resellerForm);
      notify('Revendedor criado com sucesso!');
      setModalReseller(false);
      setResellerForm({ username: '', password: '', name: '', email: '', phone: '', credits: 10 });
      fetchData();
    } catch (err) {
      notify(err.response?.data?.error || 'Erro ao criar revendedor', 'error');
    }
  };

  const handleUpdateCredits = async (e) => {
    e.preventDefault();
    try {
      await api.post(`/api/admin/resellers/${modalCredits.id}/credits`, creditForm);
      notify('Créditos ajustados com sucesso!');
      setModalCredits(null);
      fetchData();
    } catch (err) {
      notify(err.response?.data?.error || 'Erro ao atualizar créditos', 'error');
    }
  };

  const handleTransferClient = async (e) => {
    e.preventDefault();
    if (!targetResellerId) return;
    try {
      await api.post('/api/admin/clients/transfer', {
        clientId: modalTransfer.id,
        targetResellerId,
      });
      notify('Cliente transferido com sucesso!');
      setModalTransfer(null);
      fetchData();
    } catch (err) {
      notify(err.response?.data?.error || 'Erro ao transferir cliente', 'error');
    }
  };

  const handleCreateStream = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/admin/streams', streamForm);
      notify('Conteúdo cadastrado com sucesso!');
      setModalStream(false);
      setStreamForm({ name: '', type: 'live', category_id: '', stream_url: '', icon_url: '', description: '' });
      fetchData();
    } catch (err) {
      notify(err.response?.data?.error || 'Erro ao criar stream', 'error');
    }
  };

  const handleM3UImport = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/api/admin/streams/import-m3u', { m3uContent: m3uText });
      notify(res.data.message);
      setModalM3UImport(false);
      setM3uText('');
      fetchData();
    } catch (err) {
      notify(err.response?.data?.error || 'Erro ao importar M3U', 'error');
    }
  };

  const handleBlockIp = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/admin/firewall', firewallForm);
      notify('IP bloqueado com sucesso!');
      setModalFirewall(false);
      setFirewallForm({ ip_address: '', reason: 'Abuso de conexões' });
      fetchData();
    } catch (err) {
      notify(err.response?.data?.error || 'Erro ao bloquear IP', 'error');
    }
  };

  const handleUnblockIp = async (id) => {
    try {
      await api.delete(`/api/admin/firewall/${id}`);
      notify('IP desbloqueado!');
      fetchData();
    } catch (err) {
      notify('Erro ao remover regra', 'error');
    }
  };

  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      await api.put('/api/admin/settings', settings);
      notify('Configurações salvas com sucesso!');
    } catch (err) {
      notify('Erro ao salvar configurações', 'error');
    }
  };

  const copyToClipboard = (text) => {
    navigator.clipboard.writeText(text);
    notify('Copiado para a área de transferência!');
  };

  return (
    <div style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto' }}>
      
      {/* Feedback Toast */}
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

      {/* Header Tabs */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '28px',
      }}>
        <div style={{
          display: 'flex',
          background: 'var(--bg-card)',
          border: '1px solid var(--border-color)',
          padding: '4px',
          borderRadius: 'var(--radius-lg)',
          overflowX: 'auto',
          maxWidth: '100%',
        }}>
          {[
            { id: 'telemetry', label: 'Monitoramento & P2P', icon: Activity },
            { id: 'resellers', label: 'Revendedores', icon: Users },
            { id: 'clients', label: 'Todos os Clientes', icon: Wifi },
            { id: 'catalog', label: 'Catálogo de Canais & VOD', icon: Tv },
            { id: 'firewall', label: 'Firewall & IPs', icon: ShieldAlert },
            { id: 'reports', label: 'Relatórios & Auditoria', icon: FileText },
            { id: 'settings', label: 'Configurações', icon: Settings },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id)}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '9px 16px',
                  borderRadius: 'var(--radius-md)',
                  border: 'none',
                  cursor: 'pointer',
                  background: isActive ? 'var(--primary-gradient)' : 'transparent',
                  color: isActive ? '#fff' : 'var(--text-muted)',
                  fontWeight: '600',
                  fontSize: '0.85rem',
                  transition: 'var(--transition)',
                  whiteSpace: 'nowrap',
                }}
              >
                <Icon size={16} />
                <span>{tab.label}</span>
              </button>
            );
          })}
        </div>

        <button 
          onClick={fetchData} 
          className="btn btn-secondary btn-sm"
          title="Atualizar dados"
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Atualizar</span>
        </button>
      </div>

      {/* ==================================================== */}
      {/* TAB 1: TELEMETRY & MONITORING */}
      {/* ==================================================== */}
      {activeTab === 'telemetry' && telemetry && (
        <div className="animate-fade">
          {/* Metrics Top Grid */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div className="stat-card">
              <div>
                <span className="stat-label">Conexões Simultâneas</span>
                <div className="stat-value">{telemetry.activeConnections}</div>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                  {telemetry.activeUsers} cliente(s) únicos
                </span>
              </div>
              <div className="stat-icon-wrapper" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
                <Wifi size={24} />
              </div>
            </div>

            <div className="stat-card">
              <div>
                <span className="stat-label">Consumo de Banda Total</span>
                <div className="stat-value">{telemetry.estimatedBandwidthMbps} <span style={{ fontSize: '1rem', fontWeight: '400' }}>Mbps</span></div>
                <span style={{ fontSize: '0.78rem', color: '#10b981' }}>
                  ⚡ Economizado: {telemetry.bandwidthSavedMbps} Mbps
                </span>
              </div>
              <div className="stat-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
                <Activity size={24} />
              </div>
            </div>

            <div className="stat-card">
              <div>
                <span className="stat-label">Economia de Banda P2P</span>
                <div className="stat-value" style={{ color: '#22d3ee' }}>{telemetry.p2pOffloadPercent}%</div>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                  Mesh WebRTC descentralizada
                </span>
              </div>
              <div className="stat-icon-wrapper" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#22d3ee' }}>
                <Radio size={24} />
              </div>
            </div>

            <div className="stat-card">
              <div>
                <span className="stat-label">Carga do Servidor</span>
                <div className="stat-value">{telemetry.serverCpuUsage}%</div>
                <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
                  RAM: {telemetry.serverRamUsage}% em uso
                </span>
              </div>
              <div className="stat-icon-wrapper" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
                <Cpu size={24} />
              </div>
            </div>
          </div>

          {/* Active Connections Table */}
          <div className="glass-card" style={{ padding: '24px' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '18px' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: '700' }}>Transmissões Ativas em Tempo Real</h3>
                <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
                  Monitorando clientes assistindo neste exato momento com IP, dispositivo e tráfego.
                </p>
              </div>
              <span className="badge badge-active">
                ● {connections.length} Sessão(ões) Online
              </span>
            </div>

            <div className="data-table-container">
              <table className="data-table">
                <thead>
                  <tr>
                    <th>Usuário</th>
                    <th>Revendedor</th>
                    <th>Canal / Conteúdo</th>
                    <th>IP / Local</th>
                    <th>Dispositivo</th>
                    <th>Conectado às</th>
                    <th>Ações</th>
                  </tr>
                </thead>
                <tbody>
                  {connections.length === 0 ? (
                    <tr>
                      <td colSpan={7} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-dim)' }}>
                        Nenhuma transmissão ativa no momento. Inicie um canal no WebTV Player ou app externo.
                      </td>
                    </tr>
                  ) : (
                    connections.map((conn) => (
                      <tr key={conn.id}>
                        <td>
                          <strong>{conn.username}</strong>
                          <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)' }}>{conn.user_name}</span>
                        </td>
                        <td>
                          <span className="badge badge-suspended">{conn.reseller_username || 'Direto'}</span>
                        </td>
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <Tv size={14} color="#818cf8" />
                            <span>{conn.stream_name || 'Desconhecido'}</span>
                          </div>
                        </td>
                        <td>
                          <code style={{ fontSize: '0.8rem', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px' }}>
                            {conn.ip_address}
                          </code>
                        </td>
                        <td>{conn.device_type}</td>
                        <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                          {new Date(conn.connected_at).toLocaleTimeString('pt-BR')}
                        </td>
                        <td>
                          <button
                            onClick={() => handleKillConnection(conn.id)}
                            className="btn btn-danger btn-sm"
                            title="Derrubar sessão"
                          >
                            <Trash2 size={13} /> Desconectar
                          </button>
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 2: RESELLERS MANAGEMENT */}
      {/* ==================================================== */}
      {activeTab === 'resellers' && (
        <div className="animate-fade">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: '800' }}>Gestão de Revendedores</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Cadastre e gerencie revendas oficiais, saldos de créditos e acompanhe vendas.
              </p>
            </div>
            <button onClick={() => setModalReseller(true)} className="btn btn-primary">
              <Plus size={16} /> Novo Revendedor
            </button>
          </div>

          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Revenda</th>
                  <th>Contato</th>
                  <th>Saldo de Créditos</th>
                  <th>Clientes Ativos</th>
                  <th>Status</th>
                  <th>Criado Em</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {resellers.map((r) => (
                  <tr key={r.id}>
                    <td>
                      <strong>{r.name || r.username}</strong>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)' }}>@{r.username}</span>
                    </td>
                    <td>
                      <div style={{ fontSize: '0.82rem' }}>{r.phone || 'Sem telefone'}</div>
                      <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{r.email || 'Sem e-mail'}</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '1.1rem', fontWeight: '700', color: r.credits <= 5 ? '#f87171' : '#818cf8' }}>
                          {r.credits.toFixed(1)}
                        </span>
                        <button
                          onClick={() => { setModalCredits(r); setCreditForm({ amount: 10, reason: 'Recarga Master' }); }}
                          className="btn btn-secondary btn-sm"
                          style={{ padding: '3px 8px', fontSize: '0.75rem' }}
                        >
                          <Coins size={13} /> Recarregar
                        </button>
                      </div>
                    </td>
                    <td>
                      <span className="badge badge-active">{r.active_clients} ativos</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)', marginLeft: '6px' }}>de {r.total_clients}</span>
                    </td>
                    <td>
                      <span className={`badge ${r.status === 'active' ? 'badge-active' : 'badge-suspended'}`}>
                        {r.status === 'active' ? 'Ativo' : 'Suspenso'}
                      </span>
                    </td>
                    <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                      {new Date(r.created_at).toLocaleDateString('pt-BR')}
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={async () => {
                            const newStatus = r.status === 'active' ? 'suspended' : 'active';
                            await api.put(`/api/admin/resellers/${r.id}`, { ...r, status: newStatus });
                            notify(`Revendedor ${newStatus === 'active' ? 'ativado' : 'suspenso'}!`);
                            fetchData();
                          }}
                          className="btn btn-secondary btn-sm"
                        >
                          {r.status === 'active' ? 'Suspender' : 'Ativar'}
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm(`Excluir o revendedor ${r.username}? Seus clientes ficarão sem revenda associada.`)) {
                              await api.delete(`/api/admin/resellers/${r.id}`);
                              notify('Revendedor excluído!');
                              fetchData();
                            }
                          }}
                          className="btn btn-danger btn-sm"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 3: GLOBAL CLIENTS */}
      {/* ==================================================== */}
      {activeTab === 'clients' && (
        <div className="animate-fade">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: '800' }}>Todos os Clientes do Sistema</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Visão global de todos os assinantes e testes de todos os revendedores cadastrados.
              </p>
            </div>
            <span className="badge badge-active">{clients.length} Clientes Totais</span>
          </div>

          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Usuário</th>
                  <th>Revendedor Dono</th>
                  <th>Senha</th>
                  <th>Telas Permitidas</th>
                  <th>Expiração</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {clients.map((c) => (
                  <tr key={c.id}>
                    <td>
                      <strong>{c.username}</strong>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)' }}>{c.name || 'Cliente'}</span>
                    </td>
                    <td>
                      <span className="badge badge-p2p">{c.reseller_username || 'Direto Master'}</span>
                    </td>
                    <td>
                      <code style={{ fontSize: '0.82rem', background: 'rgba(255,255,255,0.06)', padding: '2px 6px', borderRadius: '4px' }}>
                        {c.plain_password || '••••••'}
                      </code>
                    </td>
                    <td>
                      <span style={{ fontWeight: '600' }}>{c.active_screens || 0} / {c.max_connections} tela(s)</span>
                    </td>
                    <td style={{ fontSize: '0.82rem' }}>
                      {c.expires_at ? (
                        <span style={{ color: new Date(c.expires_at) < new Date() ? '#f87171' : '#34d399' }}>
                          {new Date(c.expires_at).toLocaleDateString('pt-BR')} {new Date(c.expires_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ) : 'Vitalício'}
                      {c.is_trial === 1 && <span className="badge badge-trial" style={{ marginLeft: '6px' }}>Teste</span>}
                    </td>
                    <td>
                      <span className={`badge ${c.status === 'active' ? 'badge-active' : c.status === 'expired' ? 'badge-expired' : 'badge-suspended'}`}>
                        {c.status}
                      </span>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: '6px' }}>
                        <button
                          onClick={() => setModalLinks(c)}
                          className="btn btn-secondary btn-sm"
                          title="Ver Links M3U / WebTV"
                        >
                          <Copy size={13} /> Links
                        </button>
                        <button
                          onClick={() => { setModalTransfer(c); setTargetResellerId(resellers[0]?.id || ''); }}
                          className="btn btn-secondary btn-sm"
                          title="Transferir para outro revendedor"
                        >
                          <ArrowRightLeft size={13} /> Transferir
                        </button>
                        <button
                          onClick={async () => {
                            if (confirm(`Excluir cliente ${c.username}?`)) {
                              await api.delete(`/api/admin/clients/${c.id}`);
                              notify('Cliente excluído!');
                              fetchData();
                            }
                          }}
                          className="btn btn-danger btn-sm"
                        >
                          <Trash2 size={13} />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 4: CATALOG & CHANNELS */}
      {/* ==================================================== */}
      {activeTab === 'catalog' && (
        <div className="animate-fade">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: '800' }}>Catálogo de Canais & VOD</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Gerencie canais ao vivo (HLS/M3U8), filmes e séries do sistema.
              </p>
            </div>
            <div style={{ display: 'flex', gap: '10px' }}>
              <button onClick={() => setModalM3UImport(true)} className="btn btn-secondary">
                <UploadCloud size={16} /> Importar M3U em Lote
              </button>
              <button onClick={() => setModalStream(true)} className="btn btn-primary">
                <Plus size={16} /> Novo Canal / VOD
              </button>
            </div>
          </div>

          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Ícone</th>
                  <th>Nome do Conteúdo</th>
                  <th>Tipo</th>
                  <th>Categoria</th>
                  <th>URL da Fonte / Stream</th>
                  <th>Status</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {streams.map((s) => (
                  <tr key={s.id}>
                    <td>
                      <img 
                        src={s.icon_url || 'https://images.unsplash.com/photo-1517649763962-0c623266ddc0?w=64'} 
                        alt="" 
                        style={{ width: '40px', height: '40px', borderRadius: '8px', objectFit: 'cover' }}
                      />
                    </td>
                    <td>
                      <strong>{s.name}</strong>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        {s.epg_channel_id ? `EPG: ${s.epg_channel_id}` : ''}
                      </span>
                    </td>
                    <td>
                      <span className={`badge ${s.type === 'live' ? 'badge-active' : s.type === 'movie' ? 'badge-trial' : 'badge-p2p'}`}>
                        {s.type === 'live' ? 'TV Ao Vivo' : s.type === 'movie' ? 'Filme' : 'Série'}
                      </span>
                    </td>
                    <td>{s.category_name || 'Sem Categoria'}</td>
                    <td>
                      <span style={{ 
                        display: 'inline-block', 
                        maxWidth: '260px', 
                        overflow: 'hidden', 
                        textOverflow: 'ellipsis', 
                        whiteSpace: 'nowrap',
                        fontSize: '0.78rem',
                        color: 'var(--text-muted)'
                      }}>
                        {s.stream_url}
                      </span>
                    </td>
                    <td>
                      <span className="badge badge-active">Online</span>
                    </td>
                    <td>
                      <button
                        onClick={async () => {
                          if (confirm(`Excluir ${s.name}?`)) {
                            await api.delete(`/api/admin/streams/${s.id}`);
                            notify('Conteúdo excluído!');
                            fetchData();
                          }
                        }}
                        className="btn btn-danger btn-sm"
                      >
                        <Trash2 size={13} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 5: FIREWALL & SECURITY */}
      {/* ==================================================== */}
      {activeTab === 'firewall' && (
        <div className="animate-fade">
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px' }}>
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: '800' }}>Firewall & Proteção Anti-Abuso</h2>
              <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)' }}>
                Bloqueie IPs suspeitos, tentativas de ataque ou uso indevido de conexões.
              </p>
            </div>
            <button onClick={() => setModalFirewall(true)} className="btn btn-danger">
              <ShieldAlert size={16} /> Bloquear Novo IP
            </button>
          </div>

          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Endereço IP</th>
                  <th>Tipo de Regra</th>
                  <th>Motivo do Bloqueio</th>
                  <th>Data do Bloqueio</th>
                  <th>Ação</th>
                </tr>
              </thead>
              <tbody>
                {firewallRules.length === 0 ? (
                  <tr>
                    <td colSpan={5} style={{ textAlign: 'center', padding: '32px', color: 'var(--text-dim)' }}>
                      Nenhum IP bloqueado no momento. Seu sistema está seguro e operacional.
                    </td>
                  </tr>
                ) : (
                  firewallRules.map((rule) => (
                    <tr key={rule.id}>
                      <td>
                        <code style={{ fontSize: '0.9rem', color: '#f87171', fontWeight: '700' }}>{rule.ip_address}</code>
                      </td>
                      <td>
                        <span className="badge badge-expired">BLOQUEADO</span>
                      </td>
                      <td>{rule.reason}</td>
                      <td style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                        {new Date(rule.created_at).toLocaleString('pt-BR')}
                      </td>
                      <td>
                        <button onClick={() => handleUnblockIp(rule.id)} className="btn btn-secondary btn-sm">
                          Desbloquear
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
      {/* TAB 6: REPORTS & AUDIT */}
      {/* ==================================================== */}
      {activeTab === 'reports' && reports && (
        <div className="animate-fade">
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '16px', marginBottom: '24px' }}>
            <div className="stat-card">
              <div>
                <span className="stat-label">Créditos em Circulação</span>
                <div className="stat-value">{reports.totalCreditsInCirculation.toFixed(1)}</div>
              </div>
              <div className="stat-icon-wrapper" style={{ background: 'rgba(99, 102, 241, 0.15)', color: '#818cf8' }}>
                <Coins size={24} />
              </div>
            </div>

            <div className="stat-card">
              <div>
                <span className="stat-label">Total de Clientes Ativos</span>
                <div className="stat-value">{reports.totalActiveClients}</div>
              </div>
              <div className="stat-icon-wrapper" style={{ background: 'rgba(16, 185, 129, 0.15)', color: '#34d399' }}>
                <Users size={24} />
              </div>
            </div>

            <div className="stat-card">
              <div>
                <span className="stat-label">Testes Grátis Gerados</span>
                <div className="stat-value">{reports.totalTrialsGenerated}</div>
              </div>
              <div className="stat-icon-wrapper" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
                <Radio size={24} />
              </div>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '20px' }}>
            {/* Transactions */}
            <div className="glass-card" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '14px' }}>Movimentações de Créditos</h3>
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {reports.recentTransactions?.map((t) => (
                  <div key={t.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-color)', display: 'flex', justifyContent: 'space-between' }}>
                    <div>
                      <strong style={{ fontSize: '0.88rem' }}>{t.reseller_name || t.reseller_username}</strong>
                      <span style={{ display: 'block', fontSize: '0.75rem', color: 'var(--text-muted)' }}>{t.reason}</span>
                    </div>
                    <div style={{ textAlign: 'right' }}>
                      <span style={{ fontWeight: '700', color: t.amount > 0 ? '#34d399' : '#f87171' }}>
                        {t.amount > 0 ? `+${t.amount}` : t.amount}
                      </span>
                      <span style={{ display: 'block', fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                        Saldo: {t.balance_after}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Audit Logs */}
            <div className="glass-card" style={{ padding: '20px' }}>
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700', marginBottom: '14px' }}>Logs de Auditoria de Ações</h3>
              <div style={{ maxHeight: '400px', overflowY: 'auto' }}>
                {auditLogs.map((log) => (
                  <div key={log.id} style={{ padding: '10px 0', borderBottom: '1px solid var(--border-color)' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: '2px' }}>
                      <span className="badge badge-p2p" style={{ fontSize: '0.7rem' }}>{log.action}</span>
                      <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>
                        {new Date(log.created_at).toLocaleTimeString('pt-BR')}
                      </span>
                    </div>
                    <p style={{ fontSize: '0.82rem', color: 'var(--text-main)' }}>{log.details}</p>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* TAB 7: SYSTEM SETTINGS */}
      {/* ==================================================== */}
      {activeTab === 'settings' && (
        <div className="animate-fade" style={{ maxWidth: '720px' }}>
          <div className="glass-card" style={{ padding: '28px' }}>
            <h2 style={{ fontSize: '1.3rem', fontWeight: '800', marginBottom: '8px' }}>Configurações Globais do Servidor</h2>
            <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '24px' }}>
              Defina parâmetros comerciais, DNS e notificações automáticas do ecossistema.
            </p>

            <form onSubmit={handleSaveSettings}>
              <div className="input-group">
                <label className="input-label">Nome da Plataforma / Marca</label>
                <input
                  type="text"
                  className="form-control"
                  value={settings.server_name || ''}
                  onChange={(e) => setSettings({ ...settings, server_name: e.target.value })}
                />
              </div>

              <div className="input-group">
                <label className="input-label">Domínio / Host do Servidor (Usado em M3U e Xtream Codes)</label>
                <input
                  type="text"
                  className="form-control"
                  value={settings.server_domain || ''}
                  onChange={(e) => setSettings({ ...settings, server_domain: e.target.value })}
                  placeholder="http://localhost:5000"
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '16px' }}>
                <div className="input-group">
                  <label className="input-label">Duração Padrão dos Testes (Horas)</label>
                  <input
                    type="number"
                    className="form-control"
                    value={settings.trial_default_hours || 4}
                    onChange={(e) => setSettings({ ...settings, trial_default_hours: e.target.value })}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Alerta de Créditos Baixos para Revenda</label>
                  <input
                    type="number"
                    className="form-control"
                    value={settings.reseller_min_credits_alert || 5}
                    onChange={(e) => setSettings({ ...settings, reseller_min_credits_alert: e.target.value })}
                  />
                </div>
              </div>

              <div className="input-group">
                <label className="input-label">WhatsApp de Suporte Master</label>
                <input
                  type="text"
                  className="form-control"
                  value={settings.whatsapp_support_phone || ''}
                  onChange={(e) => setSettings({ ...settings, whatsapp_support_phone: e.target.value })}
                  placeholder="+5511999999999"
                />
              </div>

              <div className="input-group">
                <label className="input-label">Telegram Bot Token (Opcional)</label>
                <input
                  type="text"
                  className="form-control"
                  value={settings.telegram_bot_token || ''}
                  onChange={(e) => setSettings({ ...settings, telegram_bot_token: e.target.value })}
                  placeholder="123456789:ABCdef..."
                />
              </div>

              <button type="submit" className="btn btn-primary" style={{ marginTop: '12px' }}>
                Salvar Alterações
              </button>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODALS */}
      {/* ==================================================== */}

      {/* Modal: New Reseller */}
      {modalReseller && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>Criar Novo Revendedor</h3>
              <button onClick={() => setModalReseller(false)} className="btn btn-secondary btn-sm"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreateReseller}>
              <div className="modal-body">
                <div className="input-group">
                  <label className="input-label">Nome Completo / Empresa</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={resellerForm.name}
                    onChange={(e) => setResellerForm({ ...resellerForm, name: e.target.value })}
                  />
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="input-group">
                    <label className="input-label">Usuário de Login</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      value={resellerForm.username}
                      onChange={(e) => setResellerForm({ ...resellerForm, username: e.target.value })}
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Senha Inicial</label>
                    <input
                      type="password"
                      className="form-control"
                      required
                      value={resellerForm.password}
                      onChange={(e) => setResellerForm({ ...resellerForm, password: e.target.value })}
                    />
                  </div>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div className="input-group">
                    <label className="input-label">WhatsApp</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="+55..."
                      value={resellerForm.phone}
                      onChange={(e) => setResellerForm({ ...resellerForm, phone: e.target.value })}
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Créditos Iniciais</label>
                    <input
                      type="number"
                      className="form-control"
                      value={resellerForm.credits}
                      onChange={(e) => setResellerForm({ ...resellerForm, credits: e.target.value })}
                    />
                  </div>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setModalReseller(false)} className="btn btn-secondary">Cancelar</button>
                <button type="submit" className="btn btn-primary">Cadastrar Revendedor</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Add/Adjust Credits */}
      {modalCredits && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>
                Recarregar Créditos - {modalCredits.username}
              </h3>
              <button onClick={() => setModalCredits(null)} className="btn btn-secondary btn-sm"><X size={16} /></button>
            </div>
            <form onSubmit={handleUpdateCredits}>
              <div className="modal-body">
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                  Saldo atual da revenda: <strong>{modalCredits.credits.toFixed(1)} créditos</strong>.
                  Insira um valor positivo para adicionar ou negativo para estornar.
                </p>
                <div className="input-group">
                  <label className="input-label">Quantidade de Créditos</label>
                  <input
                    type="number"
                    step="1"
                    className="form-control"
                    required
                    value={creditForm.amount}
                    onChange={(e) => setCreditForm({ ...creditForm, amount: e.target.value })}
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">Motivo / Justificativa</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    value={creditForm.reason}
                    onChange={(e) => setCreditForm({ ...creditForm, reason: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setModalCredits(null)} className="btn btn-secondary">Cancelar</button>
                <button type="submit" className="btn btn-primary">Confirmar Transação</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Transfer Client */}
      {modalTransfer && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>
                Transferir Cliente: {modalTransfer.username}
              </h3>
              <button onClick={() => setModalTransfer(null)} className="btn btn-secondary btn-sm"><X size={16} /></button>
            </div>
            <form onSubmit={handleTransferClient}>
              <div className="modal-body">
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                  Selecione para qual revendedor este cliente será movido. Todas as renovações futuras pertencerão a ele.
                </p>
                <div className="input-group">
                  <label className="input-label">Revendedor de Destino</label>
                  <select
                    className="form-control"
                    value={targetResellerId}
                    onChange={(e) => setTargetResellerId(e.target.value)}
                    required
                  >
                    {resellers.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name || r.username} (@{r.username}) - Saldo: {r.credits.toFixed(1)}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setModalTransfer(null)} className="btn btn-secondary">Cancelar</button>
                <button type="submit" className="btn btn-primary">Transferir Agora</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: New Stream */}
      {modalStream && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>Adicionar Conteúdo ao Catálogo</h3>
              <button onClick={() => setModalStream(false)} className="btn btn-secondary btn-sm"><X size={16} /></button>
            </div>
            <form onSubmit={handleCreateStream}>
              <div className="modal-body">
                <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '12px' }}>
                  <div className="input-group">
                    <label className="input-label">Nome do Canal / Filme</label>
                    <input
                      type="text"
                      className="form-control"
                      required
                      placeholder="Ex: HBO Max HD ou Filme Exemplo"
                      value={streamForm.name}
                      onChange={(e) => setStreamForm({ ...streamForm, name: e.target.value })}
                    />
                  </div>
                  <div className="input-group">
                    <label className="input-label">Tipo</label>
                    <select
                      className="form-control"
                      value={streamForm.type}
                      onChange={(e) => setStreamForm({ ...streamForm, type: e.target.value })}
                    >
                      <option value="live">TV Ao Vivo</option>
                      <option value="movie">Filme VOD</option>
                      <option value="series">Série VOD</option>
                    </select>
                  </div>
                </div>

                <div className="input-group">
                  <label className="input-label">URL do Stream (HLS .m3u8 ou MP4)</label>
                  <input
                    type="url"
                    className="form-control"
                    required
                    placeholder="https://.../master.m3u8"
                    value={streamForm.stream_url}
                    onChange={(e) => setStreamForm({ ...streamForm, stream_url: e.target.value })}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">URL da Logo / Ícone</label>
                  <input
                    type="url"
                    className="form-control"
                    placeholder="https://.../logo.png"
                    value={streamForm.icon_url}
                    onChange={(e) => setStreamForm({ ...streamForm, icon_url: e.target.value })}
                  />
                </div>

                <div className="input-group">
                  <label className="input-label">Sinopse / Descrição</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    value={streamForm.description}
                    onChange={(e) => setStreamForm({ ...streamForm, description: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setModalStream(false)} className="btn btn-secondary">Cancelar</button>
                <button type="submit" className="btn btn-primary">Salvar no Catálogo</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Bulk M3U Import */}
      {modalM3UImport && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>Importação em Lote via Playlist M3U</h3>
              <button onClick={() => setModalM3UImport(false)} className="btn btn-secondary btn-sm"><X size={16} /></button>
            </div>
            <form onSubmit={handleM3UImport}>
              <div className="modal-body">
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '14px' }}>
                  Cole o conteúdo do arquivo <code>.m3u</code> ou <code>.m3u8</code> abaixo. 
                  O sistema reconhecerá automaticamente as tags <code>#EXTINF</code>, logos e nomes de canais.
                </p>
                <div className="input-group">
                  <textarea
                    className="form-control"
                    rows={10}
                    required
                    placeholder={'#EXTM3U\n#EXTINF:-1 tvg-logo="https://..." tvg-name="Canal Teste",Canal Teste HD\nhttp://exemplo.com/live.m3u8'}
                    value={m3uText}
                    onChange={(e) => setM3uText(e.target.value)}
                    style={{ fontFamily: 'monospace', fontSize: '0.8rem' }}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setModalM3UImport(false)} className="btn btn-secondary">Cancelar</button>
                <button type="submit" className="btn btn-primary">Processar & Importar</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Block IP */}
      {modalFirewall && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>Bloquear Endereço IP no Firewall</h3>
              <button onClick={() => setModalFirewall(false)} className="btn btn-secondary btn-sm"><X size={16} /></button>
            </div>
            <form onSubmit={handleBlockIp}>
              <div className="modal-body">
                <div className="input-group">
                  <label className="input-label">Endereço IP (IPv4 ou IPv6)</label>
                  <input
                    type="text"
                    className="form-control"
                    required
                    placeholder="Ex: 189.45.12.33"
                    value={firewallForm.ip_address}
                    onChange={(e) => setFirewallForm({ ...firewallForm, ip_address: e.target.value })}
                  />
                </div>
                <div className="input-group">
                  <label className="input-label">Motivo</label>
                  <input
                    type="text"
                    className="form-control"
                    value={firewallForm.reason}
                    onChange={(e) => setFirewallForm({ ...firewallForm, reason: e.target.value })}
                  />
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setModalFirewall(false)} className="btn btn-secondary">Cancelar</button>
                <button type="submit" className="btn btn-danger">Bloquear IP Imediatamente</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal: Client Links */}
      {modalLinks && (
        <div className="modal-overlay">
          <div className="modal-content">
            <div className="modal-header">
              <h3 style={{ fontSize: '1.1rem', fontWeight: '700' }}>Links de Acesso - {modalLinks.username}</h3>
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
                <label className="input-label">URL do WebTV Player</label>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <input
                    type="text"
                    readOnly
                    className="form-control"
                    value={`${window.location.origin}`}
                  />
                  <button
                    onClick={() => copyToClipboard(window.location.origin)}
                    className="btn btn-secondary"
                  >
                    <Copy size={16} />
                  </button>
                </div>
              </div>

              <div style={{ background: 'var(--bg-input)', padding: '12px', borderRadius: '8px', fontSize: '0.85rem' }}>
                <div><strong>Host Xtream Codes:</strong> <code>{window.location.origin}</code></div>
                <div><strong>Usuário:</strong> <code>{modalLinks.username}</code></div>
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
