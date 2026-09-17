import React, { useState, useEffect, useRef } from 'react';
import { Play, Info, Star, Calendar } from 'lucide-react';
import { getImageUrl, getPlaceholder, onImageError, extractRealResolution } from '../utils/streamUtils';

export default function HeroBanner({
  featuredItems = [],
  onPlay,
  onOpenDetails,
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [isPaused, setIsPaused] = useState(false);
  const timerRef = useRef(null);

  // Auto rotation with pause-on-hover & respect prefers-reduced-motion
  useEffect(() => {
    if (!featuredItems || featuredItems.length <= 1) return;

    // Check prefers-reduced-motion
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion || isPaused) {
      if (timerRef.current) clearInterval(timerRef.current);
      return;
    }

    timerRef.current = setInterval(() => {
      setCurrentIndex((prev) => (prev + 1) % featuredItems.length);
    }, 8500);

    return () => {
      if (timerRef.current) clearInterval(timerRef.current);
    };
  }, [featuredItems, isPaused]);

  if (!featuredItems || featuredItems.length === 0) {
    return <div className="vsa-hero-banner skeleton-box skeleton-hero" />;
  }

  const current = featuredItems[currentIndex] || featuredItems[0];
  const isSeries = current.type === 'series' || current.category_name?.toLowerCase().includes('novela');
  const isNovela = current.category_name?.toLowerCase().includes('novela');
  
  // Real data only
  const hasBackdrop = Boolean(current.backdrop_url);
  const backdropImg = current.backdrop_url || current.poster_url || getImageUrl(current);
  const year = current.release_date ? String(current.release_date).slice(0, 4) : null;
  const rating = current.rating ? String(current.rating) : null;
  const realRes = extractRealResolution(current.name);

  return (
    <div 
      className="vsa-hero-banner"
      onMouseEnter={() => setIsPaused(true)}
      onMouseLeave={() => setIsPaused(false)}
      onFocus={() => setIsPaused(true)}
      onBlur={() => setIsPaused(false)}
    >
      {/* Background layer: If no native backdrop, ambient blur behind it */}
      {!hasBackdrop && (
        <div 
          className="vsa-hero-ambient"
          style={{
            backgroundImage: `url(${backdropImg || ''})`,
          }}
        />
      )}

      {/* Main backdrop image with smooth crossfade */}
      <img
        key={current.id}
        src={backdropImg || getPlaceholder(current)}
        alt={current.name || ''}
        className={`vsa-hero-backdrop ${!hasBackdrop ? 'contained' : ''}`}
        onError={(e) => onImageError(e, current)}
      />

      {/* Smooth multi-stage cinematic gradient overlay */}
      <div className="vsa-hero-vignette" />

      {/* Hero content details */}
      <div className="vsa-hero-content animate-fade" key={`content-${current.id}`}>
        <div className="vsa-hero-badge-row">
          <span className="vsa-hero-meta-item">
            <span style={{
              background: 'rgba(255, 255, 255, 0.12)',
              border: '1px solid rgba(255, 255, 255, 0.15)',
              padding: '3px 9px',
              borderRadius: 'var(--radius-xs)',
              fontSize: '0.74rem',
              fontWeight: '700',
              letterSpacing: '0.04em'
            }}>
              {isNovela ? 'NOVELA' : isSeries ? 'SÉRIE' : 'FILME'}
            </span>
          </span>

          {current.category_name && (
            <span className="vsa-hero-meta-item" style={{ color: '#cbd5e1' }}>
              {current.category_name.split('|')[0].trim()}
            </span>
          )}

          {year && (
            <span className="vsa-hero-meta-item">
              <Calendar size={13} /> {year}
            </span>
          )}

          {rating && (
            <span className="vsa-hero-meta-item" style={{ color: '#f59e0b', fontWeight: '700' }}>
              <Star size={13} fill="#f59e0b" /> {rating}
            </span>
          )}

          {realRes && (
            <span className="vsa-hero-meta-item" style={{ 
              color: '#38bdf8', 
              background: 'rgba(56, 189, 248, 0.12)',
              padding: '2px 8px',
              borderRadius: '4px',
              fontWeight: '800' 
            }}>
              {realRes}
            </span>
          )}
        </div>

        <h1 className="vsa-hero-title">
          {current.name}
        </h1>

        {current.description && (
          <p className="vsa-hero-desc">
            {current.description}
          </p>
        )}

        {/* Action Buttons */}
        <div className="vsa-hero-actions">
          <button
            className="btn-hero-play"
            onClick={() => onPlay?.(current)}
          >
            <Play size={18} fill="#07090e" /> Assistir
          </button>
          <button
            className="btn-hero-info"
            onClick={() => onOpenDetails?.(current)}
          >
            <Info size={18} /> Mais Informações
          </button>
        </div>
      </div>

      {/* Pagination dots */}
      {featuredItems.length > 1 && (
        <div 
          className="vsa-hero-dots"
          style={{
            position: 'absolute',
            bottom: '24px',
            right: '36px',
            display: 'flex',
            gap: '8px',
            zIndex: 15,
          }}
        >
          {featuredItems.slice(0, 5).map((_, idx) => (
            <button
              key={idx}
              onClick={() => setCurrentIndex(idx)}
              style={{
                width: idx === currentIndex ? '24px' : '8px',
                height: '8px',
                borderRadius: '4px',
                background: idx === currentIndex ? '#6366f1' : 'rgba(255,255,255,0.25)',
                border: 'none',
                cursor: 'pointer',
                transition: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
              }}
              aria-label={`Ir para destaque ${idx + 1}`}
            />
          ))}
        </div>
      )}
    </div>
  );
}
