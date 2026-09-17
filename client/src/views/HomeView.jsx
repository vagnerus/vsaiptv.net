import React, { useMemo } from 'react';
import HeroBanner from '../components/HeroBanner';
import ContentRow from '../components/ContentRow';
import { Tv, Film, Clapperboard, Layers, History, Star, Flame, Sparkles } from 'lucide-react';
import { useFavorites } from '../hooks/useFavorites';
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

  const validContinueItems = useMemo(() => {
    if (!continueWatching || !Array.isArray(continueWatching)) return [];
    return continueWatching.filter((p) => {
      if (p.completed === 1) return false;
      if (!p.progress_time || p.progress_time < 15) return false;
      if (p.duration > 0 && (p.progress_time / p.duration) >= 0.95) return false;
      return true;
    });
  }, [continueWatching]);

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
        <section className="vsa-content-row" style={{ marginTop: '20px' }}>
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
                const pct = p.duration > 0 ? Math.min(100, Math.round((p.progress_time / p.duration) * 100)) : (p.completed ? 100 : 0);
                return (
                  <div
                    key={`${p.stream_id}-${p.episode_id || 'm'}`}
                    className="continue-card"
                    onClick={() => {
                      if (p.type === 'series' && p.episode_id) {
                        onPlayDirect?.(
                          { id: p.stream_id, name: p.stream_name, type: 'series', poster_url: p.poster_url },
                          { id: p.episode_id, season_num: p.season_num, episode_num: p.episode_num, title: p.episode_title },
                          p.progress_time
                        );
                      } else if (p.type === 'series') {
                        onOpenDetails?.({ id: p.stream_id, name: p.stream_name, poster_url: p.poster_url, type: 'series' });
                      } else {
                        onPlayDirect?.(
                          { id: p.stream_id, name: p.stream_name, type: 'movie', poster_url: p.poster_url },
                          null,
                          p.progress_time
                        );
                      }
                    }}
                  >
                    <div className="continue-thumb">
                      <img
                        src={p.poster_url || ''}
                        alt={p.stream_name || ''}
                        loading="lazy"
                        onError={(e) => { e.currentTarget.style.display = 'none'; }}
                      />
                      <div className="continue-play-overlay">
                        <div className="continue-play-btn" title="Continuar de onde parou">
                          <History size={18} color="#fff" />
                        </div>
                      </div>
                    </div>
                    <div className="continue-info">
                      <span className="continue-title" title={p.stream_name}>{p.stream_name}</span>
                      {p.type === 'series' && p.episode_id && (
                        <span className="continue-sub">T{p.season_num || 1}:E{p.episode_num} {p.episode_title || ''}</span>
                      )}
                      <div className="continue-progress-bar">
                        <div className="continue-progress-fill" style={{ width: `${pct}%` }} />
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
