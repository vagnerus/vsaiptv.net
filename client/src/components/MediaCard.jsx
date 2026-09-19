import React, { useState } from 'react';
import { Play, Star, Tv, Film, Clapperboard } from 'lucide-react';
import { getImageUrl, getPlaceholder, extractRealResolution } from '../utils/streamUtils';
import { useFavorites } from '../hooks/useFavorites';

export default function MediaCard({
  item,
  onClick,
  onPlayDirect,
  isPlaying = false,
}) {
  const [imgError, setImgError] = useState(false);
  const { isFavorite, toggleFavorite } = useFavorites();
  const isFav = isFavorite(item?.id);
  const isLive = item?.type === 'live' || item?.stream_type === 'live';
  const poster = getImageUrl(item);
  const title = item?.name || item?.title || 'Conteúdo';
  const realRes = extractRealResolution(title);

  const isSeries = item?.type === 'series' || item?.category_name?.toLowerCase().includes('novela') || item?.category_id === 147;
  const isNovela = item?.category_name?.toLowerCase().includes('novela') || item?.category_id === 147;

  const handleFavClick = (e) => {
    e.stopPropagation();
    toggleFavorite(item);
  };

  const handlePlayClick = (e) => {
    e.stopPropagation();
    if (isSeries) {
      onClick?.(item);
    } else if (onPlayDirect) {
      onPlayDirect(item);
    } else {
      onClick?.(item);
    }
  };

  // Cores determinísticas para o fallback
  let nameHash = 0;
  for (let i = 0; i < title.length; i++) nameHash = title.charCodeAt(i) + ((nameHash << 5) - nameHash);
  const hue1 = Math.abs(nameHash % 360);
  const hue2 = (hue1 + 45) % 360;

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
          {!imgError && poster ? (
            <img
              src={poster}
              alt=""
              className="media-card-live-logo"
              loading="lazy"
              onError={(e) => {
                e.currentTarget.style.display = 'none';
                setImgError(true);
              }}
            />
          ) : (
            <div
              style={{
                width: '100%',
                height: '100%',
                display: 'flex',
                flexDirection: 'column',
                alignItems: 'center',
                justifyContent: 'center',
                background: `linear-gradient(135deg, hsl(${hue1}, 45%, 12%), hsl(${hue2}, 55%, 6%))`,
                padding: '12px',
                textAlign: 'center',
              }}
            >
              <div style={{
                width: '36px',
                height: '36px',
                borderRadius: '50%',
                background: 'rgba(255,255,255,0.08)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                marginBottom: '6px',
              }}>
                <Tv size={18} color="#818cf8" />
              </div>
              <span style={{ fontSize: '0.78rem', fontWeight: '700', color: '#f8fafc', lineHeight: 1.2 }}>
                {title.length > 24 ? title.substring(0, 22) + '..' : title}
              </span>
            </div>
          )}

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
        {!imgError && poster ? (
          <img
            src={poster}
            alt=""
            className="media-card-poster-img"
            loading="lazy"
            onError={(e) => {
              e.currentTarget.style.display = 'none';
              setImgError(true);
            }}
          />
        ) : (
          <div
            style={{
              width: '100%',
              height: '100%',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              background: 'linear-gradient(135deg, #181e2e, #0c121e)',
              padding: '16px',
              textAlign: 'center',
            }}
          >
            <div style={{
              width: '44px',
              height: '44px',
              borderRadius: '50%',
              background: isSeries ? 'rgba(99, 102, 241, 0.15)' : 'rgba(236, 72, 153, 0.15)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginBottom: '10px',
            }}>
              {isSeries ? <Clapperboard size={22} color="#818cf8" /> : <Film size={22} color="#f43f5e" />}
            </div>
            <span style={{ fontSize: '0.86rem', fontWeight: '700', color: '#f8fafc', lineHeight: 1.3 }}>
              {title.length > 28 ? title.substring(0, 25) + '..' : title}
            </span>
            {year && (
              <span style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '4px' }}>
                {year}
              </span>
            )}
          </div>
        )}

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
