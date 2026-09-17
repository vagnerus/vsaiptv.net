import React, { useRef, useState, useEffect } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import MediaCard from './MediaCard';

export default function ContentRow({
  title,
  icon: Icon,
  items = [],
  onItemClick,
  onPlayDirect,
  onSeeAll,
  activeStreamId = null,
}) {
  const rowRef = useRef(null);
  const [canScrollLeft, setCanScrollLeft] = useState(false);
  const [canScrollRight, setCanScrollRight] = useState(false);

  // Check scroll bounds on mount, scroll and resize
  const checkScroll = () => {
    const el = rowRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setCanScrollLeft(scrollLeft > 10);
    setCanScrollRight(scrollLeft + clientWidth < scrollWidth - 10);
  };

  useEffect(() => {
    checkScroll();
    const el = rowRef.current;
    if (el) {
      el.addEventListener('scroll', checkScroll, { passive: true });
      window.addEventListener('resize', checkScroll);
    }
    return () => {
      if (el) el.removeEventListener('scroll', checkScroll);
      window.removeEventListener('resize', checkScroll);
    };
  }, [items]);

  const scroll = (direction) => {
    if (!rowRef.current) return;
    const distance = direction === 'left' ? -rowRef.current.clientWidth * 0.75 : rowRef.current.clientWidth * 0.75;
    rowRef.current.scrollBy({ left: distance, behavior: 'smooth' });
  };

  if (!items || items.length === 0) return null;

  return (
    <section className="vsa-content-row">
      <div className="vsa-row-header">
        <div className="vsa-row-title-group">
          {Icon && <Icon size={20} color="var(--primary-light)" />}
          <h2 className="vsa-row-title">{title}</h2>
          <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)', fontWeight: '600' }}>
            ({items.length})
          </span>
        </div>
        {onSeeAll && (
          <button className="vsa-row-see-all" onClick={onSeeAll}>
            Ver Todos <ChevronRight size={14} />
          </button>
        )}
      </div>

      <div className="vsa-row-scroller-wrap">
        {/* Left Arrow Button — only shown if scrolled */}
        {canScrollLeft && (
          <button
            className="vsa-row-nav-btn left"
            onClick={() => scroll('left')}
            aria-label="Rolar para esquerda"
          >
            <ChevronLeft size={22} />
          </button>
        )}

        {/* Horizontal Track */}
        <div className="vsa-row-track no-scrollbar" ref={rowRef}>
          {items.map((item) => (
            <MediaCard
              key={`${item.id}-${item.type || 'v'}`}
              item={item}
              onClick={onItemClick}
              onPlayDirect={onPlayDirect}
              isPlaying={String(activeStreamId) === String(item.id)}
            />
          ))}
        </div>

        {/* Right Arrow Button — only shown if overflow exists */}
        {canScrollRight && (
          <button
            className="vsa-row-nav-btn right"
            onClick={() => scroll('right')}
            aria-label="Rolar para direita"
          >
            <ChevronRight size={22} />
          </button>
        )}
      </div>
    </section>
  );
}
