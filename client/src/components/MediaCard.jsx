import React from 'react';
import { Play, Star } from 'lucide-react';
import { getImageUrl, getPlaceholder, onImageError, extractRealResolution } from '../utils/streamUtils';
import { useFavorites } from '../hooks/useFavorites';

export default function MediaCard({
  item,
  onClick,
  onPlayDirect,
  isPlaying = false,
}) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const isFav = isFavorite(item?.id);
  const isLive = item?.type === 'live' || item?.stream_type === 'live';
  const poster = getImageUrl(item);
  const title = item?.name || item?.title || 'Conteúdo';
  const realRes = extractRealResolution(title);

  const handleFavClick = (e) => {
    e.stopPropagation();
    toggleFavorite(item);
  };

  const handlePlayClick = (e) => {
    if (onPlayDirect) {
      e.stopPropagation();
      onPlayDirect(item);
    } else {
      onClick?.(item);
    }
  };

  if (isLive) {
    return (
      <div
        className={`media-card-live ${isPlaying ? 'card-playing' : ''}`}
        role="button"
        tabIndex={0}
        aria-label={`Canal ${title}`}
        onClick={() => onClick?.(item)}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault();
            onClick?.(item);
          }
        }}
      >
        <div className="media-card-live-thumb">
          <img
            src={poster || getPlaceholder(item)}
            alt={title}
            className="media-card-live-logo"
            loading="lazy"
            onError={(e) => onImageError(e, item)}
          />

          {/* Live Indicator Badge */}
          <span className="card-live-indicator">
            <span className="card-live-dot" /> AO VIVO
          </span>

          {/* Favorite Button */}
          <button
            className={`card-favorite-btn ${isFav ? 'favorited' : ''}`}
            onClick={handleFavClick}
            aria-label={isFav ? 'Remover dos favoritos' : 'Favoritar'}
            title={isFav ? 'Favoritado' : 'Adicionar aos favoritos'}
          >
            <Star size={13} fill={isFav ? '#f59e0b' : 'none'} color={isFav ? '#f59e0b' : '#cbd5e1'} />
          </button>

          {/* Play Bubble Overlay */}
          <div className="card-hover-overlay" onClick={handlePlayClick}>
            <div className="card-play-bubble">
              <Play size={18} fill="#fff" color="#fff" style={{ marginLeft: 2 }} />
            </div>
          </div>
        </div>

        <div className="media-card-info">
          <span className="media-card-name" title={title}>
            {title}
          </span>
          <div className="media-card-meta">
            <span style={{ fontSize: '0.74rem', color: 'var(--text-secondary)' }}>
              {item.category_name ? item.category_name.split('|')[0].trim() : 'TV'}
            </span>
            {realRes && (
              <span style={{ 
                fontSize: '0.68rem', 
                color: '#38bdf8', 
                fontWeight: '800',
                background: 'rgba(56, 189, 248, 0.1)',
                padding: '1px 5px',
                borderRadius: '3px'
              }}>
                {realRes}
              </span>
            )}
          </div>
        </div>
      </div>
    );
  }

  // VOD: Movies, Series & Novelas (Poster 2:3)
  const isSeries = item?.type === 'series' || item?.category_name?.toLowerCase().includes('novela');
  const isNovela = item?.category_name?.toLowerCase().includes('novela');
  const year = item?.release_date ? String(item.release_date).slice(0, 4) : null;
  const episodesCount = item?.episode_count || item?.total_episodes;

  return (
    <div
      className={`media-card-vod ${isPlaying ? 'card-playing' : ''}`}
      role="button"
      tabIndex={0}
      aria-label={`${isSeries ? 'Série' : 'Filme'} ${title}`}
      onClick={() => onClick?.(item)}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick?.(item);
        }
      }}
    >
      <div className="media-card-poster-wrap">
        <img
          src={poster || getPlaceholder(item)}
          alt={title}
          className="media-card-poster-img"
          loading="lazy"
          onError={(e) => onImageError(e, item)}
        />

        {/* Favorite Button */}
        <button
          className={`card-favorite-btn ${isFav ? 'favorited' : ''}`}
          onClick={handleFavClick}
          aria-label={isFav ? 'Remover dos favoritos' : 'Favoritar'}
          title={isFav ? 'Favoritado' : 'Adicionar aos favoritos'}
        >
          <Star size={13} fill={isFav ? '#f59e0b' : 'none'} color={isFav ? '#f59e0b' : '#cbd5e1'} />
        </button>

        {/* Type Badge */}
        {isSeries && (
          <span style={{
            position: 'absolute',
            top: '8px',
            left: '8px',
            background: 'rgba(99, 102, 241, 0.88)',
            color: '#fff',
            fontSize: '0.62rem',
            fontWeight: '800',
            padding: '2px 7px',
            borderRadius: '4px',
            letterSpacing: '0.04em',
            textTransform: 'uppercase'
          }}>
            {isNovela ? 'NOVELA' : 'SÉRIE'}
          </span>
        )}

        {/* Play Bubble Overlay */}
        <div className="card-hover-overlay" onClick={handlePlayClick}>
          <div className="card-play-bubble">
            <Play size={20} fill="#fff" color="#fff" style={{ marginLeft: 2 }} />
          </div>
        </div>
      </div>

      <div className="media-card-info">
        <span className="media-card-name" title={title}>
          {title}
        </span>
        <div className="media-card-meta">
          <span>{year || (isSeries ? 'Série' : 'Filme')}</span>
          {item.rating && (
            <span style={{ display: 'flex', alignItems: 'center', gap: '3px', color: '#f59e0b', fontWeight: '700' }}>
              <Star size={10} fill="#f59e0b" color="#f59e0b" /> {item.rating}
            </span>
          )}
          {episodesCount && (
            <span style={{ color: '#a5b4fc', fontWeight: '600' }}>
              {episodesCount} eps
            </span>
          )}
        </div>
      </div>
    </div>
  );
}
