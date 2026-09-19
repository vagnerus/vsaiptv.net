import React, { useState, useEffect, useRef } from 'react';
import api from '../../services/api';
import { 
  Image, RefreshCw, CheckCircle2, AlertTriangle, XCircle, 
  Trash2, ShieldCheck, Play, Square, Wrench, HardDrive, 
  Layers, Tv, Film, Clapperboard, Sparkles
} from 'lucide-react';

export default function ImageManagerView({ notify }) {
  const [stats, setStats] = useState(null);
  const [scanStatus, setScanStatus] = useState(null);
  const [loading, setLoading] = useState(false);
  const [scope, setScope] = useState('all'); // all, live, movie, series
  const [autoRepair, setAutoRepair] = useState(true);
  const pollIntervalRef = useRef(null);

  const fetchStats = async () => {
    try {
      setLoading(true);
      const res = await api.get('/api/admin/images/stats');
      setStats(res.data.stats);
      setScanStatus(res.data.auditorStatus);
    } catch (err) {
      console.error('Error fetching image stats:', err);
      if (notify) notify('Erro ao carregar estatísticas do Image Manager', 'error');
    } finally {
      setLoading(false);
    }
  };

  const pollScanStatus = async () => {
    try {
      const res = await api.get('/api/admin/images/scan/status');
      setScanStatus(res.data);
      if (!res.data.isScanning) {
        if (pollIntervalRef.current) {
          clearInterval(pollIntervalRef.current);
          pollIntervalRef.current = null;
        }
        // Refresh stats once scan ends
        fetchStats();
      }
    } catch (err) {
      console.error('Error polling scan status:', err);
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
      pollIntervalRef.current = setInterval(pollScanStatus, 1500);
    } else if (!scanStatus?.isScanning && pollIntervalRef.current) {
      clearInterval(pollIntervalRef.current);
      pollIntervalRef.current = null;
    }
  }, [scanStatus?.isScanning]);

  const handleStartScan = async () => {
    try {
      const res = await api.post('/api/admin/images/scan', {
        scope,
        repair: autoRepair,
        limit: 10000
      });
      if (notify) notify(res.data.message || 'Auditoria de imagens iniciada com sucesso!', 'success');
      pollScanStatus();
    } catch (err) {
      if (notify) notify(err.response?.data?.error || 'Erro ao iniciar auditoria', 'error');
    }
  };

  const handleCancelScan = async () => {
    try {
      const res = await api.post('/api/admin/images/scan/cancel');
      if (notify) notify(res.data.message || 'Cancelamento solicitado', 'info');
      pollScanStatus();
    } catch (err) {
      if (notify) notify('Erro ao cancelar auditoria', 'error');
    }
  };

  const [repairingMissing, setRepairingMissing] = useState(false);

  const handleRepairMissing = async () => {
    try {
      setRepairingMissing(true);
      const res = await api.post('/api/admin/images/repair-missing', { type: scope });
      if (notify) notify(res.data.message || 'Itens sem imagem reparados com sucesso!', 'success');
      await fetchStats();
    } catch (err) {
      if (notify) notify(err.response?.data?.error || 'Erro ao reparar itens sem imagem', 'error');
    } finally {
      setRepairingMissing(false);
    }
  };

  const handleCleanCache = async () => {
    if (!window.confirm('Deseja limpar os registros de URLs quebradas expiradas do cache negativo?')) return;
    try {
      const res = await api.post('/api/admin/images/clean');
      if (notify) notify(`Cache limpo com sucesso! ${res.data.changes || 0} registros removidos.`, 'success');
      fetchStats();
    } catch (err) {
      if (notify) notify('Erro ao limpar cache', 'error');
    }
  };

  const formatBytes = (bytes) => {
    if (!bytes || bytes === 0) return '0 B';
    const k = 1024;
    const sizes = ['B', 'KB', 'MB', 'GB', 'TB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  const catalog = stats?.catalog || {
    channels: { total: 0, with_image: 0, without_image: 0 },
    movies: { total: 0, with_image: 0, without_image: 0 },
    series: { total: 0, with_image: 0, without_image: 0 },
    novelas: { total: 0, with_image: 0, without_image: 0 }
  };

  const cache = stats?.cache || {
    totalFiles: 0,
    totalSizeBytes: 0,
    hits: 0,
    misses: 0,
    negativeEntries: 0
  };

  const isScanning = scanStatus?.isScanning;
  const progressPct = scanStatus?.total > 0 ? Math.round((scanStatus.scanned / scanStatus.total) * 100) : 0;

  return (
    <div className="animate-fade">
      {/* Header & Main Controls */}
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
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <div style={{
              width: '36px', height: '36px', borderRadius: '8px',
              background: 'linear-gradient(135deg, #3b82f6 0%, #8b5cf6 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center'
            }}>
              <Image size={20} color="#fff" />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>VSAIPTV Image Manager</h2>
              <p style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)', margin: 0 }}>
                Cache persistente em disco, Anti-SSRF, validação mágica de bytes e auto-repair inteligente
              </p>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            onClick={handleRepairMissing}
            disabled={repairingMissing || isScanning}
            className="btn btn-primary btn-sm"
            style={{ 
              display: 'flex', 
              alignItems: 'center', 
              gap: '6px',
              background: 'linear-gradient(135deg, #10b981 0%, #059669 100%)',
              border: 'none',
              fontWeight: 600
            }}
            title="Repara instantaneamente todos os conteúdos sem imagem com logotipos e posters"
          >
            <Sparkles size={14} className={repairingMissing ? 'animate-spin' : ''} />
            <span>{repairingMissing ? 'Reparando...' : '⚡ Reparar Sem Imagem Agora'}</span>
          </button>

          <button 
            onClick={fetchStats} 
            disabled={loading}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Atualizar</span>
          </button>

          <button 
            onClick={handleCleanCache} 
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f59e0b' }}
            title="Limpar registros de URLs quebradas expiradas"
          >
            <Trash2 size={14} />
            <span>Limpar Cache Negativo</span>
          </button>
        </div>
      </div>

      {/* Storage & General Health Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div className="stat-card" style={{ padding: '16px', background: 'var(--card-bg, #141824)', borderRadius: '10px', border: '1px solid var(--border-color, #232a3e)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <HardDrive size={18} color="#3b82f6" />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)' }}>Cache em Disco</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700 }}>{formatBytes(cache.totalSizeBytes)}</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim, #8b9bb4)', marginTop: '4px' }}>
            {cache.totalFiles} imagens salvas
          </div>
        </div>

        <div className="stat-card" style={{ padding: '16px', background: 'var(--card-bg, #141824)', borderRadius: '10px', border: '1px solid var(--border-color, #232a3e)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <CheckCircle2 size={18} color="#10b981" />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)' }}>Taxa de Cache Hit</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#10b981' }}>
            {cache.hits + cache.misses > 0 ? Math.round((cache.hits / (cache.hits + cache.misses)) * 100) : 0}%
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim, #8b9bb4)', marginTop: '4px' }}>
            {cache.hits} hits / {cache.misses} misses
          </div>
        </div>

        <div className="stat-card" style={{ padding: '16px', background: 'var(--card-bg, #141824)', borderRadius: '10px', border: '1px solid var(--border-color, #232a3e)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <ShieldCheck size={18} color="#8b5cf6" />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)' }}>Anti-SSRF & DNS Seguro</span>
          </div>
          <div style={{ fontSize: '1.4rem', fontWeight: 700, color: '#8b5cf6' }}>Ativo</div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim, #8b9bb4)', marginTop: '4px' }}>
            Bloqueio de RFC1918 / Loopback
          </div>
        </div>

        <div className="stat-card" style={{ padding: '16px', background: 'var(--card-bg, #141824)', borderRadius: '10px', border: '1px solid var(--border-color, #232a3e)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <XCircle size={18} color="#ef4444" />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)' }}>Cache Negativo (404)</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#ef4444' }}>
            {cache.negativeEntries}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim, #8b9bb4)', marginTop: '4px' }}>
            URLs bloqueadas por 7 dias
          </div>
        </div>
      </div>

      {/* Audit Scanner Control Panel */}
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
              <Wrench size={18} color="#f59e0b" />
              <span>Image Auditor & Auto-Repair</span>
            </h3>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)', margin: '4px 0 0' }}>
              Varredura controlada para verificar validade das imagens e reparar logos conhecidos automaticamente
            </p>
          </div>

          <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
            <select 
              value={scope} 
              onChange={(e) => setScope(e.target.value)}
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
              <option value="all">Todo o Catálogo</option>
              <option value="live">Somente Canais de TV</option>
              <option value="movie">Somente Filmes</option>
              <option value="series">Somente Séries</option>
            </select>

            <label style={{ display: 'flex', alignItems: 'center', gap: '6px', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input 
                type="checkbox" 
                checked={autoRepair} 
                onChange={(e) => setAutoRepair(e.target.checked)}
                disabled={isScanning}
              />
              <span>Auto-Repair (fontes oficiais)</span>
            </label>

            {!isScanning ? (
              <button 
                onClick={handleStartScan}
                className="btn btn-primary btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Play size={14} />
                <span>Iniciar Auditoria</span>
              </button>
            ) : (
              <button 
                onClick={handleCancelScan}
                className="btn btn-danger btn-sm"
                style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
              >
                <Square size={14} />
                <span>Cancelar</span>
              </button>
            )}
          </div>
        </div>

        {/* Scanner Progress Bar */}
        {isScanning && (
          <div style={{ marginTop: '16px', padding: '16px', background: '#0e121d', borderRadius: '8px', border: '1px solid #1f273b' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.85rem', marginBottom: '8px' }}>
              <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                <Sparkles size={14} color="#3b82f6" className="animate-spin" />
                <span>Auditando: <strong>{scanStatus.currentStream || 'Processando...'}</strong></span>
              </span>
              <span>{scanStatus.scanned} de {scanStatus.total} ({progressPct}%)</span>
            </div>
            
            <div style={{ width: '100%', height: '8px', background: '#1e2638', borderRadius: '4px', overflow: 'hidden' }}>
              <div style={{
                width: `${progressPct}%`,
                height: '100%',
                background: 'linear-gradient(90deg, #3b82f6, #10b981)',
                transition: 'width 0.3s ease'
              }} />
            </div>

            <div style={{ display: 'flex', gap: '16px', marginTop: '10px', fontSize: '0.78rem', color: '#8b9bb4' }}>
              <span>Válidas: <strong style={{ color: '#10b981' }}>{scanStatus.valid}</strong></span>
              <span>Quebradas: <strong style={{ color: '#ef4444' }}>{scanStatus.broken}</strong></span>
              <span>Reparadas: <strong style={{ color: '#3b82f6' }}>{scanStatus.repaired}</strong></span>
              <span>Sem imagem: <strong style={{ color: '#f59e0b' }}>{scanStatus.missing}</strong></span>
            </div>
          </div>
        )}
      </div>

      {/* Real Breakdown Table: TV, Filmes, Séries, Novelas */}
      <div style={{
        background: 'var(--card-bg, #141824)',
        border: '1px solid var(--border-color, #232a3e)',
        borderRadius: 'var(--radius-lg, 12px)',
        overflow: 'hidden'
      }}>
        <div style={{ padding: '16px 20px', borderBottom: '1px solid var(--border-color, #232a3e)' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 600, margin: 0 }}>
            Auditoria Real do Catálogo por Tipo de Conteúdo
          </h3>
          <p style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)', margin: '4px 0 0' }}>
            Dados obtidos diretamente da base de dados sem estimativas ou números fictícios
          </p>
        </div>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.88rem' }}>
            <thead>
              <tr style={{ background: '#0d111a', borderBottom: '1px solid var(--border-color, #232a3e)', color: 'var(--text-muted, #94a3b8)' }}>
                <th style={{ padding: '12px 20px' }}>Categoria</th>
                <th style={{ padding: '12px 16px' }}>Total Cadastrado</th>
                <th style={{ padding: '12px 16px' }}>Com Imagem</th>
                <th style={{ padding: '12px 16px' }}>Sem Imagem</th>
                <th style={{ padding: '12px 16px' }}>Cobertura</th>
                <th style={{ padding: '12px 20px' }}>Ação de Fallback</th>
              </tr>
            </thead>
            <tbody>
              <tr style={{ borderBottom: '1px solid #1c2438' }}>
                <td style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                  <Tv size={16} color="#3b82f6" />
                  <span>Canais de TV (Ao Vivo)</span>
                </td>
                <td style={{ padding: '14px 16px' }}>{catalog.channels.total.toLocaleString()}</td>
                <td style={{ padding: '14px 16px', color: '#10b981' }}>{catalog.channels.with_image.toLocaleString()}</td>
                <td style={{ padding: '14px 16px', color: catalog.channels.without_image > 0 ? '#f59e0b' : 'inherit' }}>
                  {catalog.channels.without_image.toLocaleString()}
                </td>
                <td style={{ padding: '14px 16px' }}>
                  {catalog.channels.total > 0 ? Math.round((catalog.channels.with_image / catalog.channels.total) * 100) : 0}%
                </td>
                <td style={{ padding: '14px 20px', color: '#8b9bb4', fontSize: '0.8rem' }}>
                  Badge Broadcast SVG com nome e frequência
                </td>
              </tr>

              <tr style={{ borderBottom: '1px solid #1c2438' }}>
                <td style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                  <Film size={16} color="#ec4899" />
                  <span>Filmes (VOD)</span>
                </td>
                <td style={{ padding: '14px 16px' }}>{catalog.movies.total.toLocaleString()}</td>
                <td style={{ padding: '14px 16px', color: '#10b981' }}>{catalog.movies.with_image.toLocaleString()}</td>
                <td style={{ padding: '14px 16px', color: catalog.movies.without_image > 0 ? '#f59e0b' : 'inherit' }}>
                  {catalog.movies.without_image.toLocaleString()}
                </td>
                <td style={{ padding: '14px 16px' }}>
                  {catalog.movies.total > 0 ? Math.round((catalog.movies.with_image / catalog.movies.total) * 100) : 0}%
                </td>
                <td style={{ padding: '14px 20px', color: '#8b9bb4', fontSize: '0.8rem' }}>
                  Card Cinematográfico VSAIPTV com título e ano
                </td>
              </tr>

              <tr style={{ borderBottom: '1px solid #1c2438' }}>
                <td style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                  <Clapperboard size={16} color="#8b5cf6" />
                  <span>Séries</span>
                </td>
                <td style={{ padding: '14px 16px' }}>{catalog.series.total.toLocaleString()}</td>
                <td style={{ padding: '14px 16px', color: '#10b981' }}>{catalog.series.with_image.toLocaleString()}</td>
                <td style={{ padding: '14px 16px', color: catalog.series.without_image > 0 ? '#f59e0b' : 'inherit' }}>
                  {catalog.series.without_image.toLocaleString()}
                </td>
                <td style={{ padding: '14px 16px' }}>
                  {catalog.series.total > 0 ? Math.round((catalog.series.with_image / catalog.series.total) * 100) : 0}%
                </td>
                <td style={{ padding: '14px 20px', color: '#8b9bb4', fontSize: '0.8rem' }}>
                  Poster VSAIPTV com selo de Série
                </td>
              </tr>

              <tr>
                <td style={{ padding: '14px 20px', display: 'flex', alignItems: 'center', gap: '8px', fontWeight: 600 }}>
                  <Layers size={16} color="#f59e0b" />
                  <span>Novelas</span>
                </td>
                <td style={{ padding: '14px 16px' }}>{catalog.novelas.total.toLocaleString()}</td>
                <td style={{ padding: '14px 16px', color: '#10b981' }}>{catalog.novelas.with_image.toLocaleString()}</td>
                <td style={{ padding: '14px 16px', color: catalog.novelas.without_image > 0 ? '#f59e0b' : 'inherit' }}>
                  {catalog.novelas.without_image.toLocaleString()}
                </td>
                <td style={{ padding: '14px 16px' }}>
                  {catalog.novelas.total > 0 ? Math.round((catalog.novelas.with_image / catalog.novelas.total) * 100) : 0}%
                </td>
                <td style={{ padding: '14px 20px', color: '#8b9bb4', fontSize: '0.8rem' }}>
                  Card Cinematográfico VSAIPTV
                </td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
