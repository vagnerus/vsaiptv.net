import React, { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import { 
  Radio, Play, Square, RefreshCw, CheckCircle2, AlertTriangle, 
  XCircle, HelpCircle, Activity, Filter, Info
} from 'lucide-react';

export default function StreamMonitorView({ notify }) {
  const [stats, setStats] = useState(null);
  const [scanStatus, setScanStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState('live');
  const [limit, setLimit] = useState(250);
  const [brokenOnly, setBrokenOnly] = useState(false);
  const pollIntervalRef = useRef(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/admin/streams/health/stats');
      setStats(res.data.stats);
      setScanStatus(res.data.scanStatus);
    } catch (err) {
      console.error('Error fetching stream health stats:', err);
      if (notify) notify('Erro ao carregar estatísticas do Monitor de Streams', 'error');
    } finally {
      setLoading(false);
    }
  };

  const pollStatus = async () => {
    try {
      const res = await api.get('/api/admin/streams/health/scan/status');
      setScanStatus(res.data);
      if (!res.data.isScanning) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        fetchStats();
      }
    } catch (err) {
      console.error('Error polling stream scan status:', err);
    }
  };

  useEffect(() => {
    fetchStats();
    return () => {
      if (pollIntervalRef.current) clearInterval(pollIntervalRef.current);
    };
  }, []);

  useEffect(() => {
    if (scanStatus?.isScanning && !pollIntervalRef.current) {
      pollIntervalRef.current = setInterval(pollStatus, 1500);
    } else if (!scanStatus?.isScanning && pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, [scanStatus?.isScanning]);

  const handleStartScan = async () => {
    try {
      const res = await api.post('/api/admin/streams/health/scan', {
        type,
        limit,
        brokenOnly
      });
      if (notify) notify(res.data.message || 'Varredura de streams iniciada!', 'success');
      pollStatus();
    } catch (err) {
      if (notify) notify(err.response?.data?.error || 'Erro ao iniciar varredura de streams', 'error');
    }
  };

  const handleCancelScan = async () => {
    try {
      const res = await api.post('/api/admin/streams/health/scan/cancel');
      if (notify) notify(res.data.message || 'Cancelamento solicitado', 'info');
      pollStatus();
    } catch (err) {
      if (notify) notify('Erro ao cancelar varredura', 'error');
    }
  };

  const isScanning = scanStatus?.isScanning;
  const progressPct = scanStatus?.total > 0 ? Math.round((scanStatus.checked / scanStatus.total) * 100) : 0;

  return (
    <div className="animate-fade">
      {/* Top Header */}
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
            background: 'linear-gradient(135deg, #0ea5e9 0%, #3b82f6 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Radio size={22} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>Monitor de Canais & Streams</h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)', margin: 0 }}>
              Verificação controlada de HLS, manifestos, DNS, timeouts e códigos HTTP
            </p>
          </div>
        </div>

        <button 
          onClick={fetchStats} 
          disabled={loading}
          className="btn btn-secondary btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Atualizar Dados</span>
        </button>
      </div>

      {/* Notice box */}
      <div style={{
        marginBottom: '20px',
        padding: '12px 18px',
        borderRadius: '8px',
        background: 'rgba(59, 130, 246, 0.08)',
        border: '1px solid rgba(59, 130, 246, 0.25)',
        display: 'flex',
        alignItems: 'center',
        gap: '10px',
        fontSize: '0.85rem',
        color: '#93c5fd'
      }}>
        <Info size={18} style={{ flexShrink: 0 }} />
        <span>
          <strong>Princípio de Integridade:</strong> Canais offline temporariamente <u>NUNCA</u> são removidos automaticamente pelo monitor. O estado é apenas demarcado com latência e causa técnica para gestão administrativa consciente.
        </span>
      </div>

      {/* Health Status Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div className="stat-card" style={{ padding: '16px', background: 'var(--card-bg, #141824)', borderRadius: '10px', border: '1px solid var(--border-color, #232a3e)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <CheckCircle2 size={18} color="#10b981" />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)' }}>Streams Online</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#10b981' }}>
            {stats?.online?.toLocaleString() || 0}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim, #8b9bb4)', marginTop: '4px' }}>
            Respondendo prontamente (&lt; 3s)
          </div>
        </div>

        <div className="stat-card" style={{ padding: '16px', background: 'var(--card-bg, #141824)', borderRadius: '10px', border: '1px solid var(--border-color, #232a3e)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <AlertTriangle size={18} color="#f59e0b" />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)' }}>Streams Instáveis</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#f59e0b' }}>
            {stats?.unstable?.toLocaleString() || 0}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim, #8b9bb4)', marginTop: '4px' }}>
            Alta latência ou 5xx intermitente
          </div>
        </div>

        <div className="stat-card" style={{ padding: '16px', background: 'var(--card-bg, #141824)', borderRadius: '10px', border: '1px solid var(--border-color, #232a3e)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <XCircle size={18} color="#ef4444" />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)' }}>Streams Offline</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#ef4444' }}>
            {stats?.offline?.toLocaleString() || 0}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim, #8b9bb4)', marginTop: '4px' }}>
            Timeout, 404 ou host inacessível
          </div>
        </div>

        <div className="stat-card" style={{ padding: '16px', background: 'var(--card-bg, #141824)', borderRadius: '10px', border: '1px solid var(--border-color, #232a3e)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '8px' }}>
            <HelpCircle size={18} color="#94a3b8" />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)' }}>Ainda Não Verificados</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#94a3b8' }}>
            {stats?.unknown?.toLocaleString() || 0}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim, #8b9bb4)', marginTop: '4px' }}>
            Total catalogado: {stats?.total?.toLocaleString() || 0}
          </div>
        </div>
      </div>

      {/* Scanner Control Panel */}
      <div style={{
        background: 'var(--card-bg, #141824)',
        border: '1px solid var(--border-color, #232a3e)',
        borderRadius: 'var(--radius-lg, 12px)',
        padding: '20px',
        marginBottom: '24px'
      }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: '16px', marginBottom: '16px' }}>
          <div>
            <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0, display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={18} color="#0ea5e9" />
              <span>Verificação Sob Demanda (Fila com Concorrência Limitada)</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)', margin: '4px 0 0' }}>
              Verifica os manifestos HLS em segundo plano sem sobrecarregar a rede ou derrubar o servidor
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <select 
              value={type} 
              onChange={(e) => setType(e.target.value)}
              disabled={isScanning}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                background: '#1a2030',
                border: '1px solid #2d374d',
                color: '#fff',
                fontSize: '0.85rem'
              }}
            >
              <option value="live">Canais Ao Vivo (HLS)</option>
              <option value="movie">Filmes (VOD)</option>
              <option value="series">Séries (VOD)</option>
              <option value="all">Todo o Catálogo</option>
            </select>

            <select 
              value={limit} 
              onChange={(e) => setLimit(Number(e.target.value))}
              disabled={isScanning}
              style={{
                padding: '8px 12px',
                borderRadius: '8px',
                background: '#1a2030',
                border: '1px solid #2d374d',
                color: '#fff',
                fontSize: '0.85rem'
              }}
            >
              <option value={100}>100 canais</option>
              <option value={250}>250 canais</option>
              <option value={500}>500 canais</option>
              <option value={1000}>1.000 canais</option>
            </select>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={brokenOnly} 
                onChange={(e) => setBrokenOnly(e.target.checked)}
                disabled={isScanning}
              />
              <span>Somente com falhas prévias</span>
            </label>

            {!isScanning ? (
              <button 
                onClick={handleStartScan}
                className="btn btn-primary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Play size={14} />
                <span>Iniciar Teste de Canais</span>
              </button>
            ) : (
              <button 
                onClick={handleCancelScan}
                className="btn btn-danger btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Square size={14} />
                <span>Cancelar Teste</span>
              </button>
            )}
          </div>
        </div>

        {/* Real-time progress */}
        {isScanning && (
          <div style={{ marginTop: '16px', padding: '16px', background: '#0e121d', borderRadius: '8px', border: '1px solid #1f273b' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '8px' }}>
              <span>
                Testando agora: <strong>{scanStatus.currentStream || 'Iniciando fila...'}</strong>
              </span>
              <span>{scanStatus.checked} de {scanStatus.total} ({progressPct}%)</span>
            </div>

            <div style={{ width: '100%', height: '8px', background: '#1e2638', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{
                width: `${progressPct}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #0ea5e9, #10b981)',
                transition: 'width 0.3s ease'
              }} />
            </div>

            <div style={{ display: 'flex', gap: '16px', marginTop: '10px', fontSize: '0.78rem', color: '#8b9bb4' }}>
              <span>Online: <strong style={{ color: '#10b981' }}>{scanStatus.online}</strong></span>
              <span>Instáveis: <strong style={{ color: '#f59e0b' }}>{scanStatus.unstable}</strong></span>
              <span>Offline: <strong style={{ color: '#ef4444' }}>{scanStatus.offline}</strong></span>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
