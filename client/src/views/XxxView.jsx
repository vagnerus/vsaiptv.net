import React, { useState, useEffect, useCallback, useMemo } from 'react';
import api from '../services/api';
import { ShieldOff, Lock, AlertTriangle, Loader2, Film, Tv, Search, RefreshCw, Unlock } from 'lucide-react';
import { getImageUrl, getPlaceholder, onImageError } from '../utils/streamUtils';

/**
 * Área XXX (conteúdo adulto).
 *
 * Fluxo:
 *  - 1º acesso do usuário: pede para CRIAR uma senha da área XXX.
 *  - Acessos seguintes: pede a senha criada para desbloquear o catálogo.
 *  - A reprodução também é validada no backend (/api/client/xxx/stream/:id).
 */
const inputStyle = {
  width: '100%',
  padding: '12px 14px',
  borderRadius: 'var(--radius-md)',
  border: '1px solid var(--border-color)',
  background: 'rgba(255,255,255,0.04)',
  color: '#fff',
  fontSize: '0.95rem',
  outline: 'none',
};

function XxxItem({ item, onPlay }) {
  const img = getImageUrl(item) || getPlaceholder(item);
  return (
    <button className="vsa-xxx-card" onClick={() => onPlay(item)} title={`Assistir ${item.name}`}>
      <div className="vsa-xxx-thumb">
        <img src={img} alt={item.name} loading="lazy" onError={(e) => onImageError(e, item)} />
      </div>
      <div className="vsa-xxx-info">
        <span className="vsa-xxx-name">{item.name}</span>
        <span className="vsa-xxx-cat">
          {item.category_name || (item.type === 'movie' ? 'Filmes & VOD' : 'Canais')}
        </span>
      </div>
    </button>
  );
}

export default function XxxView({
  onBack,
  onPlay,
  catalog = [],
  isLoading = false,
  onReload,
  user,
}) {
  const [status, setStatus] = useState(null);
  const [passwordSet, setPasswordSet] = useState(null);
  const [unlocked, setUnlocked] = useState(false);
  const [setupForm, setSetupForm] = useState({ password: '', confirm: '' });
  const [verifyForm, setVerifyForm] = useState({ password: '' });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [search, setSearch] = useState('');
  const [busy, setBusy] = useState(false);

  const loadStatus = useCallback(async () => {
    setError('');
    try {
      const menuRes = await api.get('/api/client/xxx/menu');
      setStatus(menuRes.data);
      if (menuRes.data?.allowed) {
        const passRes = await api.get('/api/client/xxx/password/status');
        setPasswordSet(!!passRes.data?.set);
      } else {
        setPasswordSet(false);
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Não foi possível carregar a área XXX.');
      setStatus({ allowed: false });
      setPasswordSet(false);
    }
  }, []);

  useEffect(() => {
    loadStatus();
  }, [loadStatus]);

  // --- Criação da senha (primeiro acesso) ---
  const handleCreatePassword = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    const pw = setupForm.password.trim();
    if (pw.length < 4) {
      setError('A senha XXX deve ter pelo menos 4 caracteres.');
      return;
    }
    if (pw !== setupForm.confirm.trim()) {
      setError('As senhas não conferem.');
      return;
    }
    setBusy(true);
    try {
      await api.post('/api/client/xxx/password/set', { password: pw });
      setPasswordSet(true);
      setUnlocked(true);
      setSetupForm({ password: '', confirm: '' });
      setSuccess('Senha criada! Ela será pedida sempre que você abrir a área XXX.');
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao salvar a senha.');
    } finally {
      setBusy(false);
    }
  };

  // --- Desbloqueio (acessos seguintes) ---
  const handleVerify = async (e) => {
    e.preventDefault();
    setError('');
    setSuccess('');
    if (!verifyForm.password) {
      setError('Digite a sua senha XXX.');
      return;
    }
    setBusy(true);
    try {
      const res = await api.post('/api/client/xxx/password/verify', { password: verifyForm.password });
      if (res.data?.valid) {
        setUnlocked(true);
        setVerifyForm({ password: '' });
      } else {
        setError('Senha incorreta. Tente novamente.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Erro ao verificar a senha.');
    } finally {
      setBusy(false);
    }
  };

  const term = search.trim().toLowerCase();
  const filteredCatalog = useMemo(() => {
    const list = Array.isArray(catalog) ? catalog : [];
    if (!term) return list;
    return list.filter((item) => (item.name || '').toLowerCase().includes(term));
  }, [catalog, term]);

  const liveItems = filteredCatalog.filter((item) => item.type === 'live');
  const movieItems = filteredCatalog.filter((item) => item.type === 'movie');

  const header = (
    <div className="vsa-xxx-header">
      <div style={{ display: 'flex', alignItems: 'center', gap: 10, minWidth: 0 }}>
        <ShieldOff size={22} color="#f472b6" />
        <span style={{ fontWeight: 800, fontSize: '1.05rem' }}>Área XXX</span>
        {(status?.userRole === 'master' || String(user?.username || '').toLowerCase() === 'vagner') && (
          <span className="vsa-xxx-badge">admin</span>
        )}
        {status?.userRole === 'client' && <span className="vsa-xxx-badge">+18</span>}
      </div>
      <button
        className="btn btn-secondary btn-sm"
        onClick={onBack}
        style={{ borderRadius: 'var(--radius-full)' }}
      >
        Fechar
      </button>
    </div>
  );

  const shell = (children) => (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0 }}>
      {header}
      {children}
    </div>
  );

  if (isLoading || !status || passwordSet === null) {
    return shell(
      <div className="vsa-xxx-center">
        <Loader2 size={32} className="animate-spin" />
        <p style={{ marginTop: 12 }}>Carregando área XXX…</p>
      </div>
    );
  }

  if (!status.allowed) {
    return shell(
      <div className="vsa-xxx-center">
        <AlertTriangle size={36} style={{ marginBottom: 12, color: '#f87171' }} />
        <p style={{ fontWeight: 700, color: '#fff' }}>Área XXX indisponível</p>
        <p style={{ fontSize: '0.85rem' }}>Este pacote não está incluído na sua assinatura.</p>
      </div>
    );
  }

  // 1º acesso: criar a senha da área XXX
  if (!passwordSet) {
    return shell(
      <div className="vsa-xxx-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <Lock size={22} color="#fbbf24" />
          <span style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>
            Crie a sua senha da área XXX
          </span>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 18 }}>
          Este é o seu primeiro acesso. Crie uma senha que será pedida sempre que você clicar em XXX.
        </p>
        <form onSubmit={handleCreatePassword}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="password"
              autoComplete="new-password"
              style={inputStyle}
              value={setupForm.password}
              onChange={(e) => setSetupForm({ ...setupForm, password: e.target.value })}
              placeholder="Nova senha (mínimo 4 caracteres)"
            />
            <input
              type="password"
              autoComplete="new-password"
              style={inputStyle}
              value={setupForm.confirm}
              onChange={(e) => setSetupForm({ ...setupForm, confirm: e.target.value })}
              placeholder="Confirmar senha"
            />
            <button
              type="submit"
              className="btn btn-primary"
              style={{ height: 46, fontSize: '0.95rem', borderRadius: 'var(--radius-full)' }}
              disabled={busy || !setupForm.password || !setupForm.confirm}
            >
              {busy ? 'Salvando…' : 'Criar senha e entrar'}
            </button>
          </div>
        </form>
        {error && <p style={{ color: '#f87171', marginTop: 12, fontSize: '0.85rem' }}>{error}</p>}
      </div>
    );
  }

  // Acessos seguintes: pedir a senha
  if (!unlocked) {
    return shell(
      <div className="vsa-xxx-panel">
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 10 }}>
          <Unlock size={22} color="#818cf8" />
          <span style={{ fontWeight: 700, fontSize: '1rem', color: '#fff' }}>Área XXX protegida</span>
        </div>
        <p style={{ fontSize: '0.85rem', color: 'var(--text-muted)', marginBottom: 18 }}>
          Digite a sua senha XXX para liberar o catálogo adulto.
        </p>
        <form onSubmit={handleVerify}>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <input
              type="password"
              autoComplete="current-password"
              style={inputStyle}
              value={verifyForm.password}
              onChange={(e) => setVerifyForm({ password: e.target.value })}
              placeholder="Senha XXX"
            />
            <button
              type="submit"
              className="btn btn-primary"
              style={{ height: 46, fontSize: '0.95rem', borderRadius: 'var(--radius-full)' }}
              disabled={busy || !verifyForm.password}
            >
              {busy ? 'Verificando…' : 'Desbloquear'}
            </button>
          </div>
        </form>
        {error && <p style={{ color: '#f87171', marginTop: 12, fontSize: '0.85rem' }}>{error}</p>}
      </div>
    );
  }
  return shell(
    <div className="vsa-xxx-body">
      <div className="vsa-xxx-toolbar">
        <div className="vsa-xxx-search">
          <Search size={16} color="var(--text-muted)" />
          <input
            className="vsa-xxx-search-input"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar na área XXX…"
          />
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <span className="vsa-xxx-count">{filteredCatalog.length} itens</span>
          {typeof onReload === 'function' && (
            <button
              className="btn btn-secondary btn-sm"
              onClick={onReload}
              title="Atualizar lista"
              style={{ borderRadius: 'var(--radius-full)' }}
            >
              <RefreshCw size={13} />
            </button>
          )}
        </div>
      </div>

      {success && (
        <p style={{ color: '#34d399', fontSize: '0.82rem', margin: '0 0 12px' }}>{success}</p>
      )}

      {liveItems.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Tv size={18} color="#f472b6" />
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
              Canais XXX ({liveItems.length})
            </h2>
          </div>
          <div className="vsa-xxx-grid">
            {liveItems.map((item) => (
              <XxxItem key={item.id} item={item} onPlay={onPlay} />
            ))}
          </div>
        </section>
      )}

      {movieItems.length > 0 && (
        <section style={{ marginBottom: 24 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12 }}>
            <Film size={18} color="#a78bfa" />
            <h2 style={{ margin: 0, fontSize: '1rem', fontWeight: 700 }}>
              Filmes &amp; VOD ({movieItems.length})
            </h2>
          </div>
          <div className="vsa-xxx-grid">
            {movieItems.map((item) => (
              <XxxItem key={item.id} item={item} onPlay={onPlay} />
            ))}
          </div>
        </section>
      )}

      {!isLoading && filteredCatalog.length === 0 && (
        <div className="vsa-xxx-center" style={{ paddingTop: 30 }}>
          <AlertTriangle size={32} style={{ marginBottom: 10, opacity: 0.6 }} />
          <p style={{ fontWeight: 600, color: '#fff' }}>Nenhum conteúdo encontrado</p>
          <p style={{ fontSize: '0.85rem' }}>
            Tente alterar a busca ou fale com o administrador para atualizar a lista XXX.
          </p>
        </div>
      )}
    </div>
  );
}
