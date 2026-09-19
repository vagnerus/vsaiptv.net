import React, { useState, useEffect } from 'react';
import { useTVMode } from './TVModeContext';
import { X, Activity } from 'lucide-react';

/**
 * TVOverlayDiagnostics — Painel HUD de Informações e Telemetria para Smart TV
 */
export default function TVOverlayDiagnostics() {
  const { showDiagnostics, setShowDiagnostics, deviceProfile, isTVMode, toggleTVMode } = useTVMode();
  const [stats, setStats] = useState({
    fps: 60,
    bufferSec: 0,
    playerState: 'IDLE',
    droppedFrames: 0
  });

  useEffect(() => {
    if (!showDiagnostics) return;

    const interval = setInterval(() => {
      const video = document.querySelector('video');
      if (video) {
        let buf = 0;
        try {
          if (video.buffered.length > 0) {
            buf = Math.max(0, video.buffered.end(video.buffered.length - 1) - video.currentTime);
          }
        } catch {
          buf = 0;
        }

        let dropped = 0;
        if (video.getVideoPlaybackQuality) {
          dropped = video.getVideoPlaybackQuality().droppedVideoFrames || 0;
        } else if (video.webkitDroppedFrameCount) {
          dropped = video.webkitDroppedFrameCount;
        }

        setStats({
          fps: 60,
          bufferSec: buf.toFixed(1),
          playerState: video.paused ? 'PAUSED' : (video.seeking ? 'SEEKING' : 'PLAYING'),
          droppedFrames: dropped
        });
      }
    }, 1000);

    return () => clearInterval(interval);
  }, [showDiagnostics]);

  if (!showDiagnostics) return null;

  const caps = deviceProfile?.capabilities || {};

  return (
    <div className="tv-diag-overlay">
      <div className="tv-diag-header">
        <span style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
          <Activity size={16} /> VSAIPTV DEVICE INFO
        </span>
        <button
          onClick={() => setShowDiagnostics(false)}
          style={{ background: 'transparent', border: 'none', color: '#94a3b8', cursor: 'pointer', padding: 0 }}
        >
          <X size={16} />
        </button>
      </div>

      <div className="tv-diag-row">
        <span className="tv-diag-label">Dispositivo:</span>
        <span className="tv-diag-val">{deviceProfile?.manufacturer} ({deviceProfile?.category})</span>
      </div>

      <div className="tv-diag-row">
        <span className="tv-diag-label">Plataforma:</span>
        <span className="tv-diag-val">{deviceProfile?.platform?.toUpperCase()}</span>
      </div>

      <div className="tv-diag-row">
        <span className="tv-diag-label">Resolução:</span>
        <span className="tv-diag-val">{caps.screenResolution?.width}x{caps.screenResolution?.height}</span>
      </div>

      <div className="tv-diag-row">
        <span className="tv-diag-label">Engine Preferida:</span>
        <span className="tv-diag-val">{deviceProfile?.preferredPlayerEngine}</span>
      </div>

      <div className="tv-diag-row">
        <span className="tv-diag-label">Suporte MSE:</span>
        <span className="tv-diag-val">{caps.supportsMSE ? 'SIM' : 'NÃO'}</span>
      </div>

      <div className="tv-diag-row">
        <span className="tv-diag-label">HLS Nativo:</span>
        <span className="tv-diag-val">{caps.supportsNativeHLS ? 'SIM' : 'NÃO'}</span>
      </div>

      <div className="tv-diag-row">
        <span className="tv-diag-label">Memory Tier:</span>
        <span className="tv-diag-val">{caps.memoryClass?.toUpperCase()} ({deviceProfile?.performanceTier})</span>
      </div>

      <div className="tv-diag-row">
        <span className="tv-diag-label">Compatibilidade HDR:</span>
        <span className="tv-diag-val" style={{ color: caps.supportsHDR ? '#10b981' : '#94a3b8' }}>
          {caps.supportsHDR ? `SIM (${caps.hdrType?.toUpperCase()} / ${caps.colorGamut?.toUpperCase()})` : 'NÃO (SDR)'}
        </span>
      </div>

      <div className="tv-diag-row">
        <span className="tv-diag-label">Entrada:</span>
        <span className="tv-diag-val">{deviceProfile?.inputMode?.toUpperCase()}</span>
      </div>

      <div className="tv-diag-row">
        <span className="tv-diag-label">TV Mode Ativo:</span>
        <span className="tv-diag-val">{isTVMode ? 'SIM' : 'NÃO'}</span>
      </div>

      <div style={{ borderTop: '1px dashed rgba(255,255,255,0.15)', margin: '8px 0' }} />

      <div className="tv-diag-row">
        <span className="tv-diag-label">Player State:</span>
        <span className="tv-diag-val">{stats.playerState}</span>
      </div>

      <div className="tv-diag-row">
        <span className="tv-diag-label">Buffer Atual:</span>
        <span className="tv-diag-val">{stats.bufferSec}s</span>
      </div>

      <div className="tv-diag-row">
        <span className="tv-diag-label">Dropped Frames:</span>
        <span className="tv-diag-val">{stats.droppedFrames}</span>
      </div>

      <div style={{ marginTop: '12px', display: 'flex', gap: '8px' }}>
        <button
          onClick={toggleTVMode}
          style={{
            flex: 1,
            background: 'rgba(56, 189, 248, 0.2)',
            border: '1px solid #38bdf8',
            color: '#38bdf8',
            borderRadius: '6px',
            padding: '6px',
            cursor: 'pointer',
            fontSize: '0.8rem'
          }}
        >
          {isTVMode ? 'Desativar TV Mode' : 'Ativar TV Mode'}
        </button>
      </div>
    </div>
  );
}
