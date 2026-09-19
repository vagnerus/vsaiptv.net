import React, { useState, useEffect } from 'react';
import { 
  Film, Tv, Search, Filter, Plus, Edit, Trash2, Image as ImageIcon,
  ChevronLeft, ChevronRight, RefreshCw, AlertCircle, Check, X,
  ExternalLink, Crop, Play, Layers
} from 'lucide-react';
import api from '../../services/api';
import ImageEditorModal from './ImageEditorModal';

export default function MasterCatalogView({ notify, onOpenM3UImport }) {
  const [streams, setStreams] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [loading, setLoading] = useState(false);

  // Filters
  const [activeTypeTab, setActiveTypeTab] = useState('all'); // 'all' | 'live' | 'movie' | 'series' | 'novelas'
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [healthFilter, setHealthFilter] = useState('all');
  const [imageFilter, setImageFilter] = useState('all'); // 'all' | 'has_image' | 'missing'
  const [categories, setCategories] = useState([]);

  // Modals & Drawers
  const [editingStream, setEditingStream] = useState(null); // content edit drawer
  const [imageEditingStream, setImageEditingStream] = useState(null); // image editor modal

  // Fetch Categories for dropdown
  useEffect(() => {
    const fetchCategories = async () => {
      try {
        const res = await api.get('/api/admin/categories');
        setCategories(res.data);
      } catch (err) {
        console.error('Error fetching categories:', err);
      }
    };
    fetchCategories();
  }, []);

  // Fetch Streams with server-side pagination & filters
  const fetchStreams = async () => {
    setLoading(true);
    try {
      const params = {
        page,
        limit: 50,
        type: activeTypeTab,
        category_id: selectedCategory,
        health_status: healthFilter,
        image_filter: imageFilter
      };
      if (searchTerm.trim()) {
        params.search = searchTerm.trim();
      }

      const res = await api.get('/api/admin/streams', { params });
      if (res.data && res.data.streams) {
        setStreams(res.data.streams);
        setTotal(res.data.total || 0);
        setTotalPages(res.data.totalPages || 1);
      } else if (Array.isArray(res.data)) {
        setStreams(res.data.slice(0, 50));
        setTotal(res.data.length);
        setTotalPages(Math.ceil(res.data.length / 50));
      }
    } catch (err) {
      console.error('Error loading streams:', err);
      if (notify) notify('Não foi possível carregar o catálogo.', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStreams();
  }, [page, activeTypeTab, selectedCategory, healthFilter, imageFilter]);

  // Search submit
  const handleSearchSubmit = (e) => {
    e.preventDefault();
    setPage(1);
    fetchStreams();
  };

  // Content edit drawer submit
  const handleSaveStreamEdit = async (e) => {
    e.preventDefault();
    if (!editingStream) return;

    try {
      await api.put(`/api/admin/streams/${editingStream.id}`, editingStream);
      if (notify) notify('Conteúdo atualizado com sucesso!', 'success');
      setEditingStream(null);
      fetchStreams();
    } catch (err) {
      console.error(err);
      if (notify) notify(err.response?.data?.error || 'Erro ao atualizar conteúdo', 'error');
    }
  };

  // Delete stream
  const handleDeleteStream = async (id, name) => {
    if (!window.confirm(`Deseja realmente remover o conteúdo "${name}" (ID #${id}) do catálogo?`)) return;
    try {
      await api.delete(`/api/admin/streams/${id}`);
      if (notify) notify(`Conteúdo "${name}" excluído.`, 'success');
      fetchStreams();
    } catch (err) {
      console.error(err);
      if (notify) notify('Erro ao remover conteúdo', 'error');
    }
  };

  const typeTabs = [
    { id: 'all', label: 'Todos' },
    { id: 'live', label: 'TV Ao Vivo' },
    { id: 'movie', label: 'Filmes' },
    { id: 'series', label: 'Séries' },
    { id: 'novelas', label: 'Novelas' }
  ];

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Bar: Title, Count & Action Buttons */}
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
              background: 'linear-gradient(135deg, #a78bfa 0%, #38bdf8 100%)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff'
            }}>
              <Film size={20} />
            </div>
            <div>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800, margin: 0, color: '#f8fafc' }}>
                Catálogo de Canais & VOD
              </h2>
              <span style={{ fontSize: '0.8rem', color: '#94a3b8' }}>
                Total cadastrado: <strong style={{ color: '#38bdf8' }}>{total.toLocaleString('pt-BR')}</strong> conteúdos
              </span>
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
          <button
            onClick={fetchStreams}
            disabled={loading}
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
              borderRadius: '8px',
              color: '#cbd5e1',
              padding: '8px 14px',
              fontSize: '0.84rem',
              fontWeight: '600',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '6px'
            }}
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
            <span>Atualizar</span>
          </button>

          {onOpenM3UImport && (
            <button
              onClick={onOpenM3UImport}
              style={{
                background: 'linear-gradient(135deg, #8b5cf6, #06b6d4)',
                border: 'none',
                borderRadius: '8px',
                color: '#fff',
                padding: '8px 16px',
                fontSize: '0.84rem',
                fontWeight: '700',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '8px'
              }}
            >
              <span>Importar M3U</span>
            </button>
          )}
        </div>
      </div>

      {/* Tabs / Content Type Filter */}
      <div style={{
        display: 'flex',
        gap: '8px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        paddingBottom: '2px',
        overflowX: 'auto'
      }}>
        {typeTabs.map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => {
              setActiveTypeTab(t.id);
              setPage(1);
            }}
            style={{
              padding: '10px 18px',
              borderRadius: '8px 8px 0 0',
              border: 'none',
              background: activeTypeTab === t.id ? 'rgba(139, 92, 246, 0.2)' : 'transparent',
              borderBottom: activeTypeTab === t.id ? '2px solid #a78bfa' : '2px solid transparent',
              color: activeTypeTab === t.id ? '#fff' : '#94a3b8',
              fontWeight: activeTypeTab === t.id ? '700' : '500',
              fontSize: '0.88rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
              transition: 'all 0.15s ease'
            }}
          >
            {t.label}
          </button>
        ))}
      </div>

      {/* Filter & Search Bar */}
      <div style={{
        display: 'flex',
        flexWrap: 'wrap',
        gap: '12px',
        alignItems: 'center',
        background: '#131828',
        padding: '16px',
        borderRadius: '12px',
        border: '1px solid rgba(255, 255, 255, 0.06)'
      }}>
        {/* Search Input */}
        <form onSubmit={handleSearchSubmit} style={{ flex: '1 1 240px', display: 'flex', gap: '8px' }}>
          <div style={{ position: 'relative', width: '100%' }}>
            <Search size={16} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Buscar por nome ou URL..."
              style={{
                width: '100%',
                padding: '8px 12px 8px 36px',
                borderRadius: '8px',
                background: '#090d16',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                color: '#fff',
                fontSize: '0.84rem'
              }}
            />
          </div>
          <button
            type="submit"
            style={{
              background: 'rgba(255, 255, 255, 0.08)',
              border: 'none',
              borderRadius: '8px',
              color: '#fff',
              padding: '0 14px',
              cursor: 'pointer',
              fontSize: '0.82rem',
              fontWeight: '600'
            }}
          >
            Buscar
          </button>
        </form>

        {/* Category Dropdown */}
        <select
          value={selectedCategory}
          onChange={(e) => {
            setSelectedCategory(e.target.value);
            setPage(1);
          }}
          style={{
            padding: '8px 12px',
            borderRadius: '8px',
            background: '#090d16',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            color: '#cbd5e1',
            fontSize: '0.82rem',
            cursor: 'pointer',
            maxWidth: '200px'
          }}
        >
          <option value="all">Todas as Categorias</option>
          {categories.map((c) => (
            <option key={c.id} value={c.id}>{c.name}</option>
          ))}
        </select>

        {/* Image Filter */}
        <select
          value={imageFilter}
          onChange={(e) => {
            setImageFilter(e.target.value);
            setPage(1);
          }}
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
          <option value="all">Imagens: Todas</option>
          <option value="has_image">Com Imagem</option>
          <option value="missing">Sem Imagem</option>
        </select>

        {/* Health Status Filter */}
        <select
          value={healthFilter}
          onChange={(e) => {
            setHealthFilter(e.target.value);
            setPage(1);
          }}
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
          <option value="all">Saúde: Todas</option>
          <option value="online">Online</option>
          <option value="unstable">Instável</option>
          <option value="offline">Offline</option>
          <option value="unknown">Não Verificado</option>
        </select>
      </div>

      {/* Catalog Table */}
      <div style={{
        background: '#131828',
        borderRadius: '14px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        overflow: 'hidden'
      }}>
        {loading ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
            <RefreshCw size={28} className="animate-spin" style={{ margin: '0 auto 12px auto' }} />
            <div>Carregando catálogo com paginação server-side...</div>
          </div>
        ) : streams.length === 0 ? (
          <div style={{ padding: '60px 20px', textAlign: 'center', color: '#94a3b8' }}>
            <AlertCircle size={32} style={{ margin: '0 auto 12px auto', color: '#fbbf24' }} />
            <div style={{ fontSize: '1rem', fontWeight: '700', color: '#f8fafc' }}>
              Nenhum conteúdo encontrado
            </div>
            <div style={{ fontSize: '0.82rem', marginTop: '4px' }}>
              Tente alterar os filtros ou termo de busca.
            </div>
          </div>
        ) : (
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: '0.85rem' }}>
              <thead>
                <tr style={{ background: '#090d16', borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8' }}>
                  <th style={{ padding: '12px 16px', width: '60px' }}>Foto</th>
                  <th style={{ padding: '12px 16px' }}>Nome & Detalhes</th>
                  <th style={{ padding: '12px 16px' }}>Tipo</th>
                  <th style={{ padding: '12px 16px' }}>Categoria</th>
                  <th style={{ padding: '12px 16px' }}>Saúde Stream</th>
                  <th style={{ padding: '12px 16px', textAlign: 'right' }}>Ações</th>
                </tr>
              </thead>
              <tbody>
                {streams.map((s) => {
                  const thumb = s.poster_url || s.icon_url;
                  return (
                    <tr 
                      key={s.id} 
                      style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)', transition: 'background 0.15s ease' }}
                      onMouseEnter={(e) => e.currentTarget.style.background = 'rgba(255, 255, 255, 0.02)'}
                      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
                    >
                      {/* Image Preview & Quick Edit */}
                      <td style={{ padding: '10px 16px' }}>
                        <div 
                          onClick={() => setImageEditingStream(s)}
                          style={{
                            width: '42px',
                            height: s.type === 'movie' || s.type === 'series' ? '56px' : '36px',
                            borderRadius: '6px',
                            overflow: 'hidden',
                            background: '#1a1f33',
                            border: '1px solid rgba(255, 255, 255, 0.1)',
                            cursor: 'pointer',
                            position: 'relative',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center'
                          }}
                          title="Clique para editar ou recortar imagem"
                        >
                          {thumb ? (
                            <img
                              src={thumb}
                              alt=""
                              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                              onError={(e) => { e.target.style.display = 'none'; }}
                            />
                          ) : (
                            <ImageIcon size={16} color="#64748b" />
                          )}
                        </div>
                      </td>

                      {/* Name & URL */}
                      <td style={{ padding: '10px 16px' }}>
                        <div style={{ fontWeight: '700', color: '#f8fafc', fontSize: '0.9rem' }}>
                          {s.name}
                        </div>
                        <div style={{ fontSize: '0.75rem', color: '#64748b', maxWidth: '340px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', marginTop: '2px' }}>
                          {s.stream_url || 'Sem URL de stream'}
                        </div>
                      </td>

                      {/* Type Badge */}
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: '700',
                          padding: '3px 8px',
                          borderRadius: '6px',
                          textTransform: 'uppercase',
                          background: s.type === 'live' ? 'rgba(56, 189, 248, 0.15)' : s.type === 'movie' ? 'rgba(139, 92, 246, 0.15)' : 'rgba(236, 72, 153, 0.15)',
                          color: s.type === 'live' ? '#38bdf8' : s.type === 'movie' ? '#a78bfa' : '#f472b6',
                          border: `1px solid ${s.type === 'live' ? 'rgba(56, 189, 248, 0.3)' : s.type === 'movie' ? 'rgba(139, 92, 246, 0.3)' : 'rgba(236, 72, 153, 0.3)'}`
                        }}>
                          {s.type === 'live' ? 'TV' : s.type === 'movie' ? 'Filme' : 'Série'}
                        </span>
                      </td>

                      {/* Category */}
                      <td style={{ padding: '10px 16px', color: '#cbd5e1' }}>
                        {s.category_name || 'Geral'}
                      </td>

                      {/* Health Status */}
                      <td style={{ padding: '10px 16px' }}>
                        <span style={{
                          fontSize: '0.72rem',
                          fontWeight: '700',
                          padding: '2px 8px',
                          borderRadius: '6px',
                          background: s.health_status === 'online' ? 'rgba(52, 211, 153, 0.15)' : s.health_status === 'offline' ? 'rgba(248, 113, 113, 0.15)' : 'rgba(148, 163, 184, 0.15)',
                          color: s.health_status === 'online' ? '#34d399' : s.health_status === 'offline' ? '#f87171' : '#94a3b8',
                          border: `1px solid ${s.health_status === 'online' ? 'rgba(52, 211, 153, 0.3)' : s.health_status === 'offline' ? 'rgba(248, 113, 113, 0.3)' : 'rgba(148, 163, 184, 0.3)'}`
                        }}>
                          {s.health_status === 'online' ? 'Online' : s.health_status === 'offline' ? 'Offline' : s.health_status === 'unstable' ? 'Instável' : 'Não verificado'}
                        </span>
                      </td>

                      {/* Actions */}
                      <td style={{ padding: '10px 16px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '6px' }}>
                          <button
                            onClick={() => setImageEditingStream(s)}
                            style={{
                              background: 'rgba(139, 92, 246, 0.12)',
                              border: '1px solid rgba(139, 92, 246, 0.3)',
                              color: '#a78bfa',
                              padding: '6px 10px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.78rem'
                            }}
                            title="Editor de imagem e recorte"
                          >
                            <Crop size={13} />
                            <span>Imagem</span>
                          </button>

                          <button
                            onClick={() => setEditingStream(s)}
                            style={{
                              background: 'rgba(255, 255, 255, 0.06)',
                              border: '1px solid rgba(255, 255, 255, 0.1)',
                              color: '#cbd5e1',
                              padding: '6px 10px',
                              borderRadius: '6px',
                              cursor: 'pointer',
                              display: 'flex',
                              alignItems: 'center',
                              gap: '4px',
                              fontSize: '0.78rem'
                            }}
                            title="Editar conteúdo"
                          >
                            <Edit size={13} />
                            <span>Editar</span>
                          </button>

                          <button
                            onClick={() => handleDeleteStream(s.id, s.name)}
                            style={{
                              background: 'rgba(239, 68, 68, 0.12)',
                              border: '1px solid rgba(239, 68, 68, 0.3)',
                              color: '#f87171',
                              padding: '6px 8px',
                              borderRadius: '6px',
                              cursor: 'pointer'
                            }}
                            title="Excluir"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        {/* Pagination Bar */}
        <div style={{
          padding: '14px 20px',
          background: '#090d16',
          borderTop: '1px solid rgba(255, 255, 255, 0.08)',
          display: 'flex',
          justifyContent: 'space-between',
          alignItems: 'center',
          flexWrap: 'wrap',
          gap: '12px'
        }}>
          <span style={{ fontSize: '0.82rem', color: '#94a3b8' }}>
            Página <strong style={{ color: '#fff' }}>{page}</strong> de <strong style={{ color: '#fff' }}>{totalPages}</strong> ({total.toLocaleString('pt-BR')} itens)
          </span>

          <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
            <button
              onClick={() => setPage((p) => Math.max(1, p - 1))}
              disabled={page <= 1 || loading}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: page <= 1 ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.06)',
                color: page <= 1 ? '#64748b' : '#cbd5e1',
                cursor: page <= 1 ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.8rem'
              }}
            >
              <ChevronLeft size={14} /> Anterior
            </button>

            <button
              onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
              disabled={page >= totalPages || loading}
              style={{
                padding: '6px 12px',
                borderRadius: '6px',
                border: '1px solid rgba(255, 255, 255, 0.1)',
                background: page >= totalPages ? 'rgba(255, 255, 255, 0.02)' : 'rgba(255, 255, 255, 0.06)',
                color: page >= totalPages ? '#64748b' : '#cbd5e1',
                cursor: page >= totalPages ? 'not-allowed' : 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: '4px',
                fontSize: '0.8rem'
              }}
            >
              Próxima <ChevronRight size={14} />
            </button>
          </div>
        </div>
      </div>

      {/* Content Editor Drawer / Modal */}
      {editingStream && (
        <div style={{
          position: 'fixed',
          inset: 0,
          background: 'rgba(5, 7, 15, 0.8)',
          backdropFilter: 'blur(6px)',
          display: 'flex',
          justifyContent: 'flex-end',
          zIndex: 1060
        }}>
          <div style={{
            width: '100%',
            maxWidth: '520px',
            background: '#131828',
            height: '100%',
            boxShadow: '-10px 0 30px rgba(0, 0, 0, 0.6)',
            display: 'flex',
            flexDirection: 'column'
          }}>
            <div style={{
              padding: '18px 24px',
              borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center'
            }}>
              <h3 style={{ margin: 0, fontSize: '1.1rem', fontWeight: '700', color: '#f8fafc' }}>
                Editar Conteúdo
              </h3>
              <button
                onClick={() => setEditingStream(null)}
                style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer' }}
              >
                <X size={20} />
              </button>
            </div>

            <form onSubmit={handleSaveStreamEdit} style={{ padding: '20px 24px', flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '14px' }}>
              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '4px' }}>
                  Nome / Título
                </label>
                <input
                  type="text"
                  value={editingStream.name || ''}
                  onChange={(e) => setEditingStream({ ...editingStream, name: e.target.value })}
                  required
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '4px' }}>
                  URL do Stream
                </label>
                <input
                  type="text"
                  value={editingStream.stream_url || ''}
                  onChange={(e) => setEditingStream({ ...editingStream, stream_url: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.85rem' }}
                />
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '4px' }}>
                    Tipo
                  </label>
                  <select
                    value={editingStream.type || 'live'}
                    onChange={(e) => setEditingStream({ ...editingStream, type: e.target.value })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.85rem' }}
                  >
                    <option value="live">TV Ao Vivo</option>
                    <option value="movie">Filme</option>
                    <option value="series">Série</option>
                  </select>
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '4px' }}>
                    Categoria
                  </label>
                  <select
                    value={editingStream.category_id || ''}
                    onChange={(e) => setEditingStream({ ...editingStream, category_id: e.target.value ? parseInt(e.target.value) : null })}
                    style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.85rem' }}
                  >
                    <option value="">Sem categoria</option>
                    {categories.map((c) => (
                      <option key={c.id} value={c.id}>{c.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '4px' }}>
                  Logo / Ícone URL
                </label>
                <input
                  type="text"
                  value={editingStream.icon_url || ''}
                  onChange={(e) => setEditingStream({ ...editingStream, icon_url: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '4px' }}>
                  Poster URL
                </label>
                <input
                  type="text"
                  value={editingStream.poster_url || ''}
                  onChange={(e) => setEditingStream({ ...editingStream, poster_url: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.85rem' }}
                />
              </div>

              <div>
                <label style={{ display: 'block', fontSize: '0.8rem', color: '#cbd5e1', marginBottom: '4px' }}>
                  Descrição / Sinopse
                </label>
                <textarea
                  rows={3}
                  value={editingStream.description || ''}
                  onChange={(e) => setEditingStream({ ...editingStream, description: e.target.value })}
                  style={{ width: '100%', padding: '8px 12px', borderRadius: '6px', background: '#090d16', border: '1px solid rgba(255,255,255,0.1)', color: '#fff', fontSize: '0.85rem', resize: 'vertical' }}
                />
              </div>

              <div style={{ marginTop: 'auto', paddingTop: '16px', display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button
                  type="button"
                  onClick={() => setEditingStream(null)}
                  style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid rgba(255,255,255,0.1)', background: 'transparent', color: '#cbd5e1', cursor: 'pointer' }}
                >
                  Cancelar
                </button>
                <button
                  type="submit"
                  style={{ padding: '8px 20px', borderRadius: '6px', border: 'none', background: 'linear-gradient(135deg, #8b5cf6, #3b82f6)', color: '#fff', fontWeight: '700', cursor: 'pointer' }}
                >
                  Salvar Alterações
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Image Editor Modal */}
      {imageEditingStream && (
        <ImageEditorModal
          stream={imageEditingStream}
          onClose={() => setImageEditingStream(null)}
          onUpdated={(newUrl, field) => {
            fetchStreams();
          }}
          notify={notify}
        />
      )}
    </div>
  );
}
