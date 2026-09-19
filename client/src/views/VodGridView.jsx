import React, { useState, useMemo } from 'react';
import MediaCard from '../components/MediaCard';
import { Search, X, Film, Clapperboard, Layers, AlertCircle } from 'lucide-react';

export default function VodGridView({
  type = 'movie', // 'movie', 'series', 'novelas'
  items = [],
  categories = [],
  selectedCategory,
  onSelectCategory,
  onItemClick,
  onPlayDirect,
  activeStreamId = null,
  isLoading = false,
}) {
  const [search, setSearch] = useState('');
  const [displayLimit, setDisplayLimit] = useState(60);

  const title = type === 'novelas' ? 'Novelas' : type === 'series' ? 'Séries' : 'Filmes (VOD)';
  const Icon = type === 'novelas' ? Layers : type === 'series' ? Clapperboard : Film;

  // Total real de itens baseado nas categorias do catálogo
  const totalCatalogItems = useMemo(() => {
    if (categories && categories.length > 0) {
      const sum = categories.reduce((acc, cat) => acc + (cat.item_count || 0), 0);
      if (sum > 0) return sum;
    }
    return items.length;
  }, [categories, items]);

  const filtered = useMemo(() => {
    if (!search.trim()) return items;
    const q = search.toLowerCase().trim();
    return items.filter((i) => i.name?.toLowerCase().includes(q));
  }, [items, search]);

  const displayed = useMemo(() => {
    return filtered.slice(0, displayLimit);
  }, [filtered, displayLimit]);

  const hasMore = filtered.length > displayLimit;

  const scrollCategories = (direction) => {
    const bar = document.getElementById(`vod-cat-bar-${type}`);
    if (bar) {
      bar.scrollBy({ left: direction * 280, behavior: 'smooth' });
    }
  };

  return (
    <div className="vod-grid-container animate-fade">
      {/* Header bar: Title & search */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '16px',
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '12px' }}>
          <div style={{
            width: '40px',
            height: '40px',
            borderRadius: 'var(--radius-md)',
            background: type === 'novelas' 
              ? 'linear-gradient(135deg, #f59e0b, #d97706)' 
              : type === 'series' 
              ? 'linear-gradient(135deg, #8b5cf6, #6366f1)' 
              : 'linear-gradient(135deg, #ec4899, #f43f5e)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            <Icon size={22} color="#fff" />
          </div>
          <div>
            <h1 style={{ fontSize: '1.4rem', fontWeight: '800', color: '#fff', margin: 0 }}>
              {title}
            </h1>
            <span style={{ fontSize: '0.8rem', color: 'var(--text-muted)' }}>
              {selectedCategory 
                ? `${filtered.length} títulos na categoria selecionada`
                : `${totalCatalogItems.toLocaleString()} títulos disponíveis no catálogo`}
            </span>
          </div>
        </div>

        {/* Quick Search */}
        <div style={{ position: 'relative', width: '280px', maxWidth: '100%' }}>
          <Search size={16} color="var(--text-muted)" style={{ position: 'absolute', left: '14px', top: '50%', transform: 'translateY(-50%)' }} />
          <input
            type="text"
            className="form-control"
            placeholder={`Buscar em ${title.toLowerCase()}...`}
            value={search}
            onChange={(e) => { setSearch(e.target.value); setDisplayLimit(60); }}
            style={{ paddingLeft: '40px', paddingRight: '36px', height: '42px', borderRadius: 'var(--radius-full)' }}
          />
          {search && (
            <button
              onClick={() => setSearch('')}
              style={{
                position: 'absolute',
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: 'var(--text-muted)',
                cursor: 'pointer',
              }}
            >
              <X size={15} />
            </button>
          )}
        </div>
      </div>

      {/* Categories Filter Pills Bar with Horizontal Scroll Navigation */}
      {categories.length > 0 && (
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center', margin: '16px 0 20px' }}>
          <button
            onClick={() => scrollCategories(-1)}
            className="btn btn-secondary"
            style={{
              minWidth: '32px',
              width: '32px',
              height: '32px',
              padding: 0,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginRight: '6px',
              flexShrink: 0,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)'
            }}
            aria-label="Rolar categorias para esquerda"
          >
            ‹
          </button>

          <div id={`vod-cat-bar-${type}`} className="livetv-categories-bar no-scrollbar" style={{ flex: 1, margin: 0, overflowX: 'auto', scrollBehavior: 'smooth' }}>
            <button
              className={`livetv-cat-pill ${selectedCategory === null ? 'active' : ''}`}
              onClick={() => { onSelectCategory(null); setDisplayLimit(60); }}
            >
              Todos ({totalCatalogItems.toLocaleString()})
            </button>
            {categories.map((cat) => (
              <button
                key={cat.id}
                className={`livetv-cat-pill ${selectedCategory === cat.id ? 'active' : ''}`}
                onClick={() => { onSelectCategory(cat.id); setDisplayLimit(60); }}
              >
                {cat.name} {cat.item_count !== undefined ? `(${cat.item_count.toLocaleString()})` : ''}
              </button>
            ))}
          </div>

          <button
            onClick={() => scrollCategories(1)}
            className="btn btn-secondary"
            style={{
              minWidth: '32px',
              width: '32px',
              height: '32px',
              padding: 0,
              borderRadius: '50%',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: '6px',
              flexShrink: 0,
              background: 'rgba(255,255,255,0.08)',
              border: '1px solid rgba(255,255,255,0.12)'
            }}
            aria-label="Rolar categorias para direita"
          >
            ›
          </button>
        </div>
      )}

      {/* Grid */}
      {isLoading ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <div className="spinner-circle" style={{ margin: '0 auto 16px' }} />
          <span>Carregando catálogo de {title}...</span>
        </div>
      ) : displayed.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '60px 20px', color: 'var(--text-muted)' }}>
          <AlertCircle size={36} style={{ margin: '0 auto 12px', opacity: 0.5 }} />
          <h3>Nenhum título encontrado</h3>
          <p style={{ fontSize: '0.85rem', marginTop: '6px' }}>Tente alterar a categoria ou o termo da busca.</p>
        </div>
      ) : (
        <>
          <div className="vod-catalog-grid">
            {displayed.map((item) => (
              <MediaCard
                key={item.id}
                item={item}
                onClick={() => onItemClick?.(item)}
                onPlayDirect={() => onPlayDirect?.(item)}
                isPlaying={String(activeStreamId) === String(item.id)}
              />
            ))}
          </div>

          {/* Progressive Load Button */}
          {hasMore && (
            <div style={{ textAlign: 'center', padding: '24px 0 40px' }}>
              <button
                className="btn btn-secondary"
                style={{ borderRadius: 'var(--radius-full)', padding: '10px 28px', fontWeight: '700' }}
                onClick={() => setDisplayLimit((prev) => prev + 60)}
              >
                Carregar Mais ({displayed.length} de {filtered.length})
              </button>
            </div>
          )}
        </>
      )}
    </div>
  );
}
