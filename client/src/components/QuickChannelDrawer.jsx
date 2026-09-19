import React, { useState, useMemo, useEffect, useRef } from 'react';
import { X, Search, Tv, Play, Radio, Loader2 } from 'lucide-react';
import { getImageUrl, getPlaceholder, onImageError } from '../utils/streamUtils';

export default function QuickChannelDrawer({
  channels = [],
  activeChannelId = null,
  onSelectChannel,
  onClose,
}) {
  const [search, setSearch] = useState('');
  const [switchingId, setSwitchingId] = useState(null);
  const activeItemRef = useRef(null);
  const listRef = useRef(null);

  // Auto-scroll to active channel when drawer opens
  useEffect(() => {
    if (activeItemRef.current) {
      activeItemRef.current.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  }, [activeChannelId]);

  const filtered = useMemo(() => {
    if (!search.trim()) return channels.slice(0, 100);
    const q = search.toLowerCase().trim();
    return channels.filter((c) => c.name?.toLowerCase().includes(q)).slice(0, 100);
  }, [channels, search]);

  const handleChannelClick = (ch) => {
    setSwitchingId(ch.id);
    onSelectChannel?.(ch);
  };

  return (
    <div
      style={{
        position: 'absolute',
        top: 0,
        right: 0,
        bottom: 0,
        width: '340px',
        maxWidth: '85vw',
        background: 'rgba(7, 9, 14, 0.96)',
        backdropFilter: 'blur(24px)',
        WebkitBackdropFilter: 'blur(24px)',
        borderLeft: '1px solid rgba(255, 255, 255, 0.12)',
        zIndex: 50,
        display: 'flex',
        flexDirection: 'column',
        boxShadow: '-12px 0 35px rgba(0, 0, 0, 0.85)',
        animation: 'fadeIn 0.2s ease-out',
      }}
      onClick={(e) => e.stopPropagation()}
    >
      {/* Header */}
      <div style={{
        padding: '14px 18px',
        borderBottom: '1px solid rgba(255, 255, 255, 0.08)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <Tv size={18} color="#06b6d4" />
          <span style={{ fontSize: '0.92rem', fontWeight: '800', color: '#fff' }}>
            Quick Zapping (Canais)
          </span>
        </div>
        <button
          onClick={onClose}
          style={{
            background: 'none',
            border: 'none',
            color: '#94a3b8',
            cursor: 'pointer',
            padding: '4px',
            borderRadius: '50%',
          }}
          aria-label="Fechar gaveta"
        >
          <X size={18} />
        </button>
      </div>

      {/* Quick Search */}
      <div style={{ padding: '10px 14px', borderBottom: '1px solid rgba(255, 255, 255, 0.06)' }}>
        <div style={{ position: 'relative' }}>
          <Search size={14} color="#64748b" style={{ position: 'absolute', left: '12px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            className="form-control"
            placeholder="Filtrar canais..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            style={{
              paddingLeft: '34px',
              height: '36px',
              fontSize: '0.84rem',
              borderRadius: 'var(--radius-full)',
              background: 'rgba(255, 255, 255, 0.05)',
              border: '1px solid rgba(255, 255, 255, 0.1)',
            }}
          />
        </div>
      </div>

      {/* Channel list */}
      <div style={{ flex: 1, overflowY: 'auto', padding: '8px' }} className="no-scrollbar" ref={listRef}>
        {filtered.map((ch) => {
          const isActive = String(activeChannelId) === String(ch.id);
          const isSwitching = String(switchingId) === String(ch.id);
          const logo = getImageUrl(ch);

          return (
            <div
              key={ch.id}
              ref={isActive ? activeItemRef : null}
              onClick={() => handleChannelClick(ch)}
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '12px',
                padding: '10px 12px',
                borderRadius: '8px',
                cursor: 'pointer',
                background: isActive ? 'rgba(99, 102, 241, 0.22)' : 'transparent',
                border: isActive ? '1px solid #6366f1' : '1px solid transparent',
                marginBottom: '4px',
                transition: 'all 0.15s ease',
              }}
            >
              <img
                src={logo || getPlaceholder(ch)}
                alt=""
                loading="lazy"
                style={{
                  width: '46px',
                  height: '30px',
                  objectFit: 'contain',
                  borderRadius: '4px',
                  background: '#090e18',
                  padding: '2px',
                  flexShrink: 0,
                }}
                onError={(e) => onImageError(e, ch)}
              />

              <div style={{ flex: 1, minWidth: 0 }}>
                <span style={{
                  fontSize: '0.84rem',
                  fontWeight: '700',
                  color: isActive ? '#fff' : '#e2e8f0',
                  display: 'block',
                  whiteSpace: 'nowrap',
                  overflow: 'hidden',
                  textOverflow: 'ellipsis',
                }}>
                  {ch.name}
                </span>
                <span style={{ fontSize: '0.72rem', color: '#94a3b8' }}>
                  {ch.category_name ? ch.category_name.split('|')[0].trim() : 'TV Ao Vivo'}
                </span>
              </div>

              {isSwitching ? (
                <span style={{
                  fontSize: '0.68rem',
                  fontWeight: '800',
                  color: '#fbbf24',
                  background: 'rgba(245, 158, 11, 0.15)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                }}>
                  Sintonizando...
                </span>
              ) : isActive ? (
                <span style={{
                  fontSize: '0.65rem',
                  fontWeight: '800',
                  color: '#22d3ee',
                  background: 'rgba(6, 182, 212, 0.15)',
                  padding: '2px 8px',
                  borderRadius: '4px',
                }}>
                  NO AR
                </span>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
