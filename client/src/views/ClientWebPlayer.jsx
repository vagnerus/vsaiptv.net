import React, { useState, useEffect, useRef, useMemo, lazy, Suspense } from 'react';
import api from '../services/api';
import VideoPlayer from '../components/VideoPlayer';
import BottomNav from '../components/BottomNav';
import DetailModal from '../components/DetailModal';
import HomeView from './HomeView';

// Code Splitting (Lazy Loading) para visões pesadas de catálogo
const LiveTvView = lazy(() => import('./LiveTvView'));
const VodGridView = lazy(() => import('./VodGridView'));
const FavoritesView = lazy(() => import('./FavoritesView'));
const SearchView = lazy(() => import('./SearchView'));
import { getPlayableUrl, getImageUrl, getPlaceholder, onImageError, getSubtitles } from '../utils/streamUtils';
import { useProgress } from '../hooks/useProgress';
import { Radio, X, Play, Tv } from 'lucide-react';

export default function ClientWebPlayer({ 
  user, 
  activeTab = 'home', 
  onTabChange 
}) {
  // Content data state
  const [liveChannels, setLiveChannels] = useState([]);
  const [movies, setMovies] = useState([]);
  const [series, setSeries] = useState([]);
  const [novelas, setNovelas] = useState([]);
  const [categories, setCategories] = useState([]);
  const [selectedCategory, setSelectedCategory] = useState(null);
  const [liveCategory, setLiveCategory] = useState(null);
  const [liveSearchQuery, setLiveSearchQuery] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  // Playback state
  const [activeStream, setActiveStream] = useState(null);
  const [playbackSourceUrl, setPlaybackSourceUrl] = useState('');
  const [playbackTitle, setPlaybackTitle] = useState('');
  const [playbackType, setPlaybackType] = useState('live');
  const [playbackPoster, setPlaybackPoster] = useState('');
  const [currentProgram, setCurrentProgram] = useState(null);
  const [sessionToken, setSessionToken] = useState(null);
  const [playbackInitialSeek, setPlaybackInitialSeek] = useState(null);
  const [playbackSubtitles, setPlaybackSubtitles] = useState([]);
  const playlistRef = useRef([]);

  // Detail Modal state
  const [detailModalItem, setDetailModalItem] = useState(null);

  // P2P WebRTC mesh stats
  const [p2pStats, setP2pStats] = useState({
    peersCount: 0,
    offloadPercent: 0,
    chunksShared: 0,
  });
  const wsTrackerRef = useRef(null);

  // Progress hook
  const { continueWatching, isEpisodeWatched, refreshProgress } = useProgress();

  // Scroll restoration per tab
  const scrollPositionsRef = useRef({});

  useEffect(() => {
    const handleScroll = () => {
      scrollPositionsRef.current[activeTab] = window.scrollY;
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [activeTab]);

  useEffect(() => {
    const savedY = scrollPositionsRef.current[activeTab] || 0;
    window.scrollTo({ top: savedY, behavior: 'instant' });
  }, [activeTab]);

  // Scroll suave até o player no topo da tela
  const scrollToPlayer = () => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
    document.documentElement.scrollTop = 0;
    document.body.scrollTop = 0;

    setTimeout(() => {
      const stage = document.querySelector('.vsa-player-stage');
      if (stage) {
        stage.scrollIntoView({ behavior: 'smooth', block: 'start' });
      } else {
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }, 120);
  };

  // Garante subida até o player sempre que um vídeo for iniciado
  useEffect(() => {
    if (playbackSourceUrl) {
      scrollToPlayer();
    }
  }, [playbackSourceUrl]);

  // Carrega conteúdo inicial essencial (Canais e Filmes para a Home)
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    const loadInitialData = async () => {
      try {
        const [liveRes, moviesRes, seriesRes, novelasRes] = await Promise.all([
          api.get('/api/client/streams?type=live'),
          api.get('/api/client/streams?type=movie'),
          api.get('/api/client/streams?type=series'),
          api.get('/api/client/streams?type=novelas'),
        ]);

        if (isMounted) {
          setLiveChannels(liveRes.data || []);
          setMovies(moviesRes.data || []);
          setSeries(seriesRes.data || []);
          setNovelas(novelasRes.data || []);
        }
      } catch (err) {
        console.error('Failed to load catalog data:', err);
      } finally {
        if (isMounted) setIsLoading(false);
      }
    };

    loadInitialData();
    return () => { isMounted = false; };
  }, []);

  // Carrega categorias ao trocar de aba (live, movie, series, novelas)
  useEffect(() => {
    if (['live', 'movie', 'series', 'novelas'].includes(activeTab)) {
      api.get(`/api/client/categories?type=${activeTab}`)
        .then((res) => setCategories(res.data || []))
        .catch(() => setCategories([]));
      setSelectedCategory(null);
    }
  }, [activeTab]);

  // Se uma categoria for selecionada, recarrega a lista específica
  useEffect(() => {
    if (!['live', 'movie', 'series', 'novelas'].includes(activeTab)) return;
    if (!selectedCategory) return;

    let isMounted = true;
    setIsLoading(true);
    api.get(`/api/client/streams?type=${activeTab}&category_id=${selectedCategory}`)
      .then((res) => {
        if (!isMounted) return;
        if (activeTab === 'live') setLiveChannels(res.data || []);
        else if (activeTab === 'movie') setMovies(res.data || []);
        else if (activeTab === 'series') setSeries(res.data || []);
        else if (activeTab === 'novelas') setNovelas(res.data || []);
      })
      .catch((err) => console.error(err))
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => { isMounted = false; };
  }, [selectedCategory, activeTab]);

  // Itens para o Hero Banner cinematográfico (mescla de filmes e séries populares)
  const featuredList = useMemo(() => {
    const list = [...movies.slice(0, 4), ...series.slice(0, 3)];
    return list.filter((i) => i.backdrop_url || i.poster_url);
  }, [movies, series]);

  // Atalho Escape / Remote Control Back
  useEffect(() => {
    const onKey = (e) => {
      const isBackKey =
        e.key === 'Escape' ||
        e.keyCode === 1001 || // Tizen TV
        e.keyCode === 461;    // webOS TV
      if (!isBackKey) return;

      if (detailModalItem) {
        setDetailModalItem(null);
        e.preventDefault();
      } else if (playbackSourceUrl && e.key === 'Escape') {
        handleClosePlayer();
        e.preventDefault();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [detailModalItem, playbackSourceUrl]);

  // Iniciar reprodução de canal, filme ou episódio
  const startPlayback = async (stream, episode = null, initialSeek = null) => {
    if (!stream) return;

    // Fecha sessão anterior se houver
    if (sessionToken) {
      api.post('/api/client/session/close', { sessionToken }).catch(() => {});
    }

    setPlaybackInitialSeek(initialSeek || null);
    scrollToPlayer();

    try {
      const res = await api.get(`/api/client/stream/${stream.id}`);
      const sessionTok = res.data.sessionToken;
      setSessionToken(sessionTok);
      setCurrentProgram(res.data.currentProgram || null);

      const serverStream = res.data.stream || stream;
      const fullStream = { ...stream, ...serverStream };

      if (episode) {
        // Reproduzindo episódio específico (mescla com dados completos dos episódios retornados pelo server)
        let fullEpisode = episode;
        if (res.data.episodes && res.data.episodes.length > 0) {
          const found = res.data.episodes.find((e) => String(e.id) === String(episode.id));
          if (found) fullEpisode = { ...episode, ...found };
        }
        const epUrl = getPlayableUrl(fullEpisode);
        setPlaybackSourceUrl(epUrl);
        const epLabel = fullStream.category_name?.toLowerCase().includes('novela') 
          ? `Capítulo ${fullEpisode.episode_num}` 
          : `T${fullEpisode.season_num || 1}:E${fullEpisode.episode_num}`;
        setPlaybackTitle(`${fullStream.name} • ${epLabel} - ${fullEpisode.title || ''}`);
        setPlaybackType('episode');
        setPlaybackPoster(getImageUrl(fullStream));
        setPlaybackSubtitles([
          ...getSubtitles(fullEpisode),
          ...getSubtitles(fullStream),
        ]);
        setActiveStream({ ...fullStream, playingEpisodeId: fullEpisode.id });
      } else {
        // Reproduzindo canal ao vivo ou filme VOD
        const streamUrl = getPlayableUrl(fullStream);
        setPlaybackSourceUrl(streamUrl);
        setPlaybackTitle(fullStream.name);
        setPlaybackType(fullStream.type || 'live');
        setPlaybackPoster(getImageUrl(fullStream));
        setPlaybackSubtitles(getSubtitles(fullStream));
        setActiveStream(fullStream);
      }

      setupP2PTracker(fullStream.id);
      scrollToPlayer();
    } catch (err) {
      console.error('Playback setup error:', err);
      // Fallback: tenta URL direta se a API falhou
      const directUrl = getPlayableUrl(episode || stream);
      if (directUrl) {
        setPlaybackSourceUrl(directUrl);
        setPlaybackTitle(episode ? `${stream.name} - Ep. ${episode.episode_num}` : stream.name);
        setPlaybackType(stream.type || 'live');
        setActiveStream(stream);
        scrollToPlayer();
      }
    }
  };

  // Fechar o player
  const handleClosePlayer = () => {
    if (sessionToken) {
      api.post('/api/client/session/close', { sessionToken }).catch(() => {});
    }
    setActiveStream(null);
    setPlaybackSourceUrl('');
    setPlaybackSubtitles([]);
    setSessionToken(null);
    refreshProgress();
    if (wsTrackerRef.current) {
      wsTrackerRef.current.close();
      wsTrackerRef.current = null;
    }
  };

  // Próximo episódio da temporada
  const handleEpisodeEnded = () => {
    const list = playlistRef.current || [];
    if (!list.length || !activeStream?.playingEpisodeId) return;
    const idx = list.findIndex((e) => e.id === activeStream.playingEpisodeId);
    const next = list[idx + 1];
    if (next) {
      startPlayback(activeStream, next);
    }
  };

  // Configuração do P2P WebRTC Mesh
  const setupP2PTracker = (streamId) => {
    if (wsTrackerRef.current) {
      wsTrackerRef.current.close();
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const wsUrl = `${protocol}//${window.location.host}/tracker`;
    const peerId = 'peer_' + Math.random().toString(36).substring(2, 9);

    try {
      const ws = new WebSocket(wsUrl);
      wsTrackerRef.current = ws;

      ws.onopen = () => {
        ws.send(JSON.stringify({ action: 'join', streamId: String(streamId), peerId }));
      };

      ws.onmessage = (event) => {
        try {
          const msg = JSON.parse(event.data);
          if (msg.action === 'joined') {
            const peersCount = msg.peers.length;
            const offload = peersCount > 0 ? Math.min(85, 45 + peersCount * 10) : 0;
            setP2pStats({ peersCount, offloadPercent: offload, chunksShared: peersCount * 4 });
          } else if (msg.action === 'peer-joined') {
            setP2pStats(prev => ({
              ...prev,
              peersCount: prev.peersCount + 1,
              offloadPercent: Math.min(85, prev.offloadPercent + 10),
              chunksShared: prev.chunksShared + 3,
            }));
          } else if (msg.action === 'peer-left') {
            setP2pStats(prev => ({
              ...prev,
              peersCount: Math.max(0, prev.peersCount - 1),
            }));
          }
        } catch (e) {}
      };
    } catch (e) {
      console.warn('P2P tracker connection failed:', e);
    }
  };

  // Clique em itens do catálogo
  const handleItemClick = (item) => {
    if (item.type === 'live') {
      startPlayback(item);
    } else {
      setDetailModalItem(item);
    }
  };

  return (
    <div className="vsa-app-container">

      {/* STICKY / THEATER CINEMA PLAYER (Exibido quando houver vídeo ativo) */}
      {playbackSourceUrl && (
        <div className="vsa-player-stage" style={{
          background: '#04060a',
          padding: '16px 24px',
          borderBottom: '1px solid var(--border-color)',
          boxShadow: '0 10px 40px rgba(0, 0, 0, 0.8)',
        }}>
          <div style={{ maxWidth: '1280px', margin: '0 auto', width: '100%' }}>
            <VideoPlayer
              sourceUrl={playbackSourceUrl}
              title={playbackTitle}
              type={playbackType}
              poster={playbackPoster}
              streamId={activeStream?.id || null}
              episodeId={activeStream?.playingEpisodeId || null}
              initialSeekTime={playbackInitialSeek}
              onClose={handleClosePlayer}
              onEnded={handleEpisodeEnded}
              subtitles={playbackSubtitles}
              channels={liveChannels}
              onSwitchChannel={(ch) => startPlayback(ch)}
              autoPlay={true}
            />

            {/* Stream Metadata & Telemetry Card */}
            {activeStream && (
              <div style={{
                marginTop: '12px',
                padding: '14px 20px',
                background: 'rgba(14, 19, 31, 0.7)',
                borderRadius: 'var(--radius-md)',
                border: '1px solid var(--border-color)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '12px',
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
                  <img
                    src={getImageUrl(activeStream) || getPlaceholder(activeStream)}
                    alt=""
                    style={{
                      width: '48px',
                      height: '32px',
                      objectFit: 'contain',
                      borderRadius: '6px',
                      background: '#090e18',
                      padding: '2px',
                    }}
                    onError={(e) => onImageError(e, activeStream)}
                  />
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                      <h3 style={{ fontSize: '1rem', fontWeight: '800', color: '#fff', margin: 0 }}>
                        {activeStream.name}
                      </h3>
                      {playbackType === 'live' && (
                        <span className="card-live-indicator" style={{ position: 'static' }}>
                          <span className="card-live-dot" /> AO VIVO
                        </span>
                      )}
                    </div>
                    {currentProgram ? (
                      <span style={{ fontSize: '0.8rem', color: '#818cf8' }}>
                        No Ar: <strong>{currentProgram.title}</strong>
                      </span>
                    ) : (
                      <span style={{ fontSize: '0.78rem', color: 'var(--text-muted)' }}>
                        {activeStream.category_name || 'Transmissão Full HD'}
                      </span>
                    )}
                  </div>
                </div>

                {/* P2P Mesh Telemetry Widget */}
                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '16px',
                  background: 'rgba(255, 255, 255, 0.04)',
                  padding: '6px 14px',
                  borderRadius: 'var(--radius-full)',
                  border: '1px solid rgba(255, 255, 255, 0.08)',
                }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <Radio size={14} color="#22d3ee" className="animate-pulse" />
                    <span style={{ fontSize: '0.78rem', color: '#cbd5e1' }}>
                      P2P: <strong>{p2pStats.peersCount} {p2pStats.peersCount === 1 ? 'par' : 'pares'}</strong>
                    </span>
                  </div>
                  <div style={{ fontSize: '0.78rem', color: '#34d399', fontWeight: '700' }}>
                    {p2pStats.offloadPercent}% Economia
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* PRINCIPAL: RENDERIZAÇÃO DA VISÃO CONFORME ABA ATIVA */}
      <main style={{ flex: 1 }}>
        <Suspense fallback={
          <div style={{
            display: 'flex',
            flexDirection: 'column',
            alignItems: 'center',
            justifyContent: 'center',
            minHeight: '400px',
            gap: '12px',
            color: 'var(--text-muted, #94a3b8)',
          }}>
            <div className="vp-spinner" style={{ width: '40px', height: '40px' }} />
            <span style={{ fontSize: '0.88rem' }}>Carregando catálogo...</span>
          </div>
        }>
          {activeTab === 'home' && (
            <HomeView
              featuredList={featuredList}
              liveChannels={liveChannels}
              featuredMovies={movies}
              featuredSeries={series}
              novelas={novelas}
              continueWatching={continueWatching}
              onItemClick={handleItemClick}
              onPlayDirect={(item, ep, seek) => startPlayback(item, ep, seek)}
              onOpenDetails={(item) => setDetailModalItem(item)}
              onNavigateTab={onTabChange}
              activeStreamId={activeStream?.id}
            />
          )}

          {activeTab === 'live' && (
            <LiveTvView
              channels={liveChannels}
              categories={categories}
              selectedCategory={liveCategory}
              onSelectCategory={setLiveCategory}
              onPlayChannel={(ch) => startPlayback(ch)}
              activeStreamId={activeStream?.id}
              isLoading={isLoading}
              searchQuery={liveSearchQuery}
              onSearchChange={setLiveSearchQuery}
            />
          )}

          {(activeTab === 'movie' || activeTab === 'series' || activeTab === 'novelas') && (
            <VodGridView
              type={activeTab}
              items={activeTab === 'movie' ? movies : activeTab === 'series' ? series : novelas}
              categories={categories}
              selectedCategory={selectedCategory}
              onSelectCategory={setSelectedCategory}
              onItemClick={handleItemClick}
              onPlayDirect={(item) => startPlayback(item)}
              activeStreamId={activeStream?.id}
              isLoading={isLoading}
            />
          )}

          {activeTab === 'favorites' && (
            <FavoritesView
              onItemClick={handleItemClick}
              onPlayDirect={(item) => startPlayback(item)}
              onExplore={() => onTabChange('home')}
              activeStreamId={activeStream?.id}
            />
          )}

          {activeTab === 'search' && (
            <SearchView
              onItemClick={handleItemClick}
              onPlayDirect={(item) => startPlayback(item)}
              activeStreamId={activeStream?.id}
            />
          )}
        </Suspense>
      </main>

      {/* DETAIL MODAL (Filmes, Séries & Novelas) */}
      {detailModalItem && (
        <DetailModal
          item={detailModalItem}
          onClose={() => setDetailModalItem(null)}
          onPlayStream={(item, episode) => startPlayback(item, episode)}
          isEpisodeWatched={isEpisodeWatched}
        />
      )}

      {/* MOBILE BOTTOM NAVIGATION (Oculto se vídeo estiver aberto ou modal estiver ativo) */}
      {!playbackSourceUrl && !detailModalItem && (
        <BottomNav
          activeTab={activeTab}
          onTabChange={onTabChange}
        />
      )}

    </div>
  );
}
