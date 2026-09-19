import React, { useState, useEffect } from 'react';
import { 
  UserCheck, UserPlus, Clock, ShieldCheck, Key, RefreshCw, 
  Trash2, AlertTriangle, Check, Copy, X, ArrowRightLeft, 
  ExternalLink, Smartphone, Search, Lock, ShieldAlert
} from 'lucide-react';
import api from '../../services/api';

export default function MasterClientsView({ notify }) {
  const [clients, setClients] = useState([]);
  const [resellers, setResellers] = useState([]);
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modals
  const [modalNewClient, setModalNewClient] = useState(false);
  const [modalQuickTest, setModalQuickTest] = useState(false);
  const [modalRenew, setModalRenew] = useState(null); // client
  const [modalTransfer, setModalTransfer] = useState(null); // client
  const [modalCredentials, setModalCredentials] = useState(null); // { username, password, expires_at, title }

  // Forms
  const [clientForm, setClientForm] = useState({
    username: '', password: '', name: '', email: '', phone: '',
    reseller_id: '', duration_type: 'months', duration_value: 1,
    max_connections: 1, notes: ''
  });
  const [testForm, setTestForm] = useState({ username: '', password: '' });
  const [renewForm, setRenewForm] = useState({ duration_type: 'months', duration_value: 1 });
  const [targetResellerId, setTargetResellerId] = useState('');

  const fetchClientsAndResellers = async () => {
    setLoading(true);
    try {
      const [cRes, rRes] = await Promise.all([
        api.get('/api/admin/clients'),
        api.get('/api/admin/resellers')
      ]);
      setClients(cRes.data || []);
      setResellers(rRes.data || []);
    } catch (err) {
      console.error(err);
      if (notify) notify('Erro ao carregar lista de clientes.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchClientsAndResellers();
  }, []);

  const copyToClipboard = (text, label) => {
    navigator.clipboard.writeText(text);
    if (notify) notify(`${label || 'Copiado'} para a área de transferência!`, 'success');
  };

  // Create New Regular Client
  const handleCreateClient = async (e) => {
    e.preventDefault();
    try {
      const res = await api.post('/api/admin/clients', clientForm);
      if (res.data.success) {
        setModalNewClient(false);
        fetchClientsAndResellers();
        // Show credentials modal ONCE with temporary password
        setModalCredentials({
          title: 'Cliente Cadastrado com Sucesso!',
          username: res.data.client.username,
          password: res.data.temporaryPassword,
          expires_at: res.data.client.expires_at,
          notice: 'A senha temporária é exibida apenas agora. O sistema não a armazena em texto puro.'
        });
        setClientForm({
          username: '', password: '', name: '', email: '', phone: '',
          reseller_id: '', duration_type: 'months', duration_value: 1,
          max_connections: 1, notes: ''
        });
      }
    } catch (err) {
      console.error(err);
      if (notify) notify(err.response?.data?.error || 'Erro ao cadastrar cliente', 'error');
    }
  };

  // Create 30-Minute Test Client (Server-computed)
  const handleCreateTest30m = async (e) => {
    if (e) e.preventDefault();
    try {
      const res = await api.post('/api/admin/clients/test-30m', testForm);
      if (res.data.success) {
        setModalQuickTest(false);
        fetchClientsAndResellers();
        setModalCredentials({
          title: 'Conta de Teste de 30 Minutos Ativada!',
          username: res.data.client.username,
          password: res.data.client.temporaryPassword,
          expires_at: res.data.client.expires_at,
          notice: 'Duração estrita de 30 minutos gerada pelo servidor. Copie os dados agora.'
        });
        setTestForm({ username: '', password: '' });
      }
    } catch (err) {
      console.error(err);
      if (notify) notify(err.response?.data?.error || 'Erro ao criar teste de 30 minutos', 'error');
    }
  };

  // Reset Password (Generate temporary password)
  const handleResetPassword = async (client) => {
    if (!window.confirm(`Deseja redefinir a senha do cliente "${client.username}"? Uma senha temporária segura será gerada e o cliente deverá trocá-la.`)) return;

    try {
      const res = await api.post(`/api/admin/clients/${client.id}/reset-password`);
      if (res.data.success) {
        fetchClientsAndResellers();
        setModalCredentials({
          title: 'Nova Senha Temporária Gerada!',
          username: client.username,
          password: res.data.temporaryPassword,
          notice: 'Guarde esta senha agora. Ela NÃO poderá ser recuperada posteriormente por motivos de segurança.'
        });
      }
    } catch (err) {
      console.error(err);
      if (notify) notify('Erro ao redefinir senha', 'error');
    }
  };

  // Toggle Force Password Change on Next Login
  const handleToggleForcePassword = async (client) => {
    try {
      const res = await api.post(`/api/admin/clients/${client.id}/toggle-force-password`);
      if (res.data.success) {
        if (notify) notify(res.data.message, 'success');
        fetchClientsAndResellers();
      }
    } catch (err) {
      console.error(err);
      if (notify) notify('Erro ao alterar configuração de senha', 'error');
    }
  };

  // Renew Subscription
  const handleRenewClient = async (e) => {
    e.preventDefault();
    if (!modalRenew) return;

    try {
      await api.post(`/api/admin/clients/${modalRenew.id}/renew`, renewForm);
      if (notify) notify(`Cliente ${modalRenew.username} renovado com sucesso!`, 'success');
      setModalRenew(null);
      fetchClientsAndResellers();
    } catch (err) {
      console.error(err);
      if (notify) notify('Erro ao renovar cliente', 'error');
    }
  };

  // Transfer Client
  const handleTransferClient = async (e) => {
    e.preventDefault();
    if (!modalTransfer || !targetResellerId) return;

    try {
      await api.post('/api/admin/clients/transfer', {
        clientId: modalTransfer.id,
        targetResellerId
      });
      if (notify) notify(`Cliente ${modalTransfer.username} transferido com sucesso!`, 'success');
      setModalTransfer(null);
      fetchClientsAndResellers();
    } catch (err) {
      console.error(err);
      if (notify) notify('Erro ao transferir cliente', 'error');
    }
  };

  // Delete Client with Strong Confirmation
  const handleDeleteClient = async (client) => {
    const input = window.prompt(`DIGITE "${client.username}" PARA CONFIRMAR A EXCLUSÃO DEFINITIVA:`);
    if (input !== client.username) {
      if (input !== null && notify) notify('Exclusão cancelada (nome incorreto).', 'info');
      return;
    }

    try {
      await api.delete(`/api/admin/clients/${client.id}`);
      if (notify) notify(`Cliente ${client.username} excluído com sucesso.`, 'success');
      fetchClientsAndResellers();
    } catch (err) {
      console.error(err);
      if (notify) notify('Erro ao excluir cliente', 'error');
    }
  };

  // Filter clients
  const filteredClients = clients.filter((c) => {
    const matchSearch = searchTerm === '' || 
      c.username?.toLowerCase().includes(searchTerm.toLowerCase()) || 
      c.name?.toLowerCase().includes(searchTerm.toLowerCase()) ||
      c.reseller_username?.toLowerCase().includes(searchTerm.toLowerCase());

    const matchStatus = statusFilter === 'all' || c.status === statusFilter;
    return matchSearch && matchStatus;
  });

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Header Bar */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        padding: '20px 24px',
        background: '#131828',
        borderRadius: '14px',
        border: '1px solid rgba(255, 255, 255, 0.08)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '8px',
              background: 'linear-gradient(135deg, #10b981 0%, #06b6d4 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
            }}>
              <UserCheck size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#f8fafc' }}>
                Gerenciamento de Clientes
              </h2>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Total cadastrado: <strong style={{ color: '#34d399' }}>{clients.length}</strong> clientes ativos no sistema
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={() => setModalQuickTest(true)}
            style={{
              background: 'rgba(245, 158, 11, 0.15)',
              border: '1px solid rgba(245, 158, 11, 0.4)',
              borderRadius: '8px',
              color: '#fbbf24',
              padding: '8px 14px',
              fontSize: '0.84rem',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <Clock size={15} />
            <span>Criar Teste (30 Min)</span>
          </button>

          <button
            onClick={() => setModalNewClient(true)}
            style={{
              background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              padding: '8px 16px',
              fontSize: '0.84rem',
              fontWeight: '700',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <UserPlus size={15} />
            <span>Novo Cliente</span>
          </button>

          <button
            onClick={fetchClientsAndResellers}
            disabled={loading}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              color: '#cbd5e1',
              padding: '8px 12px',
              cursor: 'pointer'
            }}
          >
            <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          </button>
        </div>
      </div>

      {/* Filters Bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        alignItems: 'center',
        background: '#131828',
        padding: '14px 20px',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.06)'
      }}>
        <div style={{ position: 'relative', flex: '1 1 220px' }}>
          <Search size={15} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Buscar por usuário, nome ou revendedor..."
            style={{
              width: '100%',
              padding: '8px 12px 8px 34px',
              borderRadius: '8px',
              background: '#090d16',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              color: '#fff',
              fontSize: '0.84rem'
            }}
          />
        </div>

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          style={{
            padding: '8px 12px',
            borderRadius: '8px',
            background: '#090d16',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#cbd5e1',
            fontSize: '0.82rem',
            cursor: 'pointer'
          }}
        >
          <option value="all">Todos os Status</option>
          <option value="active">Ativo</option>
          <option value="suspended">Suspenso</option>
          <option value="expired">Expirado</option>
        </select>
      </div>

      {/* Clients Table with ZERO Plain Passwords */}
      <div style={{
        background: '#131828',
        borderRadius: '14px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        overflow: 'hidden'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
            <thead>
              <tr style={{ background: '#090d16', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8' }}>
                <th style={{ padding: '12px 16px' }}>Usuário</th>
                <th style={{ padding: '12px 16px' }}>Revendedor</th>
                <th style={{ padding: '12px 16px' }}>Telas Ativas</th>
                <th style={{ padding: '12px 16px' }}>Expiração & Plano</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 16px' }}>Segurança / Acesso</th>
                <th style={{ padding: '12px 16px', textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {filteredClients.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px', textAlign: 'center', color: '#94a3b8' }}>
                    Nenhum cliente encontrado.
                  </td>
                </tr>
              ) : (
                filteredClients.map((c) => (
                  <tr 
                    key={c.id}
                    style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', transition: 'background 0.15s ease' }}
                    onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'}
                    onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                  >
                    {/* User */}
                    <td style={{ padding: '12px 16px' }}>
                      <strong style={{ color: '#f8fafc', fontSize: '0.9rem' }}>{c.username}</strong>
                      <span style={{ display: 'block', fontSize: '0.74rem', color: '#64748b' }}>
                        {c.name || 'Cliente'}
                      </span>
                    </td>

                    {/* Reseller */}
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        fontSize: '0.74rem',
                        fontWeight: '600',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: c.reseller_username ? 'rgba(56, 189, 248, 0.15)' : 'rgba(139, 92, 246, 0.15)',
                        color: c.reseller_username ? '#38bdf8' : '#a78bfa',
                        border: `1px solid ${c.reseller_username ? 'rgba(56, 189, 248, 0.3)' : 'rgba(139, 92, 246, 0.3)'}`
                      }}>
                        {c.reseller_username || 'Direto Master'}
                      </span>
                    </td>

                    {/* Screens */}
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{ fontWeight: '700', color: c.active_screens > 0 ? '#38bdf8' : '#cbd5e1' }}>
                        {c.active_screens || 0}
                      </span> / {c.max_connections} tela(s)
                    </td>

                    {/* Expiration */}
                    <td style={{ padding: '12px 16px', fontSize: '0.8rem' }}>
                      {c.expires_at ? (
                        <span style={{ color: new Date(c.expires_at) < new Date() ? '#f87171' : '#34d399', fontWeight: '600' }}>
                          {new Date(c.expires_at).toLocaleDateString('pt-BR')} {new Date(c.expires_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      ) : (
                        <span style={{ color: '#a78bfa', fontWeight: '700' }}>Vitalício</span>
                      )}
                      {c.is_trial === 1 && (
                        <span style={{
                          fontSize: '0.68rem',
                          background: 'rgba(245, 158, 11, 0.2)',
                          color: '#fbbf24',
                          border: '1px solid rgba(245, 158, 11, 0.4)',
                          padding: '1px 5px',
                          borderRadius: '4px',
                          marginLeft: '6px',
                          fontWeight: '700'
                        }}>
                          Teste
                        </span>
                      )}
                    </td>

                    {/* Status */}
                    <td style={{ padding: '12px 16px' }}>
                      <span style={{
                        fontSize: '0.72rem',
                        fontWeight: '700',
                        padding: '2px 8px',
                        borderRadius: '6px',
                        background: c.status === 'active' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(248, 113, 113, 0.15)',
                        color: c.status === 'active' ? '#34d399' : '#f87171',
                        border: `1px solid ${c.status === 'active' ? 'rgba(52, 211, 153, 0.3)' : 'rgba(248, 113, 113, 0.3)'}`
                      }}>
                        {c.status}
                      </span>
                    </td>

                    {/* Security Column (Replacing Plain Text Password) */}
                    <td style={{ padding: '12px 16px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          background: 'rgba(52, 211, 153, 0.1)',
                          color: '#34d399',
                          border: '1px solid rgba(52, 211, 153, 0.25)',
                          padding: '2px 6px',
                          borderRadius: '4px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '4px',
                          fontWeight: '600'
                        }} title="Armazenada com hash criptográfico bcrypt">
                          <Lock size={11} />
                          Hash Seguro
                        </span>

                        {c.must_change_password === 1 && (
                          <span style={{
                            fontSize: '0.7rem',
                            background: 'rgba(245, 158, 11, 0.2)',
                            color: '#fbbf24',
                            padding: '2px 6px',
                            borderRadius: '4px',
                            fontWeight: '700'
                          }} title="Forçado a alterar no próximo login">
                            Troca Obrigatória
                          </span>
                        )}
                      </div>
                    </td>

                    {/* Actions */}
                    <td style={{ padding: '12px 16px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px', flexWrap: 'wrap' }}>
                        <button
                          onClick={() => handleResetPassword(c)}
                          style={{
                            background: 'rgba(245, 158, 11, 0.12)',
                            border: '1px solid rgba(245, 158, 11, 0.3)',
                            color: '#fbbf24',
                            padding: '5px 8px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.74rem',
                            fontWeight: '600'
                          }}
                          title="Gerar senha temporária segura"
                        >
                          Redefinir
                        </button>

                        <button
                          onClick={() => handleToggleForcePassword(c)}
                          style={{
                            background: c.must_change_password ? 'rgba(52, 211, 153, 0.15)' : 'rgba(255, 255, 255, 0.05)',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            color: c.must_change_password ? '#34d399' : '#94a3b8',
                            padding: '5px 8px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.74rem'
                          }}
                          title={c.must_change_password ? 'Desativar obrigatoriedade de troca' : 'Forçar troca de senha no próximo login'}
                        >
                          Forçar Troca
                        </button>

                        <button
                          onClick={() => setModalRenew(c)}
                          style={{
                            background: 'rgba(56, 189, 248, 0.12)',
                            border: '1px solid rgba(56, 189, 248, 0.3)',
                            color: '#38bdf8',
                            padding: '5px 8px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.74rem',
                            fontWeight: '600'
                          }}
                          title="Renovar assinatura"
                        >
                          Renovar
                        </button>

                        <button
                          onClick={() => setModalTransfer(c)}
                          style={{
                            background: 'rgba(139, 92, 246, 0.12)',
                            border: '1px solid rgba(139, 92, 246, 0.3)',
                            color: '#a78bfa',
                            padding: '5px 8px',
                            borderRadius: '6px',
                            cursor: 'pointer',
                            fontSize: '0.74rem'
                          }}
                          title="Transferir para outro revendedor"
                        >
                          Transferir
                        </button>

                        <button
                          onClick={() => handleDeleteClient(c)}
                          style={{
                            background: 'rgba(239, 68, 68, 0.12)',
                            border: '1px solid rgba(239, 68, 68, 0.3)',
                            color: '#f87171',
                            padding: '5px 8px',
                            borderRadius: '6px',
                            cursor: 'pointer'
                          }}
                          title="Excluir cliente com confirmação"
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

      {/* Modal 1: Credentials One-Time View */}
      {modalCredentials && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(5, 7, 15, 0.85)',
          backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1100, padding: '20px'
        }}>
          <div style={{
            background: '#131828', borderRadius: '16px', border: '1px solid rgba(52, 211, 153, 0.4)',
            width: '100%', maxWidth: '480px', padding: '24px', boxShadow: '0 25px 50px rgba(0,0,0,0.6)'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '14px' }}>
              <ShieldCheck size={24} color="#34d399" />
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#f8fafc', fontWeight: '700' }}>
                {modalCredentials.title}
              </h3>
            </div>

            <p style={{ fontSize: '0.82rem', color: '#94a3b8', margin: '0 0 16px 0' }}>
              {modalCredentials.notice}
            </p>

            <div style={{ background: '#090d16', borderRadius: '10px', padding: '16px', display: 'flex', flexDirection: 'column', gap: '10px', marginBottom: '20px' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Usuário:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <code style={{ fontSize: '0.9rem', color: '#fff', fontWeight: '700' }}>{modalCredentials.username}</code>
                  <button
                    onClick={() => copyToClipboard(modalCredentials.username, 'Usuário')}
                    style={{ background: 'transparent', border: 'none', color: '#38bdf8', cursor: 'pointer' }}
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Senha Temporária:</span>
                <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                  <code style={{ fontSize: '0.95rem', color: '#34d399', fontWeight: '800' }}>{modalCredentials.password}</code>
                  <button
                    onClick={() => copyToClipboard(modalCredentials.password, 'Senha')}
                    style={{ background: 'transparent', border: 'none', color: '#34d399', cursor: 'pointer' }}
                  >
                    <Copy size={14} />
                  </button>
                </div>
              </div>

              {modalCredentials.expires_at && (
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderTop: '1px solid rgba(255,255,255,0.06)', paddingTop: '8px' }}>
                  <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>Válido até:</span>
                  <span style={{ fontSize: '0.82rem', color: '#cbd5e1' }}>
                    {new Date(modalCredentials.expires_at).toLocaleString('pt-BR')}
                  </span>
                </div>
              )}
            </div>

            <button
              onClick={() => setModalCredentials(null)}
              style={{
                width: '100%', padding: '10px', borderRadius: '8px', border: 'none',
                background: 'linear-gradient(135deg, #10b981, #06b6d4)', color: '#fff', fontWeight: '700', cursor: 'pointer'
              }}
            >
              Compreendi e Salvei os Dados
            </button>
          </div>
        </div>
      )}

      {/* Modal 2: New Client */}
      {modalNewClient && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(5, 7, 15, 0.85)',
          backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1080, padding: '20px'
        }}>
          <div style={{
            background: '#131828', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.1)',
            width: '100%', maxWidth: '520px', padding: '24px', boxShadow: '0 25px 50px rgba(0,0,0,0.6)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '16px' }}>
              <h3 style={{ margin: 0, fontSize: '1.15rem', color: '#f8fafc', fontWeight: '700' }}>
                Novo Cliente Master
              </h3>
              <button onClick={() => setModalNewClient(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleCreateClient} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Usuário *</label>
                  <input
                    type="text"
                    required
                    value={clientForm.username}
                    onChange={(e) => setClientForm({ ...clientForm, username: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                  />
                </div>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Senha Inicial *</label>
                  <input
                    type="password"
                    required
                    value={clientForm.password}
                    onChange={(e) => setClientForm({ ...clientForm, password: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                  />
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Nome Completo</label>
                <input
                  type="text"
                  value={clientForm.name}
                  onChange={(e) => setClientForm({ ...clientForm, name: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Revendedor Vinculado</label>
                  <select
                    value={clientForm.reseller_id}
                    onChange={(e) => setClientForm({ ...clientForm, reseller_id: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                  >
                    <option value="">Direto Master</option>
                    {resellers.map((r) => (
                      <option key={r.id} value={r.id}>{r.username} ({r.name || 'Revenda'})</option>
                    ))}
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Telas Simultâneas</label>
                  <input
                    type="number"
                    min={1}
                    max={5}
                    value={clientForm.max_connections}
                    onChange={(e) => setClientForm({ ...clientForm, max_connections: parseInt(e.target.value) || 1 })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                  />
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Duração</label>
                  <select
                    value={clientForm.duration_type}
                    onChange={(e) => setClientForm({ ...clientForm, duration_type: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                  >
                    <option value="months">Meses</option>
                    <option value="hours">Horas (Teste)</option>
                    <option value="lifetime">Vitalício</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Quantidade</label>
                  <input
                    type="number"
                    min={1}
                    value={clientForm.duration_value}
                    onChange={(e) => setClientForm({ ...clientForm, duration_value: parseInt(e.target.value) || 1 })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                  />
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '12px' }}>
                <button
                  type="button"
                  onClick={() => setModalNewClient(false)}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#cbd5e1', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)', color: '#fff', fontWeight: '700', cursor: 'pointer' }}
                >
                  Cadastrar Cliente
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 3: Quick Test (30 Minutes) */}
      {modalQuickTest && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(5, 7, 15, 0.85)',
          backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1080, padding: '20px'
        }}>
          <div style={{
            background: '#131828', borderRadius: '16px', border: '1px solid rgba(245, 158, 11, 0.3)',
            width: '100%', maxWidth: '420px', padding: '24px', boxShadow: '0 25px 50px rgba(0,0,0,0.6)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <Clock size={20} color="#fbbf24" />
                <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f8fafc', fontWeight: '700' }}>
                  Gerar Teste de 30 Minutos
                </h3>
              </div>
              <button onClick={() => setModalQuickTest(false)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <p style={{ fontSize: '0.8rem', color: '#94a3b8', margin: '0 0 16px 0' }}>
              O teste terá expiração calculada estritamente no servidor e será bloqueado automaticamente após 30 minutos.
            </p>

            <form onSubmit={handleCreateTest30m} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Usuário (opcional, deixa em branco para gerar aleatório)</label>
                <input
                  type="text"
                  placeholder="teste_1234"
                  value={testForm.username}
                  onChange={(e) => setTestForm({ ...testForm, username: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Senha (opcional, deixa em branco para gerar aleatória)</label>
                <input
                  type="text"
                  placeholder="senha automática"
                  value={testForm.password}
                  onChange={(e) => setTestForm({ ...testForm, password: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                />
              </div>

              <button
                type="submit"
                style={{
                  width: '100%', padding: '10px', borderRadius: '8px', border: 'none',
                  background: 'linear-gradient(135deg, #f59e0b, #d97706)', color: '#fff', fontWeight: '700', cursor: 'pointer', marginTop: '6px'
                }}
              >
                Gerar e Ativar Teste
              </button>
            </form>
          </div>
        </div>
      )}

      {/* Modal 4: Renew Client */}
      {modalRenew && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(5, 7, 15, 0.85)',
          backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1080, padding: '20px'
        }}>
          <div style={{
            background: '#131828', borderRadius: '16px', border: '1px solid rgba(56, 189, 248, 0.3)',
            width: '100%', maxWidth: '420px', padding: '24px', boxShadow: '0 25px 50px rgba(0,0,0,0.6)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f8fafc', fontWeight: '700' }}>
                Renovar Assinatura: {modalRenew.username}
              </h3>
              <button onClick={() => setModalRenew(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleRenewClient} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Tipo de Duração</label>
                <select
                  value={renewForm.duration_type}
                  onChange={(e) => setRenewForm({ ...renewForm, duration_type: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                >
                  <option value="months">Meses</option>
                  <option value="hours">Horas</option>
                  <option value="lifetime">Vitalício</option>
                </select>
              </div>

              {renewForm.duration_type !== 'lifetime' && (
                <div>
                  <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Quantidade</label>
                  <input
                    type="number"
                    min={1}
                    value={renewForm.duration_value}
                    onChange={(e) => setRenewForm({ ...renewForm, duration_value: parseInt(e.target.value) || 1 })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                  />
                </div>
              )}

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setModalRenew(null)}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#cbd5e1', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: 'linear-gradient(135deg, #0284c7, #06b6d4)', color: '#fff', fontWeight: '700', cursor: 'pointer' }}
                >
                  Confirmar Renovação
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Modal 5: Transfer Client */}
      {modalTransfer && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(5, 7, 15, 0.85)',
          backdropFilter: 'blur(8px)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1080, padding: '20px'
        }}>
          <div style={{
            background: '#131828', borderRadius: '16px', border: '1px solid rgba(139, 92, 246, 0.3)',
            width: '100%', maxWidth: '420px', padding: '24px', boxShadow: '0 25px 50px rgba(0,0,0,0.6)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '14px' }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', color: '#f8fafc', fontWeight: '700' }}>
                Transferir Cliente: {modalTransfer.username}
              </h3>
              <button onClick={() => setModalTransfer(null)} style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}>
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleTransferClient} style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#cbd5e1', marginBottom: '4px' }}>Revendedor de Destino</label>
                <select
                  required
                  value={targetResellerId}
                  onChange={(e) => setTargetResellerId(e.target.value)}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff' }}
                >
                  <option value="">Selecione o revendedor...</option>
                  {resellers.map((r) => (
                    <option key={r.id} value={r.id}>{r.username} ({r.name || 'Revenda'})</option>
                  ))}
                </select>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '10px' }}>
                <button
                  type="button"
                  onClick={() => setModalTransfer(null)}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#cbd5e1', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)', color: '#fff', fontWeight: '700', cursor: 'pointer' }}
                >
                  Efetivar Transferência
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
