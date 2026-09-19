import React from 'react';
import { 
  Tv, LogOut, Shield, UserCheck, PlayCircle, 
  Coins, AlertTriangle, Home, Film, 
  Clapperboard, Layers, Star, Search, ShieldOff 
} from 'lucide-react';
import { canSeeXxx } from '../utils/xxxAccess';

export default function Navbar({ 
  user, 
  onLogout,
  activeTab = 'home',
  onTabChange,
  currentView = 'player',
  onToggleView,
}) {
  const isMaster = user?.role === 'master';
  const isReseller = user?.role === 'reseller';
  const isClient = user?.role === 'client';
  const showPlayerTabs = isClient || currentView === 'player';

  // Menu XXX: admin sempre; cliente somente com o pacote liberado na conta
  const isXxxAllowed = canSeeXxx(user);

  const navItems = [
    { id: 'home', label: 'Início', icon: Home },
    { id: 'live', label: 'TV Ao Vivo', icon: Tv },
    { id: 'movie', label: 'Filmes', icon: Film },
    { id: 'series', label: 'Séries', icon: Clapperboard },
    { id: 'novelas', label: 'Novelas', icon: Layers },
    { id: 'favorites', label: 'Favoritos', icon: Star },
    ...(isXxxAllowed ? [{ id: 'xxx', label: 'XXX', icon: ShieldOff, xxx: true }] : []),
  ];

  // Abre a área XXX (se o admin/revenda estiver no painel, entra no player primeiro)
  const openXxx = () => {
    if (!showPlayerTabs && onToggleView) onToggleView('player');
    onTabChange?.('xxx');
  };

  return (
    <header className="vsa-navbar">
      {/* Left: Brand */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '20px' }}>
        <div className="vsa-brand" onClick={() => {
          if (showPlayerTabs) onTabChange?.('home');
        }}>
          <div className="vsa-brand-logo">
            <Tv size={22} color="#fff" />
          </div>
          <div>
            <div className="vsa-brand-text">
              VSA<span>IPTV</span>
            </div>
            <span style={{ fontSize: '0.7rem', color: 'var(--text-muted)', display: 'block' }}>
              {isMaster && (currentView === 'player' ? 'Master • Assistir WebTV (Sem Limite)' : 'Painel Master')}
              {isReseller && (currentView === 'player' ? 'Revenda • Assistir WebTV (Sem Limite)' : 'Painel Revenda')}
              {isClient && 'Streaming & OTT Player'}
            </span>
          </div>
        </div>

        {/* Center: Desktop Navigation Tabs when in Player mode */}
        {showPlayerTabs && onTabChange && (
          <nav className="vsa-nav-links" aria-label="Navegação desktop">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  className={`vsa-nav-btn ${isActive ? 'active' : ''} ${item.xxx ? 'vsa-nav-xxx' : ''}`}
                  onClick={() => (item.xxx ? openXxx() : onTabChange(item.id))}
                  title={item.xxx ? 'Área XXX (conteúdo adulto protegido por senha)' : item.label}
                >
                  <Icon size={16} />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        )}

        {/* XXX fora do modo player (Painel Master/Revenda): admin sempre vê */}
        {isXxxAllowed && !showPlayerTabs && onTabChange && (
          <button
            className={`vsa-nav-btn vsa-nav-xxx ${activeTab === 'xxx' ? 'active' : ''}`}
            onClick={openXxx}
            title="Abrir a Área XXX (conteúdo adulto)"
          >
            <ShieldOff size={16} />
            <span>XXX</span>
          </button>
        )}
      </div>

      {/* Right User Info & Actions */}
      <div className="vsa-nav-right">
        {/* Switch Mode Button for Resellers and Masters */}
        {(isReseller || isMaster) && onToggleView && (
          currentView === 'player' ? (
            <button
              onClick={() => onToggleView('dashboard')}
              className="btn btn-secondary btn-sm"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 14px',
                borderRadius: 'var(--radius-full)',
                fontWeight: '600',
                border: '1px solid rgba(99, 102, 241, 0.4)',
                background: 'rgba(99, 102, 241, 0.12)'
              }}
              title="Voltar para o Painel de Gestão"
            >
              <Shield size={15} color="#818cf8" />
              <span>{isMaster ? 'Painel Master' : 'Painel de Revenda'}</span>
            </button>
          ) : (
            <button
              onClick={() => onToggleView('player')}
              className="btn btn-primary btn-sm"
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '6px',
                padding: '6px 16px',
                borderRadius: 'var(--radius-full)',
                fontWeight: '700',
                boxShadow: '0 0 15px rgba(99, 102, 241, 0.4)'
              }}
              title="Assistir canais, filmes e séries sem limites"
            >
              <PlayCircle size={16} />
              <span>Assistir WebTV (Sem Limite)</span>
            </button>
          )
        )}

        {/* Quick Search Button (Desktop in Player mode) */}
        {showPlayerTabs && onTabChange && (
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
