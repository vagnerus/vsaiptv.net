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

  // Channels to filter: if 'favorites' category is selected, filter to favorites only
  const baseChannels = useMemo(() => {
    if (selectedCategory === 'favorites') {
      const favIds = new Set(favorites.map((f) => String(f.id)));
      return channels.filter((c) => favIds.has(String(c.id)));
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
              {filteredChannels.length} canais transmitindo em tempo real
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

      {/* Category Pills Bar with 'Todos' and '★ Favoritos' */}
      <div className="livetv-categories-bar no-scrollbar">
        <button
          className={`livetv-cat-pill ${selectedCategory === null ? 'active' : ''}`}
          onClick={() => { onSelectCategory(null); setDisplayLimit(60); }}
        >
          Todos os Canais ({channels.length})
        </button>

        <button
          className={`livetv-cat-pill ${selectedCategory === 'favorites' ? 'active' : ''}`}
          onClick={() => { onSelectCategory('favorites'); setDisplayLimit(60); }}
          style={{ display: 'flex', alignItems: 'center', gap: '5px' }}
        >
          <Star size={13} fill={selectedCategory === 'favorites' ? '#fff' : '#f59e0b'} color={selectedCategory === 'favorites' ? '#fff' : '#f59e0b'} />
          Favoritos ({favorites.filter(f => f.type === 'live').length})
        </button>

        {categories.map((cat) => (
          <button
            key={cat.id}
            className={`livetv-cat-pill ${selectedCategory === cat.id ? 'active' : ''}`}
            onClick={() => { onSelectCategory(cat.id); setDisplayLimit(60); }}
          >
            {cat.name}
          </button>
        ))}
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
