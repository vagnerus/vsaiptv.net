import React from 'react';
import { 
  Tv, LogOut, Shield, UserCheck, PlayCircle, 
  Coins, AlertTriangle, Radio, Home, Film, 
  Clapperboard, Layers, Star, Search 
} from 'lucide-react';

export default function Navbar({ 
  user, 
  onLogout,
  activeTab = 'home',
  onTabChange,
}) {
  const isMaster = user?.role === 'master';
  const isReseller = user?.role === 'reseller';
  const isClient = user?.role === 'client';

  const navItems = [
    { id: 'home', label: 'Início', icon: Home },
    { id: 'live', label: 'TV Ao Vivo', icon: Tv },
    { id: 'movie', label: 'Filmes', icon: Film },
    { id: 'series', label: 'Séries', icon: Clapperboard },
    { id: 'novelas', label: 'Novelas', icon: Layers },
    { id: 'favorites', label: 'Favoritos', icon: Star },
  ];

  return (
    <header className="vsa-navbar">
      {/* Left: Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div className="vsa-brand" onClick={() => onTabChange?.('home')}>
          <div className="vsa-brand-logo">
            <Tv size={22} color="#fff" />
          </div>
          <div>
            <div className="vsa-brand-text">
              VSA<span>IPTV</span>
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>
              {isMaster && 'Painel Master'}
              {isReseller && 'Painel Revenda'}
              {isClient && 'Streaming & OTT Player'}
            </span>
          </div>
        </div>

        {/* Center: Desktop Navigation Tabs for Clients */}
        {isClient && onTabChange && (
          <nav className="vsa-nav-links" aria-label="Navegação desktop">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  className={`vsa-nav-btn ${isActive ? 'active' : ''}`}
                  onClick={() => onTabChange(item.id)}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        )}
      </div>

      {/* Right User Info & Actions */}
      <div className="vsa-nav-right">
        {/* Quick Search Button (Desktop) */}
        {isClient && onTabChange && (
          <button
            onClick={() => onTabChange('search')}
            className={`vsa-nav-btn ${activeTab === 'search' ? 'active' : ''}`}
            style={{ padding: '8px 12px' }}
            title="Buscar conteúdos"
          >
            <Search size={17} />
            <span style={{ display: 'none', md: 'inline' }}>Buscar</span>
          </button>
        )}

        {/* Reseller Credits Pill */}
        {isReseller && (
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: user.credits <= 5 ? 'rgba(239, 68, 68, 0.15)' : 'rgba(99, 102, 241, 0.12)',
            border: `1px solid ${user.credits <= 5 ? 'rgba(239, 68, 68, 0.4)' : 'rgba(99, 102, 241, 0.3)'}`,
            padding: '6px 14px',
            borderRadius: 'var(--radius-full)',
          }}>
            <Coins size={16} color={user.credits <= 5 ? '#f87171' : '#818cf8'} />
            <span style={{ fontSize: '0.85rem', fontWeight: '700' }}>
              {user.credits?.toFixed(1) || '0.0'} Créditos
            </span>
            {user.credits <= 5 && (
              <span title="Saldo Baixo!" style={{ display: 'flex', alignItems: 'center' }}>
                <AlertTriangle size={14} color="#f87171" />
              </span>
            )}
          </div>
        )}

        {/* Client Expiry Pill */}
        {isClient && (
          <div style={{
            background: 'rgba(255, 255, 255, 0.04)',
            border: '1px solid var(--border-subtle)',
            padding: '5px 12px',
            borderRadius: 'var(--radius-full)',
            fontSize: '0.76rem',
            color: 'var(--text-muted)',
            display: 'none',
            sm: 'flex',
            alignItems: 'center',
            gap: '6px'
          }}>
            <span>Expira:</span>
            <strong style={{ color: '#34d399' }}>
              {user.expires_at ? new Date(user.expires_at).toLocaleDateString('pt-BR') : 'Vitalício'}
            </strong>
          </div>
        )}

        {/* User Role Badge */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{
            width: '34px',
            height: '34px',
            borderRadius: '50%',
            background: 'var(--bg-card)',
            border: '1px solid var(--border-color)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
          }}>
            {isMaster && <Shield size={16} color="#818cf8" />}
            {isReseller && <UserCheck size={16} color="#34d399" />}
            {isClient && <PlayCircle size={16} color="#22d3ee" />}
          </div>
          <div style={{ display: 'none', md: 'block' }}>
            <span style={{ fontSize: '0.86rem', fontWeight: '700', display: 'block', color: '#fff' }}>
              {user.name || user.username}
            </span>
          </div>
        </div>

        {/* Logout Button */}
        <button 
          onClick={onLogout}
          className="btn btn-secondary btn-sm"
          title="Sair da Conta"
          style={{ padding: '6px 12px', borderRadius: 'var(--radius-full)' }}
        >
          <LogOut size={15} />
          <span style={{ display: 'none', sm: 'inline' }}>Sair</span>
        </button>
      </div>
    </header>
  );
}
