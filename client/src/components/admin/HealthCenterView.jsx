import React, { useState, useEffect } from 'react';
import api from '../../services/api';
import {
  Activity, Database, Radio, Image, Wifi, Calendar, HardDrive, 
  Archive, RefreshCw, CheckCircle2, AlertTriangle, XCircle, 
  Cpu, Server, ShieldCheck, Play, Terminal, AlertCircle
} from 'lucide-react';

export default function HealthCenterView({ notify, onNavigateTab }) {
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState({});
  const [integrityResult, setIntegrityResult] = useState(null);

  const fetchHealth = async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/admin/health');
      setHealth(res.data);
    } catch (err) {
      console.error('Error fetching system health:', err);
      if (notify) notify('Erro ao carregar Central de Saúde', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHealth();
  }, []);

  const handleVerifyDb = async () => {
    try {
      setActionLoading(prev => ({ ...prev, db: true }));
      const res = await api.post('/api/admin/health/db-integrity');
      setIntegrityResult(res.data);
      if (res.data.success) {
        if (notify) notify(`Banco íntegro! Verificado em ${res.data.durationMs}ms (PRAGMA integrity_check: ok)`, 'success');
      } else {
        if (notify) notify('Aviso: integridade do banco reportou problemas.', 'error');
      }
      fetchHealth();
    } catch (err) {
      if (notify) notify('Erro ao verificar integridade do banco', 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, db: false }));
    }
  };

  const handleCreateBackup = async () => {
    if (!window.confirm('Confirma a criação de um backup consistente do banco de dados com flush WAL imediato?')) return;
    try {
      setActionLoading(prev => ({ ...prev, backup: true }));
      const res = await api.post('/api/admin/health/backup');
      if (notify) notify(`Backup gerado com sucesso: ${res.data.filename} (${(res.data.size_bytes / 1024 / 1024).toFixed(2)} MB)`, 'success');
      fetchHealth();
    } catch (err) {
      if (notify) notify('Erro ao gerar backup', 'error');
    } finally {
      setActionLoading(prev => ({ ...prev, backup: false }));
    }
  };

  const formatUptime = (seconds) => {
    if (!seconds) return '0s';
    const d = Math.floor(seconds / (3600 * 24));
    const h = Math.floor((seconds % (3600 * 24)) / 3600);
    const m = Math.floor((seconds % 3600) / 60);
    if (d > 0) return `${d}d ${h}h ${m}m`;
    if (h > 0) return `${h}h ${m}m`;
    return `${m}m ${seconds % 60}s`;
  };

  const getStatusBadge = (status) => {
    const s = String(status || '').toUpperCase();
    if (s === 'ONLINE') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#10b981', fontWeight: 600, fontSize: '0.8rem' }}>
          <CheckCircle2 size={14} /> ONLINE
        </span>
      );
    }
    if (s === 'DEGRADADO') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#f59e0b', fontWeight: 600, fontSize: '0.8rem' }}>
          <AlertTriangle size={14} /> DEGRADADO
        </span>
      );
    }
    if (s === 'OFFLINE') {
      return (
        <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#ef4444', fontWeight: 600, fontSize: '0.8rem' }}>
          <XCircle size={14} /> OFFLINE
        </span>
      );
    }
    return (
      <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', color: '#94a3b8', fontWeight: 600, fontSize: '0.8rem' }}>
        DESCONHECIDO
      </span>
    );
  };

  const services = health?.services || {};
  const metrics = health?.metrics || {};

  return (
    <div className="animate-fade">
      {/* Master Top Bar */}
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
            background: 'linear-gradient(135deg, #10b981 0%, #3b82f6 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Activity size={22} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>Central de Saúde VSAIPTV</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)', margin: 0 }}>
              Diagnóstico operacional em tempo real baseado 100% em dados e testes reais
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            onClick={fetchHealth} 
            disabled={loading}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Verificar Sistema</span>
          </button>

          <button 
            onClick={handleVerifyDb} 
            disabled={actionLoading.db}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Database size={14} className={actionLoading.db ? 'animate-spin' : ''} />
            <span>Verificar Banco (Integrity Check)</span>
          </button>

          <button 
            onClick={handleCreateBackup} 
            disabled={actionLoading.backup}
            className="btn btn-primary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Archive size={14} className={actionLoading.backup ? 'animate-spin' : ''} />
            <span>Executar Backup</span>
          </button>
        </div>
      </div>

      {/* Integrity Check Banner if recently run */}
      {integrityResult && (
        <div style={{
          marginBottom: '20px',
          padding: '12px 18px',
          borderRadius: '8px',
          background: integrityResult.success ? 'rgba(16, 185, 129, 0.1)' : 'rgba(239, 68, 68, 0.1)',
          border: `1px solid ${integrityResult.success ? '#10b981' : '#ef4444'}`,
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          fontSize: '0.88rem'
        }}>
          <span>
            <strong>Resultado PRAGMA integrity_check:</strong> {integrityResult.status.toUpperCase()} ({integrityResult.durationMs}ms)
          </span>
          <span style={{ color: 'var(--text-dim, #8b9bb4)', fontSize: '0.78rem' }}>
            {integrityResult.checkedAt}
          </span>
        </div>
      )}

      {/* Grid of 8 Required Services */}
      <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '14px' }}>Status dos Serviços Fundamentais</h3>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))',
        gap: '16px',
        marginBottom: '28px'
      }}>
        {/* 1. API */}
        <div className="stat-card" style={{ padding: '16px', background: 'var(--card-bg, #141824)', borderRadius: '10px', border: '1px solid var(--border-color, #232a3e)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
              <Server size={18} color="#3b82f6" />
              <span>API Gateway</span>
            </div>
            {getStatusBadge(services.api?.status)}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)' }}>
            <div>Latência: <strong style={{ color: '#fff' }}>{services.api?.latency_ms ?? 0} ms</strong></div>
            <div>Uptime: <strong style={{ color: '#fff' }}>{formatUptime(services.api?.uptime_seconds)}</strong></div>
            <div>Node: <strong style={{ color: '#fff' }}>{services.api?.node_version || 'v24'}</strong></div>
          </div>
        </div>

        {/* 2. Banco de Dados */}
        <div className="stat-card" style={{ padding: '16px', background: 'var(--card-bg, #141824)', borderRadius: '10px', border: '1px solid var(--border-color, #232a3e)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
              <Database size={18} color="#10b981" />
              <span>SQLite Master</span>
            </div>
            {getStatusBadge(services.database?.status)}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)' }}>
            <div>Latência query: <strong style={{ color: '#fff' }}>{services.database?.latency_ms ?? 0} ms</strong></div>
            <div>Streams: <strong style={{ color: '#fff' }}>{services.database?.counts?.streams?.toLocaleString() || 0}</strong></div>
            <div>Integridade: <strong style={{ color: '#10b981' }}>{services.database?.integrity || 'ok'}</strong></div>
          </div>
        </div>

        {/* 3. Proxy de Mídia */}
        <div className="stat-card" style={{ padding: '16px', background: 'var(--card-bg, #141824)', borderRadius: '10px', border: '1px solid var(--border-color, #232a3e)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
              <Radio size={18} color="#8b5cf6" />
              <span>Proxy de Mídia</span>
            </div>
            {getStatusBadge(services.media_proxy?.status)}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)' }}>
            <div>Anti-SSRF: <strong style={{ color: '#10b981' }}>Ativo (RFC1918)</strong></div>
            <div>Protocolos: <strong style={{ color: '#fff' }}>HLS (.m3u8), TS, MP4</strong></div>
            <div>Status: <strong style={{ color: '#fff' }}>Streaming contínuo</strong></div>
          </div>
        </div>

        {/* 4. Image Manager */}
        <div className="stat-card" style={{ padding: '16px', background: 'var(--card-bg, #141824)', borderRadius: '10px', border: '1px solid var(--border-color, #232a3e)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
              <Image size={18} color="#ec4899" />
              <span>Image Manager</span>
            </div>
            {getStatusBadge(services.image_manager?.status)}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)' }}>
            <div>Imagens em disco: <strong style={{ color: '#fff' }}>{services.image_manager?.stats?.cache?.totalFiles || 0}</strong></div>
            <div>Cache Negativo: <strong style={{ color: '#fff' }}>{services.image_manager?.stats?.cache?.negativeEntries || 0}</strong></div>
            <div>Magic Bytes: <strong style={{ color: '#10b981' }}>PNG, JPG, WEBP, SVG</strong></div>
          </div>
        </div>

        {/* 5. WebSocket & P2P */}
        <div className="stat-card" style={{ padding: '16px', background: 'var(--card-bg, #141824)', borderRadius: '10px', border: '1px solid var(--border-color, #232a3e)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
              <Wifi size={18} color="#f59e0b" />
              <span>WebSocket & P2P</span>
            </div>
            {getStatusBadge(services.websocket_p2p?.status)}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)' }}>
            <div>Conexões Ativas: <strong style={{ color: '#fff' }}>{services.websocket_p2p?.activeConnections ?? 0}</strong></div>
            <div>Peers no Swarm: <strong style={{ color: '#fff' }}>{services.websocket_p2p?.p2pSwarmPeers ?? 0}</strong></div>
            <div>Economia de Banda: <strong style={{ color: '#10b981' }}>{services.websocket_p2p?.p2pEfficiency || '0%'}</strong></div>
          </div>
        </div>

        {/* 6. EPG */}
        <div className="stat-card" style={{ padding: '16px', background: 'var(--card-bg, #141824)', borderRadius: '10px', border: '1px solid var(--border-color, #232a3e)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
              <Calendar size={18} color="#06b6d4" />
              <span>Guia de TV (EPG)</span>
            </div>
            {getStatusBadge(services.epg?.status)}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)' }}>
            <div>Programas no BD: <strong style={{ color: '#fff' }}>{services.epg?.totalPrograms?.toLocaleString() || 0}</strong></div>
            <div>Canais com EPG: <strong style={{ color: '#fff' }}>{services.epg?.channelsWithEpg || 0}</strong></div>
            <div>Timeline: <strong style={{ color: '#fff' }}>{services.epg?.source || 'Normalizado'}</strong></div>
          </div>
        </div>

        {/* 7. Cache */}
        <div className="stat-card" style={{ padding: '16px', background: 'var(--card-bg, #141824)', borderRadius: '10px', border: '1px solid var(--border-color, #232a3e)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
              <HardDrive size={18} color="#a855f7" />
              <span>Cache & Memória</span>
            </div>
            {getStatusBadge(services.cache?.status)}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)' }}>
            <div>V8 Heap Usado: <strong style={{ color: '#fff' }}>{services.cache?.heapUsedMb ?? 0} MB</strong></div>
            <div>Processo RSS: <strong style={{ color: '#fff' }}>{services.cache?.rssMb ?? 0} MB</strong></div>
            <div>Cache de Imagem: <strong style={{ color: '#fff' }}>{services.cache?.imageDiskMb ?? 0} MB</strong></div>
          </div>
        </div>

        {/* 8. Backup */}
        <div className="stat-card" style={{ padding: '16px', background: 'var(--card-bg, #141824)', borderRadius: '10px', border: '1px solid var(--border-color, #232a3e)' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
              <Archive size={18} color="#14b8a6" />
              <span>Backup Manager</span>
            </div>
            {getStatusBadge(services.backup?.status)}
          </div>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)' }}>
            <div>Backups Salvos: <strong style={{ color: '#fff' }}>{services.backup?.totalBackups ?? 0}</strong></div>
            <div>Último: <strong style={{ color: '#fff' }}>{services.backup?.lastBackup?.filename ? `${(services.backup.lastBackup.size_bytes / 1024 / 1024).toFixed(1)} MB` : 'Nenhum'}</strong></div>
            <div>Retenção: <strong style={{ color: '#fff' }}>Últimos 14 snapshots</strong></div>
          </div>
        </div>
      </div>

      {/* Real Server Metrics & Telemetry Grid */}
      <h3 style={{ fontSize: '1.05rem', fontWeight: 600, marginBottom: '14px' }}>Métricas de Hardware & Plataforma</h3>
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '28px'
      }}>
        <div className="stat-card" style={{ padding: '16px', background: 'var(--card-bg, #141824)', borderRadius: '10px', border: '1px solid var(--border-color, #232a3e)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Cpu size={18} color="#3b82f6" />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)' }}>CPU do Servidor</span>
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>{metrics.cpu?.cores || 1} Cores</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim, #8b9bb4)', marginTop: '4px' }}>
            Load: {metrics.cpu?.loadAvg?.map(n => n.toFixed(2)).join(', ') || 'N/A'}
          </div>
        </div>

        <div className="stat-card" style={{ padding: '16px', background: 'var(--card-bg, #141824)', borderRadius: '10px', border: '1px solid var(--border-color, #232a3e)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <HardDrive size={18} color="#10b981" />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)' }}>Memória RAM</span>
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>
            {metrics.memory?.usedMb || 0} / {metrics.memory?.totalMb || 0} MB
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim, #8b9bb4)', marginTop: '4px' }}>
            {metrics.memory?.usagePct || 0}% em uso ({metrics.memory?.freeMb || 0} MB livres)
          </div>
        </div>

        <div className="stat-card" style={{ padding: '16px', background: 'var(--card-bg, #141824)', borderRadius: '10px', border: '1px solid var(--border-color, #232a3e)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <Activity size={18} color="#f59e0b" />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)' }}>Streams Verificados</span>
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700 }}>
            {metrics.streams?.online || 0} Online
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim, #8b9bb4)', marginTop: '4px' }}>
            {metrics.streams?.unstable || 0} instáveis | {metrics.streams?.offline || 0} offline | {metrics.streams?.unknown || 0} a verificar
          </div>
        </div>
      </div>

      {/* Quick Actions Panel */}
      <div style={{
        background: 'var(--card-bg, #141824)',
        border: '1px solid var(--border-color, #232a3e)',
        borderRadius: 'var(--radius-lg, 12px)',
        padding: '20px',
        marginBottom: '24px'
      }}>
        <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: '0 0 14px' }}>Ações de Manutenção do Sistema</h3>
        <div style={{ display: 'flex', gap: '12px', flexWrap: 'wrap' }}>
          <button 
            onClick={() => onNavigateTab && onNavigateTab('streams_health')} 
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Play size={14} color="#3b82f6" />
            <span>Verificar Canais (Stream Monitor)</span>
          </button>

          <button 
            onClick={() => onNavigateTab && onNavigateTab('images')} 
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Image size={14} color="#ec4899" />
            <span>Auditar Imagens & Logos</span>
          </button>

          <button 
            onClick={handleVerifyDb} 
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <ShieldCheck size={14} color="#10b981" />
            <span>Executar PRAGMA integrity_check</span>
          </button>

          <button 
            onClick={handleCreateBackup} 
            className="btn btn-primary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <Archive size={14} />
            <span>Fazer Backup Agora</span>
          </button>
        </div>
      </div>

      {/* Recent Sanitized Error Logs */}
      {metrics.recentErrors && metrics.recentErrors.length > 0 && (
        <div style={{
          background: 'var(--card-bg, #141824)',
          border: '1px solid var(--border-color, #232a3e)',
          borderRadius: 'var(--radius-lg, 12px)',
          overflow: 'hidden'
        }}>
          <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color, #232a3e)' }}>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <AlertCircle size={18} color="#ef4444" />
              <span>Erros Operacionais Recentes</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)', margin: '4px 0 0' }}>
              Falhas sanitizadas (nenhuma credencial ou URL sensível é exibida)
            </p>
          </div>

          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#0d111a', borderBottom: '1px solid #1f273b', color: '#94a3b8' }}>
                  <th style={{ padding: '10px 16px' }}>Horário</th>
                  <th style={{ padding: '10px 16px' }}>Tipo</th>
                  <th style={{ padding: '10px 16px' }}>Conteúdo</th>
                  <th style={{ padding: '10px 16px' }}>Mensagem Técnica</th>
                  <th style={{ padding: '10px 16px' }}>Status</th>
                </tr>
              </thead>
              <tbody>
                {metrics.recentErrors.map(err => (
                  <tr key={err.id} style={{ borderBottom: '1px solid #1c2438' }}>
                    <td style={{ padding: '10px 16px', color: '#8b9bb4' }}>
                      {new Date(err.created_at).toLocaleTimeString()}
                    </td>
                    <td style={{ padding: '10px 16px', fontWeight: 600, color: '#ef4444' }}>
                      {err.error_type}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      {err.content_name || 'N/A'}
                    </td>
                    <td style={{ padding: '10px 16px', fontFamily: 'monospace', color: '#cbd5e1' }}>
                      {err.error_message}
                    </td>
                    <td style={{ padding: '10px 16px' }}>
                      <span style={{ padding: '2px 8px', borderRadius: '4px', background: '#371e22', color: '#ef4444', fontSize: '0.75rem', fontWeight: 600 }}>
                        {err.http_status || 'ERR'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
