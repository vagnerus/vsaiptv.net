/**
 * MasterSubtitlesView.jsx — FASE 49-53: Painel "IA → Legendas IA"
 * Dashboard do agente, job atual, fila com ações (pausar/retomar/retry/cancelar)
 * e health (FFmpeg/ASR/VSAIROUTER/Storage). Somente leitura de métricas + ações seguras.
 */
import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';

const STATUS_COLORS = {
  QUEUED: '#94a3b8', RETRYING: '#f59e0b', PAUSED: '#f59e0b',
  EXTRACTING: '#3b82f6', TRANSCRIBING: '#3b82f6', TRANSLATING: '#8b5cf6',
  GENERATING: '#8b5cf6', VALIDATING: '#06b6d4', WAITING_TRANSLATION: '#f59e0b',
  READY: '#10b981', FAILED: '#ef4444', CANCELLED: '#64748b',
};

const btnStyle = {
  padding: '4px 10px', fontSize: '0.75rem', borderRadius: 6, cursor: 'pointer',
  background: 'rgba(99,102,241,0.15)', border: '1px solid rgba(99,102,241,0.4)', color: '#c7d2fe',
};

export default function MasterSubtitlesView({ notify }) {
  const [dashboard, setDashboard] = useState(null);
  const [jobs, setJobs] = useState([]);
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    try {
      const [d, j, h] = await Promise.all([
        api.get('/api/subtitles/admin/dashboard'),
        api.get('/api/subtitles/admin/jobs'),
        api.get('/api/subtitles/admin/health'),
      ]);
      setDashboard(d.data);
      setJobs(j.data.jobs || []);
      setHealth(h.data);
    } catch (e) {
      console.error('[subtitles-admin] falha ao carregar:', e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(load, 10000);
    return () => clearInterval(t);
  }, [load]);

  const runAction = async (jobId, action) => {
    try {
      await api.post(`/api/subtitles/admin/jobs/${jobId}/action`, { action });
      notify?.({ type: 'success', message: `Ação ${action} aplicada ao job #${jobId}` });
      load();
    } catch (e) {
      notify?.({ type: 'error', message: e?.response?.data?.error || 'Ação falhou' });
    }
  };

  if (loading) {
    return <div style={{ padding: 24, color: '#94a3b8' }}>Carregando Legendas IA…</div>;
  }

  const card = {
    background: '#131828', borderRadius: 12, padding: '16px 18px',
    border: '1px solid rgba(255,255,255,0.06)',
  };

  return (
    <div style={{ padding: '24px', color: '#e2e8f0' }}>
      <h2 style={{ fontSize: '1.3rem', fontWeight: 700, margin: 0 }}>Legendas IA</h2>
      <p style={{ fontSize: '0.85rem', color: '#94a3b8', marginTop: 4 }}>
        Agente autônomo de geração e tradução de legendas (ASR + VSAIROUTER). Legendas prontas são reutilizadas por todos os usuários.
      </p>

      {/* Dashboard (FASE 49) */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 12, marginTop: 16 }}>
        <div style={card}><div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Agente</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#10b981' }}>
            {health?.subtitleAgent ? 'ONLINE' : '—'}
          </div></div>
        <div style={card}><div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Fila</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{dashboard?.queue ?? '—'}</div></div>
        <div style={card}><div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Processando</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700 }}>{dashboard?.processing ?? '—'}</div></div>
        <div style={card}><div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Prontas hoje</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#10b981' }}>{dashboard?.readyToday ?? '—'}</div></div>
        <div style={card}><div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Falhas</div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#ef4444' }}>{dashboard?.failed ?? '—'}</div></div>
      </div>

      {/* Health (FASE 67) */}
      <div style={{ ...card, marginTop: 16, fontSize: '0.85rem' }}>
        <strong style={{ fontSize: '0.9rem' }}>Saúde dos Serviços</strong>
        <div style={{ display: 'flex', gap: 18, flexWrap: 'wrap', marginTop: 8 }}>
          <span>FFmpeg: <strong style={{ color: health?.ffmpeg === 'ONLINE' ? '#10b981' : '#ef4444' }}>{health?.ffmpeg || '…'}</strong></span>
          <span>ASR ({health?.asr?.provider || '—'}): <strong style={{ color: health?.asr?.status === 'ONLINE' ? '#10b981' : '#f59e0b' }}>{health?.asr?.status || '…'}</strong></span>
          <span>VSAIROUTER: <strong style={{ color: health?.vsairouter?.status === 'ONLINE' ? '#10b981' : '#f59e0b' }}>{health?.vsairouter?.status || '…'}</strong></span>
          <span>Storage: <strong style={{ color: health?.storage?.exists ? '#10b981' : '#f59e0b' }}>{health?.storage?.exists ? 'OK' : 'ausente'}</strong></span>
          <span>Minutos de áudio hoje: <strong>{health?.subtitleAgent?.dailyMinutes ?? 0}</strong></span>
        </div>
      </div>

      {/* Job atual (FASE 50) */}
      {dashboard?.current && (
        <div style={{ ...card, marginTop: 16 }}>
          <strong style={{ fontSize: '0.9rem' }}>Job atual</strong>
          <div style={{ marginTop: 6, fontSize: '0.9rem' }}>
            <div><strong>{dashboard.current.title || `Conteúdo #${dashboard.current.content_id}`}</strong></div>
            <div>Status: <span style={{ color: STATUS_COLORS[dashboard.current.status] || '#fff', fontWeight: 600 }}>{dashboard.current.status}</span> · Etapa: {dashboard.current.current_stage}</div>
            <div style={{ background: '#0b0f1a', borderRadius: 6, marginTop: 8, height: 10, overflow: 'hidden' }}>
              <div style={{ width: `${dashboard.current.progress || 0}%`, height: '100%', background: 'linear-gradient(90deg,#6366f1,#8b5cf6)', transition: 'width 1s' }} />
            </div>
            <div style={{ fontSize: '0.78rem', color: '#94a3b8', marginTop: 4 }}>{dashboard.current.progress || 0}%</div>
          </div>
        </div>
      )}

      {/* Fila (FASE 51) */}
      <div style={{ ...card, marginTop: 16, overflowX: 'auto' }}>
        <strong style={{ fontSize: '0.9rem' }}>Fila de Jobs</strong>
        <table style={{ width: '100%', borderCollapse: 'collapse', marginTop: 10, fontSize: '0.82rem' }}>
          <thead>
            <tr style={{ color: '#94a3b8', textAlign: 'left' }}>
              <th style={{ padding: '6px 8px' }}>Conteúdo</th>
              <th style={{ padding: '6px 8px' }}>Tipo</th>
              <th style={{ padding: '6px 8px' }}>Idioma</th>
              <th style={{ padding: '6px 8px' }}>Prioridade</th>
              <th style={{ padding: '6px 8px' }}>Progresso</th>
              <th style={{ padding: '6px 8px' }}>Status</th>
              <th style={{ padding: '6px 8px' }}>Tentativas</th>
              <th style={{ padding: '6px 8px' }}>Ações</th>
            </tr>
          </thead>
          <tbody>
            {jobs.map((j) => (
              <tr key={j.id} style={{ borderTop: '1px solid rgba(255,255,255,0.05)' }}>
                <td style={{ padding: '6px 8px' }}>{j.title || `#${j.content_id}`}</td>
                <td style={{ padding: '6px 8px' }}>{j.source_type === 'series_episode' ? 'Episódio' : 'Filme'}</td>
                <td style={{ padding: '6px 8px' }}>{j.target_language}</td>
                <td style={{ padding: '6px 8px' }}>{j.priority >= 20 ? 'ALTA' : j.priority >= 10 ? 'DEMANDA' : 'BACKGROUND'}</td>
                <td style={{ padding: '6px 8px' }}>{j.progress}%</td>
                <td style={{ padding: '6px 8px', color: STATUS_COLORS[j.status] || '#fff', fontWeight: 600 }}>
                  {j.status}{j.error_code ? ` (${j.error_code})` : ''}
                </td>
                <td style={{ padding: '6px 8px' }}>{j.attempts}/{j.max_attempts}</td>
                <td style={{ padding: '6px 8px', display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {j.status !== 'READY' && j.status !== 'PAUSED' && (
                    <button onClick={() => runAction(j.id, 'PAUSE')} style={btnStyle}>Pausar</button>
                  )}
                  {j.status === 'PAUSED' && (
                    <button onClick={() => runAction(j.id, 'RESUME')} style={btnStyle}>Retomar</button>
                  )}
                  {(j.status === 'FAILED' || j.status === 'CANCELLED') && (
                    <button onClick={() => runAction(j.id, 'RETRY')} style={btnStyle}>Tentar novamente</button>
                  )}
                  {j.status !== 'READY' && (
                    <button onClick={() => runAction(j.id, 'CANCEL')} style={{ ...btnStyle, color: '#fca5a5' }}>Cancelar</button>
                  )}
                </td>
              </tr>
            ))}
            {!jobs.length && (
              <tr><td colSpan={8} style={{ padding: 12, color: '#94a3b8' }}>Nenhum job na fila.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
