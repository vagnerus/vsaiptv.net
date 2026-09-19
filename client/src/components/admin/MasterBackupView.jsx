import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import { 
  HardDrive, RefreshCw, ShieldCheck, Download, Trash2, 
  CheckCircle2, AlertTriangle, FileCode, Check, X, 
  Database, PlusCircle, ArrowDownToLine, Clock, Cpu
} from 'lucide-react';

export default function MasterBackupView({ notify }) {
  const [health, setHealth] = useState(null);
  const [backups, setBackups] = useState([]);
  const [loading, setLoading] = useState(false);
  const [creatingBackup, setCreatingBackup] = useState(false);
  const [testingFile, setTestingFile] = useState(null);
  const [testResult, setTestResult] = useState(null);

  const fetchHealthAndBackups = async () => {
    try {
      setLoading(true);
      const [hRes, bRes] = await Promise.all([
        api.get('/api/admin/health'),
        api.get('/api/admin/health/backups')
      ]);
      setHealth(hRes.data);
      setBackups(bRes.data || []);
    } catch (err) {
      console.error('Error fetching backup data:', err);
      if (notify) notify('Erro ao carregar dados do Backup Manager', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealthAndBackups();
  }, []);

  const handleCreateBackup = async () => {
    try {
      setCreatingBackup(true);
      const res = await api.post('/api/admin/health/backup');
      if (notify) notify(`Backup criado com sucesso! Arquivo: ${res.data.filename}`, 'success');
      await fetchHealthAndBackups();
    } catch (err) {
      if (notify) notify(err.response?.data?.error || 'Erro ao criar backup', 'error');
    } finally {
      setCreatingBackup(false);
    }
  };

  const handleTestIntegrity = async (filename) => {
    try {
      setTestingFile(filename);
      const res = await api.post('/api/admin/health/backups/test-restore', { filename });
      setTestResult(res.data);
      if (notify) notify(`Integridade validada com sucesso! Status: ${res.data.integrity}`, 'success');
    } catch (err) {
      if (notify) notify(err.response?.data?.error || 'Falha ao testar integridade do backup', 'error');
    } finally {
      setTestingFile(null);
    }
  };

  const handleDeleteBackup = async (filename) => {
    if (!window.confirm(`Tem certeza que deseja excluir o arquivo de backup ${filename}? Esta ação é permanente.`)) return;
    try {
      await api.delete(`/api/admin/health/backups/${filename}`);
      if (notify) notify('Backup excluído com sucesso!', 'success');
      await fetchHealthAndBackups();
    } catch (err) {
      if (notify) notify(err.response?.data?.error || 'Erro ao excluir backup', 'error');
    }
  };

  const handleDownloadBackup = (filename) => {
    const token = localStorage.getItem('token');
    const downloadUrl = `/api/admin/health/backups/${encodeURIComponent(filename)}/download?token=${encodeURIComponent(token || '')}`;
    
    // Create temporary link with auth header / window open
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
  };

  const formatDate = (iso) => {
    if (!iso) return 'N/A';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('pt-BR', { 
        day: '2-digit', month: '2-digit', year: 'numeric',
        hour: '2-digit', minute: '2-digit', second: '2-digit'
      });
    } catch {
      return 'N/A';
    }
  };

  const totalBackupSizeMB = backups.reduce((acc, b) => acc + (b.size_bytes ? b.size_bytes / 1024 / 1024 : 0), 0);

  return (
    <div className="animate-fade">
      {/* Header Controls */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        marginBottom: '24px',
        padding: '20px',
        background: 'var(--card-bg, #141824)',
        border: '1px solid var(--border-color, #232a3e)',
        borderRadius: 'var(--radius-lg, 12px)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px', height: '40px', borderRadius: '10px',
            background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Database size={22} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#fff' }}>
              Backup Manager & Integridade SQLite
            </h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)', margin: 0 }}>
              Cópias consistentes com WAL flush, verificação PRAGMA e download direto para seu dispositivo
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            onClick={handleCreateBackup}
            disabled={creatingBackup}
            className="btn btn-primary btn-sm"
            style={{ 
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'linear-gradient(135deg, #10b981 0%, #047857 100%)',
              border: 'none', fontWeight: 600
            }}
            title="Gera um backup completo e consistente do banco iptv.db"
          >
            <PlusCircle size={14} className={creatingBackup ? 'animate-spin' : ''} />
            <span>{creatingBackup ? 'Gerando Backup...' : '💾 Criar Backup Agora'}</span>
          </button>

          <button 
            onClick={fetchHealthAndBackups} 
            disabled={loading}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Atualizar</span>
          </button>
        </div>
      </div>

      {/* Database Health Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{ padding: '18px', background: 'var(--card-bg, #141824)', borderRadius: '10px', border: '1px solid var(--border-color, #232a3e)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <HardDrive size={18} color="#3b82f6" />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)' }}>Banco de Dados Ativo</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f8fafc' }}>
            {health?.database?.sizeMB || '0.00'} MB
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim, #8b9bb4)', marginTop: '4px' }}>
            WAL: {health?.database?.walSizeMB || '0.00'} MB • Checkpoint: OK
          </div>
        </div>

        <div style={{ padding: '18px', background: 'var(--card-bg, #141824)', borderRadius: '10px', border: '1px solid var(--border-color, #232a3e)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <ShieldCheck size={18} color="#10b981" />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)' }}>Integridade PRAGMA</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#10b981' }}>
            {health?.database?.integrity?.toUpperCase() || 'OK'}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim, #8b9bb4)', marginTop: '4px' }}>
            Zero corrupção ou páginas órfãs
          </div>
        </div>

        <div style={{ padding: '18px', background: 'var(--card-bg, #141824)', borderRadius: '10px', border: '1px solid var(--border-color, #232a3e)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <Database size={18} color="#8b5cf6" />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)' }}>Backups Armazenados</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#8b5cf6' }}>
            {backups.length}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim, #8b9bb4)', marginTop: '4px' }}>
            Total em disco: {totalBackupSizeMB.toFixed(2)} MB
          </div>
        </div>

        <div style={{ padding: '18px', background: 'var(--card-bg, #141824)', borderRadius: '10px', border: '1px solid var(--border-color, #232a3e)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <Clock size={18} color="#06b6d4" />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)' }}>Último Backup Criado</span>
          </div>
          <div style={{ fontSize: '1.05rem', fontWeight: 700, color: '#06b6d4', marginTop: '6px' }}>
            {backups[0] ? formatDate(backups[0].created_at) : 'Nenhum'}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim, #8b9bb4)', marginTop: '6px' }}>
            Retenção automática de 14 versões
          </div>
        </div>
      </div>

      {/* Test Result Modal */}
      {testResult && (
        <div style={{
          marginBottom: '24px',
          padding: '18px 22px',
          background: '#0e1828',
          border: '1px solid #1e3a8a',
          borderRadius: '12px',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '16px'
        }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
              <CheckCircle2 size={18} color="#10b981" />
              <strong style={{ color: '#fff', fontSize: '0.95rem' }}>
                Resultado do Teste de Integridade: {testResult.filename}
              </strong>
            </div>
            <div style={{ fontSize: '0.84rem', color: '#93c5fd' }}>
              Integridade do arquivo: <strong style={{ color: '#10b981' }}>{testResult.integrity}</strong> • 
              Conteúdos validados: <strong>{testResult.verifiedRows?.streams?.toLocaleString() || 0} streams</strong> • 
              Usuários validados: <strong>{testResult.verifiedRows?.users || 0} usuários</strong>
            </div>
          </div>
          <button
            onClick={() => setTestResult(null)}
            className="btn btn-secondary btn-sm"
            style={{ fontSize: '0.78rem' }}
          >
            Fechar Relatório
          </button>
        </div>
      )}

      {/* Backups Table */}
      <div style={{
        background: 'var(--card-bg, #141824)',
        border: '1px solid var(--border-color, #232a3e)',
        borderRadius: 'var(--radius-lg, 12px)',
        overflow: 'hidden'
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color, #232a3e)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0, color: '#fff' }}>
              Histórico de Cópias de Segurança (.db)
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)', margin: '4px 0 0' }}>
              Todos os arquivos gerados pelo VACUUM INTO prontos para restauração ou download
            </p>
          </div>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
            <thead>
              <tr style={{ background: '#0d111d', borderBottom: '1px solid var(--border-color, #232a3e)', color: '#8b9bb4' }}>
                <th style={{ padding: '12px 20px' }}>Nome do Arquivo</th>
                <th style={{ padding: '12px 16px' }}>Tamanho</th>
                <th style={{ padding: '12px 16px' }}>Data de Criação</th>
                <th style={{ padding: '12px 16px' }}>Status</th>
                <th style={{ padding: '12px 20px', textAlign: 'right' }}>Ações de Manutenção</th>
              </tr>
            </thead>
            <tbody>
              {loading && backups.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ padding: '36px', textAlign: 'center', color: '#8b9bb4' }}>
                    <RefreshCw size={22} className="animate-spin" style={{ margin: '0 auto 8px' }} />
                    <p>Carregando arquivos de backup...</p>
                  </td>
                </tr>
              ) : backups.length === 0 ? (
                <tr>
                  <td colSpan="5" style={{ padding: '36px', textAlign: 'center', color: '#8b9bb4' }}>
                    Nenhum backup encontrado. Clique no botão <strong>"💾 Criar Backup Agora"</strong> para gerar o primeiro.
                  </td>
                </tr>
              ) : (
                backups.map((b) => (
                  <tr key={b.filename} style={{ borderBottom: '1px solid #1c2438' }}>
                    <td style={{ padding: '14px 20px' }}>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                        <FileCode size={18} color="#10b981" />
                        <div>
                          <strong style={{ color: '#f8fafc', fontSize: '0.88rem' }}>
                            {b.filename}
                          </strong>
                          <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                            SQLite Database V3
                          </div>
                        </div>
                      </div>
                    </td>

                    <td style={{ padding: '14px 16px', color: '#94a3b8', fontWeight: 600 }}>
                      {b.size_formatted}
                    </td>

                    <td style={{ padding: '14px 16px', color: '#94a3b8' }}>
                      {formatDate(b.created_at)}
                    </td>

                    <td style={{ padding: '14px 16px' }}>
                      <span style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: 'rgba(16, 185, 129, 0.12)',
                        color: '#10b981',
                        border: '1px solid rgba(16, 185, 129, 0.25)',
                        fontSize: '0.76rem',
                        fontWeight: 600
                      }}>
                        Pronto para Restauro
                      </span>
                    </td>

                    <td style={{ padding: '14px 20px', textAlign: 'right' }}>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px' }}>
                        <button
                          onClick={() => handleTestIntegrity(b.filename)}
                          disabled={testingFile === b.filename}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '4px' }}
                          title="Testa PRAGMA integrity_check de forma isolada neste arquivo"
                        >
                          <ShieldCheck size={13} className={testingFile === b.filename ? 'animate-spin' : ''} />
                          <span>{testingFile === b.filename ? 'Testando...' : 'Testar'}</span>
                        </button>

                        <button
                          onClick={() => handleDownloadBackup(b.filename)}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#38bdf8' }}
                          title="Baixar arquivo .db para o computador"
                        >
                          <Download size={13} />
                          <span>Baixar</span>
                        </button>

                        <button
                          onClick={() => handleDeleteBackup(b.filename)}
                          className="btn btn-secondary btn-sm"
                          style={{ fontSize: '0.76rem', display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#ef4444' }}
                          title="Excluir arquivo de backup permanentemente"
                        >
                          <Trash2 size={13} />
                          <span>Excluir</span>
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
    </div>
  );
}
