import { useState, useEffect, useContext, createContext } from 'react';

const ProgressContext = createContext();

export function ProgressProvider({ children }) {
  const [continueWatching, setContinueWatching] = useState([]);
  const [watchedEpisodes, setWatchedEpisodes] = useState({});

  useEffect(() => {
    const token = localStorage.getItem('iptv_token');
    if (token) {
      fetchContinueWatching(token);
    }
  }, []);

  const fetchContinueWatching = async (token) => {
    if (!token) token = localStorage.getItem('iptv_token');
    if (!token) return;
    try {
      const res = await fetch('/api/client/progress', {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setContinueWatching(data);
    } catch (e) {
      console.error('Erro carregando progresso:', e);
    }
  };

  const fetchWatchedEpisodes = async (seriesId) => {
    if (watchedEpisodes[seriesId] !== undefined) return;
    const token = localStorage.getItem('iptv_token');
    if (!token) return;
    try {
      const res = await fetch(`/api/client/series/${seriesId}/watched`, {
        headers: { Authorization: `Bearer ${token}` }
      });
      const data = await res.json();
      setWatchedEpisodes(prev => ({ ...prev, [seriesId]: new Set(data) }));
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
      refreshProgress: fetchContinueWatching
    }}>
      {children}
    </ProgressContext.Provider>
  );
}

export const useProgress = () => useContext(ProgressContext);