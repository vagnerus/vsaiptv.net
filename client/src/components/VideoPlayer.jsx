import React, { useState, useEffect, useRef, useMemo } from 'react';
import Hls from 'hls.js';
import {
  Play, Pause, Volume2, VolumeX, Maximize, Minimize,
  RotateCcw, X, AlertCircle, Settings, Subtitles, SkipForward,
  PictureInPicture, Tv, List
} from 'lucide-react';
import { formatDuration, srtToVtt } from '../utils/streamUtils';
import QuickChannelDrawer from './QuickChannelDrawer';
import './VideoPlayer.css';

// Proxy automÃ¡tico: qualquer http:// externo vira /media/proxy?src=<url codificada>
// (o app roda sobre HTTPS; navegadores bloqueiam conteÃºdo misto http:// em pÃ¡gina https://)
const withProxy = (url) => {
  if (!url || typeof url !== 'string') return url;
  if (/^http:\/\//i.test(url)) {
    return `${window.location.origin}/media/proxy?src=${encodeURIComponent(url)}`;
  }
  return url;
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
}) {
  const videoRef = useRef(null);
  const containerRef = useRef(null);
  const hlsRef = useRef(null);
  const controlsTimeoutRef = useRef(null);
  const progressSaveRef = useRef(null);
  const retryTimeoutRef = useRef(null);
  const retryCountRef = useRef(0);
  const subtitleUrlsRef = useRef([]);

  const proxiedUrl = useMemo(() => withProxy(sourceUrl), [sourceUrl]);

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
  const [showSettings, setShowSettings] = useState(false);
  const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
  const [activeSubtitle, setActiveSubtitle] = useState(-1); // -1 = desligada
  const [subtitleError, setSubtitleError] = useState('');
  const [ended, setEnded] = useState(false);
  const [showChannelDrawer, setShowChannelDrawer] = useState(false);

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

  const isLive = type === 'live';

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

    const isHls = /\.m3u8(\?|$)/i.test(proxiedUrl) || isLive;

    if (isHls && Hls.isSupported()) {
      const hls = new Hls({
        enableWorker: true,
        lowLatencyMode: isLive,
        backBufferLength: isLive ? 15 : 60,
        maxBufferLength: 30,
        maxMaxBufferLength: 60,
      });

      hls.loadSource(proxiedUrl);
      hls.attachMedia(video);

      hls.on(Hls.Events.MANIFEST_PARSED, (event, data) => {
        if (data.levels && data.levels.length > 1) {
          setQualities(data.levels.map((lvl, idx) => ({
            id: idx,
            label: lvl.height ? `${lvl.height}p` : `${Math.round(lvl.bitrate / 1000)} kbps`,
          })));
        } else {
          setQualities([]);
        }
        startPlayback();
      });

      hls.on(Hls.Events.ERROR, (event, data) => {
        if (!data.fatal) return;
        switch (data.type) {
          case Hls.ErrorTypes.NETWORK_ERROR:
            // ReconexÃ£o automÃ¡tica bÃ¡sica (atÃ© 3 tentativas com backoff)
            if (retryCountRef.current < 3) {
              retryCountRef.current += 1;
              retryTimeoutRef.current = setTimeout(() => hls.startLoad(), 1500 * retryCountRef.current);
            } else {
              hls.destroy();
              hlsRef.current = null;
              setErrorMessage('Falha ao conectar com a transmissão. Verifique sua conexão ou tente novamente.');
              setIsLoading(false);
              if (onError) onError(data.details);
            }
            break;
          case Hls.ErrorTypes.MEDIA_ERROR:
            hls.recoverMediaError();
            break;
          default:
            hls.destroy();
            hlsRef.current = null;
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
    const onWaiting = () => setIsLoading(true);
    const onPlaying = () => { setIsLoading(false); setRequiresUserInteraction(false); };
    const onDurationChange = () => setDuration(video.duration || 0);

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
        setErrorMessage('NÃ£o foi possÃ­vel reproduzir este vÃ­deo. O link pode estar offline ou incompatÃ­vel.');
      } else {
        setErrorMessage('NÃ£o foi possÃ­vel reproduzir este vÃ­deo. O link pode estar offline ou instÃ¡vel.');
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

  // Fullscreen: escutar todos os eventos de fallback
  useEffect(() => {
    const onFsChange = () => setIsFullscreen(!!getFullscreenElement());
    const events = ['fullscreenchange', 'webkitfullscreenchange', 'mozfullscreenchange', 'MSFullscreenChange'];
    events.forEach((ev) => document.addEventListener(ev, onFsChange));
    return () => events.forEach((ev) => document.removeEventListener(ev, onFsChange));
  }, []);

  // Teclado / controle remoto (D-pad) no player
  useEffect(() => {
    const onKey = (e) => {
      const video = videoRef.current;
      if (!video) return;
      switch (e.key) {
        case ' ':
        case 'Enter':
          if (e.target && e.target.tagName === 'BUTTON') return; // botÃµes cuidam de si
          e.preventDefault();
          togglePlay();
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

  const toggleFullscreen = () => {
    if (getFullscreenElement()) exitFullscreen();
    else requestFullscreen(containerRef.current);
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
    // ForÃ§a recriaÃ§Ã£o do player trocando a key do componente interno
    setReloadToken((t) => t + 1);
  };

  const [reloadToken, setReloadToken] = useState(0);
  useEffect(() => {
    if (reloadToken > 0) {
      // Reanexar mÃ­dia apÃ³s retry
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
      hlsRef.current.currentLevel = levelId; // -1 volta para automÃ¡tico
    }
    setShowSettings(false);
  };

  const selectSubtitle = (idx) => {
    setActiveSubtitle(idx);
    setShowSubtitleMenu(false);
  };

  // ---------- Render ----------
  const controlsVisible = showControls || !isPlaying || errorMessage || ended;

  return (
    <div
      ref={containerRef}
      className="vp-root"
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

      {/* Header */}
      <div className={`vp-header ${controlsVisible ? '' : 'vp-hidden'}`}>
        <div className="vp-header-left">
          {isLive ? (
            <span className="vp-live-badge"><span className="vp-live-dot" /> AO VIVO</span>
          ) : (
            <span className="vp-type-badge">{type === 'episode' ? 'EPISÓDIO' : 'FILME'}</span>
          )}
          <h4 className="vp-title">{title}</h4>
        </div>
        {onClose && (
          <button className="vp-icon-btn vp-close-btn" onClick={onClose} aria-label="Fechar player" title="Fechar player (Back no controle)">
            <X size={18} />
          </button>
        )}
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
            {preparedSubtitles.length > 0 && (
              <div className="vp-menu-anchor">
                <button
                  className={`vp-icon-btn ${activeSubtitle >= 0 ? 'vp-active' : ''}`}
                  onClick={() => { setShowSubtitleMenu((s) => !s); setShowSettings(false); }}
                  aria-label="Legendas"
                  title="Legendas"
                >
                  <Subtitles size={20} />
                </button>
                {showSubtitleMenu && (
                  <div className="vp-menu">
                    <button className="vp-menu-item" onClick={() => selectSubtitle(-1)}>
                      Desligadas {activeSubtitle === -1 && <span className="vp-check">âœ“</span>}
                    </button>
                    {preparedSubtitles.map((s, idx) => (
                      <button key={idx} className="vp-menu-item" onClick={() => selectSubtitle(idx)}>
                        {s.label} {activeSubtitle === idx && <span className="vp-check">âœ“</span>}
                      </button>
                    ))}
                    {subtitleError && <p className="vp-sub-error">{subtitleError}</p>}
                  </div>
                )}
              </div>
            )}

            {qualities.length > 0 && (
              <div className="vp-menu-anchor">
                <button
                  className="vp-icon-btn"
                  onClick={() => { setShowSettings((s) => !s); setShowSubtitleMenu(false); }}
                  aria-label="Qualidade de vÃ­deo"
                  title="Qualidade"
                >
                  <Settings size={19} />
                  <span className="vp-quality-label">{selectedQuality === -1 ? 'Auto' : (qualities[selectedQuality] || {}).label}</span>
                </button>
                {showSettings && (
                  <div className="vp-menu">
                    <button className="vp-menu-item" onClick={() => handleQualityChange(-1)}>
                      AutomÃ¡tica {selectedQuality === -1 && <span className="vp-check">âœ“</span>}
                    </button>
                    {qualities.map((q) => (
                      <button key={q.id} className="vp-menu-item" onClick={() => handleQualityChange(q.id)}>
                        {q.label} {selectedQuality === q.id && <span className="vp-check">âœ“</span>}
                      </button>
                    ))}
                  </div>
                )}
              </div>
            )}

            {isLive && channels.length > 0 && (
              <button
                className={`vp-icon-btn ${showChannelDrawer ? 'vp-active' : ''}`}
                onClick={() => setShowChannelDrawer(s => !s)}
                aria-label="Lista de canais"
                title="Trocar canal rápido"
              >
                <List size={20} />
              </button>
            )}

            <button className="vp-icon-btn" onClick={togglePiP} aria-label="Picture-in-Picture" title="Mini-player (PiP)">
              <PictureInPicture size={19} />
            </button>

            <button className="vp-icon-btn" onClick={toggleFullscreen} aria-label="Tela cheia" title="Tela cheia (F)">
              {isFullscreen ? <Minimize size={20} /> : <Maximize size={20} />}
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


