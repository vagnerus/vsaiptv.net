import { useState, useEffect, useContext, createContext, useCallback } from 'react';
import progressSyncManager from '../services/progressSyncManager';

const ProgressContext = createContext();

export function ProgressProvider({ children }) {
  const [continueWatching, setContinueWatching] = useState([]);
  const [watchedEpisodes, setWatchedEpisodes] = useState({});
  const [autoResume, setAutoResumeState] = useState(() => progressSyncManager.getAutoResumePreference());

  const setAutoResume = useCallback((enabled) => {
    setAutoResumeState(enabled);
    progressSyncManager.setAutoResumePreference(enabled);
  }, []);

  const fetchContinueWatching = useCallback(async (token) => {
    if (!token && typeof window !== 'undefined') token = localStorage.getItem('iptv_token');
    if (!token) return;
    try {
      let res = await fetch('/api/watch-progress', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (!res.ok) {
        res = await fetch('/api/client/progress', {
          headers: { Authorization: `Bearer ${token}` }
        });
      }
      if (res.ok) {
        const data = await res.json();
        setContinueWatching(Array.isArray(data) ? data : []);
      }
    } catch (e) {
      console.error('Erro carregando progresso:', e);
    }
  }, []);

  useEffect(() => {
    const token = typeof window !== 'undefined' ? localStorage.getItem('iptv_token') : null;
    if (token) {
      fetchContinueWatching(token);
    }
  }, [fetchContinueWatching]);

  const removeProgress = useCallback(async (streamId, episodeId = null) => {
    // Atualização otimista imediata na UI
    setContinueWatching((prev) =>
      prev.filter((item) => !(item.stream_id === streamId && (episodeId ? item.episode_id === episodeId : true)))
    );

    // Persistência no backend via progressSyncManager
    await progressSyncManager.removeProgress(streamId, episodeId);
  }, []);

  const fetchWatchedEpisodes = async (seriesId) => {
    if (watchedEpisodes[seriesId] !== undefined) return;
    const token = typeof window !== 'undefined' ? localStorage.getItem('iptv_token') : null;
    if (!token) return;
    try {
      const res = await fetch(`/api/client/series/${seriesId}/watched`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setWatchedEpisodes((prev) => ({ ...prev, [seriesId]: new Set(data) }));
    } catch (e) { /* ignore */ }
  };

  const isEpisodeWatched = (seriesId, episodeId) => {
    return watchedEpisodes[seriesId]?.has(episodeId) || false;
  };

  return (
    <ProgressContext.Provider value={{
      continueWatching,
      watchedEpisodes,
      fetchWatchedEpisodes,
      isEpisodeWatched,
      removeProgress,
      refreshProgress: fetchContinueWatching,
      autoResume,
      setAutoResume
    }}>
      {children}
    </ProgressContext.Provider>
  );
}

export const useProgress = () => useContext(ProgressContext);