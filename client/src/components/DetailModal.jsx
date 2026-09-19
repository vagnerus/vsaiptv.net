import React, { useState, useEffect, useMemo } from 'react';
import { 
  X, Play, Star, Calendar, Clock, Check, Layers, 
  Bookmark, BookmarkCheck, AlertCircle, Radio, Search
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
  const [episodeSearch, setEpisodeSearch] = useState('');

  const isFav = isFavorite(item?.id);
  const isNovela = item?.category_name?.toLowerCase().includes('novela') || 
                   item?.name?.toLowerCase().includes('novela') || 
                   item?.category_id === 147;
  const isSeries = item?.type === 'series' || isNovela || episodes.length > 0;

  // Close modal on Escape
  useEffect(() => {
    const handleKeyDown = (e) => {
      if (e.key === 'Escape') onClose?.();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  // Fetch episodes if item is a series or novela
  useEffect(() => {
    if (!item?.id) return;
    let isMounted = true;
    setIsLoadingEpisodes(true);

    // Use dedicated lightweight episodes endpoint
    api.get(`/api/client/series/${item.id}/episodes`)
      .then((res) => {
        if (isMounted) {
          const eps = res.data.episodes || [];
          setEpisodes(eps);
        }
      })
      .catch(() => {
        // Fallback to /stream/:id if needed
        api.get(`/api/client/stream/${item.id}`)
          .then((res) => {
            if (isMounted) {
              setEpisodes(res.data.episodes || []);
            }
          })
          .catch((err) => {
            console.error('Failed to fetch series episodes:', err);
          });
      })
      .finally(() => {
        if (isMounted) setIsLoadingEpisodes(false);
      });

    return () => { isMounted = false; };
  }, [item?.id]);

  // Group episodes into seasons or blocks
  const seasons = useMemo(() => {
    if (!episodes || episodes.length === 0) return [];
    
    // Check if we have multiple season numbers
    const seasonMap = {};
    episodes.forEach((ep) => {
      const sNum = (ep.season_num !== undefined && ep.season_num !== null && Number(ep.season_num) > 0)
        ? Number(ep.season_num) 
        : 1;
      if (!seasonMap[sNum]) seasonMap[sNum] = [];
      seasonMap[sNum].push(ep);
    });

    const sortedNums = Object.keys(seasonMap).map(Number).sort((a, b) => a - b);

    // If multiple real seasons exist
    if (sortedNums.length > 1) {
      return sortedNums.map((sNum) => {
        const eps = seasonMap[sNum].slice().sort((a, b) => (Number(a.episode_num) || 0) - (Number(b.episode_num) || 0));
        return {
          id: sNum,
          label: isNovela ? `Parte ${sNum}` : `Temporada ${sNum}`,
          episodes: eps,
          count: eps.length,
        };
      });
    }

    // If only 1 season but with more than 25 episodes (typical in Novelas / long series)
    const allEps = episodes.slice().sort((a, b) => (Number(a.episode_num) || 0) - (Number(b.episode_num) || 0));
    if (allEps.length > 25) {
      const blockSize = 25;
      const blocks = [];
      for (let i = 0; i < allEps.length; i += blockSize) {
        const chunk = allEps.slice(i, i + blockSize);
        const firstEpNum = chunk[0]?.episode_num || (i + 1);
        const lastEpNum = chunk[chunk.length - 1]?.episode_num || (i + chunk.length);
        blocks.push({
          id: `block_${firstEpNum}_${lastEpNum}`,
          label: isNovela 
            ? (firstEpNum === lastEpNum ? `Cap. ${firstEpNum}` : `Caps ${firstEpNum}-${lastEpNum}`)
            : (firstEpNum === lastEpNum ? `Ep. ${firstEpNum}` : `Eps ${firstEpNum}-${lastEpNum}`),
          episodes: chunk,
          count: chunk.length,
        });
      }
      return blocks;
    }

    // Single season with standard count
    return [{
      id: 1,
      label: isNovela ? 'Capítulos' : 'Temporada 1',
      episodes: allEps,
      count: allEps.length,
    }];
  }, [episodes, isNovela]);

  // Set default selected season/block
  useEffect(() => {
    if (seasons.length > 0) {
      if (selectedSeasonNum === null || !seasons.some(s => s.id === selectedSeasonNum)) {
        setSelectedSeasonNum(seasons[0].id);
      }
    }
  }, [seasons, selectedSeasonNum]);

  // Filter episodes for current selected season/block + search filter
  const currentSeasonEpisodes = useMemo(() => {
    let baseEps = episodes;
    if (selectedSeasonNum !== 'all') {
      const found = seasons.find((s) => s.id === selectedSeasonNum);
      baseEps = found ? found.episodes : (seasons[0]?.episodes || episodes);
    }

    if (!episodeSearch.trim()) return baseEps;

    const query = episodeSearch.toLowerCase().trim();
    return baseEps.filter((ep) => 
      (ep.title && ep.title.toLowerCase().includes(query)) ||
      String(ep.episode_num).includes(query) ||
      String(ep.season_num).includes(query)
    );
  }, [seasons, selectedSeasonNum, episodes, episodeSearch]);

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
            loading="lazy"
            onError={(e) => onImageError(e, item)}
          />
          <div className="detail-hero-gradient" />

          <div className="detail-hero-content">
            <div className="detail-hero-layout">
              {/* Poster card */}
              <div className="detail-poster-wrap">
                <img
                  src={poster || getPlaceholder(item)}
                  alt={item.name}
                  className="detail-poster-img"
                  loading="lazy"
                  onError={(e) => onImageError(e, item)}
                />
              </div>

              {/* Text Info */}
              <div className="detail-info-wrap">
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
                  <span className="badge badge-active" style={{ fontSize: '0.7rem' }}>
                    {isNovela ? 'NOVELA' : isSeries ? 'SÉRIE' : item.type === 'live' ? 'AO VIVO' : 'FILME VOD'}
                  </span>
                  {realRes && (
                    <span style={{
                      fontSize: '0.68rem',
                      color: '#38bdf8',
                      fontWeight: '800',
                      background: 'rgba(56, 189, 248, 0.1)',
                      border: '1px solid rgba(56, 189, 248, 0.3)',
                      padding: '2px 6px',
                      borderRadius: '4px'
                    }}>
                      {realRes}
                    </span>
                  )}
                  {year && (
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      <Calendar size={12} style={{ display: 'inline', marginRight: 4 }} />
                      {year}
                    </span>
                  )}
                  {rating && (
                    <span style={{ fontSize: '0.78rem', color: '#f59e0b', fontWeight: '700' }}>
                      <Star size={12} fill="#f59e0b" style={{ display: 'inline', marginRight: 4 }} />
                      {rating}
                    </span>
                  )}
                  {item.category_name && (
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {item.category_name}
                    </span>
                  )}
                </div>

                <h2 className="detail-title">{item.name}</h2>

                {/* Action Buttons */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', marginTop: '8px', flexWrap: 'wrap' }}>
                  <button
                    className="btn btn-primary"
                    style={{ padding: '10px 24px', borderRadius: 'var(--radius-full)', fontWeight: '700' }}
                    onClick={() => {
                      if (isSeries && currentSeasonEpisodes.length > 0) {
                        const firstPlayable = currentSeasonEpisodes.find((e) => getPlayableUrl(e)) || currentSeasonEpisodes[0];
                        onPlayStream?.(item, firstPlayable);
                        onClose?.();
                      } else {
                        onPlayStream?.(item);
                        onClose?.();
                      }
                    }}
                  >
                    <Play size={17} fill="#fff" style={{ marginRight: 6 }} />
                    {isSeries ? (isNovela ? 'Assistir 1º Capítulo' : 'Assistir 1º Episódio') : 'Assistir Agora'}
                  </button>

                  <button
                    className={`btn ${isFav ? 'btn-secondary' : 'btn-secondary'}`}
                    style={{
                      borderRadius: 'var(--radius-full)',
                      padding: '10px 18px',
                      color: isFav ? '#f59e0b' : '#cbd5e1',
                    }}
                    onClick={() => toggleFavorite(item)}
                  >
                    <Star size={16} fill={isFav ? '#f59e0b' : 'none'} style={{ marginRight: 6 }} />
                    {isFav ? 'Salvo nos Favoritos' : 'Favoritar'}
                  </button>
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Modal Body */}
        <div className="detail-modal-body">
          {/* Synopsis */}
          <div style={{ background: 'rgba(255,255,255,0.02)', padding: '16px', borderRadius: 'var(--radius-md)', border: '1px solid rgba(255,255,255,0.05)' }}>
            <p className="detail-desc">
              {item.description || 'Nenhuma sinopse adicional cadastrada para este título no momento.'}
            </p>
          </div>

          {/* Series & Novelas: Season selector and Episodes */}
          {(isSeries || episodes.length > 0) && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '14px', marginTop: '10px' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: '10px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <div style={{
                    width: '32px',
                    height: '32px',
                    borderRadius: '8px',
                    background: 'rgba(99, 102, 241, 0.2)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#818cf8',
                  }}>
                    <Layers size={18} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: '1.1rem', fontWeight: '800', color: '#fff', margin: 0 }}>
                      {isNovela ? 'Escolha o Capítulo da Novela' : 'Temporadas e Episódios'}
                    </h3>
                    <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                      {episodes.length} {isNovela ? 'capítulos disponíveis' : 'episódios disponíveis'}
                    </span>
                  </div>
                </div>

                {/* Quick search episode within series */}
                {episodes.length > 10 && (
                  <div style={{ position: 'relative', width: '200px' }}>
                    <Search size={14} style={{ position: 'absolute', left: '10px', top: '50%', transform: 'translateY(-50%)', color: 'var(--text-dim)' }} />
                    <input
                      type="text"
                      className="form-control"
                      style={{ paddingLeft: '32px', height: '34px', fontSize: '0.8rem', borderRadius: 'var(--radius-full)' }}
                      placeholder={isNovela ? 'Buscar capítulo...' : 'Buscar ep...'}
                      value={episodeSearch}
                      onChange={(e) => setEpisodeSearch(e.target.value)}
                    />
                  </div>
                )}
              </div>

              {/* Seasons / Parts Selector Pills */}
              {seasons.length > 0 && (
                <div style={{
                  background: 'rgba(255, 255, 255, 0.02)',
                  border: '1px solid rgba(255, 255, 255, 0.06)',
                  borderRadius: '12px',
                  padding: '10px 14px',
                }}>
                  <div style={{ fontSize: '0.75rem', fontWeight: '700', color: 'var(--text-dim)', marginBottom: '8px', textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                    {isNovela ? 'Selecione a Parte ou Bloco:' : 'Selecione a Temporada:'}
                  </div>
                  <div className="seasons-pill-row no-scrollbar" style={{ padding: 0 }}>
                    {seasons.map((s) => (
                      <button
                        key={s.id}
                        className={`season-pill-btn ${selectedSeasonNum === s.id ? 'active' : ''}`}
                        onClick={() => setSelectedSeasonNum(s.id)}
                        style={{
                          fontSize: '0.85rem',
                          padding: '8px 18px',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                        }}
                      >
                        <span>{s.label}</span>
                        <span style={{ 
                          fontSize: '0.72rem', 
                          opacity: 0.8,
                          background: selectedSeasonNum === s.id ? 'rgba(255,255,255,0.25)' : 'rgba(255,255,255,0.1)',
                          padding: '1px 6px',
                          borderRadius: '10px',
                        }}>
                          {s.count}
                        </span>
                      </button>
                    ))}
                    {seasons.length > 1 && (
                      <button
                        className={`season-pill-btn ${selectedSeasonNum === 'all' ? 'active' : ''}`}
                        onClick={() => setSelectedSeasonNum('all')}
                        style={{ fontSize: '0.85rem', padding: '8px 18px' }}
                      >
                        Todos ({episodes.length})
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Episode list */}
              <div className="episodes-card-list no-scrollbar">
                {isLoadingEpisodes ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    <div className="spinner-circle" style={{ margin: '0 auto 12px' }} />
                    <span>Carregando grade de episódios...</span>
                  </div>
                ) : currentSeasonEpisodes.length === 0 ? (
                  <div style={{ textAlign: 'center', padding: '40px', color: 'var(--text-muted)' }}>
                    <AlertCircle size={32} style={{ margin: '0 auto 10px', opacity: 0.5 }} />
                    <p style={{ margin: 0, fontWeight: '600' }}>Nenhum episódio encontrado com o filtro selecionado.</p>
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
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '14px',
                          padding: '12px 16px',
                          background: 'rgba(255, 255, 255, 0.03)',
                          border: '1px solid rgba(255, 255, 255, 0.06)',
                          borderRadius: 'var(--radius-md)',
                          cursor: 'pointer',
                          transition: 'all 0.2s',
                        }}
                      >
                        <span style={{
                          background: 'rgba(99, 102, 241, 0.2)',
                          color: '#a5b4fc',
                          fontSize: '0.82rem',
                          fontWeight: '800',
                          padding: '6px 10px',
                          borderRadius: '6px',
                          whiteSpace: 'nowrap',
                          border: '1px solid rgba(99, 102, 241, 0.3)',
                        }}>
                          {epLabel}
                        </span>

                        <div style={{ flex: 1, minWidth: 0 }}>
                          <span style={{ 
                            fontSize: '0.92rem', 
                            fontWeight: '700', 
                            color: '#fff', 
                            display: 'block', 
                            whiteSpace: 'nowrap', 
                            overflow: 'hidden', 
                            textOverflow: 'ellipsis' 
                          }}>
                            {ep.title || (isNovela ? `Capítulo ${ep.episode_num}` : `Episódio ${ep.episode_num}`)}
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
                          style={{ borderRadius: 'var(--radius-full)', padding: '6px 16px', fontWeight: '700' }}
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
