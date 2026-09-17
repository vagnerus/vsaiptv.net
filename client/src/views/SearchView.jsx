import React, { useState, useEffect } from 'react';
import MediaCard from '../components/MediaCard';
import { Search, X, AlertCircle, Tv, Film, Clapperboard, Layers } from 'lucide-react';
import api from '../services/api';

export default function SearchView({
  onItemClick,
  onPlayDirect,
  activeStreamId = null,
}) {
  const [query, setQuery] = useState('');
  const [debouncedQuery, setDebouncedQuery] = useState('');
  const [activeFilter, setActiveFilter] = useState('all');
  const [results, setResults] = useState([]);
  const [isLoading, setIsLoading] = useState(false);

  // 300ms Debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      setDebouncedQuery(query);
    }, 300);
    return () => clearTimeout(timer);
  }, [query]);

  // Fetch search results from API
  useEffect(() => {
    if (!debouncedQuery.trim()) {
      setResults([]);
      setIsLoading(false);
      return;
    }

    let isMounted = true;
    setIsLoading(true);

    const typeParam = activeFilter !== 'all' ? `&type=${activeFilter}` : '';
    api.get(`/api/client/streams?search=${encodeURIComponent(debouncedQuery.trim())}${typeParam}`)
      .then((res) => {
        if (isMounted) setResults(res.data || []);
      })
      .catch((err) => {
        console.error('Search error:', err);
      })
      .finally(() => {
        if (isMounted) setIsLoading(false);
      });

    return () => { isMounted = false; };
  }, [debouncedQuery, activeFilter]);

  return (
    <div className="search-view-container animate-fade">
      {/* Search Hero Box */}
      <div className="search-input-hero">
        <Search size={22} className="search-field-icon" />
        <input
          type="text"
          className="search-input-field"
          placeholder="O que você quer assistir hoje? (ex: SporTV, Batman, Novela...)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          autoFocus
        />
        {query && (
          <button
            onClick={() => setQuery('')}
            style={{
              position: 'absolute',
              right: '20px',
              top: '50%',
              transform: 'translateY(-50%)',
              background: 'none',
              border: 'none',
              color: 'var(--text-muted)',
              cursor: 'pointer',
            }}
          >
            <X size={20} />
          </button>
        )}
      </div>

      {/* Filter Tabs */}
      <div style={{ display: 'flex', gap: '8px', marginBottom: '24px', overflowX: 'auto' }} className="no-scrollbar">
        {[
          { id: 'all', label: 'Todos os Resultados' },
          { id: 'live', label: 'Canais de TV' },
          { id: 'movie', label: 'Filmes' },
          { id: 'series', label: 'Séries' },
          { id: 'novelas', label: 'Novelas' },
        ].map((tab) => (
          <button
            key={tab.id}
            className={`livetv-cat-pill ${activeFilter === tab.id ? 'active' : ''}`}
            onClick={() => setActiveFilter(tab.id)}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Results or States */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <div className="spinner-circle" style={{ margin: '0 auto 16px' }} />
          <span>Buscando no catálogo global...</span>
        </div>
      ) : !debouncedQuery.trim() ? (
        <div style={{ textAlign: 'center', padding: '70px 20px', color: 'var(--text-muted)' }}>
          <Search size={40} style={{ margin: '0 auto 14px', opacity: 0.4 }} />
          <h3 style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '6px' }}>
            Digite o nome de um canal, filme ou série
          </h3>
          <p style={{ fontSize: '0.85rem' }}>Pesquise instantaneamente entre milhares de conteúdos ao vivo e sob demanda.</p>
        </div>
      ) : results.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '70px 20px', color: 'var(--text-muted)' }}>
          <AlertCircle size={40} style={{ margin: '0 auto 14px', opacity: 0.5 }} />
          <h3 style={{ color: '#fff', fontSize: '1.2rem', marginBottom: '6px' }}>
            Nenhum resultado encontrado para "{debouncedQuery}"
          </h3>
          <p style={{ fontSize: '0.85rem' }}>Verifique se a ortografia está correta ou tente buscar por outro termo.</p>
        </div>
      ) : (
        <div>
          <div style={{ marginBottom: '16px', color: 'var(--text-secondary)', fontSize: '0.88rem' }}>
            Encontrados <strong style={{ color: '#fff' }}>{results.length}</strong> resultados para "{debouncedQuery}":
          </div>

          <div className="vod-catalog-grid">
            {results.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                onClick={() => onItemClick?.(item)}
                onPlayDirect={() => onPlayDirect?.(item)}
                isPlaying={String(activeStreamId) === String(item.id)}
              />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
