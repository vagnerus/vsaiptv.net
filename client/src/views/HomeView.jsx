import React, { useMemo } from 'react';
import HeroBanner from '../components/HeroBanner';
import ContentRow from '../components/ContentRow';
import { Tv, Film, Clapperboard, Layers, History, Star, Flame, Sparkles, Play, X, Clock } from 'lucide-react';
import { useFavorites } from '../hooks/useFavorites';
import { useProgress } from '../hooks/useProgress';
import { getPlayableUrl } from '../utils/streamUtils';

export default function HomeView({
  featuredList = [],
  liveChannels = [],
  featuredMovies = [],
  featuredSeries = [],
  novelas = [],
  continueWatching = [],
  onItemClick,
  onPlayDirect,
  onOpenDetails,
  onNavigateTab,
  activeStreamId = null,
}) {
  const { favorites } = useFavorites();
  const { removeProgress } = useProgress();

  const validContinueItems = useMemo(() => {
    if (!continueWatching || !Array.isArray(continueWatching)) return [];
    return continueWatching.filter((p) => {
      if (p.completed === 1 || p.completed === true) return false;
      if (p.is_removed === 1) return false;
      if (!p.progress_time || p.progress_time < 20) return false;
      if (p.duration > 0 && (p.progress_time / p.duration) >= 0.95) return false;
      return true;
    });
  }, [continueWatching]);

  const formatProgressTime = (secs) => {
    if (!secs || isNaN(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    return `${m}:${s < 10 ? '0' : ''}${s}`;
  };

  const handleContinuePlay = (p) => {
    if (p.type === 'series' && p.episode_id) {
      onPlayDirect?.(
        { id: p.stream_id, name: p.stream_name, type: 'series', poster_url: p.poster_url, backdrop_url: p.backdrop_url },
        { id: p.episode_id, season_num: p.season_num, episode_num: p.episode_num, title: p.episode_title },
        p.progress_time
      );
    } else if (p.type === 'series') {
      onOpenDetails?.({ id: p.stream_id, name: p.stream_name, poster_url: p.poster_url, type: 'series' });
    } else {
      onPlayDirect?.(
        { id: p.stream_id, name: p.stream_name, type: 'movie', poster_url: p.poster_url, backdrop_url: p.backdrop_url },
        null,
        p.progress_time
      );
    }
  };

  return (
    <div className="home-view-container animate-fade">
      {/* 1. Cinematic Hero Banner */}
      <HeroBanner
        featuredItems={featuredList}
        onPlay={(item) => onPlayDirect ? onPlayDirect(item) : onItemClick(item)}
        onOpenDetails={onOpenDetails}
      />

      {/* 2. Continuar Assistindo Rail (se houver histórico com progresso real não concluído) */}
      {validContinueItems.length > 0 && (
        <section className="vsa-content-row continue-watching-section">
          <div className="vsa-row-header">
            <div className="vsa-row-title-group">
              <History size={20} color="#818cf8" />
              <h2 className="vsa-row-title">Continue Assistindo</h2>
            </div>
          </div>
          <div className="vsa-row-track no-scrollbar">
            {validContinueItems
              .slice(0, 15)
              .map((p) => {
                const pct = p.progress_percent || (p.duration > 0 ? Math.min(100, Math.round((p.progress_time / p.duration) * 100)) : 0);
                const remSecs = p.duration > p.progress_time ? p.duration - p.progress_time : 0;
                const remMins = Math.max(1, Math.round(remSecs / 60));

                return (
                  <div
                    key={`${p.stream_id}-${p.episode_id || 'm'}`}
                    className="continue-card"
                    tabIndex={0}
                    data-nav="true"
                    data-card="true"
                    title={`Continuar ${p.stream_name} de onde parou (${formatProgressTime(p.progress_time)})`}
                    onClick={() => handleContinuePlay(p)}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') {
                        e.preventDefault();
                        handleContinuePlay(p);
                      }
                    }}
                  >
                    <div className="continue-thumb">
                      <img
                        src={p.poster_url || p.backdrop_url || ''}
                        alt={p.stream_name || ''}
                        loading="lazy"
                        onError={(e) => {
                          e.currentTarget.src = 'data:image/svg+xml;utf8,<svg xmlns="http://www.w3.org/2000/svg" width="230" height="144" viewBox="0 0 230 144"><rect width="230" height="144" fill="%230c121e"/><text x="50%" y="50%" fill="%2364748b" font-family="sans-serif" font-size="13" font-weight="bold" text-anchor="middle" dy=".3em">VSA IPTV</text></svg>';
                        }}
                      />

                      {/* Botão de exclusão rápida de Continuar Assistindo */}
                      <button
                        className="continue-remove-btn"
                        title="Remover de Continuar Assistindo"
                        aria-label="Remover de Continuar Assistindo"
                        tabIndex={0}
                        data-nav="true"
                        onClick={(e) => {
                          e.stopPropagation();
                          removeProgress(p.stream_id, p.episode_id);
                        }}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.stopPropagation();
                            e.preventDefault();
                            removeProgress(p.stream_id, p.episode_id);
                          }
                        }}
                      >
                        <X size={13} />
                      </button>

                      <div className="continue-play-overlay">
                        <div className="continue-play-btn" title="Continuar de onde parou">
                          <Play size={22} fill="#fff" color="#fff" style={{ marginLeft: 2 }} />
                        </div>
                      </div>
                      <div className="continue-progress-bar">
                        <div className="continue-progress-fill" style={{ width: `${pct}%` }} />
                      </div>
                    </div>
                    <div className="continue-info">
                      <span className="continue-title" title={p.stream_name}>{p.stream_name}</span>
                      <div className="continue-sub">
                        {p.type === 'series' && p.episode_id ? (
                          <span>T{p.season_num || 1}:E{p.episode_num} {p.episode_title ? `• ${p.episode_title}` : ''}</span>
                        ) : (
                          <span className="continue-time-rem">{remMins} min restantes</span>
                        )}
                        <span className="continue-time-tag">{formatProgressTime(p.progress_time)}</span>
                      </div>
                    </div>
                  </div>
                );
              })}
          </div>
        </section>
      )}

      {/* 3. Favoritos do Usuário (se existirem) */}
      {favorites && favorites.length > 0 && (
        <ContentRow
          title="Seus Favoritos"
          icon={Star}
          items={favorites.slice(0, 15)}
          onItemClick={onItemClick}
          onPlayDirect={onPlayDirect}
          onSeeAll={() => onNavigateTab('favorites')}
          activeStreamId={activeStreamId}
        />
      )}

      {/* 4. Canais ao Vivo Populares */}
      {liveChannels.length > 0 && (
        <ContentRow
          title="Canais de TV Ao Vivo"
          icon={Tv}
          items={liveChannels.slice(0, 20)}
          onItemClick={onPlayDirect}
          onPlayDirect={onPlayDirect}
          onSeeAll={() => onNavigateTab('live')}
          activeStreamId={activeStreamId}
        />
      )}

      {/* 5. Filmes em Destaque */}
      {featuredMovies.length > 0 && (
        <ContentRow
          title="Filmes em Alta (VOD)"
          icon={Film}
          items={featuredMovies.slice(0, 20)}
          onItemClick={onOpenDetails}
          onPlayDirect={onPlayDirect}
          onSeeAll={() => onNavigateTab('movie')}
          activeStreamId={activeStreamId}
        />
      )}

      {/* 6. Séries Originais & Populares */}
      {featuredSeries.length > 0 && (
        <ContentRow
          title="Séries Populares"
          icon={Clapperboard}
          items={featuredSeries.slice(0, 20)}
          onItemClick={onOpenDetails}
          onPlayDirect={onPlayDirect}
          onSeeAll={() => onNavigateTab('series')}
          activeStreamId={activeStreamId}
        />
      )}

      {/* 7. Novelas Brasileiras e Internacionais */}
      {novelas.length > 0 && (
        <ContentRow
          title="Novelas em Destaque"
          icon={Layers}
          items={novelas.slice(0, 20)}
          onItemClick={onOpenDetails}
          onPlayDirect={onPlayDirect}
          onSeeAll={() => onNavigateTab('novelas')}
          activeStreamId={activeStreamId}
        />
      )}
    </div>
  );
}
