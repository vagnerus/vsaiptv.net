import React, { useState } from 'react';
import api from '../services/api';
import { Tv, Shield, User, Lock, Play, ArrowRight, AlertCircle } from 'lucide-react';

export default function LoginView({ onLoginSuccess }) {
  const [activeTab, setActiveTab] = useState('client'); // default to 'client' for PWA app
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleLogin = async (e) => {
    e?.preventDefault();
    setError('');
    setLoading(true);

    try {
      const endpoint = activeTab === 'client' ? '/api/auth/client-login' : '/api/auth/login';
      const res = await api.post(endpoint, { username, password });

      localStorage.setItem('iptv_token', res.data.token);
      localStorage.setItem('iptv_user', JSON.stringify(res.data.user));
      onLoginSuccess(res.data.user);
    } catch (err) {
      setError(err.response?.data?.error || 'Falha ao autenticar. Verifique suas credenciais.');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      padding: '24px',
      background: 'radial-gradient(circle at top, #181d2d 0%, #0a0d14 100%)',
    }}>
      <div className="glass-card animate-fade" style={{ width: '100%', maxWidth: '440px', padding: '36px 32px' }}>
        
        {/* Brand Header */}
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{
            width: '56px',
            height: '56px',
            borderRadius: '16px',
            background: 'var(--primary-gradient)',
            display: 'inline-flex',
            alignItems: 'center',
            justifyContent: 'center',
            boxShadow: '0 0 25px rgba(99, 102, 241, 0.5)',
            marginBottom: '14px',
          }}>
            <Tv size={28} color="#fff" />
          </div>
          <h1 style={{ fontSize: '1.8rem', fontWeight: '800', letterSpacing: '-0.03em' }}>
            VSA <span style={{ color: 'var(--primary)' }}>IPTV</span>
          </h1>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginTop: '4px' }}>
            Plataforma Premium de Streaming &amp; VOD
          </p>
        </div>

        {/* Tab Selector */}
        <div style={{
          display: 'grid',
          gridTemplateColumns: '1fr 1fr',
          background: 'var(--bg-input)',
          padding: '4px',
          borderRadius: 'var(--radius-md)',
          marginBottom: '24px',
          border: '1px solid var(--border-color)',
        }}>
          <button
            type="button"
            onClick={() => { setActiveTab('staff'); setError(''); }}
            style={{
              padding: '8px',
              fontSize: '0.82rem',
              fontWeight: '600',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'var(--transition)',
              background: activeTab === 'staff' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'staff' ? '#fff' : 'var(--text-muted)',
            }}
          >
            <Shield size={14} /> Master / Revenda
          </button>
          <button
            type="button"
            onClick={() => { setActiveTab('client'); setError(''); }}
            style={{
              padding: '8px',
              fontSize: '0.82rem',
              fontWeight: '600',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              gap: '6px',
              transition: 'var(--transition)',
              background: activeTab === 'client' ? 'var(--primary)' : 'transparent',
              color: activeTab === 'client' ? '#fff' : 'var(--text-muted)',
            }}
          >
            <Play size={14} /> WebTV Player
          </button>
        </div>

        {/* Error Alert */}
        {error && (
          <div style={{
            background: 'rgba(239, 68, 68, 0.15)',
            border: '1px solid rgba(239, 68, 68, 0.3)',
            borderRadius: 'var(--radius-md)',
            padding: '10px 14px',
            marginBottom: '20px',
            display: 'flex',
            alignItems: 'center',
            gap: '10px',
            fontSize: '0.85rem',
            color: '#f87171',
          }}>
            <AlertCircle size={16} style={{ flexShrink: 0 }} />
            <span>{error}</span>
          </div>
        )}

        {/* Form */}
        <form onSubmit={handleLogin}>
          <div className="input-group">
            <label className="input-label">Usuário de Acesso</label>
            <div style={{ position: 'relative' }}>
              <User size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '13px' }} />
              <input
                type="text"
                className="form-control"
                placeholder=""
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                required
                style={{ paddingLeft: '38px' }}
              />
            </div>
          </div>

          <div className="input-group">
            <label className="input-label">Senha</label>
            <div style={{ position: 'relative' }}>
              <Lock size={16} color="var(--text-dim)" style={{ position: 'absolute', left: '12px', top: '13px' }} />
              <input
                type="password"
                className="form-control"
                placeholder=""
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                style={{ paddingLeft: '38px' }}
              />
            </div>
          </div>

          <button
            type="submit"
            className="btn btn-primary"
            style={{ width: '100%', padding: '12px', marginTop: '8px', fontSize: '0.95rem' }}
            disabled={loading}
          >
            {loading ? 'Autenticando...' : (
              <>
                <span>Entrar no Sistema</span>
                <ArrowRight size={16} />
              </>
            )}
          </button>
        </form>

      </div>
    </div>
  );
}
