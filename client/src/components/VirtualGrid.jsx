import React, { useState, useEffect, useRef, useMemo } from 'react';
import { useTVMode } from '../tv/TVModeContext';

/**
 * VirtualGrid — Renderizador de Grade Virtualizada com baixo consumo de memória
 * Essencial para Smart TVs com pouca RAM onde renderizar milhares de cartões causa crash por OOM.
 */
export default function VirtualGrid({
  items = [],
  renderItem,
  itemHeight = 280,
  itemWidth = 190,
  gap = 16,
  className = '',
  style = {}
}) {
  const containerRef = useRef(null);
  const [scrollTop, setScrollTop] = useState(0);
  const [containerWidth, setContainerWidth] = useState(1200);
  const { performanceTier } = useTVMode();

  // Em tiers baixos (Smart TVs fracas), reduz o overscan de segurança
  const overscanRows = performanceTier === 'low' ? 1 : 2;

  useEffect(() => {
    const handleResize = () => {
      if (containerRef.current) {
        setContainerWidth(containerRef.current.clientWidth || 1200);
      }
    };

    const handleScroll = () => {
      setScrollTop(window.scrollY);
    };

    handleResize();
    window.addEventListener('resize', handleResize, { passive: true });
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      window.removeEventListener('resize', handleResize);
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  // Calcula colunas dinamicamente baseado na largura do container
  const columns = Math.max(1, Math.floor((containerWidth + gap) / (itemWidth + gap)));
  const totalRows = Math.ceil(items.length / columns);
  const totalHeight = totalRows * (itemHeight + gap);

  // Calcula fatia visível de linhas
  const windowHeight = typeof window !== 'undefined' ? window.innerHeight : 800;
  const containerTop = containerRef.current ? containerRef.current.getBoundingClientRect().top + window.scrollY : 0;
  const relativeScrollY = Math.max(0, scrollTop - containerTop);

  const startRow = Math.max(0, Math.floor(relativeScrollY / (itemHeight + gap)) - overscanRows);
  const endRow = Math.min(totalRows, Math.ceil((relativeScrollY + windowHeight) / (itemHeight + gap)) + overscanRows);

  const startIndex = startRow * columns;
  const endIndex = Math.min(items.length, endRow * columns);

  const visibleItems = useMemo(() => {
    return items.slice(startIndex, endIndex).map((item, idx) => ({
      item,
      absoluteIndex: startIndex + idx
    }));
  }, [items, startIndex, endIndex]);

  const paddingTop = startRow * (itemHeight + gap);
  const paddingBottom = Math.max(0, (totalRows - endRow) * (itemHeight + gap));

  return (
    <div
      ref={containerRef}
      className={className}
      style={{
        ...style,
        position: 'relative',
        width: '100%',
        paddingTop: `${paddingTop}px`,
        paddingBottom: `${paddingBottom}px`,
        boxSizing: 'border-box'
      }}
    >
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))`,
          gap: `${gap}px`
        }}
      >
        {visibleItems.map(({ item, absoluteIndex }) => (
          <React.Fragment key={item.id || absoluteIndex}>
            {renderItem(item, absoluteIndex)}
          </React.Fragment>
        ))}
      </div>
    </div>
  );
}
