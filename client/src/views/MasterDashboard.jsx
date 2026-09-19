import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { 
  Activity, Users, Tv, ShieldAlert, Settings, FileText, 
  Plus, Edit, Trash2, Coins, ArrowRightLeft, Radio, 
  Wifi, Cpu, HardDrive, RefreshCw, X, Check, Copy, AlertCircle, UploadCloud,
  Image, HeartPulse, Menu, ExternalLink, Smartphone, FolderTree
} from 'lucide-react';

import MasterSidebar from '../components/admin/MasterSidebar';
import MasterDashboardHome from '../components/admin/MasterDashboardHome';
import MasterCatalogView from '../components/admin/MasterCatalogView';
import MasterClientsView from '../components/admin/MasterClientsView';
import HealthCenterView from '../components/admin/HealthCenterView';
import ImageManagerView from '../components/admin/ImageManagerView';
import StreamMonitorView from '../components/admin/StreamMonitorView';
import MasterEpgView from '../components/admin/MasterEpgView';
import MasterBackupView from '../components/admin/MasterBackupView';
import MasterSupportInbox from '../components/admin/MasterSupportInbox';
import MasterAgentsObservability from '../components/admin/MasterAgentsObservability';
import MasterSubtitlesView from '../components/admin/MasterSubtitlesView';

export default function MasterDashboard({ user, onLogout }) {
  const [activeTab, setActiveTab] = useState('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // States
  const [telemetry, setTelemetry] = useState(null);
  const [connections, setConnections] = useState([]);
  const [resellers, setResellers] = useState([]);
  const [categories, setCategories] = useState([]);
  const [firewallRules, setFirewallRules] = useState([]);
  const [reports, setReports] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [settings, setSettings] = useState({});

  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState({ message: '', type: '' });

  // Modals
  const [modalReseller, setModalReseller] = useState(false);
  const [modalCredits, setModalCredits] = useState(null);
  const [modalFirewall, setModalFirewall] = useState(false);
  const [modalCategory, setModalCategory] = useState(false);

  // Forms
  const [resellerForm, setResellerForm] = useState({ username: '', password: '', name: '', email: '', phone: '', credits: 10 });
  const [creditForm, setCreditForm] = useState({ amount: 10, reason: 'Recarga administrativa' });
  const [categoryForm, setCategoryForm] = useState({ name: '', type: 'live', order_num: 0 });
  const [m3uText, setM3uText] = useState('');
  const [m3uPreview, setM3uPreview] = useState(null);
  const [firewallForm, setFirewallForm] = useState({ ip_address: '', reason: 'Bloqueio administrativo' });

  const notify = (msg, type = 'success') => {
    setFeedback({ message: msg, type });
    setTimeout(() => setFeedback({ message: '', type: '' }), 4500);
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

  // Fetch tab-specific data
  const fetchData = async () => {
    try {
      if (activeTab === 'telemetry' || activeTab === 'connections') {
        await fetchTelemetry();
      } else if (activeTab === 'resellers') {
        const res = await api.get('/api/admin/resellers');
        setResellers(res.data);
      } else if (activeTab === 'categories') {
        const res = await api.get('/api/admin/categories');
        setCategories(res.data);
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
      } else if (activeTab === 'audit_logs') {
        const logRes = await api.get('/api/admin/audit-logs');
        setAuditLogs(logRes.data);
      } else if (activeTab === 'settings') {
        const res = await api.get('/api/admin/settings');
        setSettings(res.data);
      }
    } catch (err) {
      console.error(err);
    }
  };

  useEffect(() => {
    fetchData();
  }, [activeTab]);

  useEffect(() => {
    if (activeTab === 'telemetry' || activeTab === 'connections') {
      const interval = setInterval(fetchTelemetry, 5000);
      return () => clearInterval(interval);
    }
  }, [activeTab]);

  // Kill connection
  const handleKillConnection = async (id) => {
    if (!window.confirm('Deseja realmente encerrar esta transmissão ativa?')) return;
    try {
      await api.delete(`/api/admin/connections/${id}`);
      notify('Transmissão encerrada com sucesso!');
      fetchTelemetry();
    } catch (err) {
      notify('Erro ao encerrar conexão', 'error');
    }
  };

  // Resellers: Create
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

  // Resellers: Adjust Credits
  const handleAdjustCredits = async (e) => {
    e.preventDefault();
    if (!modalCredits) return;
    try {
      await api.post(`/api/admin/resellers/${modalCredits.id}/credits`, creditForm);
      notify('Créditos atualizados e registrados no ledger com sucesso!');
      setModalCredits(null);
      setCreditForm({ amount: 10, reason: 'Recarga administrativa' });
      fetchData();
    } catch (err) {
      notify(err.response?.data?.error || 'Erro ao ajustar créditos', 'error');
    }
  };

  // Resellers: Toggle Status
  const handleToggleResellerStatus = async (r) => {
    try {
      const newStatus = r.status === 'active' ? 'suspended' : 'active';
      await api.put(`/api/admin/resellers/${r.id}`, { status: newStatus });
      notify(`Revendedor ${newStatus === 'active' ? 'ativado' : 'suspenso'} com sucesso!`);
      fetchData();
    } catch (err) {
      notify('Erro ao alterar status do revendedor', 'error');
    }
  };

  // Categories: Create
  const handleCreateCategory = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/admin/categories', categoryForm);
      notify('Categoria criada com sucesso!');
      setModalCategory(false);
      setCategoryForm({ name: '', type: 'live', order_num: 0 });
      fetchData();
    } catch (err) {
      notify('Erro ao criar categoria', 'error');
    }
  };

  // Categories: Delete
  const handleDeleteCategory = async (id) => {
    if (!window.confirm('Deseja realmente excluir esta categoria?')) return;
    try {
      await api.delete(`/api/admin/categories/${id}`);
      notify('Categoria excluída.');
      fetchData();
    } catch (err) {
      notify('Erro ao excluir categoria', 'error');
    }
  };

  // M3U Import Flow with Preview & Deduplication
  const handleAnalyzeM3U = () => {
    if (!m3uText.trim()) {
      notify('Cole o conteúdo M3U antes de analisar.', 'error');
      return;
    }
    const lines = m3uText.split(/\r?\n/);
    let channels = 0;
    for (const l of lines) {
      if (l.trim().startsWith('#EXTINF:')) channels++;
    }
    setM3uPreview({
      totalLines: lines.length,
      detectedChannels: channels,
      readyToImport: channels > 0
    });
  };

  const handleConfirmM3UImport = async () => {
    try {
      setLoading(true);
      const res = await api.post('/api/admin/streams/import-m3u', { m3uContent: m3uText });
      notify(res.data.message || 'Canais importados com sucesso!');
      setM3uText('');
      setM3uPreview(null);
      setActiveTab('catalog');
    } catch (err) {
      notify(err.response?.data?.error || 'Erro ao importar M3U', 'error');
    } finally {
      setLoading(false);
    }
  };

  // Firewall: Block IP
  const handleBlockIp = async (e) => {
    e.preventDefault();
    try {
      await api.post('/api/admin/firewall', firewallForm);
      notify('IP bloqueado no firewall com sucesso!');
      setModalFirewall(false);
      setFirewallForm({ ip_address: '', reason: 'Bloqueio administrativo' });
      fetchData();
    } catch (err) {
      notify(err.response?.data?.error || 'Erro ao bloquear IP', 'error');
    }
  };

  // Firewall: Unblock IP
  const handleUnblockIp = async (id) => {
    try {
      await api.delete(`/api/admin/firewall/${id}`);
      notify('Regra removida do firewall.');
      fetchData();
    } catch (err) {
      notify('Erro ao remover regra', 'error');
    }
  };

  // Settings: Save
  const handleSaveSettings = async (e) => {
    e.preventDefault();
    try {
      await api.put('/api/admin/settings', settings);
      notify('Configurações globais salvas com sucesso!');
    } catch (err) {
      notify('Erro ao salvar configurações', 'error');
    }
  };

  // Tab Title helper
  const getTabTitle = () => {
    switch (activeTab) {
      case 'dashboard': return 'Visão Geral & Métricas';
      case 'support_inbox': return 'Central de Suporte & Chamados em Tempo Real';
      case 'agents_observability': return 'Observabilidade de Agentes & Automação';
      case 'telemetry': return 'Monitoramento & P2P Tracker';
      case 'connections': return 'Transmissões Ativas em Tempo Real';
      case 'streams_health': return 'Monitor de Canais & Streams';
      case 'images': return 'VSAIPTV Image Manager';
      case 'catalog': return 'Catálogo de Canais & VOD';
      case 'clients': return 'Gerenciamento de Clientes';
      case 'resellers': return 'Revendedores & Sub-revendas';
      case 'reports': return 'Extrato de Créditos & Ledger';
      case 'import_m3u': return 'Importador M3U Profissional';
      case 'categories': return 'Gestão de Categorias';
      case 'firewall': return 'Firewall & Proteção de Rede';
      case 'audit_logs': return 'Trilha de Auditoria Administrativa';
      case 'health': return 'Central de Saúde & Backups';
      case 'settings': return 'Configurações Globais do Sistema';
      default: return 'Painel Administrativo Master';
    }
  };

  const sidebarWidth = isSidebarCollapsed ? 72 : 260;

  return (
    <div style={{ minHeight: '100vh', background: '#090d16', color: '#f8fafc', display: 'flex' }}>
      {/* Toast Notification */}
      {feedback.message && (
        <div style={{
          position: 'fixed',
          top: '24px',
          right: '24px',
          zIndex: 9999,
          background: feedback.type === 'error' ? 'rgba(239, 68, 68, 0.95)' : 'rgba(16, 185, 129, 0.95)',
          color: '#fff',
          padding: '12px 20px',
          borderRadius: '10px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.5)',
          backdropFilter: 'blur(8px)',
          fontWeight: '600',
          fontSize: '0.88rem',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          border: '1px solid rgba(255, 255, 255, 0.2)'
        }}>
          {feedback.type === 'error' ? <AlertCircle size={18} /> : <Check size={18} />}
          <span>{feedback.message}</span>
        </div>
      )}

      {/* Left Collapsible Sidebar */}
      <MasterSidebar
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        isCollapsed={isSidebarCollapsed}
        setIsCollapsed={setIsSidebarCollapsed}
        isMobileOpen={isMobileMenuOpen}
        setIsMobileOpen={setIsMobileMenuOpen}
        onLogout={onLogout}
      />

      {/* Main Content Area */}
      <div style={{
        flex: 1,
        marginLeft: `${sidebarWidth}px`,
        transition: 'margin-left 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
        display: 'flex',
        flexDirection: 'column',
        minHeight: '100vh',
        maxWidth: `calc(100vw - ${sidebarWidth}px)`
      }} className="master-content-area">
        {/* Top Header Bar */}
        <header style={{
          height: '68px',
          padding: '0 28px',
          background: '#0d111d',
          borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          position: 'sticky',
          top: 0,
          zIndex: 900
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            {/* Mobile hamburger trigger */}
            <button
              onClick={() => setIsMobileMenuOpen(true)}
              className="mobile-menu-trigger"
              style={{
                background: 'transparent',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                display: 'none',
                padding: '6px'
              }}
            >
              <Menu size={22} />
            </button>

            <div>
              <h1 style={{ fontSize: '1.15rem', fontWeight: '800', margin: 0, color: '#f8fafc', letterSpacing: '-0.2px' }}>
                {getTabTitle()}
              </h1>
              <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                VSAIPTV • Operação Centralizada
              </span>
            </div>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
              background: 'rgba(255, 255, 255, 0.04)',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              padding: '6px 14px',
              borderRadius: '20px',
              fontSize: '0.78rem'
            }}>
              <span style={{ width: '7px', height: '7px', borderRadius: '50%', background: '#34d399', boxShadow: '0 0 8px #34d399' }} />
              <span style={{ color: '#cbd5e1', fontWeight: '600' }}>Cluster Operacional</span>
            </div>
          </div>
        </header>

        {/* Viewport Content */}
        <main style={{ flex: 1, padding: '24px 28px', overflowY: 'auto' }}>
          {/* TAB: DASHBOARD (Resumo Executivo) */}
          {activeTab === 'dashboard' && (
            <MasterDashboardHome setActiveTab={setActiveTab} notify={notify} />
          )}

          {/* TAB: SUPPORT INBOX (Central de Suporte e Chamados) */}
          {activeTab === 'support_inbox' && (
            <MasterSupportInbox notify={notify} />
          )}

          {/* TAB: AGENTS OBSERVABILITY (Observabilidade & Kill Switches) */}
          {activeTab === 'agents_observability' && (
            <MasterAgentsObservability notify={notify} />
          )}

          {/* TAB: LEGENDAS IA (FASE 49-53) */}
          {activeTab === 'ai_subtitles' && (
            <MasterSubtitlesView notify={notify} />
          )}

          {/* TAB: CATALOG (Catálogo de Canais & VOD com Paginação Server-Side) */}
          {activeTab === 'catalog' && (
            <MasterCatalogView notify={notify} onOpenM3UImport={() => setActiveTab('import_m3u')} />
          )}

          {/* TAB: CLIENTS (Clientes com Senhas Criptografadas, Teste 30m e Senhas Temporárias) */}
          {activeTab === 'clients' && (
            <MasterClientsView notify={notify} />
          )}

          {/* TAB: IMAGE MANAGER (Image Manager Real com Estatísticas Reais) */}
          {activeTab === 'images' && (
            <ImageManagerView notify={notify} />
          )}

          {/* TAB: STREAMS HEALTH (Monitor de Canais com Varredura Concorrente) */}
          {activeTab === 'streams_health' && (
            <StreamMonitorView notify={notify} />
          )}

          {/* TAB: HEALTH (Central de Saúde) */}
          {activeTab === 'health' && (
            <HealthCenterView notify={notify} />
          )}

          {/* TAB: BACKUP MANAGER (Cópias de Segurança & Integridade) */}
          {activeTab === 'backups' && (
            <MasterBackupView notify={notify} />
          )}

          {/* TAB: EPG (Guia de Programação de TV) */}
          {activeTab === 'epg' && (
            <MasterEpgView notify={notify} />
          )}

          {/* TAB: TELEMETRY (Monitoramento & P2P Tracker) */}
          {activeTab === 'telemetry' && telemetry && (
            <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <div style={{ background: '#131828', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700' }}>Clientes Ativos</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#38bdf8', marginTop: '6px' }}>{telemetry.totalClientsConnected || 0}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Sessões em tempo real</div>
                </div>

                <div style={{ background: '#131828', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700' }}>Streams Ao Vivo</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#a78bfa', marginTop: '6px' }}>{telemetry.activeStreams || 0}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Canais sendo transmitidos</div>
                </div>

                <div style={{ background: '#131828', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700' }}>Swarm P2P Mesh</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#34d399', marginTop: '6px' }}>{telemetry.p2pSwarm?.activeNodes || 0}</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Nós trocando pacotes WebRTC</div>
                </div>

                <div style={{ background: '#131828', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8', textTransform: 'uppercase', fontWeight: '700' }}>Economia de Banda P2P</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#f59e0b', marginTop: '6px' }}>{telemetry.p2pSwarm?.bandwidthSavedPercentage || 0}%</div>
                  <div style={{ fontSize: '0.75rem', color: '#64748b', marginTop: '4px' }}>Tráfego aliviado da CDN</div>
                </div>
              </div>

              {/* Memory & System Specs */}
              <div style={{ background: '#131828', padding: '24px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1.05rem', fontWeight: '700', color: '#f8fafc' }}>
                  Recursos do Servidor Node.js
                </h3>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '16px' }}>
                  <div style={{ background: '#090d16', padding: '16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Memória RSS</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#f8fafc', marginTop: '4px' }}>
                      {telemetry.system?.memory ? (telemetry.system.memory.rss / 1024 / 1024).toFixed(1) + ' MB' : 'N/A'}
                    </div>
                  </div>
                  <div style={{ background: '#090d16', padding: '16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Heap Utilizado</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#f8fafc', marginTop: '4px' }}>
                      {telemetry.system?.memory ? (telemetry.system.memory.heapUsed / 1024 / 1024).toFixed(1) + ' MB' : 'N/A'}
                    </div>
                  </div>
                  <div style={{ background: '#090d16', padding: '16px', borderRadius: '10px', border: '1px solid rgba(255,255,255,0.06)' }}>
                    <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Uptime do Processo</div>
                    <div style={{ fontSize: '1.3rem', fontWeight: '700', color: '#f8fafc', marginTop: '4px' }}>
                      {telemetry.system?.uptime ? Math.floor(telemetry.system.uptime / 3600) + 'h ' + Math.floor((telemetry.system.uptime % 3600) / 60) + 'm' : 'N/A'}
                    </div>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* TAB: CONNECTIONS (Transmissões Ativas) */}
          {activeTab === 'connections' && (
            <div className="animate-fade" style={{ background: '#131828', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
              <div style={{ padding: '20px 24px', borderBottom: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: '#f8fafc' }}>Sessões Ativas em Execução</h3>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{connections.length} clientes assistindo no momento</span>
                </div>
                <button onClick={fetchTelemetry} style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#cbd5e1', padding: '6px 12px', borderRadius: '6px', cursor: 'pointer' }}>
                  Atualizar
                </button>
              </div>

              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#090d16', color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <th style={{ padding: '12px 16px' }}>Cliente</th>
                      <th style={{ padding: '12px 16px' }}>Revenda</th>
                      <th style={{ padding: '12px 16px' }}>Conteúdo</th>
                      <th style={{ padding: '12px 16px' }}>IP & Dispositivo</th>
                      <th style={{ padding: '12px 16px' }}>Início</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {connections.length === 0 ? (
                      <tr>
                        <td colSpan={6} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                          Nenhuma transmissão ativa no momento.
                        </td>
                      </tr>
                    ) : (
                      connections.map((c) => (
                        <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '12px 16px', fontWeight: '700', color: '#f8fafc' }}>{c.username}</td>
                          <td style={{ padding: '12px 16px', color: '#94a3b8' }}>{c.reseller_username || 'Master'}</td>
                          <td style={{ padding: '12px 16px', color: '#38bdf8' }}>{c.stream_name || 'Canal'}</td>
                          <td style={{ padding: '12px 16px', fontSize: '0.78rem', color: '#cbd5e1' }}>
                            <div>{c.ip_address || '127.0.0.1'}</div>
                            <div style={{ color: '#64748b' }}>{c.device_info || 'Web Player'}</div>
                          </td>
                          <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: '#94a3b8' }}>
                            {c.connected_at ? new Date(c.connected_at).toLocaleTimeString('pt-BR') : 'Agora'}
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <button
                              onClick={() => handleKillConnection(c.id)}
                              style={{ background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600' }}
                            >
                              Derrubar
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

          {/* TAB: RESELLERS (Revendedores com Ledger e Sem Senhas Cruas) */}
          {activeTab === 'resellers' && (
            <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ padding: '20px 24px', background: '#131828', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '700', color: '#f8fafc' }}>Rede de Revendedores</h3>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{resellers.length} revendedores cadastrados</span>
                </div>
                <button
                  onClick={() => setModalReseller(true)}
                  style={{ background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Plus size={16} />
                  <span>Novo Revendedor</span>
                </button>
              </div>

              <div style={{ background: '#131828', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <div style={{ overflowX: 'auto' }}>
                  <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                    <thead>
                      <tr style={{ background: '#090d16', color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                        <th style={{ padding: '12px 16px' }}>Revendedor</th>
                        <th style={{ padding: '12px 16px' }}>Contato</th>
                        <th style={{ padding: '12px 16px' }}>Saldo Créditos</th>
                        <th style={{ padding: '12px 16px' }}>Clientes Ativos</th>
                        <th style={{ padding: '12px 16px' }}>Status</th>
                        <th style={{ padding: '12px 16px', textAlign: 'right' }}>Ações</th>
                      </tr>
                    </thead>
                    <tbody>
                      {resellers.map((r) => (
                        <tr key={r.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '12px 16px' }}>
                            <strong style={{ color: '#f8fafc' }}>{r.username}</strong>
                            <span style={{ display: 'block', fontSize: '0.74rem', color: '#64748b' }}>{r.name || 'Revenda'}</span>
                          </td>
                          <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>{r.phone || r.email || '-'}</td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{ fontSize: '1rem', fontWeight: '800', color: r.credits < 5 ? '#f87171' : '#34d399' }}>
                              {parseFloat(r.credits || 0).toFixed(1)}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>
                            {r.active_clients || 0} / {r.total_clients || 0}
                          </td>
                          <td style={{ padding: '12px 16px' }}>
                            <span style={{
                              fontSize: '0.72rem', fontWeight: '700', padding: '2px 8px', borderRadius: '6px',
                              background: r.status === 'active' ? 'rgba(52,211,153,0.15)' : 'rgba(248,113,113,0.15)',
                              color: r.status === 'active' ? '#34d399' : '#f87171'
                            }}>
                              {r.status}
                            </span>
                          </td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                              <button
                                onClick={() => setModalCredits(r)}
                                style={{ background: 'rgba(52,211,153,0.12)', border: '1px solid rgba(52,211,153,0.3)', color: '#34d399', padding: '5px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem', fontWeight: '600' }}
                              >
                                Créditos
                              </button>
                              <button
                                onClick={() => handleToggleResellerStatus(r)}
                                style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#cbd5e1', padding: '5px 8px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.75rem' }}
                              >
                                {r.status === 'active' ? 'Suspender' : 'Ativar'}
                              </button>
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB: REPORTS & AUDIT */}
          {activeTab === 'reports' && reports && (
            <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: '16px' }}>
                <div style={{ background: '#131828', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Créditos em Circulação</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#a78bfa', marginTop: '6px' }}>
                    {reports.totalCreditsInCirculation?.toFixed(1) || '0.0'}
                  </div>
                </div>
                <div style={{ background: '#131828', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Clientes Ativos</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#34d399', marginTop: '6px' }}>
                    {reports.totalActiveClients || 0}
                  </div>
                </div>
                <div style={{ background: '#131828', padding: '20px', borderRadius: '12px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>Testes Gerados</div>
                  <div style={{ fontSize: '1.8rem', fontWeight: '800', color: '#fbbf24', marginTop: '6px' }}>
                    {reports.totalTrialsGenerated || 0}
                  </div>
                </div>
              </div>

              {/* Transactions Ledger */}
              <div style={{ background: '#131828', padding: '24px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <h3 style={{ margin: '0 0 16px 0', fontSize: '1.05rem', fontWeight: '700', color: '#f8fafc' }}>
                  Movimentações de Créditos (Ledger Imutável)
                </h3>
                <div style={{ maxHeight: '420px', overflowY: 'auto' }}>
                  {reports.recentTransactions?.map((t) => (
                    <div key={t.id} style={{ padding: '10px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                      <div>
                        <strong style={{ color: '#f8fafc' }}>{t.reseller_name || t.reseller_username}</strong>
                        <div style={{ fontSize: '0.78rem', color: '#94a3b8' }}>{t.reason}</div>
                        <div style={{ fontSize: '0.72rem', color: '#64748b' }}>{new Date(t.created_at).toLocaleString('pt-BR')}</div>
                      </div>
                      <div style={{ textAlign: 'right' }}>
                        <div style={{ fontWeight: '800', fontSize: '1rem', color: t.amount > 0 ? '#34d399' : '#f87171' }}>
                          {t.amount > 0 ? `+${t.amount}` : t.amount}
                        </div>
                        <div style={{ fontSize: '0.74rem', color: '#94a3b8' }}>Saldo: {t.balance_after}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* TAB: M3U IMPORT (Importador M3U Profissional com Validação e Preview) */}
          {activeTab === 'import_m3u' && (
            <div className="animate-fade" style={{ maxWidth: '800px', display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ background: '#131828', padding: '24px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <h2 style={{ fontSize: '1.2rem', fontWeight: '700', color: '#f8fafc', margin: '0 0 8px 0' }}>
                  Importação de Playlists M3U em Lote
                </h2>
                <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0 0 20px 0' }}>
                  Cole o conteúdo da lista M3U. O sistema analisará previamente a quantidade de canais, tags tvg-logo e identificadores antes de gravar no banco de dados.
                </p>

                <textarea
                  rows={10}
                  placeholder="#EXTM3U&#10;#EXTINF:-1 tvg-id='cnn' tvg-logo='http://...' group-title='Noticias',CNN Brasil&#10;http://stream..."
                  value={m3uText}
                  onChange={(e) => {
                    setM3uText(e.target.value);
                    setM3uPreview(null);
                  }}
                  style={{
                    width: '100%', padding: '14px', borderRadius: '8px', background: '#090d16',
                    border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.82rem', fontFamily: 'monospace'
                  }}
                />

                <div style={{ display: 'flex', gap: '12px', marginTop: '16px', justifyContent: 'flex-end' }}>
                  <button
                    type="button"
                    onClick={handleAnalyzeM3U}
                    disabled={!m3uText.trim() || loading}
                    style={{
                      background: 'rgba(255,255,255,0.08)', border: '1px solid rgba(255,255,255,0.15)',
                      color: '#cbd5e1', padding: '9px 18px', borderRadius: '8px', fontWeight: '600', cursor: 'pointer'
                    }}
                  >
                    Analisar Conteúdo
                  </button>

                  {m3uPreview?.readyToImport && (
                    <button
                      type="button"
                      onClick={handleConfirmM3UImport}
                      disabled={loading}
                      style={{
                        background: 'linear-gradient(135deg, #10b981, #06b6d4)', border: 'none',
                        color: '#fff', padding: '9px 20px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer'
                      }}
                    >
                      {loading ? 'Importando...' : `Confirmar Importação de ${m3uPreview.detectedChannels} Canais`}
                    </button>
                  )}
                </div>

                {m3uPreview && (
                  <div style={{ marginTop: '18px', padding: '16px', background: '#090d16', borderRadius: '8px', border: '1px solid rgba(56,189,248,0.3)', fontSize: '0.85rem' }}>
                    <div style={{ color: '#38bdf8', fontWeight: '700' }}>Resultado da Análise Preliminar:</div>
                    <div style={{ marginTop: '4px', color: '#cbd5e1' }}>
                      Linhas totais: {m3uPreview.totalLines} | Canais detectados: <strong>{m3uPreview.detectedChannels}</strong>
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* TAB: CATEGORIES */}
          {activeTab === 'categories' && (
            <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ padding: '20px 24px', background: '#131828', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '700', color: '#f8fafc' }}>Categorias do Sistema</h3>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{categories.length} categorias cadastradas</span>
                </div>
                <button
                  onClick={() => setModalCategory(true)}
                  style={{ background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Plus size={16} /> Nova Categoria
                </button>
              </div>

              <div style={{ background: '#131828', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#090d16', color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <th style={{ padding: '12px 16px' }}>Nome</th>
                      <th style={{ padding: '12px 16px' }}>Tipo</th>
                      <th style={{ padding: '12px 16px' }}>Streams Associadas</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Ações</th>
                    </tr>
                  </thead>
                  <tbody>
                    {categories.map((c) => (
                      <tr key={c.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                        <td style={{ padding: '12px 16px', fontWeight: '700', color: '#f8fafc' }}>{c.name}</td>
                        <td style={{ padding: '12px 16px', textTransform: 'uppercase', color: '#38bdf8', fontSize: '0.75rem', fontWeight: '700' }}>{c.type}</td>
                        <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>{c.streams_count || 0}</td>
                        <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                          <button
                            onClick={() => handleDeleteCategory(c.id)}
                            style={{ background: 'rgba(239,68,68,0.12)', border: '1px solid rgba(239,68,68,0.3)', color: '#f87171', padding: '4px 8px', borderRadius: '6px', cursor: 'pointer' }}
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

          {/* TAB: FIREWALL */}
          {activeTab === 'firewall' && (
            <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
              <div style={{ padding: '20px 24px', background: '#131828', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '1.15rem', fontWeight: '700', color: '#f8fafc' }}>Firewall & Regras de Acesso</h3>
                  <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>{firewallRules.length} endereços IP bloqueados</span>
                </div>
                <button
                  onClick={() => setModalFirewall(true)}
                  style={{ background: 'linear-gradient(135deg, #ef4444, #f97316)', border: 'none', color: '#fff', padding: '8px 16px', borderRadius: '8px', fontWeight: '700', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Plus size={16} /> Bloquear IP
                </button>
              </div>

              <div style={{ background: '#131828', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', overflow: 'hidden' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
                  <thead>
                    <tr style={{ background: '#090d16', color: '#94a3b8', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
                      <th style={{ padding: '12px 16px' }}>IP</th>
                      <th style={{ padding: '12px 16px' }}>Motivo</th>
                      <th style={{ padding: '12px 16px' }}>Data</th>
                      <th style={{ padding: '12px 16px', textAlign: 'right' }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {firewallRules.length === 0 ? (
                      <tr>
                        <td colSpan={4} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                          Nenhum IP bloqueado. Sistema seguro e sem restrições.
                        </td>
                      </tr>
                    ) : (
                      firewallRules.map((rule) => (
                        <tr key={rule.id} style={{ borderBottom: '1px solid rgba(255,255,255,0.04)' }}>
                          <td style={{ padding: '12px 16px', fontWeight: '700', color: '#f87171' }}>{rule.ip_address}</td>
                          <td style={{ padding: '12px 16px', color: '#cbd5e1' }}>{rule.reason}</td>
                          <td style={{ padding: '12px 16px', fontSize: '0.8rem', color: '#94a3b8' }}>{new Date(rule.created_at).toLocaleString('pt-BR')}</td>
                          <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                            <button
                              onClick={() => handleUnblockIp(rule.id)}
                              style={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.1)', color: '#cbd5e1', padding: '4px 10px', borderRadius: '6px', cursor: 'pointer', fontSize: '0.78rem' }}
                            >
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

          {/* TAB: AUDIT LOGS */}
          {activeTab === 'audit_logs' && (
            <div className="animate-fade" style={{ background: '#131828', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)', padding: '24px' }}>
              <h3 style={{ margin: '0 0 16px 0', fontSize: '1.1rem', fontWeight: '700', color: '#f8fafc' }}>Trilha de Auditoria Administrativa</h3>
              <div style={{ maxHeight: '600px', overflowY: 'auto' }}>
                {auditLogs.map((log) => (
                  <div key={log.id} style={{ padding: '12px 0', borderBottom: '1px solid rgba(255,255,255,0.05)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{ fontSize: '0.72rem', background: 'rgba(139,92,246,0.2)', color: '#a78bfa', padding: '2px 6px', borderRadius: '4px', fontWeight: '700' }}>
                          {log.action}
                        </span>
                        <span style={{ fontSize: '0.85rem', color: '#f8fafc', fontWeight: '600' }}>{log.username || 'Sistema'}</span>
                      </div>
                      <div style={{ fontSize: '0.8rem', color: '#cbd5e1', marginTop: '4px' }}>{log.details}</div>
                    </div>
                    <div style={{ fontSize: '0.75rem', color: '#64748b' }}>
                      {new Date(log.created_at).toLocaleString('pt-BR')}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* TAB: SETTINGS */}
          {activeTab === 'settings' && (
            <div className="animate-fade" style={{ maxWidth: '680px', background: '#131828', padding: '28px', borderRadius: '14px', border: '1px solid rgba(255,255,255,0.08)' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: '800', color: '#f8fafc', margin: '0 0 8px 0' }}>Configurações Globais</h2>
              <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0 0 20px 0' }}>
                Ajuste parâmetros de domínio, limites comerciais e contatos do ecossistema.
              </p>

              <form onSubmit={handleSaveSettings} style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Nome da Plataforma</label>
                  <input
                    type="text"
                    value={settings.server_name || ''}
                    onChange={(e) => setSettings({ ...settings, server_name: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Domínio / Host Público</label>
                  <input
                    type="text"
                    value={settings.server_domain || ''}
                    onChange={(e) => setSettings({ ...settings, server_domain: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Duração Padrão dos Testes (Horas)</label>
                    <input
                      type="number"
                      value={settings.trial_default_hours || 4}
                      onChange={(e) => setSettings({ ...settings, trial_default_hours: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Alerta de Créditos Baixos</label>
                    <input
                      type="number"
                      value={settings.reseller_min_credits_alert || 5}
                      onChange={(e) => setSettings({ ...settings, reseller_min_credits_alert: e.target.value })}
                      style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                    />
                  </div>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>WhatsApp de Suporte</label>
                  <input
                    type="text"
                    value={settings.whatsapp_support_phone || ''}
                    onChange={(e) => setSettings({ ...settings, whatsapp_support_phone: e.target.value })}
                    style={{ width: '100%', padding: '9px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                  />
                </div>

                <button
                  type="submit"
                  style={{
                    padding: '10px 20px', borderRadius: '8px', border: 'none',
                    background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)', color: '#fff', fontWeight: '700', cursor: 'pointer', marginTop: '10px'
                  }}
                >
                  Salvar Configurações
                </button>
              </form>
            </div>
          )}
        </main>
      </div>

      {/* MODALS */}
      {/* Modal New Reseller */}
      {modalReseller && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,7,15,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px' }}>
          <div style={{ background: '#131828', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', width: '100%', maxWidth: '480px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#f8fafc', fontWeight: '700' }}>Criar Novo Revendedor</h3>
              <button onClick={() => setModalReseller(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateReseller} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Nome da Revenda *</label>
                <input type="text" required value={resellerForm.name} onChange={(e) => setResellerForm({ ...resellerForm, name: e.target.value })} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Usuário *</label>
                  <input type="text" required value={resellerForm.username} onChange={(e) => setResellerForm({ ...resellerForm, username: e.target.value })} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Senha Inicial *</label>
                  <input type="password" required value={resellerForm.password} onChange={(e) => setResellerForm({ ...resellerForm, password: e.target.value })} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                </div>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>WhatsApp</label>
                  <input type="text" value={resellerForm.phone} onChange={(e) => setResellerForm({ ...resellerForm, phone: e.target.value })} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Créditos Iniciais</label>
                  <input type="number" value={resellerForm.credits} onChange={(e) => setResellerForm({ ...resellerForm, credits: e.target.value })} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
                </div>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button type="button" onClick={() => setModalReseller(false)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#cbd5e1', cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)', color: '#fff', fontWeight: '700', cursor: 'pointer' }}>Criar Revendedor</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Credits Ledger */}
      {modalCredits && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,7,15,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px' }}>
          <div style={{ background: '#131828', borderRadius: '16px', border: '1px solid rgba(52,211,153,0.3)', width: '100%', maxWidth: '420px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f8fafc', fontWeight: '700' }}>
                Recarregar Créditos: {modalCredits.username}
              </h3>
              <button onClick={() => setModalCredits(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 14px 0' }}>
              Saldo atual: <strong style={{ color: '#34d399' }}>{modalCredits.credits}</strong> créditos. Toda alteração grava registro na trilha de auditoria.
            </p>
            <form onSubmit={handleAdjustCredits} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Quantidade (+ para somar, - para remover)</label>
                <input type="number" step="any" required value={creditForm.amount} onChange={(e) => setCreditForm({ ...creditForm, amount: e.target.value })} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Motivo / Justificativa</label>
                <input type="text" required value={creditForm.reason} onChange={(e) => setCreditForm({ ...creditForm, reason: e.target.value })} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setModalCredits(null)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#cbd5e1', cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: 'linear-gradient(135deg, #10b981, #06b6d4)', color: '#fff', fontWeight: '700', cursor: 'pointer' }}>Efetivar Recarga</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Firewall IP */}
      {modalFirewall && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,7,15,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px' }}>
          <div style={{ background: '#131828', borderRadius: '16px', border: '1px solid rgba(239,68,68,0.3)', width: '100%', maxWidth: '420px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f8fafc', fontWeight: '700' }}>Bloquear Endereço IP</h3>
              <button onClick={() => setModalFirewall(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleBlockIp} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Endereço IP</label>
                <input type="text" required placeholder="192.168.1.100" value={firewallForm.ip_address} onChange={(e) => setFirewallForm({ ...firewallForm, ip_address: e.target.value })} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Motivo</label>
                <input type="text" required value={firewallForm.reason} onChange={(e) => setFirewallForm({ ...firewallForm, reason: e.target.value })} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setModalFirewall(false)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#cbd5e1', cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: 'linear-gradient(135deg, #ef4444, #f97316)', color: '#fff', fontWeight: '700', cursor: 'pointer' }}>Bloquear IP</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal Category */}
      {modalCategory && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(5,7,15,0.85)', backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px' }}>
          <div style={{ background: '#131828', borderRadius: '16px', border: '1px solid rgba(255,255,255,0.1)', width: '100%', maxWidth: '420px', padding: '24px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f8fafc', fontWeight: '700' }}>Nova Categoria</h3>
              <button onClick={() => setModalCategory(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            <form onSubmit={handleCreateCategory} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Nome da Categoria</label>
                <input type="text" required value={categoryForm.name} onChange={(e) => setCategoryForm({ ...categoryForm, name: e.target.value })} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }} />
              </div>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Tipo de Conteúdo</label>
                <select value={categoryForm.type} onChange={(e) => setCategoryForm({ ...categoryForm, type: e.target.value })} style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}>
                  <option value="live">TV Ao Vivo</option>
                  <option value="movie">Filmes</option>
                  <option value="series">Séries</option>
                </select>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button type="button" onClick={() => setModalCategory(false)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#cbd5e1', cursor: 'pointer' }}>Cancelar</button>
                <button type="submit" style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)', color: '#fff', fontWeight: '700', cursor: 'pointer' }}>Salvar Categoria</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
