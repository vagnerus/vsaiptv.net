import React from 'react';
import { 
  LayoutDashboard, Activity, Radio, Tv, Image, Calendar, 
  Users, UserCheck, Coins, Film, UploadCloud, FolderTree, 
  ShieldAlert, Smartphone, FileText, HardDrive, AlertTriangle, 
  Settings, ChevronLeft, ChevronRight, Menu, X, LogOut, Database,
  Headphones, Bot
} from 'lucide-react';

export default function MasterSidebar({ 
  activeTab, 
  setActiveTab, 
  isCollapsed, 
  setIsCollapsed, 
  isMobileOpen, 
  setIsMobileOpen, 
  onLogout 
}) {
  const menuGroups = [
    {
      group: 'VISÃO GERAL',
      items: [
        { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
        { id: 'support_inbox', label: 'Central de Suporte', icon: Headphones },
        { id: 'agents_observability', label: 'Agentes & Sentinela', icon: Bot },
        { id: 'ai_subtitles', label: 'Legendas IA', icon: Film }
      ]
    },
    {
      group: 'OPERAÇÃO',
      items: [
        { id: 'telemetry', label: 'Monitoramento & P2P', icon: Activity },
        { id: 'connections', label: 'Transmissões Ativas', icon: Radio },
        { id: 'streams_health', label: 'Monitor de Canais', icon: Tv },
        { id: 'images', label: 'Image Manager', icon: Image },
        { id: 'epg', label: 'Guia EPG', icon: Calendar }
      ]
    },
    {
      group: 'COMERCIAL',
      items: [
        { id: 'resellers', label: 'Revendedores', icon: Users },
        { id: 'clients', label: 'Todos os Clientes', icon: UserCheck },
        { id: 'reports', label: 'Créditos & Relatórios', icon: Coins }
      ]
    },
    {
      group: 'CONTEÚDO',
      items: [
        { id: 'catalog', label: 'Catálogo & VOD', icon: Film },
        { id: 'import_m3u', label: 'Importações M3U', icon: UploadCloud },
        { id: 'categories', label: 'Categorias', icon: FolderTree }
      ]
    },
    {
      group: 'SEGURANÇA',
      items: [
        { id: 'firewall', label: 'Firewall & IPs', icon: ShieldAlert },
        { id: 'sessions', label: 'Sessões & Tokens', icon: Smartphone },
        { id: 'audit_logs', label: 'Auditoria Administrativa', icon: FileText }
      ]
    },
    {
      group: 'SISTEMA',
      items: [
        { id: 'health', label: 'Central de Saúde', icon: HardDrive },
        { id: 'backups', label: 'Backup Manager', icon: Database },
        { id: 'error_logs', label: 'Logs de Erros', icon: AlertTriangle },
        { id: 'settings', label: 'Configurações', icon: Settings }
      ]
    }
  ];

  const handleSelectTab = (id) => {
    setActiveTab(id);
    if (isMobileOpen) {
      setIsMobileOpen(false);
    }
  };

  return (
    <>
      {/* Mobile Backdrop */}
      {isMobileOpen && (
        <div 
          onClick={() => setIsMobileOpen(false)}
          style={{
            position: 'fixed',
            inset: 0,
            background: 'rgba(0, 0, 0, 0.7)',
            backdropFilter: 'blur(4px)',
            zIndex: 998
          }}
        />
      )}

      {/* Sidebar Container */}
      <aside
        style={{
          position: 'fixed',
          top: 0,
          left: 0,
          bottom: 0,
          width: isCollapsed ? '72px' : '260px',
          background: '#0d111d',
          borderRight: '1px solid rgba(255, 255, 255, 0.08)',
          zIndex: 999,
          display: 'flex',
          flexDirection: 'column',
          transition: 'width 0.22s cubic-bezier(0.4, 0, 0.2, 1), transform 0.22s cubic-bezier(0.4, 0, 0.2, 1)',
          transform: isMobileOpen ? 'translateX(0)' : undefined,
          boxShadow: '4px 0 24px rgba(0, 0, 0, 0.4)'
        }}
        className="master-sidebar"
      >
        {/* Top Brand Header */}
        <div style={{
          height: '68px',
          padding: '0 18px',
          display: 'flex',
          alignItems: 'center',
          justifyContent: isCollapsed ? 'center' : 'space-between',
          borderBottom: '1px solid rgba(255, 255, 255, 0.06)'
        }}>
          {!isCollapsed && (
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
              <div style={{
                width: '32px',
                height: '32px',
                borderRadius: '8px',
                background: 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: '900',
                color: '#fff',
                fontSize: '14px',
                boxShadow: '0 0 12px rgba(139, 92, 246, 0.5)'
              }}>
                V
              </div>
              <div>
                <span style={{ fontWeight: '800', fontSize: '1rem', color: '#f8fafc', letterSpacing: '-0.3px' }}>
                  VSA<span style={{ color: '#06b6d4' }}>IPTV</span>
                </span>
                <span style={{ display: 'block', fontSize: '0.68rem', color: '#a78bfa', fontWeight: '700', textTransform: 'uppercase', letterSpacing: '0.8px' }}>
                  Painel Master
                </span>
              </div>
            </div>
          )}

          {isCollapsed && (
            <div style={{
              width: '32px',
              height: '32px',
              borderRadius: '8px',
              background: 'linear-gradient(135deg, #8b5cf6 0%, #06b6d4 100%)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontWeight: '900',
              color: '#fff',
              fontSize: '14px'
            }}>
              V
            </div>
          )}

          {/* Collapse Toggle Button (Desktop) */}
          <button
            onClick={() => setIsCollapsed(!isCollapsed)}
            className="sidebar-collapse-btn"
            style={{
              background: 'rgba(255, 255, 255, 0.05)',
              border: 'none',
              color: '#94a3b8',
              cursor: 'pointer',
              padding: '6px',
              borderRadius: '6px',
              display: isCollapsed ? 'none' : 'flex',
              alignItems: 'center',
              justifyContent: 'center'
            }}
            title={isCollapsed ? 'Expandir Menu' : 'Recolher Menu'}
          >
            <ChevronLeft size={16} />
          </button>
        </div>

        {/* Scrollable Navigation List */}
        <div style={{
          flex: 1,
          overflowY: 'auto',
          overflowX: 'hidden',
          padding: isCollapsed ? '14px 8px' : '14px 12px',
          display: 'flex',
          flexDirection: 'column',
          gap: '18px'
        }}>
          {menuGroups.map((grp) => (
            <div key={grp.group}>
              {!isCollapsed && (
                <div style={{
                  fontSize: '0.65rem',
                  fontWeight: '700',
                  color: '#64748b',
                  letterSpacing: '1px',
                  padding: '4px 10px 8px 10px',
                  textTransform: 'uppercase'
                }}>
                  {grp.group}
                </div>
              )}

              <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                {grp.items.map((item) => {
                  const Icon = item.icon;
                  const isActive = activeTab === item.id;

                  return (
                    <button
                      key={item.id}
                      onClick={() => handleSelectTab(item.id)}
                      title={isCollapsed ? item.label : undefined}
                      style={{
                        width: '100%',
                        display: 'flex',
                        alignItems: 'center',
                        gap: '12px',
                        padding: isCollapsed ? '10px 0' : '9px 12px',
                        justifyContent: isCollapsed ? 'center' : 'flex-start',
                        borderRadius: '8px',
                        border: 'none',
                        background: isActive 
                          ? 'linear-gradient(90deg, rgba(139, 92, 246, 0.22) 0%, rgba(6, 182, 212, 0.12) 100%)' 
                          : 'transparent',
                        color: isActive ? '#f8fafc' : '#94a3b8',
                        cursor: 'pointer',
                        transition: 'all 0.15s ease',
                        position: 'relative'
                      }}
                      onMouseEnter={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.background = 'rgba(255, 255, 255, 0.04)';
                          e.currentTarget.style.color = '#e2e8f0';
                        }
                      }}
                      onMouseLeave={(e) => {
                        if (!isActive) {
                          e.currentTarget.style.background = 'transparent';
                          e.currentTarget.style.color = '#94a3b8';
                        }
                      }}
                    >
                      {isActive && (
                        <div style={{
                          position: 'absolute',
                          left: 0,
                          top: '6px',
                          bottom: '6px',
                          width: '3px',
                          borderRadius: '0 3px 3px 0',
                          background: '#a78bfa',
                          boxShadow: '0 0 8px #a78bfa'
                        }} />
                      )}

                      <Icon 
                        size={18} 
                        color={isActive ? '#38bdf8' : '#94a3b8'} 
                        strokeWidth={isActive ? 2.3 : 1.8}
                      />

                      {!isCollapsed && (
                        <span style={{
                          fontSize: '0.84rem',
                          fontWeight: isActive ? '700' : '500',
                          whiteSpace: 'nowrap',
                          letterSpacing: '-0.1px'
                        }}>
                          {item.label}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Bottom Expand Toggle when Collapsed */}
        {isCollapsed && (
          <div style={{
            padding: '12px 0',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            display: 'flex',
            justifyContent: 'center'
          }}>
            <button
              onClick={() => setIsCollapsed(false)}
              style={{
                background: 'rgba(255, 255, 255, 0.05)',
                border: 'none',
                color: '#94a3b8',
                cursor: 'pointer',
                padding: '8px',
                borderRadius: '8px'
              }}
              title="Expandir menu"
            >
              <ChevronRight size={16} />
            </button>
          </div>
        )}

        {/* Footer info / Logout */}
        {!isCollapsed && (
          <div style={{
            padding: '14px 18px',
            borderTop: '1px solid rgba(255, 255, 255, 0.06)',
            background: 'rgba(0, 0, 0, 0.2)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between'
          }}>
            <div>
              <span style={{ display: 'block', fontSize: '0.8rem', fontWeight: '700', color: '#f8fafc' }}>
                Administrador
              </span>
              <span style={{ fontSize: '0.7rem', color: '#34d399' }}>
                ● Conexão Segura
              </span>
            </div>

            {onLogout && (
              <button
                onClick={onLogout}
                style={{
                  background: 'transparent',
                  border: 'none',
                  color: '#94a3b8',
                  cursor: 'pointer',
                  padding: '6px',
                  borderRadius: '6px'
                }}
                title="Sair do Painel Master"
              >
                <LogOut size={16} />
              </button>
            )}
          </div>
        )}
      </aside>
    </>
  );
}
