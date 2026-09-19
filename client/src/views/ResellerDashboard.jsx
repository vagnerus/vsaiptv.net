import React, { useState, useEffect, useMemo } from 'react';
import api from '../services/api';
import { 
  Users, Zap, Coins, Clock, AlertTriangle, 
  Plus, RefreshCw, Copy, Check, Trash2, Power, 
  MessageSquare, Share2, Tv, X, Wifi, PlayCircle,
  Eye, EyeOff, Edit3, Search, Film, FileText, CheckSquare, Square
} from 'lucide-react';

const AVAILABLE_PACKAGES = [
  { id: 'live', label: 'Canais Ao Vivo', icon: '📺', desc: 'Abertos, Esportes, Notícias, 24h' },
  { id: 'movie', label: 'Filmes & VOD', icon: '🍿', desc: 'Lançamentos, Cinema, 4K & FHD' },
  { id: 'series', label: 'Séries Completas', icon: '🎬', desc: 'Temporadas completas atualizadas' },
  { id: 'novelas', label: 'Novelas & Docs', icon: '🎭', desc: 'Clássicos e novelas atuais' },
  { id: 'xxx', label: 'XXX / Adulto', icon: '🔞', desc: 'Conteúdo adulto protegido por senha' },
];

export default function ResellerDashboard({ user, onOpenPlayer }) {
  const [profile, setProfile] = useState(null);
  const [clients, setClients] = useState([]);
  const [activeConnections, setActiveConnections] = useState([]);
  const [creditHistory, setCreditHistory] = useState([]);
  const [activeSubTab, setActiveSubTab] = useState('clients'); // clients, connections, credits
  const [loading, setLoading] = useState(false);
  const [feedback, setFeedback] = useState({ message: '', type: '' });

  // Filters & Search
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // all, watching, active, trial, expired

  // Password visibility toggles
  const [showNewClientPass, setShowNewClientPass] = useState(false);
  const [showEditPass, setShowEditPass] = useState(false);
  const [showTrialPass, setShowTrialPass] = useState(false);

  // Modals
  const [modalNewClient, setModalNewClient] = useState(false);
  const [modalNewTrial, setModalNewTrial] = useState(false);
  const [trialResult, setTrialResult] = useState(null); // Generated trial ready to copy
  const [modalRenew, setModalRenew] = useState(null); // client object
  const [modalLinks, setModalLinks] = useState(null); // client object
  const [modalEdit, setModalEdit] = useState(null); // client object to edit

  // Forms
  const [clientForm, setClientForm] = useState({
    username: '',
    password: '',
    name: '',
    phone: '',
    months: 1,
    max_connections: 1,
    packages: ['live', 'movie', 'series', 'novelas', 'xxx'],
    notes: '',
  });

  const [trialForm, setTrialForm] = useState({
    hours: 4,
    username: '',
    password: '',
    name: '',
    phone: '',
    max_connections: 1,
    packages: ['live', 'movie', 'series', 'novelas', 'xxx'],
    notes: 'Teste rápido gerado pelo revendedor',
  });

  const [editForm, setEditForm] = useState({
    id: null,
    username: '',
    password: '',
    name: '',
    phone: '',
    max_connections: 1,
    packages: ['live', 'movie', 'series', 'novelas', 'xxx'],
    notes: '',
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
    const interval = setInterval(fetchData, 12000); // 12s live refresh
    return () => clearInterval(interval);
  }, []);

  // Helper generators
  const generateRandomUser = (prefix = 'user') => {
    return `${prefix}_${Math.floor(1000 + Math.random() * 9000)}`;
  };

  const generateRandomPassword = () => {
    const chars = 'abcdefghjkmnpqrstuvwxyz23456789';
    let res = '';
    for (let i = 0; i < 6; i++) {
      res += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return res;
  };

  // Open New Client Modal with preset random credentials
  const openNewClientModal = () => {
    setClientForm({
      username: generateRandomUser('cli'),
      password: generateRandomPassword(),
      name: '',
      phone: '',
      months: 1,
      max_connections: 1,
      packages: ['live', 'movie', 'series', 'novelas'],
      notes: '',
    });
    setShowNewClientPass(true);
    setModalNewClient(true);
  };

  // Open New Trial Modal
  const openNewTrialModal = () => {
    setTrialForm({
      hours: 4,
      username: generateRandomUser('teste'),
      password: generateRandomPassword(),
      name: '',
      phone: '',
      max_connections: 1,
      packages: ['live', 'movie', 'series', 'novelas'],
      notes: 'Teste rápido de 4h',
    });
    setShowTrialPass(true);
    setModalNewTrial(true);
  };

  // Open Edit Modal
  const openEditModal = (client) => {
    const currentPkgs = client.packages ? client.packages.split(',').map(p => p.trim()) : ['live', 'movie', 'series', 'novelas', 'xxx'];
    setEditForm({
      id: client.id,
      username: client.username,
      password: '', // Blank means keep current
      name: client.name || '',
      phone: client.phone || '',
      max_connections: client.max_connections || 1,
      packages: currentPkgs,
      notes: client.notes || '',
    });
    setShowEditPass(false);
    setModalEdit(client);
  };

  // Toggle package helper
  const togglePackage = (formState, setFormState, pkgId) => {
    const exists = formState.packages.includes(pkgId);
    const updated = exists 
      ? formState.packages.filter(p => p !== pkgId)
      : [...formState.packages, pkgId];
    setFormState({ ...formState, packages: updated });
  };

  const selectAllPackages = (setFormState) => {
    setFormState(prev => ({ ...prev, packages: AVAILABLE_PACKAGES.map(p => p.id) }));
  };

  const clearPackages = (setFormState) => {
    setFormState(prev => ({ ...prev, packages: ['live', 'xxx'] }));
  };

  const handleCreateClient = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...clientForm,
        packages: clientForm.packages.join(','),
      };
      const res = await api.post('/api/reseller/clients', payload);
      notify(res.data.message);
      setModalNewClient(false);
      fetchData();
    } catch (err) {
      notify(err.response?.data?.error || 'Erro ao criar cliente', 'error');
    }
  };

  const handleGenerateTrial = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        ...trialForm,
        packages: trialForm.packages.join(','),
      };
      const res = await api.post('/api/reseller/generate-trial', payload);
      setTrialResult(res.data.trial);
      setModalNewTrial(false);
      notify('Teste gerado com sucesso!');
      fetchData();
    } catch (err) {
      notify(err.response?.data?.error || 'Erro ao gerar teste', 'error');
    }
  };

  const handleEditClient = async (e) => {
    e.preventDefault();
    try {
      const payload = {
        name: editForm.name,
        phone: editForm.phone,
        max_connections: editForm.max_connections,
        notes: editForm.notes,
        packages: editForm.packages.join(','),
      };
      if (editForm.password && editForm.password.trim().length > 0) {
        payload.password = editForm.password.trim();
      }
      const res = await api.put(`/api/reseller/clients/${editForm.id}`, payload);
      notify(res.data.message);
      setModalEdit(null);
      fetchData();
    } catch (err) {
      notify(err.response?.data?.error || 'Erro ao atualizar cliente', 'error');
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
      notify(`Cliente ${newStatus === 'active' ? 'reativado' : 'suspenso'}!`);
      fetchData();
    } catch (err) {
      notify('Erro ao alterar status', 'error');
    }
  };

  const handleDeleteClient = async (id, username) => {
    if (!confirm(`Tem certeza que deseja excluir o cliente ${username}? Esta ação não pode ser desfeita.`)) return;
    try {
      await api.delete(`/api/reseller/clients/${id}`);
      notify('Cliente excluído com sucesso!');
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

  // Filtered clients
  const filteredClients = useMemo(() => {
    return clients.filter(c => {
      // Search
      const matchSearch = 
        c.username.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (c.name && c.name.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (c.phone && c.phone.includes(searchTerm)) ||
        (c.notes && c.notes.toLowerCase().includes(searchTerm.toLowerCase()));

      if (!matchSearch) return false;

      // Status
      if (statusFilter === 'watching') return !!c.current_watching;
      if (statusFilter === 'active') return c.status === 'active' && c.is_trial === 0;
      if (statusFilter === 'trial') return c.is_trial === 1;
      if (statusFilter === 'expired') return c.status === 'expired' || (c.expires_at && new Date(c.expires_at) < new Date());

      return true;
    });
  }, [clients, searchTerm, statusFilter]);

  const totalWatching = clients.filter(c => !!c.current_watching).length;

  return (
    <div style={{ padding: '24px', maxWidth: '1440px', margin: '0 auto' }}>
      
      {/* Toast Feedback */}
      {feedback.message && (
        <div style={{
          position: 'fixed',
          top: '20px',
          right: '20px',
          zIndex: 2500,
          background: feedback.type === 'error' ? '#ef4444' : '#10b981',
          color: '#fff',
          padding: '14px 22px',
          borderRadius: 'var(--radius-md)',
          boxShadow: '0 8px 30px rgba(0,0,0,0.5)',
          display: 'flex',
          alignItems: 'center',
          gap: '10px',
          fontWeight: '700',
          fontSize: '0.92rem',
        }}>
          <Check size={20} />
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
              Testes rápidos temporários
            </span>
          </div>
          <div className="stat-icon-wrapper" style={{ background: 'rgba(245, 158, 11, 0.15)', color: '#fbbf24' }}>
            <Clock size={24} />
          </div>
        </div>

        {/* Active Streams - Live Monitoring */}
        <div className="stat-card" style={{ borderLeft: totalWatching > 0 ? '4px solid #06b6d4' : 'none' }}>
          <div>
            <span className="stat-label">Assistindo Agora (Ao Vivo)</span>
            <div className="stat-value" style={{ color: totalWatching > 0 ? '#22d3ee' : 'var(--text-dim)', display: 'flex', alignItems: 'center', gap: '8px' }}>
              {totalWatching}
              {totalWatching > 0 && (
                <span style={{
                  display: 'inline-block',
                  width: '10px',
                  height: '10px',
                  borderRadius: '50%',
                  background: '#22d3ee',
                  boxShadow: '0 0 10px #22d3ee',
                  animation: 'pulse 1.5s infinite',
                }} />
              )}
            </div>
            <span style={{ fontSize: '0.78rem', color: 'var(--text-dim)' }}>
              {activeConnections.length} tela(s) conectada(s)
            </span>
          </div>
          <div className="stat-icon-wrapper" style={{ background: 'rgba(6, 182, 212, 0.15)', color: '#22d3ee' }}>
            <Wifi size={24} />
          </div>
        </div>
      </div>

      {/* Banner: Unlimited WebTV Player Access */}
      {onOpenPlayer && (
        <div style={{
          background: 'linear-gradient(135deg, rgba(79, 70, 229, 0.16) 0%, rgba(124, 58, 237, 0.16) 100%)',
          border: '1px solid rgba(99, 102, 241, 0.35)',
          borderRadius: 'var(--radius-lg)',
          padding: '16px 20px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          marginBottom: '24px',
          flexWrap: 'wrap',
          gap: '14px',
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '12px',
              background: 'linear-gradient(135deg, #4f46e5 0%, #7c3aed 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: '#fff',
              boxShadow: '0 0 16px rgba(99, 102, 241, 0.45)',
              flexShrink: 0,
            }}>
              <Tv size={24} />
            </div>
            <div>
              <h3 style={{ fontSize: '1rem', fontWeight: '800', color: '#fff', margin: 0 }}>
                Acesso Ilimitado ao WebTV Player
              </h3>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-muted)', margin: '3px 0 0 0' }}>
                Sua conta de revendedor possui acesso liberado sem limite de telas para assistir canais ao vivo, filmes, séries e novelas.
              </p>
            </div>
          </div>
          <button
            onClick={onOpenPlayer}
            className="btn btn-primary"
            style={{
              padding: '10px 22px',
              borderRadius: 'var(--radius-full)',
              fontWeight: '700',
              boxShadow: '0 0 16px rgba(99, 102, 241, 0.45)',
            }}
          >
            <PlayCircle size={18} /> Assistir no Navegador
          </button>
        </div>
      )}

      {/* Main Action Buttons & Subtabs */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '12px', marginBottom: '20px' }}>
        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            onClick={openNewTrialModal} 
            className="btn"
            style={{ 
              background: 'linear-gradient(135deg, #f59e0b 0%, #d97706 100%)', 
              color: '#fff', 
              boxShadow: '0 4px 15px rgba(245, 158, 11, 0.3)',
              fontWeight: '700'
            }}
          >
            <Zap size={16} /> ⚡ Gerar Teste Rápido
          </button>
          <button 
            onClick={openNewClientModal} 
            className="btn btn-primary"
            style={{ fontWeight: '700' }}
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
            style={{ border: 'none', fontWeight: '600' }}
          >
            Meus Clientes ({clients.length})
          </button>
          <button
            onClick={() => setActiveSubTab('connections')}
            className={`btn btn-sm ${activeSubTab === 'connections' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ border: 'none', fontWeight: '600' }}
          >
            Telas Conectadas ({activeConnections.length})
          </button>
          <button
            onClick={() => setActiveSubTab('credits')}
            className={`btn btn-sm ${activeSubTab === 'credits' ? 'btn-primary' : 'btn-secondary'}`}
            style={{ border: 'none', fontWeight: '600' }}
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
          
          {/* Filter and Search Bar */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '14px', marginBottom: '20px' }}>
            
            {/* Search Input */}
            <div style={{ position: 'relative', flex: '1', minWidth: '260px', maxWidth: '400px' }}>
              <Search size={16} style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
              <input
                type="text"
                className="form-control"
                style={{ paddingLeft: '38px', height: '40px' }}
                placeholder="Buscar usuário, nome, telefone ou nota..."
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
              />
            </div>

            {/* Quick Status Filters */}
            <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
              <button
                onClick={() => setStatusFilter('all')}
                className={`btn btn-sm ${statusFilter === 'all' ? 'btn-primary' : 'btn-secondary'}`}
              >
                Todos ({clients.length})
              </button>
              <button
                onClick={() => setStatusFilter('watching')}
                className={`btn btn-sm ${statusFilter === 'watching' ? 'btn-primary' : 'btn-secondary'}`}
                style={totalWatching > 0 ? { border: '1px solid #06b6d4', color: '#22d3ee' } : {}}
              >
                🔴 Assistindo Agora ({totalWatching})
              </button>
              <button
                onClick={() => setStatusFilter('active')}
                className={`btn btn-sm ${statusFilter === 'active' ? 'btn-primary' : 'btn-secondary'}`}
              >
                Ativos ({clients.filter(c => c.status === 'active' && !c.is_trial).length})
              </button>
              <button
                onClick={() => setStatusFilter('trial')}
                className={`btn btn-sm ${statusFilter === 'trial' ? 'btn-primary' : 'btn-secondary'}`}
              >
                Testes ({clients.filter(c => c.is_trial === 1).length})
              </button>
              <button
                onClick={() => setStatusFilter('expired')}
                className={`btn btn-sm ${statusFilter === 'expired' ? 'btn-primary' : 'btn-secondary'}`}
              >
                Vencidos ({clients.filter(c => c.status === 'expired' || (c.expires_at && new Date(c.expires_at) < new Date())).length})
              </button>
            </div>
          </div>

          {/* Table */}
          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Usuário / Acesso</th>
                  <th>Status & Assistindo Agora</th>
                  <th>Contato / Cliente</th>
                  <th>Pacotes Liberados</th>
                  <th>Telas</th>
                  <th>Validade</th>
                  <th>Observações</th>
                  <th>Ações</th>
                </tr>
              </thead>
              <tbody>
                {filteredClients.length === 0 ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: 'center', padding: '40px', color: 'var(--text-dim)' }}>
                      {searchTerm ? 'Nenhum cliente encontrado com os critérios de busca.' : 'Você ainda não cadastrou nenhum cliente. Clique em "Ativar Novo Cliente" ou "Gerar Teste Rápido"!'}
                    </td>
                  </tr>
                ) : (
                  filteredClients.map((c) => {
                    const isWatching = !!c.current_watching;
                    const clientPkgs = c.packages ? c.packages.split(',').map(p => p.trim()) : ['live', 'movie', 'series', 'novelas'];

                    return (
                      <tr key={c.id} style={isWatching ? { background: 'rgba(6, 182, 212, 0.04)' } : {}}>
                        
                        {/* 1. Username & Password */}
                        <td>
                          <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <strong style={{ fontSize: '0.95rem', color: '#fff' }}>{c.username}</strong>
                            {c.is_trial === 1 && (
                              <span className="badge badge-trial" style={{ fontSize: '0.65rem' }}>
                                Teste {c.trial_hours}h
                              </span>
                            )}
                          </div>
                          <div style={{ marginTop: '4px', display: 'flex', alignItems: 'center', gap: '6px' }}>
                            <span style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>Senha:</span>
                            <code style={{ 
                              fontSize: '0.8rem', 
                              background: 'rgba(255,255,255,0.06)', 
                              padding: '2px 6px', 
                              borderRadius: '4px', 
                              color: '#34d399', 
                              fontWeight: '600' 
                            }}>
                              {c.plain_password || '••••••'}
                            </code>
                          </div>
                        </td>

                        {/* 2. Status & Live Watching Display */}
                        <td>
                          {isWatching ? (
                            <div style={{
                              background: 'rgba(6, 182, 212, 0.15)',
                              border: '1px solid rgba(6, 182, 212, 0.35)',
                              padding: '6px 10px',
                              borderRadius: '8px',
                              display: 'inline-flex',
                              flexDirection: 'column',
                              gap: '3px',
                              maxWidth: '220px',
                            }}>
                              <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                                <span style={{
                                  width: '8px',
                                  height: '8px',
                                  borderRadius: '50%',
                                  background: '#22d3ee',
                                  boxShadow: '0 0 8px #22d3ee',
                                }} />
                                <strong style={{ color: '#22d3ee', fontSize: '0.75rem', textTransform: 'uppercase' }}>
                                  Assistindo Agora
                                </strong>
                              </div>
                              <span style={{ 
                                color: '#fff', 
                                fontWeight: '700', 
                                fontSize: '0.85rem',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }} title={c.current_watching.stream_name}>
                                {c.current_watching.stream_name || 'Transmissão IPTV'}
                              </span>
                              <span style={{ fontSize: '0.7rem', color: 'var(--text-dim)' }}>
                                {c.current_watching.device_type} • Conectou {new Date(c.current_watching.connected_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </span>
                            </div>
                          ) : (
                            <div>
                              <span className={`badge ${c.status === 'active' ? 'badge-active' : c.status === 'expired' ? 'badge-expired' : 'badge-suspended'}`}>
                                {c.status === 'active' ? 'Ativo' : c.status === 'expired' ? 'Expirado' : 'Suspenso'}
                              </span>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)', marginTop: '4px' }}>
                                Desconectado
                              </div>
                            </div>
                          )}
                        </td>

                        {/* 3. Name & Phone */}
                        <td>
                          <div style={{ fontWeight: '600', color: '#fff' }}>{c.name || 'Sem nome'}</div>
                          {c.phone ? (
                            <a
                              href={`https://api.whatsapp.com/send?phone=${c.phone.replace(/\D/g, '')}`}
                              target="_blank"
                              rel="noreferrer"
                              style={{ 
                                fontSize: '0.76rem', 
                                color: '#34d399', 
                                display: 'inline-flex', 
                                alignItems: 'center', 
                                gap: '4px',
                                textDecoration: 'none',
                                marginTop: '2px'
                              }}
                            >
                              <MessageSquare size={12} /> {c.phone}
                            </a>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>Sem WhatsApp</span>
                          )}
                        </td>

                        {/* 4. Packages */}
                        <td>
                          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', maxWidth: '160px' }}>
                            {clientPkgs.map(p => {
                              const pkgInfo = AVAILABLE_PACKAGES.find(item => item.id === p);
                              return (
                                <span 
                                  key={p} 
                                  style={{
                                    fontSize: '0.68rem',
                                    background: p === 'adult' ? 'rgba(239, 68, 68, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                                    color: p === 'adult' ? '#f87171' : '#a5b4fc',
                                    border: `1px solid ${p === 'adult' ? 'rgba(239, 68, 68, 0.3)' : 'rgba(99, 102, 241, 0.3)'}`,
                                    padding: '2px 6px',
                                    borderRadius: '4px',
                                    fontWeight: '600'
                                  }}
                                >
                                  {pkgInfo ? `${pkgInfo.icon} ${pkgInfo.label.split(' ')[0]}` : p}
                                </span>
                              );
                            })}
                          </div>
                        </td>

                        {/* 5. Screens */}
                        <td>
                          <span style={{ fontWeight: '700', color: isWatching ? '#22d3ee' : '#fff' }}>
                            {c.active_screens || 0} / {c.max_connections}
                          </span>
                          <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>tela(s)</div>
                        </td>

                        {/* 6. Expiration */}
                        <td style={{ fontSize: '0.82rem' }}>
                          {c.expires_at ? (
                            <div>
                              <span style={{ 
                                color: new Date(c.expires_at) < new Date() ? '#f87171' : '#34d399',
                                fontWeight: '600'
                              }}>
                                {new Date(c.expires_at).toLocaleDateString('pt-BR')}
                              </span>
                              <div style={{ fontSize: '0.72rem', color: 'var(--text-dim)' }}>
                                {new Date(c.expires_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                              </div>
                            </div>
                          ) : (
                            <span style={{ color: '#818cf8', fontWeight: '700' }}>Vitalício</span>
                          )}
                        </td>

                        {/* 7. Observations */}
                        <td>
                          {c.notes ? (
                            <div 
                              style={{ 
                                fontSize: '0.78rem', 
                                color: 'var(--text-muted)', 
                                background: 'rgba(255,255,255,0.03)',
                                padding: '6px 8px',
                                borderRadius: '6px',
                                border: '1px solid var(--border-color)',
                                maxWidth: '180px',
                                whiteSpace: 'nowrap',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis'
                              }}
                              title={c.notes}
                            >
                              <FileText size={12} style={{ display: 'inline', marginRight: '4px', verticalAlign: 'middle' }} />
                              {c.notes}
                            </div>
                          ) : (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>-</span>
                          )}
                        </td>

                        {/* 8. Actions */}
                        <td>
                          <div style={{ display: 'flex', gap: '6px', flexWrap: 'nowrap' }}>
                            <button
                              onClick={() => setModalLinks(c)}
                              className="btn btn-secondary btn-sm"
                              title="Copiar dados de acesso / M3U"
                            >
                              <Copy size={13} />
                            </button>
                            <button
                              onClick={() => openEditModal(c)}
                              className="btn btn-secondary btn-sm"
                              title="Editar cliente, senha, pacotes e observações"
                            >
                              <Edit3 size={13} color="#818cf8" />
                            </button>
                            <button
                              onClick={() => { setModalRenew(c); setRenewMonths(1); }}
                              className="btn btn-success btn-sm"
                              title="Renovar assinatura com créditos"
                            >
                              <RefreshCw size={13} />
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
                              title="Excluir cliente"
                            >
                              <Trash2 size={13} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* SUBTAB: CONNECTED STREAMS (LIVE) */}
      {/* ==================================================== */}
      {activeSubTab === 'connections' && (
        <div className="glass-card animate-fade" style={{ padding: '24px' }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <span style={{
                width: '10px',
                height: '10px',
                borderRadius: '50%',
                background: '#22d3ee',
                boxShadow: '0 0 10px #22d3ee',
                animation: 'pulse 1.5s infinite',
              }} />
              <h3 style={{ fontSize: '1.2rem', fontWeight: '700', margin: 0 }}>
                Telas Conectadas dos Meus Clientes (Tempo Real)
              </h3>
            </div>
            <button onClick={fetchData} className="btn btn-secondary btn-sm">
              <RefreshCw size={14} /> Atualizar Conexões
            </button>
          </div>

          <div className="data-table-container">
            <table className="data-table">
              <thead>
                <tr>
                  <th>Cliente</th>
                  <th>Canal / Conteúdo em Reprodução</th>
                  <th>Dispositivo</th>
                  <th>IP Conectado</th>
                  <th>Início da Conexão</th>
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
                      <td>
                        <strong>{conn.username}</strong>
                        {conn.user_name && <div style={{ fontSize: '0.75rem', color: 'var(--text-dim)' }}>{conn.user_name}</div>}
                      </td>
                      <td>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <Tv size={16} color="#818cf8" />
                          <strong style={{ color: '#fff' }}>{conn.stream_name || 'Desconhecido'}</strong>
                        </div>
                      </td>
                      <td>
                        <span style={{ background: 'rgba(255,255,255,0.06)', padding: '2px 8px', borderRadius: '4px', fontSize: '0.8rem' }}>
                          {conn.device_type}
                        </span>
                      </td>
                      <td><code>{conn.ip_address}</code></td>
                      <td style={{ fontSize: '0.82rem', color: 'var(--text-muted)' }}>
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
      {/* MODAL: CREATE OFFICIAL CLIENT */}
      {/* ==================================================== */}
      {modalNewClient && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Plus size={20} color="#6366f1" />
                <h3 style={{ fontSize: '1.15rem', fontWeight: '800' }}>Ativar Novo Cliente Oficial</h3>
              </div>
              <button onClick={() => setModalNewClient(false)} className="btn btn-secondary btn-sm"><X size={16} /></button>
            </div>
            
            <form onSubmit={handleCreateClient}>
              <div className="modal-body">
                <div style={{
                  background: 'rgba(99, 102, 241, 0.1)',
                  border: '1px solid rgba(99, 102, 241, 0.25)',
                  borderRadius: '8px',
                  padding: '10px 14px',
                  marginBottom: '18px',
                  fontSize: '0.85rem',
                  color: 'var(--text-muted)'
                }}>
                  💰 Seu saldo atual: <strong style={{ color: '#818cf8' }}>{profile?.reseller?.credits?.toFixed(1)} créditos</strong>. Cada mês de ativação consome <strong>1 crédito</strong>.
                </div>

                {/* Credentials Section */}
                <div style={{ 
                  background: 'var(--bg-input)', 
                  padding: '16px', 
                  borderRadius: '10px', 
                  border: '1px solid var(--border-color)', 
                  marginBottom: '18px' 
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <label className="input-label" style={{ fontWeight: '800', color: '#fff', margin: 0 }}>
                      🔑 Dados de Acesso do Cliente
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setClientForm({
                          ...clientForm,
                          username: generateRandomUser('cli'),
                          password: generateRandomPassword(),
                        });
                      }}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.75rem', padding: '4px 8px' }}
                    >
                      ⚡ Gerar Aleatório
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' }}>
                    <div className="input-group" style={{ margin: 0 }}>
                      <label className="input-label">Usuário de Acesso *</label>
                      <input
                        type="text"
                        className="form-control"
                        required
                        placeholder="Ex: marcos_silva"
                        value={clientForm.username}
                        onChange={(e) => setClientForm({ ...clientForm, username: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                      />
                    </div>

                    <div className="input-group" style={{ margin: 0 }}>
                      <label className="input-label">Senha de Acesso *</label>
                      <div style={{ position: 'relative' }}>
                        <input
                          type={showNewClientPass ? 'text' : 'password'}
                          className="form-control"
                          required
                          placeholder="Senha de acesso"
                          value={clientForm.password}
                          onChange={(e) => setClientForm({ ...clientForm, password: e.target.value })}
                        />
                        <button
                          type="button"
                          onClick={() => setShowNewClientPass(!showNewClientPass)}
                          style={{
                            position: 'absolute',
                            right: '10px',
                            top: '50%',
                            transform: 'translateY(-50%)',
                            background: 'none',
                            border: 'none',
                            color: 'var(--text-dim)',
                            cursor: 'pointer',
                          }}
                        >
                          {showNewClientPass ? <EyeOff size={16} /> : <Eye size={16} />}
                        </button>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Personal details */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div className="input-group" style={{ margin: 0 }}>
                    <label className="input-label">Nome Completo</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Ex: Marcos Silva"
                      value={clientForm.name}
                      onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                    />
                  </div>
                  <div className="input-group" style={{ margin: 0 }}>
                    <label className="input-label">WhatsApp com DDD</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="+55 11 99999-9999"
                      value={clientForm.phone}
                      onChange={(e) => setClientForm({ ...clientForm, phone: e.target.value })}
                    />
                  </div>
                </div>

                {/* Plan & Screens */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '18px' }}>
                  <div className="input-group" style={{ margin: 0 }}>
                    <label className="input-label">Período de Validade</label>
                    <select
                      className="form-control"
                      value={clientForm.months}
                      onChange={(e) => setClientForm({ ...clientForm, months: parseInt(e.target.value) })}
                    >
                      <option value={1}>1 Mês (1 Crédito)</option>
                      <option value={2}>2 Meses (2 Créditos)</option>
                      <option value={3}>3 Meses (3 Créditos)</option>
                      <option value={6}>6 Meses (6 Créditos)</option>
                      <option value={12}>12 Meses (12 Créditos)</option>
                    </select>
                  </div>

                  <div className="input-group" style={{ margin: 0 }}>
                    <label className="input-label">Telas Permitidas</label>
                    <select
                      className="form-control"
                      value={clientForm.max_connections}
                      onChange={(e) => setClientForm({ ...clientForm, max_connections: parseInt(e.target.value) })}
                    >
                      <option value={1}>1 Tela Simultânea</option>
                      <option value={2}>2 Telas Simultâneas</option>
                      <option value={3}>3 Telas Simultâneas</option>
                      <option value={4}>4 Telas Simultâneas</option>
                      <option value={5}>5 Telas Simultâneas</option>
                    </select>
                  </div>
                </div>

                {/* Content Packages Selection */}
                <div style={{ 
                  background: 'var(--bg-card)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '10px', 
                  padding: '14px', 
                  marginBottom: '16px' 
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <label className="input-label" style={{ fontWeight: '800', color: '#fff', margin: 0 }}>
                      📦 Pacotes de Conteúdo Liberados
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => selectAllPackages(setClientForm)}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                      >
                        Marcar Todos
                      </button>
                      <button
                        type="button"
                        onClick={() => clearPackages(setClientForm)}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                      >
                        Apenas TV
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
                    {AVAILABLE_PACKAGES.map((pkg) => {
                      const isSelected = clientForm.packages.includes(pkg.id);
                      return (
                        <div
                          key={pkg.id}
                          onClick={() => togglePackage(clientForm, setClientForm, pkg.id)}
                          style={{
                            border: `1px solid ${isSelected ? '#6366f1' : 'var(--border-color)'}`,
                            background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-input)',
                            borderRadius: '8px',
                            padding: '8px 10px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                            transition: 'all 0.2s',
                          }}
                        >
                          {isSelected ? <CheckSquare size={16} color="#818cf8" /> : <Square size={16} color="var(--text-dim)" />}
                          <div>
                            <div style={{ fontSize: '0.82rem', fontWeight: '700', color: isSelected ? '#fff' : 'var(--text-muted)' }}>
                              {pkg.icon} {pkg.label}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>{pkg.desc}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Notes */}
                <div className="input-group" style={{ margin: 0 }}>
                  <label className="input-label">Observações / Notas Internas</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    placeholder="Ex: Pagamento via Pix, vence todo dia 15, usa Smart TV LG..."
                    value={clientForm.notes}
                    onChange={(e) => setClientForm({ ...clientForm, notes: e.target.value })}
                  />
                </div>

              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setModalNewClient(false)} className="btn btn-secondary">Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{ fontWeight: '800' }}>
                  Confirmar & Debitar ({clientForm.months} Crédito{clientForm.months > 1 ? 's' : ''})
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: FAST TRIAL GENERATOR */}
      {/* ==================================================== */}
      {modalNewTrial && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '600px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Zap size={20} color="#f59e0b" />
                <h3 style={{ fontSize: '1.15rem', fontWeight: '800' }}>Gerador Instantâneo de Teste Grátis</h3>
              </div>
              <button onClick={() => setModalNewTrial(false)} className="btn btn-secondary btn-sm"><X size={16} /></button>
            </div>
            <form onSubmit={handleGenerateTrial}>
              <div className="modal-body">
                <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: '16px' }}>
                  Gere um teste temporário gratuito. <strong>Não consome créditos</strong> da sua carteira.
                </p>

                {/* Duration */}
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

                {/* Custom or Auto Username & Password */}
                <div style={{ 
                  background: 'var(--bg-input)', 
                  padding: '14px', 
                  borderRadius: '10px', 
                  border: '1px solid var(--border-color)', 
                  marginBottom: '14px' 
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
                    <label className="input-label" style={{ fontWeight: '800', color: '#fff', margin: 0 }}>
                      🔑 Usuário e Senha do Teste
                    </label>
                    <button
                      type="button"
                      onClick={() => {
                        setTrialForm({
                          ...trialForm,
                          username: generateRandomUser('teste'),
                          password: generateRandomPassword(),
                        });
                      }}
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                    >
                      ⚡ Gerar Novo
                    </button>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Usuário"
                      value={trialForm.username}
                      onChange={(e) => setTrialForm({ ...trialForm, username: e.target.value.toLowerCase().replace(/\s+/g, '_') })}
                    />
                    <div style={{ position: 'relative' }}>
                      <input
                        type={showTrialPass ? 'text' : 'password'}
                        className="form-control"
                        placeholder="Senha"
                        value={trialForm.password}
                        onChange={(e) => setTrialForm({ ...trialForm, password: e.target.value })}
                      />
                      <button
                        type="button"
                        onClick={() => setShowTrialPass(!showTrialPass)}
                        style={{
                          position: 'absolute',
                          right: '8px',
                          top: '50%',
                          transform: 'translateY(-50%)',
                          background: 'none',
                          border: 'none',
                          color: 'var(--text-dim)',
                          cursor: 'pointer',
                        }}
                      >
                        {showTrialPass ? <EyeOff size={15} /> : <Eye size={15} />}
                      </button>
                    </div>
                  </div>
                </div>

                {/* Client info */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div className="input-group" style={{ margin: 0 }}>
                    <label className="input-label">Nome do Contato</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="Ex: Carlos Teste"
                      value={trialForm.name}
                      onChange={(e) => setTrialForm({ ...trialForm, name: e.target.value })}
                    />
                  </div>

                  <div className="input-group" style={{ margin: 0 }}>
                    <label className="input-label">WhatsApp (Opcional)</label>
                    <input
                      type="text"
                      className="form-control"
                      placeholder="+55 11 9..."
                      value={trialForm.phone}
                      onChange={(e) => setTrialForm({ ...trialForm, phone: e.target.value })}
                    />
                  </div>
                </div>

                {/* Content Packages Selection for Trial */}
                <div style={{ 
                  background: 'var(--bg-card)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '10px', 
                  padding: '12px', 
                  marginBottom: '14px' 
                }}>
                  <label className="input-label" style={{ fontWeight: '800', color: '#fff', marginBottom: '8px' }}>
                    📦 Pacotes Ativos no Teste
                  </label>
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(150px, 1fr))', gap: '8px' }}>
                    {AVAILABLE_PACKAGES.map((pkg) => {
                      const isSelected = trialForm.packages.includes(pkg.id);
                      return (
                        <div
                          key={pkg.id}
                          onClick={() => togglePackage(trialForm, setTrialForm, pkg.id)}
                          style={{
                            border: `1px solid ${isSelected ? '#f59e0b' : 'var(--border-color)'}`,
                            background: isSelected ? 'rgba(245, 158, 11, 0.12)' : 'var(--bg-input)',
                            borderRadius: '8px',
                            padding: '6px 10px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          {isSelected ? <CheckSquare size={15} color="#fbbf24" /> : <Square size={15} color="var(--text-dim)" />}
                          <span style={{ fontSize: '0.8rem', fontWeight: '700', color: isSelected ? '#fff' : 'var(--text-muted)' }}>
                            {pkg.icon} {pkg.label}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>

                <div className="input-group" style={{ margin: 0 }}>
                  <label className="input-label">Observação</label>
                  <input
                    type="text"
                    className="form-control"
                    placeholder="Ex: Veio pelo Instagram, tem Smart TV..."
                    value={trialForm.notes}
                    onChange={(e) => setTrialForm({ ...trialForm, notes: e.target.value })}
                  />
                </div>

              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setModalNewTrial(false)} className="btn btn-secondary">Cancelar</button>
                <button type="submit" className="btn" style={{ background: '#f59e0b', color: '#fff', fontWeight: '800' }}>
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
          <div className="modal-content" style={{ maxWidth: '620px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Check size={20} color="#10b981" />
                <h3 style={{ fontSize: '1.15rem', fontWeight: '800' }}>Teste Liberado com Sucesso!</h3>
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
                    <MessageSquare size={14} color="#25D366" /> Mensagem Pronta para o Cliente:
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
                style={{ fontWeight: '700' }}
              >
                <Share2 size={16} /> Abrir no WhatsApp
              </button>
              <button onClick={() => setTrialResult(null)} className="btn btn-secondary">Concluir</button>
            </div>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: EDIT CLIENT */}
      {/* ==================================================== */}
      {modalEdit && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '640px' }}>
            <div className="modal-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Edit3 size={20} color="#818cf8" />
                <h3 style={{ fontSize: '1.15rem', fontWeight: '800' }}>Editar Cliente: @{modalEdit.username}</h3>
              </div>
              <button onClick={() => setModalEdit(null)} className="btn btn-secondary btn-sm"><X size={16} /></button>
            </div>
            
            <form onSubmit={handleEditClient}>
              <div className="modal-body">
                
                {/* Change Password option */}
                <div style={{ background: 'var(--bg-input)', padding: '14px', borderRadius: '8px', border: '1px solid var(--border-color)', marginBottom: '14px' }}>
                  <label className="input-label" style={{ fontWeight: '700', color: '#fff' }}>
                    Alterar Senha do Cliente (deixe em branco para não alterar)
                  </label>
                  <div style={{ position: 'relative' }}>
                    <input
                      type={showEditPass ? 'text' : 'password'}
                      className="form-control"
                      placeholder="Digite a nova senha se desejar alterar..."
                      value={editForm.password}
                      onChange={(e) => setEditForm({ ...editForm, password: e.target.value })}
                    />
                    <button
                      type="button"
                      onClick={() => setShowEditPass(!showEditPass)}
                      style={{
                        position: 'absolute',
                        right: '10px',
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        color: 'var(--text-dim)',
                        cursor: 'pointer',
                      }}
                    >
                      {showEditPass ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
                  <div className="input-group" style={{ margin: 0 }}>
                    <label className="input-label">Nome Completo</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editForm.name}
                      onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                    />
                  </div>
                  <div className="input-group" style={{ margin: 0 }}>
                    <label className="input-label">WhatsApp com DDD</label>
                    <input
                      type="text"
                      className="form-control"
                      value={editForm.phone}
                      onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
                    />
                  </div>
                </div>

                <div className="input-group" style={{ marginBottom: '16px' }}>
                  <label className="input-label">Telas Permitidas (Simultâneas)</label>
                  <select
                    className="form-control"
                    value={editForm.max_connections}
                    onChange={(e) => setEditForm({ ...editForm, max_connections: parseInt(e.target.value) })}
                  >
                    <option value={1}>1 Tela Simultânea</option>
                    <option value={2}>2 Telas Simultâneas</option>
                    <option value={3}>3 Telas Simultâneas</option>
                    <option value={4}>4 Telas Simultâneas</option>
                    <option value={5}>5 Telas Simultâneas</option>
                  </select>
                </div>

                {/* Content Packages Selection */}
                <div style={{ 
                  background: 'var(--bg-card)', 
                  border: '1px solid var(--border-color)', 
                  borderRadius: '10px', 
                  padding: '14px', 
                  marginBottom: '16px' 
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
                    <label className="input-label" style={{ fontWeight: '800', color: '#fff', margin: 0 }}>
                      📦 Pacotes de Conteúdo Ativos
                    </label>
                    <div style={{ display: 'flex', gap: '8px' }}>
                      <button
                        type="button"
                        onClick={() => selectAllPackages(setEditForm)}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                      >
                        Marcar Todos
                      </button>
                      <button
                        type="button"
                        onClick={() => clearPackages(setEditForm)}
                        className="btn btn-secondary btn-sm"
                        style={{ fontSize: '0.72rem', padding: '2px 8px' }}
                      >
                        Apenas TV
                      </button>
                    </div>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '8px' }}>
                    {AVAILABLE_PACKAGES.map((pkg) => {
                      const isSelected = editForm.packages.includes(pkg.id);
                      return (
                        <div
                          key={pkg.id}
                          onClick={() => togglePackage(editForm, setEditForm, pkg.id)}
                          style={{
                            border: `1px solid ${isSelected ? '#6366f1' : 'var(--border-color)'}`,
                            background: isSelected ? 'rgba(99, 102, 241, 0.12)' : 'var(--bg-input)',
                            borderRadius: '8px',
                            padding: '8px 10px',
                            cursor: 'pointer',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
                          {isSelected ? <CheckSquare size={16} color="#818cf8" /> : <Square size={16} color="var(--text-dim)" />}
                          <div>
                            <div style={{ fontSize: '0.82rem', fontWeight: '700', color: isSelected ? '#fff' : 'var(--text-muted)' }}>
                              {pkg.icon} {pkg.label}
                            </div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-dim)' }}>{pkg.desc}</div>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>

                {/* Notes */}
                <div className="input-group" style={{ margin: 0 }}>
                  <label className="input-label">Observações / Notas Internas</label>
                  <textarea
                    className="form-control"
                    rows={2}
                    placeholder="Ex: Anotações sobre pagamentos, dispositivos, preferências..."
                    value={editForm.notes}
                    onChange={(e) => setEditForm({ ...editForm, notes: e.target.value })}
                  />
                </div>

              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setModalEdit(null)} className="btn btn-secondary">Cancelar</button>
                <button type="submit" className="btn btn-primary" style={{ fontWeight: '800' }}>
                  Salvar Alterações
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
              <h3 style={{ fontSize: '1.1rem', fontWeight: '800' }}>
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
                    <option value={2}>+ 2 Meses (2 Créditos)</option>
                    <option value={3}>+ 3 Meses (3 Créditos)</option>
                    <option value={6}>+ 6 Meses (6 Créditos)</option>
                    <option value={12}>+ 12 Meses (12 Créditos)</option>
                  </select>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={() => setModalRenew(null)} className="btn btn-secondary">Cancelar</button>
                <button type="submit" className="btn btn-success" style={{ fontWeight: '800' }}>
                  Confirmar Renovação ({renewMonths} Crédito{renewMonths > 1 ? 's' : ''})
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* ==================================================== */}
      {/* MODAL: ACCESS LINKS & WHATSAPP SHARING */}
      {/* ==================================================== */}
      {modalLinks && (
        <div className="modal-overlay">
          <div className="modal-content" style={{ maxWidth: '580px' }}>
            <div className="modal-header">
              <h3 style={{ fontSize: '1.15rem', fontWeight: '800' }}>Dados de Acesso: {modalLinks.username}</h3>
              <button onClick={() => setModalLinks(null)} className="btn btn-secondary btn-sm"><X size={16} /></button>
            </div>
            <div className="modal-body">
              
              <div style={{ background: 'var(--bg-input)', padding: '14px', borderRadius: '8px', fontSize: '0.88rem', marginBottom: '16px' }}>
                <div style={{ marginBottom: '6px' }}><strong>Host / Servidor:</strong> <code>{window.location.origin}</code></div>
                <div style={{ marginBottom: '6px' }}><strong>Usuário:</strong> <code style={{ color: '#818cf8', fontWeight: '700' }}>{modalLinks.username}</code></div>
                <div style={{ marginBottom: '6px' }}><strong>Senha:</strong> <code style={{ color: '#34d399', fontWeight: '700' }}>{modalLinks.plain_password || '******'}</code></div>
                <div><strong>Telas:</strong> <code>{modalLinks.max_connections} simultânea(s)</code></div>
              </div>

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

            </div>
            <div className="modal-footer">
              <button
                onClick={() => {
                  const msg = `*📺 SEUS DADOS DE ACESSO IPTV:*\n\n👤 *Usuário:* \`${modalLinks.username}\`\n🔑 *Senha:* \`${modalLinks.plain_password || '******'}\`\n🌐 *Player Web:* ${window.location.origin}\n📥 *Lista M3U:* \`${window.location.origin}/get.php?username=${modalLinks.username}&password=${modalLinks.plain_password || '******'}&type=m3u_plus&output=ts\`\n⚙️ *Host:* \`${window.location.origin}\``;
                  const url = `https://api.whatsapp.com/send?${modalLinks.phone ? `phone=${modalLinks.phone.replace(/\D/g, '')}&` : ''}text=${encodeURIComponent(msg)}`;
                  window.open(url, '_blank');
                }}
                className="btn btn-success"
                style={{ fontWeight: '700' }}
              >
                <Share2 size={16} /> Enviar no WhatsApp
              </button>
              <button onClick={() => setModalLinks(null)} className="btn btn-secondary">Fechar</button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
