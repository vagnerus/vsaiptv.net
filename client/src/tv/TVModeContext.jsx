import React, { createContext, useContext, useState, useEffect } from 'react';
import { DeviceProfile } from '../platform/deviceProfile';
import { PlatformManager } from '../platform/PlatformManager';

const TVModeContext = createContext({
  isTVMode: false,
  deviceProfile: null,
  performanceTier: 'medium',
  showDiagnostics: false,
  setShowDiagnostics: () => {},
  toggleTVMode: () => {}
});

export function TVModeProvider({ children }) {
  const [profile, setProfile] = useState(() => DeviceProfile.getProfile());
  const [isTVMode, setIsTVMode] = useState(() => {
    const saved = localStorage.getItem('iptv_tv_mode');
    if (saved !== null) return saved === 'true';
    return profile.category === 'tv' || profile.inputMode === 'remote';
  });
  const [showDiagnostics, setShowDiagnostics] = useState(false);

  useEffect(() => {
    // Inicializa o gerenciador da plataforma nativa (Tizen, webOS, etc.)
    PlatformManager.getInstance().init();

    // Adiciona classe no documentElement para estilização TV global
    if (isTVMode) {
      document.documentElement.classList.add('tv-mode');
      document.documentElement.setAttribute('data-tier', profile.performanceTier);
    } else {
      document.documentElement.classList.remove('tv-mode');
      document.documentElement.removeAttribute('data-tier');
    }

    // Tecla de atalho para alternar Diagnóstico (Tecla 'i' ou 'Info' do controle)
    const handleKey = (e) => {
      if (e.key === 'i' || e.key === 'Info' || e.key === 'ColorF0Red') {
        const active = document.activeElement;
        const isInput = active && (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA');
        if (!isInput) {
          setShowDiagnostics((prev) => !prev);
        }
      }
    };

    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [isTVMode, profile]);

  const toggleTVMode = () => {
    setIsTVMode((prev) => {
      const next = !prev;
      localStorage.setItem('iptv_tv_mode', String(next));
      return next;
    });
  };

  return (
    <TVModeContext.Provider
      value={{
        isTVMode,
        deviceProfile: profile,
        performanceTier: profile.performanceTier,
        showDiagnostics,
        setShowDiagnostics,
        toggleTVMode
      }}
    >
      {children}
    </TVModeContext.Provider>
  );
}

export function useTVMode() {
  return useContext(TVModeContext);
}
