import React, { useState, useEffect, lazy, Suspense } from 'react';
import Navbar from './components/Navbar';
import LoginView from './views/LoginView';
import { ProgressProvider } from './hooks/useProgress';
import { FavoritesProvider } from './hooks/useFavorites';
import { useSpatialNav } from './hooks/useSpatialNav';
import { TVModeProvider } from './tv/TVModeContext';
import TVOverlayDiagnostics from './tv/TVOverlayDiagnostics';
import './tv/tv.css';
import api from './services/api';
import SupportBubble from './components/SupportBubble';

const MasterDashboard = lazy(() => import('./views/MasterDashboard'));
const ResellerDashboard = lazy(() => import('./views/ResellerDashboard'));
const ClientWebPlayer = lazy(() => import('./views/ClientWebPlayer'));

export default function App() {
  useSpatialNav({ enabled: true });

  const [user, setUser] = useState(() => {
    const saved = localStorage.getItem('iptv_user');
    return saved ? JSON.parse(saved) : null;
  });

  const [clientTab, setClientTab] = useState('home');
  const [activeView, setActiveView] = useState(() => {
    return localStorage.getItem('iptv_active_view') || 'dashboard';
  });
  const [loading, setLoading] = useState(true);

  const handleToggleView = (view) => {
    setActiveView(view);
    localStorage.setItem('iptv_active_view', view);
  };

  // Validate session on load
  useEffect(() => {
    const token = localStorage.getItem('iptv_token');
    if (!token) {
      setLoading(false);
      return;
    }

    api.get('/api/auth/me')
      .then((res) => {
        setUser(res.data);
        localStorage.setItem('iptv_user', JSON.stringify(res.data));
      })
      .catch(() => {
        localStorage.removeItem('iptv_token');
        localStorage.removeItem('iptv_user');
        setUser(null);
      })
      .finally(() => {
        setLoading(false);
      });
  }, []);

  const handleLogout = () => {
    localStorage.removeItem('iptv_token');
    localStorage.removeItem('iptv_user');
    setUser(null);
  };

  if (loading) {
    return (
      <div style={{
        minHeight: '100vh',
        background: '#0a0d14',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        color: '#818cf8',
        fontFamily: 'sans-serif',
      }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{
            width: '40px',
            height: '40px',
            border: '3px solid rgba(99, 102, 241, 0.2)',
            borderTopColor: '#6366f1',
            borderRadius: '50%',
            animation: 'spinSlow 0.8s linear infinite',
            margin: '0 auto 16px auto',
          }} />
          <p style={{ fontSize: '0.9rem', color: '#94a3b8' }}>Iniciando VSAIPTV...</p>
        </div>
      </div>
    );
  }

  const effectiveView = user?.role === 'client' ? 'player' : activeView;

  return (
    <TVModeProvider>
      <TVOverlayDiagnostics />
      {!user || user.must_change_password ? (
        <LoginView onLoginSuccess={(loggedInUser) => setUser(loggedInUser)} />
      ) : (
        <ProgressProvider>
          <FavoritesProvider>
            <div style={{ minHeight: '100vh', background: 'var(--bg-main)' }}>
              <Navbar 
                user={user} 
                onLogout={handleLogout} 
                activeTab={clientTab} 
                onTabChange={setClientTab}
                currentView={effectiveView}
                onToggleView={handleToggleView}
              />
              <main>
                <Suspense fallback={
                  <div style={{
                    minHeight: '60vh',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    color: '#818cf8',
                  }}>
                    <div className="vp-spinner" style={{ width: '40px', height: '40px' }} />
                  </div>
                }>
                  {user.role === 'master' && (
                    effectiveView === 'player' ? (
                      <ClientWebPlayer 
                        user={user} 
                        activeTab={clientTab} 
                        onTabChange={setClientTab} 
                      />
                    ) : (
                      <MasterDashboard user={user} onOpenPlayer={() => handleToggleView('player')} />
                    )
                  )}
                  {user.role === 'reseller' && (
                    effectiveView === 'player' ? (
                      <ClientWebPlayer 
                        user={user} 
                        activeTab={clientTab} 
                        onTabChange={setClientTab} 
                      />
                    ) : (
                      <ResellerDashboard user={user} onOpenPlayer={() => handleToggleView('player')} />
                    )
                  )}
                  {user.role === 'client' && (
                    <ClientWebPlayer 
                      user={user} 
                      activeTab={clientTab} 
                      onTabChange={setClientTab} 
                    />
                  )}
                </Suspense>
              </main>
              <SupportBubble user={user} currentRoute={clientTab} />
            </div>
          </FavoritesProvider>
        </ProgressProvider>
      )}
    </TVModeProvider>
  );
}
