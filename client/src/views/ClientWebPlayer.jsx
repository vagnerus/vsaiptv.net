import React, { useState, useEffect, useRef, useMemo, useCallback, lazy, Suspense } from 'react';
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
const XxxView = lazy(() => import('./XxxView'));
import { getPlayableUrl, getImageUrl, getPlaceholder, onImageError, getSubtitles } from '../utils/streamUtils';
import { canSeeXxx } from '../utils/xxxAccess';
import { useProgress } from '../hooks/useProgress';
import { Radio, X, Play, Tv, Loader2, AlertCircle, ArrowUp, Layers } from 'lucide-react';

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

  // Área XXX (adulto) — catálogo carregado apenas quando a aba é aberta
  const [xxxCatalog, setXxxCatalog] = useState([]);
  const [xxxLoading, setXxxLoading] = useState(false);
  const showXxxTab = canSeeXxx(user);

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
  const [aiSubtitleJob, setAiSubtitleJob] = useState(null); // Legendas IA (FASE 36)
  const aiSubtitlePollRef = useRef(null);
  const [isPlayerFullscreen, setIsPlayerFullscreen] = useState(false);
  const playlistRef = useRef([]);

  // Playback UX feedback
  const [isStartingPlayback, setIsStartingPlayback] = useState(false);
  const [playbackErrorToast, setPlaybackErrorToast] = useState(null);
  const [isScrolledPastPlayer, setIsScrolledPastPlayer] = useState(false);
  const playerStageRef = useRef(null);

  // ===== Legendas IA (FASE 34/35/36/37) — nunca bloqueia a reprodução =====
  const mergeAiSubtitles = useCallback(async (stream, episode = null) => {
    try {
      if (!stream?.id || stream.type === 'live') return;
      const res = await api.get(`/api/subtitles/content/${stream.id}`, {
        params: episode?.id ? { episodeId: episode.id } : {},
      });
      const data = res.data || {};
      setAiSubtitleJob(data.job || null);
      if (Array.isArray(data.subtitles) && data.subtitles.length) {
        setPlaybackSubtitles((prev) => {
          const existing = new Set(prev.map((s) => s.url));
          const fresh = data.subtitles
            .filter((s) => s?.url && !existing.has(s.url))
            .map((s) => ({ label: s.label, url: s.url }));
          return fresh.length ? [...prev, ...fresh] : prev;
        });
      }
    } catch (e) {
      console.warn('[subtitles-ai] indisponível:', e?.response?.status || e.message);
    }
  }, []);

  // FASE 35: poll leve enquanto houver job ativo — legenda aparece automaticamente
  useEffect(() => {
    if (!aiSubtitleJob || !activeStream?.id) return undefined;
    const episode = activeStream.playingEpisodeId ? { id: activeStream.playingEpisodeId } : null;
    aiSubtitlePollRef.current = setInterval(() => mergeAiSubtitles(activeStream, episode), 15000);
    return () => { if (aiSubtitlePollRef.current) clearInterval(aiSubtitlePollRef.current); };
  }, [aiSubtitleJob?.id, aiSubtitleJob?.status, activeStream?.id, activeStream?.playingEpisodeId, mergeAiSubtitles]);

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

  // Scroll restoration per tab & detection of scroll past player
  const scrollPositionsRef = useRef({});

  useEffect(() => {
    const handleScroll = () => {
      scrollPositionsRef.current[activeTab] = window.scrollY;
      setIsScrolledPastPlayer(window.scrollY > 420);
    };
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, [activeTab]);

  useEffect(() => {
    const savedY = scrollPositionsRef.current[activeTab] || 0;
    window.scrollTo({ top: savedY, behavior: 'instant' });
  }, [activeTab]);

  // Scroll suave e garantido até o player no topo da tela
  const scrollToPlayer = () => {
    requestAnimationFrame(() => {
      window.scrollTo({ top: 0, behavior: 'smooth' });
      if (playerStageRef.current) {
        playerStageRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
      }
    });
  };

  // Garante subida até o player sempre que um vídeo for iniciado
  useEffect(() => {
    if (playbackSourceUrl) {
      scrollToPlayer();
      const t1 = setTimeout(scrollToPlayer, 120);
      const t2 = setTimeout(scrollToPlayer, 350);
      return () => { clearTimeout(t1); clearTimeout(t2); };
    }
  }, [playbackSourceUrl]);

  // Auto-dismiss do toast de erro após 4.5s
  useEffect(() => {
    if (playbackErrorToast) {
      const timer = setTimeout(() => setPlaybackErrorToast(null), 4500);
      return () => clearTimeout(timer);
    }
  }, [playbackErrorToast]);

  // Carrega conteúdo inicial essencial (Canais e Filmes para a Home)
  useEffect(() => {
    let isMounted = true;
    setIsLoading(true);

    const loadInitialData = async () => {
      try {
        const [liveRes, moviesRes, seriesRes, novelasRes] = await Promise.all([
          api.get('/api/client/streams?type=live&limit=40'),
          api.get('/api/client/streams?type=movie&limit=40'),
          api.get('/api/client/streams?type=series&limit=40'),
          api.get('/api/client/streams?type=novelas&limit=40'),
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

  // Carrega streams ao trocar de aba ou categoria selecionada (com limite ampliado)
  useEffect(() => {
    if (!['live', 'movie', 'series', 'novelas'].includes(activeTab)) return;

    let isMounted = true;
    setIsLoading(true);

    const catParam = selectedCategory ? `&category_id=${selectedCategory}` : '';
    const limitParam = selectedCategory ? '500' : '400';

    api.get(`/api/client/streams?type=${activeTab}${catParam}&limit=${limitParam}`)
      .then((res) => {
        if (!isMounted) return;
        if (activeTab === 'live') setLiveChannels(res.data || []);
        else if (activeTab === 'movie') setMovies(res.data || []);
        else if (activeTab === 'series') setSeries(res.data || []);
        else if (activeTab === 'novelas') setNovelas(res.data || []);
      })
      .catch((err) => console.error('Erro ao carregar streams:', err))
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => { isMounted = false; };
  }, [activeTab, selectedCategory]);

  // Catálogo da área XXX (carregado apenas quando a aba XXX é aberta)
  const loadXxxCatalog = useCallback(async () => {
    setXxxLoading(true);
    try {
      const res = await api.get('/api/client/xxx/catalog?limit=300');
      setXxxCatalog(res.data || []);
    } catch (err) {
      console.error('Falha ao carregar o catálogo XXX:', err);
      setXxxCatalog([]);
    } finally {
      setXxxLoading(false);
    }
  }, []);

  useEffect(() => {
    if (activeTab === 'xxx') loadXxxCatalog();
  }, [activeTab, loadXxxCatalog]);



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
    setIsStartingPlayback(true);
    setPlaybackErrorToast(null);

    // Scroll preventivo para cima
    scrollToPlayer();

    try {
      const res = await api.get(`/api/client/stream/${stream.id}`);
      const sessionTok = res.data.sessionToken;
      setSessionToken(sessionTok);
      setCurrentProgram(res.data.currentProgram || null);

      const serverStream = res.data.stream || stream;
      const fullStream = { ...stream, ...serverStream };
      const serverEpisodes = res.data.episodes || [];

      // Identificar se o conteúdo é série ou novela
      const isSeriesOrNovela = fullStream.type === 'series' || 
                               fullStream.category_name?.toLowerCase().includes('novela');

      if (isSeriesOrNovela) {
        // Se for série, determinar qual episódio reproduzir:
        let targetEpisode = episode;

        // Se NÃO foi passado episódio, escolher automaticamente:
        if (!targetEpisode && serverEpisodes.length > 0) {
          // Tenta retomar do histórico "continueWatching" se houver
          const inProgress = (continueWatching || []).find(
            (p) => String(p.stream_id) === String(fullStream.id) && p.episode_id
          );
          if (inProgress) {
            targetEpisode = serverEpisodes.find((e) => String(e.id) === String(inProgress.episode_id)) || serverEpisodes[0];
            if (inProgress.progress_time && !initialSeek) {
              setPlaybackInitialSeek(inProgress.progress_time);
            }
          } else {
            targetEpisode = serverEpisodes[0];
          }
        }

        if (targetEpisode) {
          // Mescla com dados do server se houver
          const foundServerEp = serverEpisodes.find((e) => String(e.id) === String(targetEpisode.id));
          const fullEpisode = foundServerEp ? { ...targetEpisode, ...foundServerEp } : targetEpisode;

          const epUrl = getPlayableUrl(fullEpisode);
          if (!epUrl) {
            throw new Error('Episódio sem URL de transmissão válida.');
          }

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
          mergeAiSubtitles(fullStream, fullEpisode); // FASE 34: busca "Português (IA)"
          setActiveStream({ ...fullStream, playingEpisodeId: fullEpisode.id });
          playlistRef.current = serverEpisodes;
          scrollToPlayer();
        } else {
          // Série sem episódios disponíveis no catálogo: abre detalhes para o usuário
          setDetailModalItem(fullStream);
          setPlaybackErrorToast('Esta série ainda não possui episódios disponíveis no catálogo.');
        }
      } else {
        // Reproduzindo canal ao vivo ou filme VOD
        const streamUrl = getPlayableUrl(fullStream);
        if (!streamUrl) {
          throw new Error('Conteúdo sem URL de transmissão disponível.');
        }
        setPlaybackSourceUrl(streamUrl);
        setPlaybackTitle(fullStream.name);
        setPlaybackType(fullStream.type || 'live');
        setPlaybackPoster(getImageUrl(fullStream));
        setPlaybackSubtitles(getSubtitles(fullStream));
        mergeAiSubtitles(fullStream); // FASE 34: busca "Português (IA)" p/ filmes
        setActiveStream(fullStream);
        scrollToPlayer();
      }

      setupP2PTracker(fullStream.id);
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
      } else {
        setPlaybackErrorToast(
          err.response?.data?.error || 
          err.message || 
          'Não foi possível iniciar a transmissão. Tente novamente ou selecione outro conteúdo.'
        );
      }
    } finally {
      setIsStartingPlayback(false);
    }
  };

  // Reprodução da área XXX: usa a rota protegida /api/client/xxx/stream/:id
  const startXxxPlayback = async (item) => {
    if (!item) return;

    if (sessionToken) {
      api.post('/api/client/session/close', { sessionToken }).catch(() => {});
    }

    setIsStartingPlayback(true);
    setPlaybackErrorToast(null);
    setPlaybackInitialSeek(null);
    scrollToPlayer();

    try {
      const res = await api.get(`/api/client/xxx/stream/${item.id}`);
      const serverStream = res.data?.stream || item;
      const fullStream = { ...item, ...serverStream };
      const streamUrl = getPlayableUrl(fullStream);
      if (!streamUrl) {
        throw new Error('Conteúdo sem URL de transmissão disponível.');
      }

      setSessionToken(res.data?.sessionToken || null);
      setCurrentProgram(null);
      setPlaybackSourceUrl(streamUrl);
      setPlaybackTitle(fullStream.name);
      setPlaybackType(fullStream.type || 'live');
      setPlaybackPoster(getImageUrl(fullStream));
      setPlaybackSubtitles([]);
      setActiveStream(fullStream);
      playlistRef.current = [];
      setupP2PTracker(fullStream.id);
      scrollToPlayer();
    } catch (err) {
      console.error('XXX playback setup error:', err);
      setPlaybackErrorToast(
        err.response?.data?.error ||
        err.message ||
        'Não foi possível iniciar este conteúdo. Tente novamente.'
      );
    } finally {
      setIsStartingPlayback(false);
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
      {/* Playback Feedback Toasts (Loading & Error notifications) */}
      <div className="vsa-toast-container">
        {isStartingPlayback && (
          <div className="vsa-toast-loading animate-fade">
            <Loader2 size={16} className="animate-spin" color="#6366f1" />
            <span>Iniciando transmissão...</span>
          </div>
        )}
        {playbackErrorToast && (
          <div className="vsa-toast-error animate-fade">
            <AlertCircle size={16} color="#fff" />
            <span>{playbackErrorToast}</span>
          </div>
        )}
      </div>

      {/* STICKY / THEATER CINEMA PLAYER (Exibido quando houver vídeo ativo) */}
      {playbackSourceUrl && (
        <div 
          ref={playerStageRef}
          className="vsa-player-stage" 
          style={{
            background: '#04060a',
            padding: '16px 24px',
            borderBottom: '1px solid var(--border-color)',
            boxShadow: '0 10px 40px rgba(0, 0, 0, 0.8)',
          }}
        >
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
              nextEpisode={(() => {
                const list = playlistRef.current || [];
                if (!list.length || !activeStream?.playingEpisodeId) return null;
                const idx = list.findIndex((e) => e.id === activeStream.playingEpisodeId);
                return idx >= 0 && idx < list.length - 1 ? list[idx + 1] : null;
              })()}
              onPlayNext={(nextEp) => startPlayback(activeStream, nextEp)}
              onFullscreenChange={(isFs) => setIsPlayerFullscreen(isFs)}
              autoPlay={true}
            />

            {/* FASE 36: aviso não-bloqueante de geração de legenda IA */}
            {aiSubtitleJob && (
              <div style={{
                marginTop: '10px', padding: '10px 16px', borderRadius: 'var(--radius-md)',
                background: 'rgba(99, 102, 241, 0.12)', border: '1px solid rgba(99, 102, 241, 0.4)',
                fontSize: '0.85rem', color: '#c7d2fe', display: 'flex', alignItems: 'center', gap: '10px',
              }}>
                <span role="img" aria-label="legenda">🈯</span>
                <span>
                  Legenda em português está sendo preparada ({aiSubtitleJob.stage === 'WAITING_TRANSLATION' ? 'aguardando IA' : aiSubtitleJob.stage || 'processando'}):{' '}
                  <strong>{aiSubtitleJob.progress ?? 0}%</strong>
                </span>
              </div>
            )}

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

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', flexWrap: 'wrap' }}>
                  {/* Botão de Escolher Temporadas & Episódios para Séries e Novelas */}
                  {(playbackType === 'episode' || activeStream.type === 'series' || activeStream.category_name?.toLowerCase().includes('novela')) && (
                    <button
                      onClick={() => setDetailModalItem(activeStream)}
                      className="btn btn-secondary btn-sm"
                      style={{
                        borderRadius: 'var(--radius-full)',
                        fontWeight: '700',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '6px',
                        background: 'rgba(99, 102, 241, 0.2)',
                        borderColor: 'rgba(99, 102, 241, 0.4)',
                        color: '#a5b4fc',
                        padding: '7px 16px',
                      }}
                    >
                      <Layers size={15} /> Ver Temporadas & Episódios
                    </button>
                  )}

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

          {activeTab === 'xxx' && (
            <XxxView
              user={user}
              catalog={xxxCatalog}
              isLoading={xxxLoading}
              onPlay={(item) => startXxxPlayback(item)}
              onReload={loadXxxCatalog}
              onBack={() => onTabChange?.('home')}
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

      {/* FLOATING RETURN-TO-PLAYER DOCK (Aparece quando há vídeo tocando e o usuário rolou para baixo) */}
      {playbackSourceUrl && isScrolledPastPlayer && !isPlayerFullscreen && (
        <div 
          className="vsa-floating-player-bar animate-fade"
          onClick={scrollToPlayer}
          title="Clique para voltar ao Player no topo"
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
            <span className="card-live-dot" />
            <span style={{ 
              fontSize: '0.84rem', 
              fontWeight: '700', 
              color: '#fff',
              whiteSpace: 'nowrap',
              overflow: 'hidden',
              textOverflow: 'ellipsis',
              maxWidth: '220px'
            }}>
              {playbackTitle}
            </span>
          </div>
          <button 
            className="btn btn-primary btn-sm"
            style={{ borderRadius: 'var(--radius-full)', padding: '5px 12px', fontSize: '0.78rem' }}
          >
            <ArrowUp size={13} style={{ marginRight: 4 }} /> Ver Player
          </button>
        </div>
      )}

      {/* MOBILE BOTTOM NAVIGATION (Oculto se vídeo estiver aberto ou modal estiver ativo) */}
      {!playbackSourceUrl && !detailModalItem && (
        <BottomNav
          activeTab={activeTab}
          onTabChange={onTabChange}
          showXxx={showXxxTab}
        />
      )}

    </div>
  );
}
