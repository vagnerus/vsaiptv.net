import React, { useState, useEffect } from 'react';
import { 
  Activity, ShieldAlert, Bot, Cpu, Power, AlertTriangle, 
  CheckCircle2, RefreshCw, Layers, Radio, Zap, Clock
} from 'lucide-react';
import api from '../../services/api';

export default function MasterAgentsObservability({ notify }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [toggling, setToggling] = useState({});

  const fetchStatus = async () => {
    try {
      const res = await api.get('/api/support/admin/agents/status');
      setData(res.data);
    } catch (err) {
      console.error('[MasterAgents] Erro ao carregar status:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchStatus();
    const interval = setInterval(fetchStatus, 8000);
    return () => clearInterval(interval);
  }, []);

  const handleToggle = async (key, currentValue) => {
    setToggling((prev) => ({ ...prev, [key]: true }));
    try {
      await api.post('/api/support/admin/agents/toggle', {
        key,
        value: !currentValue
      });
      if (notify) notify(`Automação [${key}] alterada com sucesso!`);
      await fetchStatus();
    } catch (err) {
      if (notify) notify('Erro ao alternar automação', 'error');
    } finally {
      setToggling((prev) => ({ ...prev, [key]: false }));
    }
  };

  if (loading && !data) {
    return (
      <div style={{ padding: '40px', textAlign: 'center', color: '#818cf8' }}>
        Carregando observabilidade dos agentes...
      </div>
    );
  }

  const agents = data?.agents || {};
  const stats = data?.stats || {};
  const incidents = data?.activeIncidents || [];
  const runs = data?.recentRuns || [];

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '24px' }}>
      {/* Cards de Status dos 4 Agentes / Provedores */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))',
        gap: '16px'
      }}>
        {/* Sentinela */}
        <div style={{
          background: '#0d111d',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Activity size={18} color="#38bdf8" />
              <strong style={{ color: '#f8fafc', fontSize: '0.9rem' }}>Agente Sentinela</strong>
            </div>
            <span style={{
              background: 'rgba(56, 189, 248, 0.15)',
              color: '#38bdf8',
              fontSize: '0.7rem',
              fontWeight: '700',
              padding: '2px 8px',
              borderRadius: '20px'
            }}>
              ● {agents.sentinel?.status || 'ONLINE'}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.76rem', color: '#94a3b8' }}>
            Auto-healing determinístico de HLS, stalls, manifests e recriação de players.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '10px' }}>
            <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>Auto-Heal:</span>
            <button
              onClick={() => handleToggle('sentinel_auto_heal', agents.sentinel?.autoHeal)}
              disabled={toggling.sentinel_auto_heal}
              style={{
                background: agents.sentinel?.autoHeal ? '#059669' : '#dc2626',
                color: '#ffffff',
                border: 'none',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.72rem',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              {agents.sentinel?.autoHeal ? 'ON (Ativo)' : 'OFF (Pausado)'}
            </button>
          </div>
        </div>

        {/* Segurança */}
        <div style={{
          background: '#0d111d',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <ShieldAlert size={18} color="#f59e0b" />
              <strong style={{ color: '#f8fafc', fontSize: '0.9rem' }}>Agente de Segurança</strong>
            </div>
            <span style={{
              background: 'rgba(245, 158, 11, 0.15)',
              color: '#fbbf24',
              fontSize: '0.7rem',
              fontWeight: '700',
              padding: '2px 8px',
              borderRadius: '20px'
            }}>
              ● {agents.security?.status || 'ONLINE'}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.76rem', color: '#94a3b8' }}>
            Monitoramento contra brute-force, tokens inválidos e anomalias de sessão. Ações defensivas reversíveis.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '10px' }}>
            <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>Ação Defensiva:</span>
            <button
              onClick={() => handleToggle('security_auto_action', agents.security?.autoAction)}
              disabled={toggling.security_auto_action}
              style={{
                background: agents.security?.autoAction ? '#059669' : '#dc2626',
                color: '#ffffff',
                border: 'none',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.72rem',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              {agents.security?.autoAction ? 'ON (Ativo)' : 'OFF (Pausado)'}
            </button>
          </div>
        </div>

        {/* Suporte */}
        <div style={{
          background: '#0d111d',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Bot size={18} color="#a855f7" />
              <strong style={{ color: '#f8fafc', fontSize: '0.9rem' }}>Agente de Suporte</strong>
            </div>
            <span style={{
              background: 'rgba(168, 85, 247, 0.15)',
              color: '#c084fc',
              fontSize: '0.7rem',
              fontWeight: '700',
              padding: '2px 8px',
              borderRadius: '20px'
            }}>
              ● {agents.support?.status || 'ONLINE'}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.76rem', color: '#94a3b8' }}>
            Atendimento em tempo real via VSAIROUTER. Usa ferramentas de catálogo e diagnóstico seguro.
          </p>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '10px' }}>
            <span style={{ fontSize: '0.75rem', color: '#cbd5e1' }}>Atendimento IA:</span>
            <button
              onClick={() => handleToggle('ai_support_enabled', agents.support?.enabled)}
              disabled={toggling.ai_support_enabled}
              style={{
                background: agents.support?.enabled ? '#059669' : '#dc2626',
                color: '#ffffff',
                border: 'none',
                padding: '4px 10px',
                borderRadius: '6px',
                fontSize: '0.72rem',
                fontWeight: '700',
                cursor: 'pointer'
              }}
            >
              {agents.support?.enabled ? 'ON (Ativo)' : 'OFF (Pausado)'}
            </button>
          </div>
        </div>

        {/* VSAIROUTER */}
        <div style={{
          background: '#0d111d',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          borderRadius: '12px',
          padding: '18px',
          display: 'flex',
          flexDirection: 'column',
          gap: '12px'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              <Cpu size={18} color="#34d399" />
              <strong style={{ color: '#f8fafc', fontSize: '0.9rem' }}>VSAIROUTER</strong>
            </div>
            <span style={{
              background: agents.vsairouter?.status === 'ONLINE' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(239, 68, 68, 0.15)',
              color: agents.vsairouter?.status === 'ONLINE' ? '#34d399' : '#f87171',
              fontSize: '0.7rem',
              fontWeight: '700',
              padding: '2px 8px',
              borderRadius: '20px'
            }}>
              ● {agents.vsairouter?.status || 'OFFLINE'}
            </span>
          </div>
          <p style={{ margin: 0, fontSize: '0.76rem', color: '#94a3b8' }}>
            Endpoint OpenAI-compatible /v1 para inferência de modelos e execução de funções.
          </p>
          <div style={{ fontSize: '0.72rem', color: '#64748b', borderTop: '1px solid rgba(255, 255, 255, 0.06)', paddingTop: '10px' }}>
            Latência: <strong>{agents.vsairouter?.latency_ms ? `${agents.vsairouter.latency_ms}ms` : 'N/A'}</strong> • Modelo: <strong>{agents.vsairouter?.model || 'Padrão'}</strong>
          </div>
        </div>
      </div>

      {/* Incidentes Globais Correlacionados */}
      <div style={{
        background: '#0d111d',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '12px',
        padding: '20px'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '14px' }}>
          <h3 style={{ margin: 0, fontSize: '0.95rem', color: '#f8fafc', fontWeight: '800' }}>
            Incidentes Globais Correlacionados
          </h3>
          <span style={{ fontSize: '0.75rem', color: '#94a3b8' }}>
            {incidents.length} incidente(s) ativo(s)
          </span>
        </div>

        {incidents.length === 0 ? (
          <div style={{ padding: '20px', textAlign: 'center', color: '#64748b', fontSize: '0.8rem' }}>
            Nenhum incidente global ativo. Todas as transmissões e rotas operando com estabilidade.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
            {incidents.map((inc) => (
              <div key={inc.id} style={{
                background: 'rgba(239, 68, 68, 0.08)',
                border: '1px solid rgba(239, 68, 68, 0.25)',
                padding: '12px 16px',
                borderRadius: '8px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between'
              }}>
                <div>
                  <strong style={{ color: '#f87171', fontSize: '0.85rem' }}>{inc.incident_code}</strong>: {inc.title}
                  <div style={{ fontSize: '0.72rem', color: '#94a3b8', marginTop: '2px' }}>
                    Origem afetada: <code>{inc.source}</code> • Usuários impactados: <strong>{inc.affected_count}</strong>
                  </div>
                </div>
                <span style={{
                  background: '#ef4444',
                  color: '#fff',
                  fontSize: '0.68rem',
                  fontWeight: '800',
                  padding: '3px 8px',
                  borderRadius: '4px'
                }}>
                  {inc.status}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Histórico Recente de Execuções e Auditoria (agent_runs) */}
      <div style={{
        background: '#0d111d',
        border: '1px solid rgba(255, 255, 255, 0.08)',
        borderRadius: '12px',
        padding: '20px'
      }}>
        <h3 style={{ margin: '0 0 14px 0', fontSize: '0.95rem', color: '#f8fafc', fontWeight: '800' }}>
          Auditoria de Execuções dos Agentes (agent_runs)
        </h3>

        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.78rem', textAlign: 'left' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.08)', color: '#94a3b8' }}>
                <th style={{ padding: '8px 12px' }}>Agente</th>
                <th style={{ padding: '8px 12px' }}>Gatilho / Evento</th>
                <th style={{ padding: '8px 12px' }}>Status</th>
                <th style={{ padding: '8px 12px' }}>Ações</th>
                <th style={{ padding: '8px 12px' }}>Resultado / Diagnóstico</th>
                <th style={{ padding: '8px 12px' }}>Horário</th>
              </tr>
            </thead>
            <tbody>
              {runs.map((r) => (
                <tr key={r.id} style={{ borderBottom: '1px solid rgba(255, 255, 255, 0.04)' }}>
                  <td style={{ padding: '10px 12px', fontWeight: '700', color: '#f8fafc' }}>{r.agent}</td>
                  <td style={{ padding: '10px 12px', color: '#38bdf8' }}><code>{r.trigger}</code></td>
                  <td style={{ padding: '10px 12px' }}>
                    <span style={{
                      padding: '2px 8px',
                      borderRadius: '4px',
                      fontSize: '0.68rem',
                      fontWeight: '700',
                      background: r.status === 'recovered' ? 'rgba(52, 211, 153, 0.15)' : 'rgba(99, 102, 241, 0.15)',
                      color: r.status === 'recovered' ? '#34d399' : '#818cf8'
                    }}>
                      {r.status}
                    </span>
                  </td>
                  <td style={{ padding: '10px 12px', color: '#cbd5e1' }}>{r.actions_count}</td>
                  <td style={{ padding: '10px 12px', color: '#94a3b8', maxWidth: '300px', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                    {r.result || 'Concluído com sucesso'}
                  </td>
                  <td style={{ padding: '10px 12px', color: '#64748b' }}>
                    {new Date(r.created_at).toLocaleTimeString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
