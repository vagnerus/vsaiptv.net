import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, Play, Star, Calendar, Clock, Check, Layers, 
  Bookmark, BookmarkCheck, AlertCircle, Radio 
} from 'lucide-react';
import { getImageUrl, getPlaceholder, onImageError, getPlayableUrl } from '../utils/streamUtils';
import { extractRealResolution } from '../utils/channelLogos';
import { useFavorites } from '../hooks/useFavorites';
import api from '../services/api';

export default function DetailModal({
  item,
  onClose,
  onPlayStream,
  isEpisodeWatched,
}) {
  const { isFavorite, toggleFavorite } = useFavorites();
  const [episodes, setEpisodes] = useState([]);
  const [isLoadingEpisodes, setIsLoadingEpisodes] = useState(false);
  const [selectedSeasonNum, setSelectedSeasonNum] = useState(null);

  const isFav = isFavorite(item?.id);
  const isSeries = item?.type === 'series' || item?.category_name?.toLowerCase().includes('novela');
  const isNovela = item?.category_name?.toLowerCase().includes('novela');

  // Close modal on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Fetch episodes if item is a series
  useEffect(() => {
    if (!item?.id || !isSeries) return;
    let isMounted = true;
    setIsLoadingEpisodes(true);

    api.get(`/api/client/stream/${item.id}`)
      .then((res) => {
        if (isMounted) {
          const eps = res.data.episodes || [];
          setEpisodes(eps);
        }
      })
      .catch((err) => {
        console.error('Failed to fetch series episodes:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoadingEpisodes(false);
      });

    return () => { isMounted = false; };
  }, [item, isSeries]);

  // Group episodes into seasons
  const seasons = useMemo(() => {
    if (!episodes || episodes.length === 0) return [];
    const map = {};
    episodes.forEach((ep) => {
      let sNum = ep.season_num && Number(ep.season_num) > 0 ? Number(ep.season_num) : 1;
      if (!map[sNum]) map[sNum] = [];
      map[sNum].push(ep);
    });

    const sortedNums = Object.keys(map).map(Number).sort((a, b) => a - b);
    return sortedNums.map((sNum) => {
      const eps = map[sNum].slice().sort((a, b) => (Number(a.episode_num) || 0) - (Number(b.episode_num) || 0));
      return {
        seasonNum: sNum,
        label: sNum === 0 ? 'Especiais' : `Temporada ${sNum}`,
        episodes: eps,
        count: eps.length,
      };
    });
  }, [episodes]);

  useEffect(() => {
    if (seasons.length > 0) {
      setSelectedSeasonNum(seasons[0].seasonNum);
    }
  }, [seasons]);

  const currentSeasonEpisodes = useMemo(() => {
    if (selectedSeasonNum === 'all') return episodes;
    const found = seasons.find((s) => s.seasonNum === selectedSeasonNum);
    return found ? found.episodes : (seasons[0]?.episodes || episodes);
  }, [seasons, selectedSeasonNum, episodes]);

  if (!item) return null;

  const backdrop = item.backdrop_url || item.poster_url || getImageUrl(item);
  const poster = getImageUrl(item);
  const year = item.release_date ? String(item.release_date).slice(0, 4) : null;
  const rating = item.rating ? String(item.rating) : null;
  const realRes = extractRealResolution(item.name);

  return (
    <div className="detail-modal-overlay" onClick={onClose}>
      <div className="detail-modal-container" onClick={(e) => e.stopPropagation()}>
        {/* Close Button */}
        <button
          className="detail-close-btn"
          onClick={onClose}
          aria-label="Fechar"
        >
          <X size={18} />
        </button>

        {/* Hero Backdrop in Modal */}
        <div className="detail-hero-banner">
          <img
            src={backdrop || getPlaceholder(item)}
            alt={item.name}
            className="detail-hero-backdrop"
            onError={(e) => onImageError(e, item)}
          />
          <div className="detail-hero-gradient" />
        </div>

        {/* Modal Main Body */}
        <div className="detail-body">
          <div className="detail-header-flex">
            <img
              src={poster || getPlaceholder(item)}
              alt={item.name}
              className="detail-poster-img"
              onError={(e) => onImageError(e, item)}
            />

            <div className="detail-title-group">
              <div className="detail-meta-pills">
                <span className="vsa-badge-brand">
                  {isNovela ? 'NOVELA' : isSeries ? 'SÉRIE' : 'FILME'}
                </span>
                {year && (
                  <span className="detail-meta-pill">
                    <Calendar size={12} style={{ display: 'inline', marginRight: 4 }} /> {year}
                  </span>
                )}
                {rating && (
                  <span className="detail-meta-pill" style={{ color: '#f59e0b' }}>
                    <Star size={12} fill="#f59e0b" style={{ display: 'inline', marginRight: 4 }} /> {rating}
                  </span>
                )}
                {realRes && (
                  <span className="detail-meta-pill" style={{ color: '#22d3ee' }}>
                    {realRes}
                  </span>
                )}
                {item.category_name && (
                  <span className="detail-meta-pill">
                    {item.category_name}
                  </span>
                )}
              </div>

              <h2 className="detail-title">{item.name}</h2>

              {/* Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px' }}>
                <button
                  className="btn btn-primary"
                  style={{ padding: '10px 24px', borderRadius: 'var(--radius-full)', fontWeight: '700' }}
                  onClick={() => {
                    if (isSeries) {
                      const firstPlayable = currentSeasonEpisodes.find((e) => getPlayableUrl(e)) || episodes[0];
                      if (firstPlayable) {
                        onPlayStream?.(item, firstPlayable);
                        onClose?.();
                      }
                    } else {
                      onPlayStream?.(item);
                      onClose?.();
                    }
                  }}
                >
                  <Play size={17} fill="#fff" style={{ marginRight: 6 }} />
                  {isSeries ? 'Assistir 1º Episódio' : 'Assistir Agora'}
                </button>

                <button
                  className={`btn btn-secondary ${isFav ? 'favorited' : ''}`}
                  style={{
                    padding: '10px 18px',
                    borderRadius: 'var(--radius-full)',
                    color: isFav ? '#f59e0b' : '#cbd5e1',
                    borderColor: isFav ? 'rgba(245, 158, 11, 0.4)' : undefined,
                  }}
                  onClick={() => toggleFavorite(item)}
                >
                  <Star size={16} fill={isFav ? '#f59e0b' : 'none'} style={{ marginRight: 6 }} />
                  {isFav ? 'Favoritado' : 'Favoritar'}
                </button>
              </div>
            </div>
          </div>

          {/* Synopsis */}
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="detail-desc">
              {item.description || 'Nenhuma sinopse adicional cadastrada para este título no momento.'}
            </p>
          </div>

          {/* Series: Season selector and Episodes */}
          {isSeries && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', marginTop: '6px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#fff', display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <Layers size={18} color="#818cf8" />
                  {isNovela ? 'Capítulos da Novela' : 'Episódios da Série'}
                </h3>
                <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
                  {episodes.length} {isNovela ? 'capítulos' : 'episódios'} disponíveis
                </span>
              </div>

              {/* Seasons Pill Selector */}
              {seasons.length > 0 && (
                <div className="seasons-pill-row no-scrollbar">
                  {seasons.map((s) => (
                    <button
                      key={s.seasonNum}
                      className={`season-pill-btn ${selectedSeasonNum === s.seasonNum ? 'active' : ''}`}
                      onClick={() => setSelectedSeasonNum(s.seasonNum)}
                    >
                      {s.label} ({s.count})
                    </button>
                  ))}
                  {seasons.length > 1 && (
                    <button
                      className={`season-pill-btn ${selectedSeasonNum === 'all' ? 'active' : ''}`}
                      onClick={() => setSelectedSeasonNum('all')}
                    >
                      Todos ({episodes.length})
                    </button>
                  )}
                </div>
              )}

              {/* Episode list */}
              <div className="episodes-card-list no-scrollbar">
                {isLoadingEpisodes ? (
                  <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                    <div className="spinner-circle" style={{ margin: '0 auto 10px' }} />
                    Carregando episódios...
                  </div>
                ) : currentSeasonEpisodes.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '30px', color: 'var(--text-muted)' }}>
                    <AlertCircle size={28} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
                    <p>Nenhum episódio cadastrado nesta temporada.</p>
                  </div>
                ) : (
                  currentSeasonEpisodes.map((ep) => {
                    const watched = isEpisodeWatched?.(item.id, ep.id);
                    const epLabel = isNovela ? `Cap. ${ep.episode_num}` : `T${ep.season_num || 1}:E${ep.episode_num}`;

                    return (
                      <div
                        key={ep.id}
                        className={`episode-row-card ${watched ? 'watched' : ''}`}
                        onClick={() => {
                          onPlayStream?.(item, ep);
                          onClose?.();
                        }}
                      >
                        <span style={{
                          background: 'rgba(99, 102, 241, 0.2)',
                          color: '#a5b4fc',
                          fontSize: '0.78rem',
                          fontWeight: '800',
                          padding: '4px 8px',
                          borderRadius: '6px',
                          whiteSpace: 'nowrap',
                        }}>
                          {epLabel}
                        </span>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ fontSize: '0.9rem', fontWeight: '700', color: '#fff', display: 'block', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {ep.title || `Episódio ${ep.episode_num}`}
                          </span>
                          {ep.duration_minutes && (
                            <span style={{ fontSize: '0.75rem', color: 'var(--text-muted)' }}>
                              <Clock size={11} style={{ display: 'inline', marginRight: 4 }} />
                              {ep.duration_minutes} min
                            </span>
                          )}
                        </div>

                        {watched && (
                          <span style={{ color: '#10b981', fontSize: '0.75rem', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '3px' }}>
                            <Check size={14} /> Visto
                          </span>
                        )}

                        <button
                          className={`btn btn-sm ${watched ? 'btn-secondary' : 'btn-primary'}`}
                          style={{ borderRadius: 'var(--radius-full)', padding: '5px 14px' }}
                          onClick={(e) => {
                            e.stopPropagation();
                            onPlayStream?.(item, ep);
                            onClose?.();
                          }}
                        >
                          <Play size={12} fill="currentColor" style={{ marginRight: 4 }} />
                          {watched ? 'Rever' : 'Assistir'}
                        </button>
                      </div>
                    );
                  })
                )}
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
