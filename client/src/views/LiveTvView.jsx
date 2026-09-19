import React, { useState, useMemo } from 'react';
import MediaCard from '../components/MediaCard';
import { Search, X, Tv, Star, AlertCircle } from 'lucide-react';
import { useFavorites } from '../hooks/useFavorites';

export default function LiveTvView({
  channels = [],
  categories = [],
  selectedCategory,
  onSelectCategory,
  onPlayChannel,
  activeStreamId = null,
  isLoading = false,
  searchQuery = '',
  onSearchChange,
}) {
  const [internalSearch, setInternalSearch] = useState('');
  const [displayLimit, setDisplayLimit] = useState(60);
  const { favorites } = useFavorites();

  const search = onSearchChange ? searchQuery : internalSearch;
  const handleSearch = (val) => {
    if (onSearchChange) onSearchChange(val);
    else setInternalSearch(val);
    setDisplayLimit(60);
  };

  // Total real de canais baseado nas categorias do catálogo
  const totalCatalogChannels = useMemo(() => {
    if (categories && categories.length > 0) {
      const sum = categories.reduce((acc, cat) => acc + (cat.item_count || 0), 0);
      if (sum > 0) return sum;
    }
    return channels.length;
  }, [categories, channels]);

  // Contagem dinâmica de canais por categoria (fallback se item_count não vier)
  const categoryCounts = useMemo(() => {
    const counts = {};
    for (const c of channels) {
      const cid = String(c.category_id || '');
      counts[cid] = (counts[cid] || 0) + 1;
    }
    return counts;
  }, [channels]);

  // Exibe todas as categorias disponíveis retornadas pela API
  const visibleCategories = useMemo(() => {
    if (categories && categories.length > 0) return categories;
    return categories.filter((cat) => (cat.item_count > 0 || (categoryCounts[String(cat.id)] || 0) > 0));
  }, [categories, categoryCounts]);

  // Channels to filter: if 'favorites' category is selected, filter to favorites only.
  // If a category ID is selected, filter channels belonging to that category.
  const baseChannels = useMemo(() => {
    if (selectedCategory === 'favorites') {
      const favIds = new Set(favorites.map((f) => String(f.id)));
      return channels.filter((c) => favIds.has(String(c.id)));
    }
    if (selectedCategory !== null && selectedCategory !== undefined && selectedCategory !== '') {
      return channels.filter((c) => String(c.category_id) === String(selectedCategory));
    }
    return channels;
  }, [channels, selectedCategory, favorites]);

  // Filter channels by search
  const filteredChannels = useMemo(() => {
    if (!search.trim()) return baseChannels;
    const q = search.toLowerCase().trim();
    return baseChannels.filter((c) => c.name?.toLowerCase().includes(q));
  }, [baseChannels, search]);

  const displayed = useMemo(() => {
    return filteredChannels.slice(0, displayLimit);
  }, [filteredChannels, displayLimit]);

  const hasMore = filteredChannels.length > displayLimit;

  const scrollCategories = (direction) => {
    const bar = document.getElementById('livetv-cat-bar');
    if (bar) {
      bar.scrollBy({ left: direction * 280, behavior: 'smooth' });
    }
  };

  return (
    <div className="livetv-view-container animate-fade">
      {/* Header bar: Title & Channel search */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: 'var(--radius-md)',
            background: 'linear-gradient(135deg, #06b6d4, #3b82f6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Tv size={22} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#fff', margin: 0 }}>
              TV Ao Vivo
            </h1>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {selectedCategory 
                ? `${filteredChannels.length} canais na categoria selecionada`
                : `${totalCatalogChannels.toLocaleString()} canais transmitindo em tempo real`}
            </span>
          </div>
        </div>

        {/* Quick Search with preserved state */}
        <div style={{ position: 'relative', width: '280px', maxWidth: '100%' }}>
          <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            className="form-control"
            placeholder="Buscar canal..."
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            style={{ paddingLeft: '40px', paddingRight: '36px', height: '42px', borderRadius: 'var(--radius-full)' }}
          />
          {search && (
            <button
              onClick={() => handleSearch('')}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
              aria-label="Limpar busca"
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Category Pills Bar with Horizontal Scroll Navigation */}
      <div style={{ position: 'relative', display: 'flex', alignItems: 'center', margin: '16px 0 20px' }}>
        <button
          onClick={() => scrollCategories(-1)}
          className="btn btn-secondary"
          style={{
            minWidth: '32px',
            width: '32px',
            height: '32px',
            padding: 0,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginRight: '6px',
            flexShrink: 0,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)'
          }}
          aria-label="Rolar categorias para esquerda"
        >
          ‹
        </button>

        <div id="livetv-cat-bar" className="livetv-categories-bar no-scrollbar" style={{ flex: 1, margin: 0, overflowX: 'auto', scrollBehavior: 'smooth' }}>
          <button
            className={`livetv-cat-pill ${selectedCategory === null ? 'active' : ''}`}
            onClick={() => { onSelectCategory(null); setDisplayLimit(60); }}
          >
            Todos os Canais ({totalCatalogChannels.toLocaleString()})
          </button>

          <button
            className={`livetv-cat-pill ${selectedCategory === 'favorites' ? 'active' : ''}`}
            onClick={() => { onSelectCategory(selectedCategory === 'favorites' ? null : 'favorites'); setDisplayLimit(60); }}
            style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
          >
            <Star size={13} fill={selectedCategory === 'favorites' ? '#fff' : '#f59e0b'} color={selectedCategory === 'favorites' ? '#fff' : '#f59e0b'} />
            Favoritos ({favorites.filter(f => f.type === 'live').length})
          </button>

          {visibleCategories.map((cat) => {
            const isSelected = String(selectedCategory) === String(cat.id);
            const count = cat.item_count !== undefined ? cat.item_count : (categoryCounts[String(cat.id)] || 0);
            return (
              <button
                key={cat.id}
                className={`livetv-cat-pill ${isSelected ? 'active' : ''}`}
                onClick={() => {
                  onSelectCategory(isSelected ? null : cat.id);
                  setDisplayLimit(60);
                }}
              >
                {cat.name} ({count.toLocaleString()})
              </button>
            );
          })}
        </div>

        <button
          onClick={() => scrollCategories(1)}
          className="btn btn-secondary"
          style={{
            minWidth: '32px',
            width: '32px',
            height: '32px',
            padding: 0,
            borderRadius: '50%',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            marginLeft: '6px',
            flexShrink: 0,
            background: 'rgba(255,255,255,0.08)',
            border: '1px solid rgba(255,255,255,0.12)'
          }}
          aria-label="Rolar categorias para direita"
        >
          ›
        </button>
      </div>

      {/* Channels Grid */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <div className="spinner-circle" style={{ margin: '0 auto 16px' }} />
          <span>Sintonizando catálogo de canais...</span>
        </div>
      ) : displayed.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <AlertCircle size={36} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
          <h3>Nenhum canal encontrado</h3>
          <p style={{ fontSize: '0.85rem', marginTop: '6px' }}>
            {selectedCategory === 'favorites' 
              ? 'Você ainda não favoritou nenhum canal ao vivo. Clique na estrela do canal para salvá-lo aqui.'
              : 'Tente alterar a categoria ou o termo da pesquisa.'}
          </p>
        </div>
      ) : (
        <>
          <div className="livetv-channels-grid">
            {displayed.map((ch) => (
              <MediaCard
                key={ch.id}
                item={ch}
                onClick={() => onPlayChannel?.(ch)}
                onPlayDirect={() => onPlayChannel?.(ch)}
                isPlaying={String(activeStreamId) === String(ch.id)}
              />
            ))}
          </div>

          {/* Progressive Load Button */}
          {hasMore && (
            <div style={{ textAlign: 'center', padding: '24px 0 40px' }}>
              <button
                className="btn btn-secondary"
                style={{ borderRadius: 'var(--radius-full)', padding: '10px 28px', fontWeight: '700' }}
                onClick={() => setDisplayLimit((prev) => prev + 60)}
              >
                Carregar Mais Canais ({displayed.length} de {filteredChannels.length})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
