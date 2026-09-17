import React, { useState, useMemo } from 'react';
import MediaCard from '../components/MediaCard';
import { Star, Tv, Film, Clapperboard, Layers, Compass, Trash2 } from 'lucide-react';
import { useFavorites } from '../hooks/useFavorites';

export default function FavoritesView({
  onItemClick,
  onPlayDirect,
  onExplore,
  activeStreamId = null,
}) {
  const { favorites } = useFavorites();
  const [filterType, setFilterType] = useState('all');

  const filtered = useMemo(() => {
    if (filterType === 'all') return favorites;
    return favorites.filter((f) => f.type === filterType);
  }, [favorites, filterType]);

  return (
    <div className="vod-grid-container animate-fade">
      {/* Header */}
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
            background: 'linear-gradient(135deg, #f59e0b, #eab308)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 20px rgba(245, 158, 11, 0.4)',
          }}>
            <Star size={22} color="#fff" fill="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#fff', margin: 0 }}>
              Meus Favoritos
            </h1>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {favorites.length} títulos salvos na sua lista pessoal
            </span>
          </div>
        </div>

        {/* Filter Pills */}
        <div style={{ display: 'flex', gap: '8px' }}>
          {[
            { id: 'all', label: `Todos (${favorites.length})` },
            { id: 'live', label: 'Canais' },
            { id: 'movie', label: 'Filmes' },
            { id: 'series', label: 'Séries' },
          ].map((tab) => (
            <button
              key={tab.id}
              className={`livetv-cat-pill ${filterType === tab.id ? 'active' : ''}`}
              onClick={() => setFilterType(tab.id)}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Grid or Empty state */}
      {filtered.length === 0 ? (
        <div style={{
          textAlign: 'center',
          padding: '80px 20px',
          background: 'rgba(255, 255, 255, 0.02)',
          borderRadius: 'var(--radius-lg)',
          border: '1px dashed rgba(255, 255, 255, 0.1)',
          marginTop: '16px',
        }}>
          <Star size={44} color="#f59e0b" style={{ margin: '0 auto 16px', opacity: 0.7 }} />
          <h2 style={{ fontSize: '1.3rem', fontWeight: '700', color: '#fff', marginBottom: '8px' }}>
            {favorites.length === 0 ? 'Sua lista de favoritos está vazia' : 'Nenhum item nesta categoria'}
          </h2>
          <p style={{ color: 'var(--text-muted)', fontSize: '0.9rem', maxWidth: '440px', margin: '0 auto 20px' }}>
            Clique na estrelinha em qualquer canal, filme ou série para salvar nesta tela e acessar rapidamente a qualquer momento.
          </p>
          {onExplore && (
            <button
              className="btn btn-primary"
              style={{ borderRadius: 'var(--radius-full)', padding: '10px 28px' }}
              onClick={onExplore}
            >
              <Compass size={17} style={{ marginRight: 6 }} /> Explorar Catálogo
            </button>
          )}
        </div>
      ) : (
        <div className="vod-catalog-grid">
          {filtered.map((item) => (
            <MediaCard
              key={item.id}
              item={item}
              onClick={() => onItemClick?.(item)}
              onPlayDirect={() => onPlayDirect?.(item)}
              isPlaying={String(activeStreamId) === String(item.id)}
            />
          ))}
        </div>
      )}
    </div>
  );
}
