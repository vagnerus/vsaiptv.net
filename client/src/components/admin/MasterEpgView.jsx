import React, { useState, useEffect, useCallback } from 'react';
import api from '../../services/api';
import { 
  Calendar, RefreshCw, Sparkles, Trash2, Search, Filter, 
  Tv, Clock, CheckCircle2, AlertCircle, ChevronLeft, ChevronRight, 
  Edit3, X, Check, Radio, Layers
} from 'lucide-react';

export default function MasterEpgView({ notify }) {
  const [stats, setStats] = useState(null);
  const [channels, setChannels] = useState([]);
  const [categories, setCategories] = useState([]);
  const [loading, setLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);

  // Filters & Pagination
  const [search, setSearch] = useState('');
  const [categoryId, setCategoryId] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [totalCount, setTotalCount] = useState(0);

  // Mapping Modal
  const [mappingChannel, setMappingChannel] = useState(null);
  const [epgIdInput, setEpgIdInput] = useState('');

  // Fetch EPG Statistics
  const fetchStats = async () => {
    try {
      const res = await api.get('/api/admin/epg/stats');
      setStats(res.data);
    } catch (err) {
      console.error('Error fetching EPG stats:', err);
    }
  };

  // Fetch Live Categories for filter
  const fetchCategories = async () => {
    try {
      const res = await api.get('/api/admin/categories');
      const liveCats = (res.data || []).filter(c => c.type === 'live' || !c.type);
      setCategories(liveCats);
    } catch (err) {
      console.error('Error fetching categories:', err);
    }
  };

  // Fetch Channels with EPG
  const fetchChannels = useCallback(async () => {
    try {
      setLoading(true);
      const params = {
        page,
        limit: 30,
        search: search.trim() || undefined,
        category_id: categoryId !== 'all' ? categoryId : undefined
      };
      const res = await api.get('/api/admin/epg/channels', { params });
      setChannels(res.data.channels || []);
      setTotalPages(res.data.pagination?.totalPages || 1);
      setTotalCount(res.data.pagination?.total || 0);
    } catch (err) {
      console.error('Error fetching EPG channels:', err);
      if (notify) notify('Erro ao carregar canais do EPG', 'error');
    } finally {
      setLoading(false);
    }
  }, [page, search, categoryId, notify]);

  useEffect(() => {
    fetchStats();
    fetchCategories();
  }, []);

  useEffect(() => {
    fetchChannels();
  }, [fetchChannels]);

  // Actions
  const handleGenerateBase = async () => {
    try {
      setActionLoading(true);
      const res = await api.post('/api/admin/epg/generate-base');
      if (notify) notify(res.data.message || 'Grade base nacional gerada com sucesso!', 'success');
      await Promise.all([fetchStats(), fetchChannels()]);
    } catch (err) {
      if (notify) notify(err.response?.data?.error || 'Erro ao gerar grade base', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleSyncEpg = async () => {
    try {
      setActionLoading(true);
      const res = await api.post('/api/admin/epg/sync');
      if (notify) notify(res.data.message || 'EPG sincronizado com sucesso!', 'success');
      await Promise.all([fetchStats(), fetchChannels()]);
    } catch (err) {
      if (notify) notify(err.response?.data?.error || 'Erro ao sincronizar EPG', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  const handleCleanupExpired = async () => {
    if (!window.confirm('Deseja remover todos os programas já encerrados há mais de 24 horas?')) return;
    try {
      setActionLoading(true);
      const res = await api.delete('/api/admin/epg/cleanup');
      if (notify) notify(res.data.message || 'Programas antigos limpos com sucesso!', 'success');
      await Promise.all([fetchStats(), fetchChannels()]);
    } catch (err) {
      if (notify) notify('Erro ao limpar programas antigos', 'error');
    } finally {
      setActionLoading(false);
    }
  };

  // Open Mapping Modal
  const openMapping = (ch) => {
    setMappingChannel(ch);
    setEpgIdInput(ch.epg_channel_id || '');
  };

  // Save Channel EPG ID
  const handleSaveMapping = async (e) => {
    e.preventDefault();
    if (!mappingChannel) return;
    try {
      await api.put(`/api/admin/epg/channels/${mappingChannel.id}`, {
        epg_channel_id: epgIdInput.trim() || null
      });
      if (notify) notify(`EPG de ${mappingChannel.name} atualizado!`, 'success');
      setMappingChannel(null);
      fetchChannels();
      fetchStats();
    } catch (err) {
      if (notify) notify(err.response?.data?.error || 'Erro ao salvar mapeamento EPG', 'error');
    }
  };

  const commonEpgIds = [
    'globo.br', 'sbt.br', 'record.br', 'band.br', 'redetv.br',
    'sportv.br', 'sportv2.br', 'sportv3.br', 'espn.br', 'espn2.br', 'espn4.br',
    'telecine.premium.br', 'telecine.action.br', 'telecine.pipoca.br',
    'hbo.br', 'hbo2.br', 'warner.br', 'tnt.br', 'universal.br',
    'discovery.br', 'history.br', 'nationalgeographic.br',
    'cartoon.br', 'disney.br', 'gloob.br',
    'globonews.br', 'cnn.br', 'bandnews.br',
    'premiere1.br', 'premiere2.br', 'combate.br'
  ];

  // Helper to format date / time
  const formatTime = (iso) => {
    if (!iso) return '';
    try {
      const d = new Date(iso);
      return d.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
    } catch {
      return '';
    }
  };

  const formatDate = (iso) => {
    if (!iso) return 'N/A';
    try {
      const d = new Date(iso);
      return d.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
    } catch {
      return 'N/A';
    }
  };

  // Calculate live progress %
  const getProgress = (start, end) => {
    if (!start || !end) return 0;
    try {
      const s = new Date(start).getTime();
      const e = new Date(end).getTime();
      const now = Date.now();
      if (now < s) return 0;
      if (now > e) return 100;
      return Math.round(((now - s) / (e - s)) * 100);
    } catch {
      return 0;
    }
  };

  return (
    <div className="animate-fade">
      {/* Header & Controls */}
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
            background: 'linear-gradient(135deg, #06b6d4 0%, #3b82f6 100%)',
            display: 'flex', alignItems: 'center', justifyContent: 'center'
          }}>
            <Calendar size={22} color="#fff" />
          </div>
          <div>
            <h2 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0, color: '#fff' }}>
              Guia de Programação (EPG)
            </h2>
            <p style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)', margin: 0 }}>
              Sincronização de grade XMLTV, geração de grade base contínua e monitoramento da programação ao vivo
            </p>
          </div>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', flexWrap: 'wrap' }}>
          <button 
            onClick={handleGenerateBase}
            disabled={actionLoading}
            className="btn btn-primary btn-sm"
            style={{ 
              display: 'flex', alignItems: 'center', gap: '6px',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #6366f1 100%)',
              border: 'none', fontWeight: 600
            }}
            title="Gera 7 dias de programação realista e contínua para as principais emissoras nacionais"
          >
            <Sparkles size={14} className={actionLoading ? 'animate-spin' : ''} />
            <span>⚡ Gerar Grade Base Nacional</span>
          </button>

          <button 
            onClick={handleSyncEpg}
            disabled={actionLoading}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
            title="Sincroniza grade de programação via feeds XMLTV oficiais"
          >
            <RefreshCw size={14} className={actionLoading ? 'animate-spin' : ''} />
            <span>Sincronizar Feed</span>
          </button>

          <button 
            onClick={handleCleanupExpired}
            disabled={actionLoading}
            className="btn btn-secondary btn-sm"
            style={{ display: 'flex', alignItems: 'center', gap: '6px', color: '#f59e0b' }}
            title="Remove registros de programas passados há mais de 24h"
          >
            <Trash2 size={14} />
            <span>Limpar Expirados</span>
          </button>
        </div>
      </div>

      {/* Live Operational Stats Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))',
        gap: '16px',
        marginBottom: '24px'
      }}>
        <div style={{ padding: '18px', background: 'var(--card-bg, #141824)', borderRadius: '10px', border: '1px solid var(--border-color, #232a3e)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <Tv size={18} color="#3b82f6" />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)' }}>Canais com Programação</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#3b82f6' }}>
            {stats?.channelsWithPrograms?.toLocaleString() || 0}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim, #8b9bb4)', marginTop: '4px' }}>
            de {stats?.totalLive?.toLocaleString() || 0} canais ao vivo ({stats?.coveragePercent || 0}% cobertos)
          </div>
        </div>

        <div style={{ padding: '18px', background: 'var(--card-bg, #141824)', borderRadius: '10px', border: '1px solid var(--border-color, #232a3e)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <Layers size={18} color="#10b981" />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)' }}>Programas Registrados</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#10b981' }}>
            {stats?.totalPrograms?.toLocaleString() || 0}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim, #8b9bb4)', marginTop: '4px' }}>
            Indexados no SQLite com busca ultrarrápida
          </div>
        </div>

        <div style={{ padding: '18px', background: 'var(--card-bg, #141824)', borderRadius: '10px', border: '1px solid var(--border-color, #232a3e)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <Radio size={18} color="#8b5cf6" />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)' }}>Canais Mapeados (tvg-id)</span>
          </div>
          <div style={{ fontSize: '1.6rem', fontWeight: 700, color: '#8b5cf6' }}>
            {stats?.mappedChannels?.toLocaleString() || 0}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim, #8b9bb4)', marginTop: '4px' }}>
            Canais com identificador XMLTV vinculado
          </div>
        </div>

        <div style={{ padding: '18px', background: 'var(--card-bg, #141824)', borderRadius: '10px', border: '1px solid var(--border-color, #232a3e)' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', marginBottom: '8px' }}>
            <Clock size={18} color="#06b6d4" />
            <span style={{ fontSize: '0.82rem', color: 'var(--text-dim, #8b9bb4)' }}>Grade Coberta Até</span>
          </div>
          <div style={{ fontSize: '1.2rem', fontWeight: 700, color: '#06b6d4', marginTop: '4px' }}>
            {formatDate(stats?.latestProgramEndTime)}
          </div>
          <div style={{ fontSize: '0.78rem', color: 'var(--text-dim, #8b9bb4)', marginTop: '6px' }}>
            Programação ativa e contínua
          </div>
        </div>
      </div>

      {/* Filter Bar */}
      <div style={{
        display: 'flex',
        gap: '12px',
        alignItems: 'center',
        flexWrap: 'wrap',
        marginBottom: '16px',
        padding: '16px',
        background: 'var(--card-bg, #141824)',
        borderRadius: '10px',
        border: '1px solid var(--border-color, #232a3e)'
      }}>
        {/* Search */}
        <div style={{ position: 'relative', flex: '1', minWidth: '220px' }}>
          <Search size={16} color="#8b9bb4" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input 
            type="text"
            placeholder="Buscar canal por nome..."
            value={search}
            onChange={(e) => { setSearch(e.target.value); setPage(1); }}
            style={{
              width: '100%',
              padding: '9px 12px 9px 36px',
              borderRadius: '8px',
              background: '#0d111d',
              border: '1px solid #232a3e',
              color: '#fff',
              fontSize: '0.85rem'
            }}
          />
        </div>

        {/* Category Filter */}
        <div style={{ minWidth: '200px' }}>
          <select
            value={categoryId}
            onChange={(e) => { setCategoryId(e.target.value); setPage(1); }}
            style={{
              width: '100%',
              padding: '9px 12px',
              borderRadius: '8px',
              background: '#0d111d',
              border: '1px solid #232a3e',
              color: '#fff',
              fontSize: '0.85rem'
            }}
          >
            <option value="all">Todas as Categorias ({categories.length})</option>
            {categories.map(c => (
              <option key={c.id} value={c.id}>{c.name}</option>
            ))}
          </select>
        </div>

        {/* Refresh List */}
        <button
          onClick={fetchChannels}
          disabled={loading}
          className="btn btn-secondary btn-sm"
          style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
        >
          <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          <span>Recarregar</span>
        </button>

        <span style={{ fontSize: '0.82rem', color: '#8b9bb4', marginLeft: 'auto' }}>
          Mostrando {channels.length} de {totalCount.toLocaleString()} canais
        </span>
      </div>

      {/* Channels & EPG Timeline Table */}
      <div style={{
        background: 'var(--card-bg, #141824)',
        border: '1px solid var(--border-color, #232a3e)',
        borderRadius: 'var(--radius-lg, 12px)',
        overflow: 'hidden'
      }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.86rem' }}>
            <thead>
              <tr style={{ background: '#0d111d', borderBottom: '1px solid var(--border-color, #232a3e)', color: '#8b9bb4' }}>
                <th style={{ padding: '12px 18px' }}>Emissora / Canal</th>
                <th style={{ padding: '12px 14px' }}>Categoria</th>
                <th style={{ padding: '12px 14px' }}>Identificador EPG</th>
                <th style={{ padding: '12px 16px', minWidth: '260px' }}>Programa No Ar (Ao Vivo)</th>
                <th style={{ padding: '12px 16px', minWidth: '200px' }}>A Seguir</th>
                <th style={{ padding: '12px 14px', textAlign: 'center' }}>Grade Salva</th>
                <th style={{ padding: '12px 18px', textAlign: 'right' }}>Ações</th>
              </tr>
            </thead>
            <tbody>
              {loading && channels.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#8b9bb4' }}>
                    <RefreshCw size={24} className="animate-spin" style={{ margin: '0 auto 10px' }} />
                    <p>Carregando grade de canais e programação...</p>
                  </td>
                </tr>
              ) : channels.length === 0 ? (
                <tr>
                  <td colSpan="7" style={{ padding: '40px', textAlign: 'center', color: '#8b9bb4' }}>
                    Nenhum canal encontrado com os filtros aplicados.
                  </td>
                </tr>
              ) : (
                channels.map((ch) => {
                  const current = ch.currentProgram;
                  const next = ch.nextProgram;
                  const progress = current ? getProgress(current.start_time, current.end_time) : 0;

                  return (
                    <tr key={ch.id} style={{ borderBottom: '1px solid #1c2438' }}>
                      {/* Channel Info */}
                      <td style={{ padding: '12px 18px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
                          <img 
                            src={ch.icon_url || '/placeholder.png'} 
                            alt={ch.name}
                            onError={(e) => { e.target.style.display = 'none'; }}
                            style={{
                              width: '38px',
                              height: '38px',
                              borderRadius: '8px',
                              objectFit: 'contain',
                              background: '#0d111d',
                              padding: '2px',
                              border: '1px solid #232a3e'
                            }}
                          />
                          <div>
                            <div style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.88rem' }}>
                              {ch.name}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b' }}>
                              ID #{ch.id}
                            </div>
                          </div>
                        </div>
                      </td>

                      {/* Category */}
                      <td style={{ padding: '12px 14px', color: '#94a3b8' }}>
                        <span style={{
                          padding: '3px 8px',
                          borderRadius: '6px',
                          background: 'rgba(255, 255, 255, 0.04)',
                          border: '1px solid rgba(255, 255, 255, 0.08)',
                          fontSize: '0.75rem'
                        }}>
                          {ch.category_name || 'Geral'}
                        </span>
                      </td>

                      {/* EPG ID */}
                      <td style={{ padding: '12px 14px' }}>
                        {ch.epg_channel_id ? (
                          <span style={{
                            padding: '3px 8px',
                            borderRadius: '6px',
                            background: 'rgba(59, 130, 246, 0.12)',
                            color: '#60a5fa',
                            border: '1px solid rgba(59, 130, 246, 0.25)',
                            fontSize: '0.76rem',
                            fontWeight: 600
                          }}>
                            {ch.epg_channel_id}
                          </span>
                        ) : (
                          <span style={{ color: '#64748b', fontSize: '0.76rem' }}>
                            —
                          </span>
                        )}
                      </td>

                      {/* Current Program with Live Progress Bar */}
                      <td style={{ padding: '12px 16px' }}>
                        {current ? (
                          <div>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '8px' }}>
                              <span style={{ fontWeight: 600, color: '#f8fafc', fontSize: '0.84rem' }}>
                                {current.title}
                              </span>
                              <span style={{ fontSize: '0.72rem', color: '#38bdf8', fontWeight: 700 }}>
                                {formatTime(current.start_time)} - {formatTime(current.end_time)}
                              </span>
                            </div>
                            {/* Progress bar */}
                            <div style={{
                              width: '100%',
                              height: '4px',
                              background: '#1e2638',
                              borderRadius: '2px',
                              marginTop: '6px',
                              overflow: 'hidden'
                            }}>
                              <div style={{
                                width: `${progress}%`,
                                height: '100%',
                                background: 'linear-gradient(90deg, #3b82f6, #06b6d4)',
                                borderRadius: '2px'
                              }} />
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: '#64748b', fontSize: '0.78rem', fontStyle: 'italic' }}>
                            Sem programação no momento
                          </span>
                        )}
                      </td>

                      {/* Next Program */}
                      <td style={{ padding: '12px 16px' }}>
                        {next ? (
                          <div>
                            <div style={{ color: '#cbd5e1', fontSize: '0.82rem' }}>
                              {next.title}
                            </div>
                            <div style={{ fontSize: '0.72rem', color: '#64748b', marginTop: '2px' }}>
                              Início às {formatTime(next.start_time)}
                            </div>
                          </div>
                        ) : (
                          <span style={{ color: '#64748b', fontSize: '0.78rem' }}>—</span>
                        )}
                      </td>

                      {/* Programs Count */}
                      <td style={{ padding: '12px 14px', textAlign: 'center' }}>
                        <span style={{
                          padding: '4px 10px',
                          borderRadius: '12px',
                          background: ch.programs_count > 0 ? 'rgba(16, 185, 129, 0.15)' : 'rgba(255, 255, 255, 0.04)',
                          color: ch.programs_count > 0 ? '#10b981' : '#64748b',
                          fontWeight: 700,
                          fontSize: '0.76rem'
                        }}>
                          {ch.programs_count || 0}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '12px 18px', textAlign: 'right' }}>
                        <button
                          onClick={() => openMapping(ch)}
                          className="btn btn-secondary btn-sm"
                          style={{
                            padding: '5px 10px',
                            fontSize: '0.76rem',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '4px'
                          }}
                          title="Vincular identificador de canal EPG"
                        >
                          <Edit3 size={12} />
                          <span>{ch.epg_channel_id ? 'Editar EPG' : 'Vincular EPG'}</span>
                        </button>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {/* Pagination Footer */}
        {totalPages > 1 && (
          <div style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            padding: '14px 20px',
            borderTop: '1px solid var(--border-color, #232a3e)',
            background: '#0d111d'
          }}>
            <button
              onClick={() => setPage(p => Math.max(1, p - 1))}
              disabled={page <= 1}
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <ChevronLeft size={14} />
              <span>Anterior</span>
            </button>

            <span style={{ fontSize: '0.82rem', color: '#8b9bb4' }}>
              Página <strong>{page}</strong> de <strong>{totalPages}</strong> ({totalCount.toLocaleString()} canais)
            </span>

            <button
              onClick={() => setPage(p => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages}
              className="btn btn-secondary btn-sm"
              style={{ display: 'flex', alignItems: 'center', gap: '4px' }}
            >
              <span>Próxima</span>
              <ChevronRight size={14} />
            </button>
          </div>
        )}
      </div>

      {/* Modal: Vincular EPG ID */}
      {mappingChannel && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(0,0,0,0.75)',
          backdropFilter: 'blur(4px)',
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'center',
          zIndex: 1000,
          padding: '20px'
        }}>
          <div style={{
            background: '#141824',
            border: '1px solid #232a3e',
            borderRadius: '14px',
            width: '100%',
            maxWidth: '520px',
            boxShadow: '0 20px 40px rgba(0,0,0,0.5)',
            overflow: 'hidden'
          }}>
            <div style={{
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              padding: '16px 20px',
              borderBottom: '1px solid #232a3e'
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <Calendar size={18} color="#3b82f6" />
                <h3 style={{ margin: 0, fontSize: '1rem', fontWeight: 700, color: '#fff' }}>
                  Vincular EPG ao Canal
                </h3>
              </div>
              <button 
                onClick={() => setMappingChannel(null)}
                style={{ background: 'none', border: 'none', color: '#8b9bb4', cursor: 'pointer' }}
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleSaveMapping} style={{ padding: '20px' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginBottom: '16px' }}>
                <img 
                  src={mappingChannel.icon_url || '/placeholder.png'} 
                  alt={mappingChannel.name}
                  style={{ width: '42px', height: '42px', borderRadius: '8px', objectFit: 'contain', background: '#0d111d', border: '1px solid #232a3e', padding: '2px' }}
                />
                <div>
                  <div style={{ fontWeight: 700, color: '#fff', fontSize: '0.95rem' }}>
                    {mappingChannel.name}
                  </div>
                  <div style={{ fontSize: '0.76rem', color: '#64748b' }}>
                    Categoria: {mappingChannel.category_name || 'Geral'} • ID #{mappingChannel.id}
                  </div>
                </div>
              </div>

              <div style={{ marginBottom: '16px' }}>
                <label style={{ display: 'block', fontSize: '0.82rem', color: '#8b9bb4', marginBottom: '6px' }}>
                  Identificador XMLTV (epg_channel_id):
                </label>
                <input 
                  type="text"
                  placeholder="ex: globo.br, sportv.br, hbo.br"
                  value={epgIdInput}
                  onChange={(e) => setEpgIdInput(e.target.value)}
                  style={{
                    width: '100%',
                    padding: '10px 14px',
                    borderRadius: '8px',
                    background: '#0d111d',
                    border: '1px solid #232a3e',
                    color: '#fff',
                    fontSize: '0.9rem'
                  }}
                />
              </div>

              <div style={{ marginBottom: '20px' }}>
                <label style={{ display: 'block', fontSize: '0.78rem', color: '#8b9bb4', marginBottom: '8px' }}>
                  Ou selecione um identificador padrão rápido:
                </label>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px', maxHeight: '140px', overflowY: 'auto', padding: '4px' }}>
                  {commonEpgIds.map(id => (
                    <button
                      key={id}
                      type="button"
                      onClick={() => setEpgIdInput(id)}
                      style={{
                        padding: '4px 8px',
                        borderRadius: '6px',
                        background: epgIdInput === id ? '#3b82f6' : '#1c2438',
                        color: '#fff',
                        border: '1px solid #2d374d',
                        fontSize: '0.72rem',
                        cursor: 'pointer'
                      }}
                    >
                      {id}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setMappingChannel(null)}
                  className="btn btn-secondary btn-sm"
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  style={{ display: 'flex', alignItems: 'center', gap: '6px' }}
                >
                  <Check size={14} />
                  <span>Salvar Mapeamento</span>
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
