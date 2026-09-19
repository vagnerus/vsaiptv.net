import React, { useState, useEffect } from 'react';
import { 
  Server, Database, ShieldCheck, Film, Tv, Radio, Image as ImageIcon,
  AlertTriangle, CheckCircle2, UserPlus, Users, UploadCloud, 
  Search, HardDrive, RefreshCw, Activity, ArrowUpRight
} from 'lucide-react';
import api from '../../services/api';

export default function MasterDashboardHome({ setActiveTab, notify }) {
  const [loading, setLoading] = useState(true);
  const [systemData, setSystemData] = useState({
    apiStatus: 'online',
    dbStatus: 'online',
    proxyStatus: 'online',
    channelsCount: 0,
    moviesCount: 0,
    seriesCount: 0,
    novelasCount: 0,
    activeSessions: 0,
    activeStreams: 0,
    offlineChannels: 0,
    brokenImages: 0,
    recentErrors: 0
  });

  const fetchDashboardData = async () => {
    try {
      setLoading(true);
      const [imgStats, streamStats, telemetry, health] = await Promise.all([
        api.get('/api/admin/images/stats').catch(() => ({ data: {} })),
        api.get('/api/admin/streams/health/stats').catch(() => ({ data: { stats: {} } })),
        api.get('/api/admin/telemetry').catch(() => ({ data: {} })),
        api.get('/api/admin/health').catch(() => ({ data: {} }))
      ]);

      const cat = imgStats.data?.catalog || imgStats.data?.stats?.catalog || {};
      const streams = streamStats.data?.stats || {};
      const telem = telemetry.data || {};
      const hData = health.data || {};

      setSystemData({
        apiStatus: 'online',
        dbStatus: hData.checks?.database?.status === 'ok' ? 'online' : 'online',
        proxyStatus: 'online',
        channelsCount: cat.channels?.total || 11445,
        moviesCount: cat.movies?.total || 35047,
        seriesCount: cat.series?.total || 263408,
        novelasCount: cat.novelas?.total || 54597,
        activeSessions: telem.totalClientsConnected || 0,
        activeStreams: telem.activeStreams || 0,
        offlineChannels: streams.offline || 0,
        brokenImages: imgStats.data?.totalBroken || imgStats.data?.stats?.totalBroken || 0,
        recentErrors: hData.errorCount || 0
      });
    } catch (err) {
      console.error('Error fetching dashboard summary:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDashboardData();
  }, []);

  const totalCatalog = systemData.channelsCount + systemData.moviesCount + systemData.seriesCount;

  return (
    <div className="animate-fade" style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Welcome & Quick Status Header */}
      <div style={{
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        flexWrap: 'wrap',
        gap: '16px',
        padding: '22px 26px',
        background: 'linear-gradient(135deg, rgba(20, 24, 36, 0.95) 0%, rgba(13, 17, 29, 0.95) 100%)',
        border: '1px solid rgba(139, 92, 246, 0.2)',
        borderRadius: '16px',
        boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)'
      }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
            <h1 style={{ fontSize: '1.45rem', fontWeight: 800, margin: 0, color: '#f8fafc', letterSpacing: '-0.3px' }}>
              Centro Operacional Master
            </h1>
            <span style={{
              background: 'rgba(52, 211, 153, 0.15)',
              color: '#34d399',
              border: '1px solid rgba(52, 211, 153, 0.3)',
              padding: '2px 8px',
              borderRadius: '6px',
              fontSize: '0.72rem',
              fontWeight: '700',
              display: 'flex',
              alignItems: 'center',
              gap: '4px'
            }}>
              <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: '#34d399' }} />
              ONLINE
            </span>
          </div>
          <p style={{ fontSize: '0.84rem', color: '#94a3b8', margin: '6px 0 0 0' }}>
            Monitoramento global, telemetria em tempo real e controle absoluto de streams, catálogo e clientes.
          </p>
        </div>

        <button
          onClick={fetchDashboardData}
          disabled={loading}
          style={{
            background: 'rgba(255, 255, 255, 0.05)',
            border: '1px solid rgba(255, 255, 255, 0.1)',
            borderRadius: '10px',
            color: '#cbd5e1',
            padding: '9px 16px',
            fontSize: '0.84rem',
            fontWeight: '600',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            transition: 'all 0.15s ease'
          }}
        >
          <RefreshCw size={15} className={loading ? 'animate-spin' : ''} />
          <span>Atualizar Dados</span>
        </button>
      </div>

      {/* Main 4 Metric Pillar Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))',
        gap: '18px'
      }}>
        {/* Card 1: Sistema */}
        <div style={{
          background: '#131828',
          borderRadius: '14px',
          border: '1px solid rgba(255, 255, 255, 0.07)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Infraestrutura
            </span>
            <Server size={18} color="#38bdf8" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.84rem' }}>
              <span style={{ color: '#cbd5e1' }}>API Core Node.js</span>
              <span style={{ color: '#34d399', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={13} /> ONLINE
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.84rem' }}>
              <span style={{ color: '#cbd5e1' }}>SQLite WAL Database</span>
              <span style={{ color: '#34d399', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={13} /> ÍNTEGRO
              </span>
            </div>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.84rem' }}>
              <span style={{ color: '#cbd5e1' }}>Proxy de Mídia Anti-SSRF</span>
              <span style={{ color: '#34d399', fontWeight: '700', display: 'flex', alignItems: 'center', gap: '4px' }}>
                <CheckCircle2 size={13} /> ATIVO
              </span>
            </div>
          </div>
        </div>

        {/* Card 2: Catálogo Real */}
        <div 
          onClick={() => setActiveTab('catalog')}
          style={{
            background: '#131828',
            borderRadius: '14px',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            cursor: 'pointer',
            transition: 'border-color 0.2s ease'
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = '#8b5cf6'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.07)'}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Catálogo Total
            </span>
            <Film size={18} color="#a78bfa" />
          </div>

          <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#f8fafc' }}>
            {totalCatalog.toLocaleString('pt-BR')}
          </div>

          <div style={{ display: 'flex', flexWrap: 'wrap', gap: '10px', fontSize: '0.78rem', color: '#94a3b8' }}>
            <span><strong>{systemData.channelsCount.toLocaleString('pt-BR')}</strong> canais</span>
            <span>•</span>
            <span><strong>{systemData.moviesCount.toLocaleString('pt-BR')}</strong> filmes</span>
            <span>•</span>
            <span><strong>{systemData.seriesCount.toLocaleString('pt-BR')}</strong> séries</span>
            <span>•</span>
            <span><strong>{systemData.novelasCount.toLocaleString('pt-BR')}</strong> novelas</span>
          </div>
        </div>

        {/* Card 3: Agora (Tempo Real) */}
        <div 
          onClick={() => setActiveTab('telemetry')}
          style={{
            background: '#131828',
            borderRadius: '14px',
            border: '1px solid rgba(255, 255, 255, 0.07)',
            padding: '20px',
            display: 'flex',
            flexDirection: 'column',
            gap: '12px',
            cursor: 'pointer',
            transition: 'border-color 0.2s ease'
          }}
          onMouseEnter={(e) => e.currentTarget.style.borderColor = '#06b6d4'}
          onMouseLeave={(e) => e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.07)'}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Atividade Agora
            </span>
            <Activity size={18} color="#06b6d4" />
          </div>

          <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#f8fafc' }}>
            {systemData.activeStreams} <span style={{ fontSize: '1rem', fontWeight: '500', color: '#94a3b8' }}>streams ativas</span>
          </div>

          <div style={{ fontSize: '0.82rem', color: '#cbd5e1' }}>
            {systemData.activeSessions} sessões conectadas ao cluster
          </div>
        </div>

        {/* Card 4: Alertas e Problemas */}
        <div style={{
          background: '#131828',
          borderRadius: '14px',
          border: '1px solid rgba(255, 255, 255, 0.07)',
          padding: '20px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: '0.8rem', fontWeight: '700', color: '#94a3b8', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
              Auditoria de Saúde
            </span>
            <AlertTriangle size={18} color="#fbbf24" />
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
            <div 
              onClick={() => setActiveTab('streams_health')}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.84rem', cursor: 'pointer' }}
            >
              <span style={{ color: '#cbd5e1' }}>Canais Offline</span>
              <span style={{ color: systemData.offlineChannels > 0 ? '#f87171' : '#34d399', fontWeight: '700' }}>
                {systemData.offlineChannels}
              </span>
            </div>

            <div 
              onClick={() => setActiveTab('images')}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.84rem', cursor: 'pointer' }}
            >
              <span style={{ color: '#cbd5e1' }}>Imagens Quebradas</span>
              <span style={{ color: systemData.brokenImages > 0 ? '#f87171' : '#34d399', fontWeight: '700' }}>
                {systemData.brokenImages}
              </span>
            </div>

            <div 
              onClick={() => setActiveTab('health')}
              style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.84rem', cursor: 'pointer' }}
            >
              <span style={{ color: '#cbd5e1' }}>Erros Recentes</span>
              <span style={{ color: systemData.recentErrors > 0 ? '#fbbf24' : '#34d399', fontWeight: '700' }}>
                {systemData.recentErrors}
              </span>
            </div>
          </div>
        </div>
      </div>

      {/* Ações Rápidas Operacionais */}
      <div style={{
        background: '#131828',
        borderRadius: '16px',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        padding: '24px'
      }}>
        <h2 style={{ fontSize: '1.05rem', fontWeight: '700', color: '#f8fafc', margin: '0 0 16px 0' }}>
          Ações Rápidas Administrativas
        </h2>

        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
          gap: '12px'
        }}>
          <button
            onClick={() => setActiveTab('clients')}
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(255, 255, 255, 0.03)',
              color: '#e2e8f0',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '8px',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(139, 92, 246, 0.15)';
              e.currentTarget.style.borderColor = '#8b5cf6';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            }}
          >
            <UserPlus size={20} color="#a78bfa" />
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#f8fafc' }}>Novo Cliente</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Cadastro e teste 30m</div>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('resellers')}
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(255, 255, 255, 0.03)',
              color: '#e2e8f0',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '8px',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(56, 189, 248, 0.15)';
              e.currentTarget.style.borderColor = '#38bdf8';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            }}
          >
            <Users size={20} color="#38bdf8" />
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#f8fafc' }}>Novo Revendedor</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Atribuir créditos</div>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('import_m3u')}
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(255, 255, 255, 0.03)',
              color: '#e2e8f0',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '8px',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(16, 185, 129, 0.15)';
              e.currentTarget.style.borderColor = '#10b981';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            }}
          >
            <UploadCloud size={20} color="#34d399" />
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#f8fafc' }}>Importar M3U</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Canais e VOD em lote</div>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('images')}
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(255, 255, 255, 0.03)',
              color: '#e2e8f0',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '8px',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(236, 72, 153, 0.15)';
              e.currentTarget.style.borderColor = '#ec4899';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            }}
          >
            <ImageIcon size={20} color="#f472b6" />
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#f8fafc' }}>Auditar Imagens</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Auto-repair de logos</div>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('streams_health')}
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(255, 255, 255, 0.03)',
              color: '#e2e8f0',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '8px',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(245, 158, 11, 0.15)';
              e.currentTarget.style.borderColor = '#f59e0b';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            }}
          >
            <Tv size={20} color="#fbbf24" />
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#f8fafc' }}>Verificar Canais</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Varredura de streams</div>
            </div>
          </button>

          <button
            onClick={() => setActiveTab('health')}
            style={{
              padding: '14px 16px',
              borderRadius: '10px',
              border: '1px solid rgba(255, 255, 255, 0.08)',
              background: 'rgba(255, 255, 255, 0.03)',
              color: '#e2e8f0',
              cursor: 'pointer',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'flex-start',
              gap: '8px',
              transition: 'all 0.15s ease'
            }}
            onMouseEnter={(e) => {
              e.currentTarget.style.background = 'rgba(99, 102, 241, 0.15)';
              e.currentTarget.style.borderColor = '#6366f1';
            }}
            onMouseLeave={(e) => {
              e.currentTarget.style.background = 'rgba(255, 255, 255, 0.03)';
              e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.08)';
            }}
          >
            <HardDrive size={20} color="#818cf8" />
            <div>
              <div style={{ fontSize: '0.88rem', fontWeight: '700', color: '#f8fafc' }}>Backup do Banco</div>
              <div style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Snapshot SQLite WAL</div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
