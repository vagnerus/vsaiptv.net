import React, { useState, useEffect, useRef, useMemo } from 'react';
import Hls from 'hls.js';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  RotateCcw, X, AlertCircle, Settings, Subtitles, SkipForward,
  PictureInPicture, Tv, List, Gauge, Check
} from 'lucide-react';
import { formatDuration, srtToVtt, normalizeLiveStreamUrl } from '../utils/streamUtils';
import { getSourceHttpError } from '../utils/playbackErrors';
import { PlaybackWatchdog } from '../player/PlaybackWatchdog';
import { sentinelClient } from '../player/SentinelClient';
import QuickChannelDrawer from './QuickChannelDrawer';
import './VideoPlayer.css';

// Proxy automático de mídia externa -> /media/proxy?src=<url codificada>
// Duas razões para encaminhar TUDO que é externo pelo servidor:
//  1. o app roda sobre HTTPS e muitos streams são http:// (conteúdo misto é bloqueado);
//  2. origens de IPTV normalmente não enviam cabeçalho CORS, então o hls.js
//     (que usa XHR) não consegue ler a playlist e o canal simplesmente não abre.
const withProxy = (url, isLiveStream = false) => {
  if (!url || typeof url !== 'string') return url;
  const targetUrl = isLiveStream ? normalizeLiveStreamUrl(url) : url;

  // blob:/data: são locais e caminhos relativos já são servidos pela própria origem.
  if (/^(blob:|data:)/i.test(targetUrl)) return targetUrl;
  if (!/^https?:\/\//i.test(targetUrl)) return targetUrl;

  // URLs que já apontam para o próprio servidor não passam pelo proxy novamente.
  if (targetUrl.startsWith(window.location.origin)) return targetUrl;

  return `${window.location.origin}/media/proxy?src=${encodeURIComponent(targetUrl)}`;
};

// ---------- Fullscreen helpers com fallbacks (desktop, Android, iOS, WebView antigos) ----------
function requestFullscreen(el) {
  if (!el) return;
  const fn = el.requestFullscreen || el.webkitRequestFullscreen || el.webkitRequestFullScreen || el.mozRequestFullScreen || el.msRequestFullscreen;
  if (fn) {
    try { fn.call(el); } catch (e) { /* ignore */ }
  } else if (el.video && el.video.webkitEnterFullscreen) {
    try { el.video.webkitEnterFullscreen(); } catch (e) { /* iOS */ }
  }
}

function exitFullscreen() {
  const fn = document.exitFullscreen || document.webkitExitFullscreen || document.webkitCancelFullScreen || document.mozCancelFullScreen || document.msExitFullscreen;
  if (fn) {
    try { fn.call(document); } catch (e) { /* ignore */ }
  }
}

function getFullscreenElement() {
  return document.fullscreenElement || document.webkitFullscreenElement || document.webkitCurrentFullScreenElement || document.mozFullScreenElement || document.msFullscreenElement || null;
}

export default function VideoPlayer({
  sourceUrl,
  title = 'Transmissão',
  type = 'live', // 'live', 'movie', 'episode'
  poster = '',
  streamId = null,
  episodeId = null,
  onClose,
  onError,
  onEnded, // reprodução em sequência: chamado ao terminar um episódio
  subtitles = [], // [{ label, url }]
  autoPlay = true,
  initialSeekTime = null,
  channels = [],
  onSwitchChannel = null,
  nextEpisode = null,
  onPlayNext = null,
  onFullscreenChange = null,
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const hlsRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const progressSaveRef = useRef(null);
  const retryTimeoutRef = useRef(null);
  const retryCountRef = useRef(0);
  const subtitleUrlsRef = useRef([]);

  const isLive = type === 'live';
  const proxiedUrl = useMemo(() => withProxy(sourceUrl, isLive), [sourceUrl, isLive]);

  const [isPlaying, setIsPlaying] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
  const [isMuted, setIsMuted] = useState(false);
  const [volume, setVolume] = useState(1);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [showControls, setShowControls] = useState(true);
  const [errorMessage, setErrorMessage] = useState('');
  const [requiresUserInteraction, setRequiresUserInteraction] = useState(false);
  const [qualities, setQualities] = useState([]);
  const [selectedQuality, setSelectedQuality] = useState(-1); // -1 = Auto
  const [detectedResolution, setDetectedResolution] = useState('');
  const [isHdrActive, setIsHdrActive] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [playbackSpeed, setPlaybackSpeed] = useState(1);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [activeSubtitle, setActiveSubtitle] = useState(-1); // -1 = desligada
  const [hlsSubtitles, setHlsSubtitles] = useState([]);
  const [activeHlsSubtitle, setActiveHlsSubtitle] = useState(-1);
  const [subtitleError, setSubtitleError] = useState('');
  const [ended, setEnded] = useState(false);
  const [showChannelDrawer, setShowChannelDrawer] = useState(false);
  const [nextEpisodeDismissed, setNextEpisodeDismissed] = useState(false);

  // Sanitized technical error reporting (Fases F & N)
  const reportPlaybackError = (errType, errDetails, httpStatus) => {
    try {
      const token = localStorage.getItem('iptv_token');
      if (!token) return;
      fetch('/api/client/player/error', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${token}`
        },
        body: JSON.stringify({
          errorType: String(errType || 'STREAM_ERROR').toUpperCase(),
          contentId: streamId,
          contentName: title,
          errorMessage: String(errDetails || 'Erro de reprodução').slice(0, 300),
          httpStatus: httpStatus || null
        })
      }).catch(() => {});
    } catch (e) {}
  };

  const togglePiP = async () => {
    try {
      if (document.pictureInPictureElement) {
        await document.exitPictureInPicture();
      } else if (videoRef.current && document.pictureInPictureEnabled) {
        await videoRef.current.requestPictureInPicture();
      }
    } catch (err) {
      console.warn('PiP error:', err);
    }
  };

  // Preparar legendas: SRT serÃ¡ convertido para VTT via blob
  const preparedSubtitles = useMemo(() => {
    return (subtitles || []).map((s) => ({
      label: s.label || 'Legenda',
      url: s.url,
      isSrt: /\.srt(\?|$)/i.test(s.url || ''),
    }));
  }, [subtitles]);

  // Criar/remover <track> no elemento video conforme legenda ativa
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    // Limpar tracks anteriores e revogar blob URLs
    const existing = video.querySelectorAll('track[data-vp="1"]');
    existing.forEach((t) => t.remove());
    subtitleUrlsRef.current.forEach((u) => { try { URL.revokeObjectURL(u); } catch (e) { /* ignore */ } });
    subtitleUrlsRef.current = [];

    if (activeSubtitle < 0 || !preparedSubtitles[activeSubtitle]) return;

    const sub = preparedSubtitles[activeSubtitle];
    setSubtitleError('');

    const applyTrack = (vttUrl, revoke) => {
      try {
        const trackEl = document.createElement('track');
        trackEl.kind = 'subtitles';
        trackEl.label = sub.label;
        trackEl.srclang = 'pt';
        trackEl.src = vttUrl;
        trackEl.setAttribute('data-vp', '1');
        if (revoke) subtitleUrlsRef.current.push(vttUrl);
        video.appendChild(trackEl);
        const activate = () => {
          try {
            const tracks = video.textTracks;
            for (let i = 0; i < tracks.length; i++) {
              tracks[i].mode = (i === tracks.length - 1) ? 'showing' : 'disabled';
            }
          } catch (e) { /* ignore */ }
        };
        trackEl.addEventListener('load', activate);
        trackEl.addEventListener('error', () => setSubtitleError('Legenda nÃ£o pÃ´de ser carregada.'));
        setTimeout(activate, 400);
      } catch (e) {
        setSubtitleError('Legenda nÃ£o pÃ´de ser carregada.');
      }
    };

    if (sub.isSrt) {
      fetch(sub.url)
        .then((r) => (r.ok ? r.text() : Promise.reject(new Error('fetch fail'))))
        .then((text) => {
          const vtt = srtToVtt(text);
          if (!vtt || vtt.length < 20) throw new Error('vtt vazio');
          const blob = new Blob([vtt], { type: 'text/vtt' });
          applyTrack(URL.createObjectURL(blob), true);
        })
        .catch(() => setSubtitleError('Legenda nÃ£o pÃ´de ser carregada.'));
    } else {
      applyTrack(sub.url, false);
    }
  }, [activeSubtitle, preparedSubtitles]);

  // InicializaÃ§Ã£o do player (HLS via hls.js, HLS nativo ou MP4/WebM)
  useEffect(() => {
    if (!proxiedUrl) {
      setErrorMessage('ConteÃºdo indisponÃ­vel ou URL nÃ£o fornecida.');
      setIsLoading(false);
      return;
    }

    setErrorMessage('');
    setEnded(false);
    setIsLoading(true);
    setRequiresUserInteraction(false);
    setCurrentTime(0);
    setDuration(0);
    retryCountRef.current = 0;
    setActiveSubtitle(-1);
    setShowSettings(false);
    setShowSubtitleMenu(false);
    setIsHdrActive(false);

    const video = videoRef.current;
    if (!video) return;

    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }

    const startPlayback = () => {
      if (autoPlay) {
        const playPromise = video.play();
        if (playPromise !== undefined) {
          playPromise
            .then(() => {
              setIsPlaying(true);
              setIsLoading(false);
              setRequiresUserInteraction(false);
            })
            .catch(() => {
              // Autoplay bloqueado: botÃ£o play grande fica visÃ­vel para o toque
              setRequiresUserInteraction(true);
              setIsLoading(false);
              setIsPlaying(false);
            });
        }
      } else {
        setIsLoading(false);
      }
    };

    const isHls = /\.m3u8(\?|$|&)/i.test(proxiedUrl) || proxiedUrl.includes('.m3u8') || isLive;

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        // Canais via proxy: prioriza estabilidade e evita congelamentos.
        lowLatencyMode: false,
        backBufferLength: isLive ? 30 : 60,
        maxBufferLength: isLive ? 60 : 60,
        maxMaxBufferLength: isLive ? 300 : 120,
        maxBufferSize: 100 * 1000 * 1000,
        // Mantém 4-5 segmentos de folga e tolerância ampla contra jitter de rede
        liveSyncDurationCount: 4,
        liveMaxLatencyDurationCount: 15,
        maxLiveSyncPlaybackRate: 1.2,
        // Pula pequenos furos de frame no TS automaticamente em vez de travar
        nudgeMaxRetry: 5,
        nudgeOffset: 0.2,
        startLevel: -1,
        testBandwidth: false,
        manifestLoadingTimeOut: 20000,
        manifestLoadingMaxRetry: 5,
        manifestLoadingRetryDelay: 1000,
        levelLoadingTimeOut: 20000,
        levelLoadingMaxRetry: 5,
        levelLoadingRetryDelay: 1000,
        fragLoadingTimeOut: 30000,
        fragLoadingMaxRetry: 6,
        fragLoadingRetryDelay: 1000,
      });

      hls.loadSource(proxiedUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        if (data.levels && data.levels.length > 0) {
          const parsed = data.levels.map((lvl, idx) => {
            const isHdr = lvl.videoRange === 'PQ' ||
                          lvl.videoRange === 'HLG' ||
                          (lvl.attrs && (lvl.attrs['VIDEO-RANGE'] === 'PQ' || lvl.attrs['VIDEO-RANGE'] === 'HLG')) ||
                          (lvl.attrs?.CODECS && (lvl.attrs.CODECS.includes('dvh1') || lvl.attrs.CODECS.includes('dvhe')));

            let label = lvl.height ? `${lvl.height}p` : `${Math.round((lvl.bitrate || 0) / 1000)} kbps`;
            if (isHdr) label += ' HDR';

            return {
              id: idx,
              label,
              height: lvl.height,
              bitrate: lvl.bitrate,
              isHdr: Boolean(isHdr)
            };
          });

          setQualities(parsed);
          if (parsed.some((p) => p.isHdr)) {
            setIsHdrActive(true);
          }
          if (data.levels[0]?.height) {
            const firstLvl = data.levels[0];
            const isFirstHdr = firstLvl.videoRange === 'PQ' || firstLvl.videoRange === 'HLG' || (firstLvl.attrs && (firstLvl.attrs['VIDEO-RANGE'] === 'PQ' || firstLvl.attrs['VIDEO-RANGE'] === 'HLG'));
            setDetectedResolution(`${firstLvl.height}p${isFirstHdr ? ' HDR' : ''}`);
          }
        } else {
          setQualities([]);
        }
        startPlayback();
      });

      hls.on(Hls.Events.SUBTITLE_TRACKS_UPDATED, (event, data) => {
        if (data.subtitleTracks && data.subtitleTracks.length > 0) {
          const hlsTracks = data.subtitleTracks.map((st, idx) => ({
            id: idx,
            label: st.name || st.lang || `Faixa ${idx + 1}`,
            isHls: true,
          }));
          setHlsSubtitles(hlsTracks);
        }
      });

      hls.on(Hls.Events.LEVEL_SWITCHED, (event, data) => {
        if (data.level !== undefined && hls.levels && hls.levels[data.level]) {
          const lvl = hls.levels[data.level];
          const isLvlHdr = lvl.videoRange === 'PQ' ||
                           lvl.videoRange === 'HLG' ||
                           (lvl.attrs && (lvl.attrs['VIDEO-RANGE'] === 'PQ' || lvl.attrs['VIDEO-RANGE'] === 'HLG')) ||
                           (lvl.attrs?.CODECS && (lvl.attrs.CODECS.includes('dvh1') || lvl.attrs.CODECS.includes('dvhe')));
          setIsHdrActive(Boolean(isLvlHdr));
          if (lvl.height) {
            setDetectedResolution(`${lvl.height}p${isLvlHdr ? ' HDR' : ''}`);
          }
        }
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        const sourceError = getSourceHttpError(data.response?.code || data.networkDetails?.status);
        if (sourceError) {
          if (retryTimeoutRef.current) {
            clearTimeout(retryTimeoutRef.current);
            retryTimeoutRef.current = null;
          }
          hls.destroy();
          hlsRef.current = null;
          setErrorMessage(sourceError);
          setIsLoading(false);
          setIsPlaying(false);
          if (onError) onError(sourceError);
          return;
        }
        if (!data.fatal) return;
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            // Notifica Sentinela + reconexão automática (até 3 tentativas com backoff)
            sentinelClient.reportEvent('STREAM_TIMEOUT', {
              hlsDetails: data.details,
              bufferLength: video.buffered?.length > 0 ? video.buffered.end(0) - video.currentTime : 0
            }, streamId);
            if (retryCountRef.current < 3) {
              retryCountRef.current += 1;
              const recovery = sentinelClient.executeDeterministicRecovery(video, hls, proxiedUrl);
              console.debug('[SentinelClient] Network recovery:', recovery);
              retryTimeoutRef.current = setTimeout(() => hls.startLoad(), 1500 * retryCountRef.current);
            } else {
              hls.destroy();
              hlsRef.current = null;
              sentinelClient.resetAttempts();
              setErrorMessage('Falha ao conectar com a transmissão. Verifique sua conexão ou tente novamente.');
              setIsLoading(false);
              if (onError) onError(data.details);
            }
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            // Notifica Sentinela + recuperação progressiva de codec
            sentinelClient.reportEvent('HLS_FATAL_ERROR', {
              hlsDetails: data.details,
              hlsType: 'MEDIA_ERROR'
            }, streamId);
            if (retryCountRef.current < 4) {
              retryCountRef.current += 1;
              if (retryCountRef.current <= 2) {
                hls.recoverMediaError();
              } else {
                hls.swapAudioCodec();
                hls.recoverMediaError();
              }
            } else {
              hls.destroy();
              hlsRef.current = null;
              sentinelClient.resetAttempts();
              setErrorMessage('A transmissão apresenta falhas de codificação e não pôde ser estabilizada.');
              setIsLoading(false);
              if (onError) onError(data.details);
            }
            break;
          default:
            sentinelClient.reportEvent('HLS_FATAL_ERROR', {
              hlsDetails: data.details,
              hlsType: data.type
            }, streamId);
            hls.destroy();
            hlsRef.current = null;
            sentinelClient.resetAttempts();
            setErrorMessage('Falha ao conectar com a transmissão. Verifique sua conexão ou tente novamente.');
            setIsLoading(false);
            if (onError) onError(data.details);
            break;
        }
      });

      hlsRef.current = hls;
    } else {
      // HLS nativo (Safari/iOS/alguns WebViews) ou arquivo direto (MP4/WebM)
      video.src = proxiedUrl;
      const onMeta = () => startPlayback();
      video.addEventListener('loadedmetadata', onMeta, { once: true });
    }

    return () => {
      if (retryTimeoutRef.current) {
        clearTimeout(retryTimeoutRef.current);
        retryTimeoutRef.current = null;
      }
      if (hlsRef.current) {
        try {
          hlsRef.current.stopLoad();
          hlsRef.current.detachMedia();
          hlsRef.current.destroy();
        } catch (e) {}
        hlsRef.current = null;
      }
      if (video) {
        try {
          video.pause();
          video.removeAttribute('src');
          video.load();
        } catch (e) {}
      }
    };
  }, [proxiedUrl, type, autoPlay]);

  // Retomar de onde parou: busca progresso salvo e posiciona o vídeo
  useEffect(() => {
    if (!streamId || type === 'live') return;

    const video = videoRef.current;
    if (!video) return;

    const applySeek = (time) => {
      try {
        if (time && time > 0) {
          video.currentTime = time;
          setCurrentTime(time);
        }
      } catch (e) { /* ignore */ }
    };

    // 1. Se passou initialSeekTime explicitamente (ex: do card Continue Assistindo)
    if (initialSeekTime && initialSeekTime > 0) {
      let applied = false;
      const doSeek = () => {
        if (!applied) {
          applySeek(initialSeekTime);
          applied = true;
        }
      };

      if (video.readyState >= 2) {
        doSeek();
      }
      video.addEventListener('loadedmetadata', doSeek, { once: true });
      video.addEventListener('canplay', doSeek, { once: true });
      video.addEventListener('playing', doSeek, { once: true });
      return;
    }

    // 2. Busca do backend se não veio explícito
    const token = localStorage.getItem('iptv_token');
    if (!token) return;
    fetch(`/api/client/progress/${streamId}`, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((r) => (r.ok ? r.json() : null))
      .then((rec) => {
        if (!rec || !rec.progress_time || rec.progress_time < 5) return;
        // Episódio: só retoma se for o MESMO episódio assistido
        if (rec.episode_id && episodeId && rec.episode_id !== episodeId) return;
        if (rec.duration > 0 && rec.progress_time >= rec.duration * 0.95) return; // já terminou

        if (video.readyState >= 1) {
          applySeek(rec.progress_time);
        } else {
          video.addEventListener('loadedmetadata', () => applySeek(rec.progress_time), { once: true });
        }
      })
      .catch(() => {});
  }, [streamId, episodeId, type, initialSeekTime]);

  // Listeners do elemento video
  useEffect(() => {
    const video = videoRef.current;
    if (!video) return;

    const onPlay = () => { setIsPlaying(true); setRequiresUserInteraction(false); };
    const onPause = () => setIsPlaying(false);
    const onWaiting = () => { setIsLoading(true); armStallWatch(); };
    const onPlaying = () => { setIsLoading(false); setRequiresUserInteraction(false); clearStallWatch(); };
    const onDurationChange = () => setDuration(video.duration || 0);

    // Watchdog de travamento: transmissões ao vivo via proxy podem congelar sem
    // disparar erro algum. Se a imagem não voltar em 4 segundos, força a
    // retomada no ponto ao vivo e destrava o pipeline de decodificação.
    const STALL_LIMIT_MS = 4000;
    let stallTimer = null;
    const clearStallWatch = () => {
      if (stallTimer) { clearTimeout(stallTimer); stallTimer = null; }
    };
    const armStallWatch = () => {
      if (stallTimer) return;
      stallTimer = setTimeout(() => {
        stallTimer = null;
        const hls = hlsRef.current;
        if (!hls || video.paused) return;
        // Notifica Sentinela sobre stall persistente
        sentinelClient.reportEvent('PLAYER_STALLED', {
          stallDurationMs: STALL_LIMIT_MS,
          bufferLength: video.buffered?.length > 0 ? (video.buffered.end(0) - video.currentTime).toFixed(2) : '0',
          currentTime: video.currentTime,
          isLive
        }, streamId);
        try {
          // Tenta recuperação determinística local via SentinelClient
          const recovery = sentinelClient.executeDeterministicRecovery(video, hls, proxiedUrl);
          console.debug('[SentinelClient] Stall recovery:', recovery);
          if (isLive && hls.liveSyncPosition && Math.abs(video.currentTime - hls.liveSyncPosition) > 2) {
            video.currentTime = hls.liveSyncPosition;
          } else if (video.currentTime > 0) {
            video.currentTime += 0.5;
          }
          hls.startLoad(isLive ? -1 : undefined);
        } catch (e) { /* ignore */ }
      }, STALL_LIMIT_MS);
    };

    // Save progress (debounced) - works for movies and episodes
    const saveProgress = () => {
      if (type === 'live' || !streamId) return;
      if (typeof window === 'undefined') return;
      const token = localStorage.getItem('iptv_token');
      if (!token) return;

      if (progressSaveRef.current) clearTimeout(progressSaveRef.current);
      progressSaveRef.current = setTimeout(() => {
        fetch('/api/client/progress', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({
            stream_id: streamId,
            episode_id: episodeId,
            type: type === 'movie' ? 'movie' : 'series',
            progress_time: Math.floor(video.currentTime),
            duration: Math.floor(video.duration || 0),
          })
        }).catch(() => {});
      }, 5000);
    };

    // Mark episode as watched when 90% complete
    const checkEpisodeComplete = () => {
      if (type !== 'episode' || !episodeId) return;
      const token = localStorage.getItem('iptv_token');
      if (!token) return;
      if (video.duration && video.currentTime >= video.duration * 0.9) {
        fetch('/api/client/episode/watched', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${token}` },
          body: JSON.stringify({ episode_id: episodeId, completed: 1 })
        }).catch(() => {});
      }
    };

    const onTimeUpdate = () => {
      clearStallWatch();
      setCurrentTime(video.currentTime);
      saveProgress();
      checkEpisodeComplete();
    };

    const onEndedEvt = () => {
      setIsPlaying(false);
      setEnded(true);
      if (onEnded) onEnded();
    };

    const onVideoError = () => {
      if (video.error && video.error.code === 4) {
        setErrorMessage('Não foi possível reproduzir este vídeo. O link pode estar offline ou incompatível.');
      } else {
        setErrorMessage('Não foi possível reproduzir este vídeo. O link pode estar offline ou instável.');
      }
      setIsLoading(false);
    };

    video.addEventListener('play', onPlay);
    video.addEventListener('pause', onPause);
    video.addEventListener('waiting', onWaiting);
    video.addEventListener('playing', onPlaying);
    video.addEventListener('timeupdate', onTimeUpdate);
    video.addEventListener('durationchange', onDurationChange);
    video.addEventListener('ended', onEndedEvt);
    video.addEventListener('error', onVideoError);

    return () => {
      clearStallWatch();
      video.removeEventListener('play', onPlay);
      video.removeEventListener('pause', onPause);
      video.removeEventListener('waiting', onWaiting);
      video.removeEventListener('playing', onPlaying);
      video.removeEventListener('timeupdate', onTimeUpdate);
      video.removeEventListener('durationchange', onDurationChange);
      video.removeEventListener('ended', onEndedEvt);
      video.removeEventListener('error', onVideoError);
    };
  }, [type, streamId, episodeId, onEnded]);

  // Helper para verificar dispositivo móvel
  const isMobile = () => {
    return /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini/i.test(navigator.userAgent) ||
           (typeof window !== 'undefined' && window.innerWidth <= 820);
  };

  // Sincronizar playbackRate com o elemento de vídeo
  useEffect(() => {
    if (videoRef.current) {
      try {
        videoRef.current.playbackRate = playbackSpeed;
      } catch (e) {}
    }
  }, [playbackSpeed]);

  // Fullscreen: escutar todos os eventos de fallback, gerenciar classes e destravar orientação ao sair
  useEffect(() => {
    const onFsChange = () => {
      const fsEl = getFullscreenElement();
      const isFs = !!fsEl;
      setIsFullscreen(isFs);
      onFullscreenChange?.(isFs);

      if (isFs) {
        document.body.classList.add('vp-body-fullscreen');
      } else {
        document.body.classList.remove('vp-body-fullscreen');
        if (screen?.orientation?.unlock) {
          try { screen.orientation.unlock(); } catch (e) {}
        }
      }
    };
    const events = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
    events.forEach((ev) => document.addEventListener(ev, onFsChange));
    return () => {
      events.forEach((ev) => document.removeEventListener(ev, onFsChange));
      document.body.classList.remove('vp-body-fullscreen');
      if (screen?.orientation?.unlock) {
        try { screen.orientation.unlock(); } catch (e) {}
      }
    };
  }, [onFullscreenChange]);

  // Teclado / controle remoto (D-pad) no player
  useEffect(() => {
    const onKey = (e) => {
      const video = videoRef.current;
      if (!video) return;
      switch (e.key) {
        case ' ':
        case 'Enter':
          if (e.target && e.target.tagName === 'BUTTON') return;
          e.preventDefault();
          togglePlay();
          break;
        case 'MediaPlay':
          e.preventDefault();
          if (video.paused) togglePlay();
          break;
        case 'MediaPause':
          e.preventDefault();
          if (!video.paused) togglePlay();
          break;
        case 'MediaPlayPause':
          e.preventDefault();
          togglePlay();
          break;
        case 'MediaStop':
          e.preventDefault();
          video.pause();
          if (onClose) onClose();
          break;
        case 'MediaFastForward':
          if (!isLive && video.duration) {
            e.preventDefault();
            video.currentTime = Math.min(video.duration, video.currentTime + 15);
          }
          break;
        case 'MediaRewind':
          if (!isLive && video.duration) {
            e.preventDefault();
            video.currentTime = Math.max(0, video.currentTime - 15);
          }
          break;
        case 'ChannelUp':
          if (isLive && channels && channels.length > 1 && onSwitchChannel) {
            e.preventDefault();
            const currIdx = channels.findIndex((c) => c.id === streamId);
            const nextIdx = (currIdx + 1) % channels.length;
            onSwitchChannel(channels[nextIdx]);
          }
          break;
        case 'ChannelDown':
          if (isLive && channels && channels.length > 1 && onSwitchChannel) {
            e.preventDefault();
            const currIdx = channels.findIndex((c) => c.id === streamId);
            const prevIdx = (currIdx - 1 + channels.length) % channels.length;
            onSwitchChannel(channels[prevIdx]);
          }
          break;
        case 'ColorF0Red':
          setShowSettings((prev) => !prev);
          break;
        case 'ColorF1Green':
          setShowChannelDrawer((prev) => !prev);
          break;
        case 'ArrowUp':
          e.preventDefault();
          changeVolume(Math.min(1, (isMuted ? 0 : volume) + 0.1));
          break;
        case 'ArrowDown':
          e.preventDefault();
          changeVolume(Math.max(0, (isMuted ? 0 : volume) - 0.1));
          break;
        case 'ArrowRight':
          if (!isLive && video.duration) {
            e.preventDefault();
            video.currentTime = Math.min(video.duration, video.currentTime + 10);
          }
          break;
        case 'ArrowLeft':
          if (!isLive && video.duration) {
            e.preventDefault();
            video.currentTime = Math.max(0, video.currentTime - 10);
          }
          break;
        case 'Escape':
        case 'Back':
        case 'BrowserBack':
          if (isFullscreen) { exitFullscreen(); }
          else if (onClose) onClose();
          break;
        case 'm':
        case 'M':
          toggleMute();
          break;
        case 'f':
        case 'F':
          toggleFullscreen();
          break;
        default:
          break;
      }
      resetControlsTimeout();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  // Auto-hide dos controles
  const resetControlsTimeout = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => setShowControls(false), 3200);
    }
  };

  useEffect(() => {
    if (isPlaying) resetControlsTimeout();
    else setShowControls(true);
    return () => { if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current); };
  }, [isPlaying]);

  const togglePlay = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused || video.ended) {
      const p = video.play();
      if (p && p.catch) p.catch(() => setRequiresUserInteraction(true));
    } else {
      video.pause();
    }
  };

  const toggleMute = () => {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
    setIsMuted(video.muted);
  };

  const changeVolume = (v) => {
    const video = videoRef.current;
    if (!video) return;
    video.volume = v;
    video.muted = v === 0;
    setVolume(v);
    setIsMuted(video.muted);
  };

  const handleVolumeChange = (e) => changeVolume(parseFloat(e.target.value));

  const handleSeek = (e) => {
    const video = videoRef.current;
    if (!video) return;
    const t = parseFloat(e.target.value);
    try { video.currentTime = t; setCurrentTime(t); } catch (err) { /* ignore */ }
  };

  const toggleFullscreen = async () => {
    const isCurrentlyFs = !!getFullscreenElement() || isFullscreen;
    if (isCurrentlyFs) {
      exitFullscreen();
      setIsFullscreen(false);
      onFullscreenChange?.(false);
      document.body.classList.remove('vp-body-fullscreen');
      if (screen?.orientation?.unlock) {
        try { screen.orientation.unlock(); } catch (e) {}
      }
    } else {
      const container = containerRef.current;
      const video = videoRef.current;

      // Suporte iOS (iPhone) onde div fullscreen não é suportado pelo Safari
      if (!container?.requestFullscreen && !container?.webkitRequestFullscreen && video && video.webkitEnterFullscreen) {
        try {
          video.webkitEnterFullscreen();
          setIsFullscreen(true);
          onFullscreenChange?.(true);
          return;
        } catch (e) {}
      }

      try {
        if (container) {
          requestFullscreen(container);
        }
      } catch (err) {
        console.warn('requestFullscreen error:', err);
      }

      setIsFullscreen(true);
      onFullscreenChange?.(true);
      document.body.classList.add('vp-body-fullscreen');

      // Rotação automática no celular para modo paisagem (landscape)
      if (isMobile()) {
        try {
          if (screen?.orientation?.lock) {
            await screen.orientation.lock('landscape');
          } else if (screen?.lockOrientation) {
            screen.lockOrientation('landscape');
          } else if (screen?.mozLockOrientation) {
            screen.mozLockOrientation('landscape');
          } else if (screen?.msLockOrientation) {
            screen.msLockOrientation('landscape');
          }
        } catch (err) {
          console.log('Orientation lock not supported by browser:', err);
        }
      }
    }
  };

  const handleSpeedChange = (speed) => {
    setPlaybackSpeed(speed);
    if (videoRef.current) {
      try {
        videoRef.current.playbackRate = speed;
      } catch (e) {}
    }
    setShowSpeedMenu(false);
  };

  const handleRetry = () => {
    setErrorMessage('');
    setIsLoading(true);
    setEnded(false);
    retryCountRef.current = 0;
    const video = videoRef.current;
    if (hlsRef.current) {
      hlsRef.current.destroy();
      hlsRef.current = null;
    }
    // Força recriação do player trocando a key do componente interno
    setReloadToken((t) => t + 1);
  };

  const [reloadToken, setReloadToken] = useState(0);
  useEffect(() => {
    if (reloadToken > 0) {
      // Reanexar mídia após retry
      const video = videoRef.current;
      if (video && proxiedUrl) {
        if (hlsRef.current) {
          hlsRef.current.loadSource(proxiedUrl);
          hlsRef.current.attachMedia(video);
        }
      }
    }
  }, [reloadToken, proxiedUrl]);

  const handleQualityChange = (levelId) => {
    setSelectedQuality(levelId);
    if (hlsRef.current) {
      hlsRef.current.currentLevel = levelId; // -1 volta para automático
    }
    setShowSettings(false);
  };

  const selectHlsSubtitle = (idx) => {
    setActiveHlsSubtitle(idx);
    setActiveSubtitle(-1);
    if (hlsRef.current) {
      hlsRef.current.subtitleTrack = idx;
    }
    setShowSubtitleMenu(false);
  };

  const selectSubtitle = (idx) => {
    setActiveSubtitle(idx);
    setActiveHlsSubtitle(-1);
    if (hlsRef.current) {
      hlsRef.current.subtitleTrack = -1;
    }
    setShowSubtitleMenu(false);
  };

  const disableAllSubtitles = () => {
    setActiveSubtitle(-1);
    setActiveHlsSubtitle(-1);
    if (hlsRef.current) {
      hlsRef.current.subtitleTrack = -1;
    }
    setShowSubtitleMenu(false);
  };

  // ---------- Render ----------
  const controlsVisible = showControls || !isPlaying || errorMessage || ended;

  return (
    <div
      ref={containerRef}
      className={`vp-root ${isFullscreen ? 'vp-is-fullscreen' : ''}`}
      tabIndex={0}
      onMouseMove={resetControlsTimeout}
      onTouchStart={resetControlsTimeout}
    >
      <video
        ref={videoRef}
        className="vp-video"
        playsInline
        webkit-playsinline="true"
        x5-playsinline="true"
        preload="metadata"
        poster={poster || undefined}
        controls={false}
        crossOrigin="anonymous"
      />

      {/* Loading spinner */}
      {isLoading && !errorMessage && (
        <div className="vp-center-layer" style={{ pointerEvents: 'none' }}>
          <div className="vp-spinner" />
          <p className="vp-loading-text">Carregando transmissão...</p>
        </div>
      )}

      {/* Overlay: requires interaction (autoplay bloqueado) */}
      {requiresUserInteraction && !errorMessage && (
        <button className="vp-center-layer vp-tap-play" onClick={togglePlay} aria-label="Reproduzir">
          <span className="vp-tap-play-circle"><Play size={34} style={{ marginLeft: 4 }} /></span>
          <span className="vp-tap-play-hint">Toque para reproduzir</span>
        </button>
      )}

      {/* Overlay: Próximo Episódio Contagem Regressiva (Fase G) */}
      {nextEpisode && !nextEpisodeDismissed && !ended && duration > 0 && (duration - currentTime <= 15) && currentTime > 10 && (
        <div style={{
          position: 'absolute',
          bottom: '84px',
          right: '24px',
          zIndex: 30,
          background: 'rgba(15, 23, 42, 0.94)',
          backdropFilter: 'blur(12px)',
          border: '1px solid rgba(99, 102, 241, 0.45)',
          borderRadius: '12px',
          padding: '16px 20px',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.8)',
          display: 'flex',
          flexDirection: 'column',
          gap: '10px',
          maxWidth: '320px',
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.78rem', color: '#818cf8', fontWeight: 700, textTransform: 'uppercase' }}>
              Próximo episódio em {Math.max(1, Math.ceil(duration - currentTime))}...
            </span>
            <button 
              onClick={() => setNextEpisodeDismissed(true)} 
              style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
            >
              <X size={16} />
            </button>
          </div>
          <div style={{ fontSize: '0.92rem', fontWeight: 600, color: '#fff', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {nextEpisode.title || `Episódio ${nextEpisode.episode_num}`}
          </div>
          <div style={{ display: 'flex', gap: '8px', marginTop: '4px' }}>
            <button 
              onClick={() => { if (onPlayNext) onPlayNext(nextEpisode); }}
              className="vp-btn vp-btn-primary"
              style={{ flex: 1, padding: '8px 12px', fontSize: '0.82rem', justifyContent: 'center' }}
            >
              <SkipForward size={14} /> Assistir Agora
            </button>
            <button 
              onClick={() => setNextEpisodeDismissed(true)} 
              className="vp-btn vp-btn-secondary"
              style={{ padding: '8px 12px', fontSize: '0.82rem' }}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}

      {/* Overlay: fim de episódio / próxima reprodução */}
      {ended && !errorMessage && onEnded && (
        <div className="vp-center-layer">
          <div className="vp-ended-box">
            <p>Fim do episódio</p>
            <button className="vp-btn vp-btn-primary" onClick={togglePlay}>
              <RotateCcw size={15} /> Assistir novamente
            </button>
            <button className="vp-btn vp-btn-secondary" onClick={onEnded}>
              <SkipForward size={15} /> Próximo
            </button>
          </div>
        </div>
      )}

      {/* Erro amigável + tentar novamente / trocar canal / voltar */}
      {errorMessage && (
        <div className="vp-center-layer">
          <div className="vp-error-box">
            <AlertCircle size={34} color="#f87171" />
            <h4>Não foi possível reproduzir este conteúdo</h4>
            <p>{errorMessage}</p>
            <div className="vp-error-actions">
              <button className="vp-btn vp-btn-primary" onClick={handleRetry}>
                <RotateCcw size={15} /> Tentar novamente
              </button>
              {isLive && channels && channels.length > 0 && (
                <button
                  className="vp-btn vp-btn-secondary"
                  onClick={() => setShowChannelDrawer(true)}
                >
                  <List size={15} /> Trocar canal
                </button>
              )}
              {onClose && (
                <button className="vp-btn vp-btn-secondary" onClick={onClose}>
                  <X size={15} /> Voltar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {/* Header com Título à esquerda e Legendas/PiP/Fechar no canto superior direito */}
      <div className={`vp-header ${controlsVisible ? '' : 'vp-hidden'}`}>
        <div className="vp-header-left">
          {isLive ? (
            <span className="vp-live-badge"><span className="vp-live-dot" /> AO VIVO</span>
          ) : (
            <span className="vp-type-badge">{type === 'episode' ? 'EPISÓDIO' : 'FILME'}</span>
          )}
          {isHdrActive && (
            <span className="vp-hdr-badge" title="High Dynamic Range (HDR)">HDR</span>
          )}
          <h4 className="vp-title">{title}</h4>
        </div>

        <div className="vp-header-right">
          {/* Botão de Legendas no topo superior direito */}
          <div className="vp-menu-anchor">
            <button
              className={`vp-icon-btn vp-header-action-btn ${activeSubtitle >= 0 || activeHlsSubtitle >= 0 ? 'vp-active' : ''}`}
              onClick={() => {
                setShowSubtitleMenu((s) => !s);
                setShowSettings(false);
                setShowSpeedMenu(false);
              }}
              aria-label="Legendas"
              title="Legendas (CC)"
            >
              <Subtitles size={19} />
            </button>
            {showSubtitleMenu && (
              <div className="vp-menu vp-menu-top">
                <div className="vp-menu-header">Legendas</div>
                <button
                  className="vp-menu-item"
                  onClick={disableAllSubtitles}
                >
                  <span>Desligadas</span>
                  {activeSubtitle === -1 && activeHlsSubtitle === -1 && <span className="vp-check">✓</span>}
                </button>

                {/* Faixas de legenda embutidas no stream HLS */}
                {hlsSubtitles.map((track) => (
                  <button
                    key={`hls_${track.id}`}
                    className="vp-menu-item"
                    onClick={() => selectHlsSubtitle(track.id)}
                  >
                    <span>{track.label}</span>
                    {activeHlsSubtitle === track.id && <span className="vp-check">✓</span>}
                  </button>
                ))}

                {/* Faixas de legenda externas (SRT/VTT) */}
                {preparedSubtitles.map((s, idx) => (
                  <button
                    key={`ext_${idx}`}
                    className="vp-menu-item"
                    onClick={() => selectSubtitle(idx)}
                  >
                    <span>{s.label}</span>
                    {activeSubtitle === idx && <span className="vp-check">✓</span>}
                  </button>
                ))}

                {hlsSubtitles.length === 0 && preparedSubtitles.length === 0 && (
                  <p className="vp-sub-error" style={{ color: '#94a3b8' }}>
                    Nenhuma legenda disponível neste conteúdo.
                  </p>
                )}

                {subtitleError && <p className="vp-sub-error">{subtitleError}</p>}
              </div>
            )}
          </div>

          {/* Mini-player (Picture-in-Picture) no topo */}
          <button className="vp-icon-btn vp-header-action-btn" onClick={togglePiP} aria-label="Picture-in-Picture" title="Mini-player (PiP)">
            <PictureInPicture size={18} />
          </button>

          {onClose && (
            <button className="vp-icon-btn vp-close-btn" onClick={onClose} aria-label="Fechar player" title="Fechar player">
              <X size={18} />
            </button>
          )}
        </div>
      </div>

      {/* Controles */}
      <div className={`vp-controls ${controlsVisible ? '' : 'vp-hidden'}`}>
        {!isLive && (
          <div className="vp-scrub-row">
            <span className="vp-time">{formatDuration(currentTime)}</span>
            <input
              type="range"
              className="vp-range"
              min="0"
              max={duration || 100}
              step="0.5"
              value={currentTime}
              onChange={handleSeek}
              aria-label="Progresso do vÃ­deo"
            />
            <span className="vp-time vp-time-right">{formatDuration(duration)}</span>
          </div>
        )}

        <div className="vp-buttons-row">
          <div className="vp-buttons-left">
            <button className="vp-icon-btn" onClick={togglePlay} aria-label={isPlaying ? 'Pausar' : 'Reproduzir'} title="Play/Pause (OK)">
              {isPlaying ? <Pause size={24} /> : <Play size={24} />}
            </button>

            <div className="vp-volume-group">
              <button className="vp-icon-btn" onClick={toggleMute} aria-label={isMuted ? 'Desmutar' : 'Mutar'} title="Mudo (M)">
                {isMuted || volume === 0 ? <VolumeX size={20} /> : <Volume2 size={20} />}
              </button>
              <input
                type="range"
                className="vp-range vp-volume-range"
                min="0"
                max="1"
                step="0.05"
                value={isMuted ? 0 : volume}
                onChange={handleVolumeChange}
                aria-label="Volume"
              />
            </div>
          </div>

          <div className="vp-buttons-right">
            {/* 1. Controle de Velocidade de Transmissão */}
            <div className="vp-menu-anchor">
              <button
                className={`vp-icon-btn ${playbackSpeed !== 1 ? 'vp-active' : ''}`}
                onClick={() => {
                  setShowSpeedMenu((s) => !s);
                  setShowSettings(false);
                }}
                aria-label="Velocidade de transmissão"
                title="Velocidade de reprodução"
              >
                <Gauge size={18} />
                <span className="vp-quality-label">{playbackSpeed}x</span>
              </button>
              {showSpeedMenu && (
                <div className="vp-menu">
                  <div className="vp-menu-header">Velocidade</div>
                  {[0.5, 0.75, 1, 1.25, 1.5, 2].map((s) => (
                    <button
                      key={s}
                      className={`vp-menu-item ${playbackSpeed === s ? 'active' : ''}`}
                      onClick={() => handleSpeedChange(s)}
                    >
                      <span>{s === 1 ? 'Normal (1x)' : `${s}x`}</span>
                      {playbackSpeed === s && <span className="vp-check">✓</span>}
                    </button>
                  ))}
                </div>
              )}
            </div>

            {/* 2. Controle de Qualidade de Vídeo */}
            <div className="vp-menu-anchor">
              <button
                className="vp-icon-btn"
                onClick={() => {
                  setShowSettings((s) => !s);
                  setShowSpeedMenu(false);
                }}
                aria-label="Qualidade de vídeo"
                title="Qualidade de transmissão"
              >
                <Settings size={18} />
                <span className="vp-quality-label">
                  {selectedQuality === -1
                    ? (detectedResolution ? `Auto (${detectedResolution})` : 'Auto')
                    : (qualities[selectedQuality]?.label || 'HD')}
                </span>
              </button>
              {showSettings && (
                <div className="vp-menu">
                  <div className="vp-menu-header">Qualidade de Vídeo</div>
                  <button className="vp-menu-item" onClick={() => handleQualityChange(-1)}>
                    <span>Automática {detectedResolution ? `(${detectedResolution})` : ''}</span>
                    {selectedQuality === -1 && <span className="vp-check">✓</span>}
                  </button>
                  {qualities.length > 0 ? (
                    qualities.map((q) => (
                      <button key={q.id} className="vp-menu-item" onClick={() => handleQualityChange(q.id)}>
                        <span>{q.label}</span>
                        {selectedQuality === q.id && <span className="vp-check">✓</span>}
                      </button>
                    ))
                  ) : (
                    <button className="vp-menu-item" onClick={() => setShowSettings(false)}>
                      <span>Original HD {detectedResolution ? `(${detectedResolution})` : ''}</span>
                      <span className="vp-check">✓</span>
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* 3. Trocar canal (TV Ao Vivo) */}
            {isLive && channels.length > 0 && (
              <button
                className={`vp-icon-btn ${showChannelDrawer ? 'vp-active' : ''}`}
                onClick={() => setShowChannelDrawer(s => !s)}
                aria-label="Lista de canais"
                title="Trocar canal rápido"
              >
                <List size={19} />
              </button>
            )}

            {/* 4. Botão de Tela Cheia com máxima prioridade e destaque visual */}
            <button 
              className="vp-icon-btn vp-fullscreen-btn" 
              onClick={toggleFullscreen} 
              aria-label="Tela cheia" 
              title="Tela cheia (F)"
            >
              {isFullscreen ? <Minimize size={21} /> : <Maximize size={21} />}
            </button>
          </div>
        </div>
      </div>

      {/* Quick Channel Drawer inside Player for Live TV */}
      {showChannelDrawer && isLive && (
        <QuickChannelDrawer
          channels={channels}
          activeChannelId={streamId}
          onSelectChannel={(ch) => {
            onSwitchChannel?.(ch);
            setShowChannelDrawer(false);
          }}
          onClose={() => setShowChannelDrawer(false)}
        />
      )}
    </div>
  );
}


