# VSAIPTV — Auto-Healing do Agente Sentinela

## Filosofia

O Sentinela resolve a **grande maioria** das falhas de reprodução de forma silenciosa, determinística e sem consumir tokens de IA. A IA só é acionada em diagnósticos ambíguos ou no atendimento ao usuário.

---

## Estratégias de Recuperação

### Hierarquia de Tentativas

```
Falha Detectada
      │
      ▼
[Tentativa 1] Reload de Manifest
      │ falhou?
      ▼
[Tentativa 2] Troca de Proxy / Rota Alternativa
      │ falhou?
      ▼
[Tentativa 3] Recriação Completa do Player
      │ falhou?
      ▼
[Escalonamento] → Master Inbox como Incidente
```

### Resfriamento (Cooldown)

- Mínimo de **10 segundos** entre tentativas do mesmo tipo no mesmo stream
- Circuit breaker por stream: máximo 3 tentativas em 2 minutos
- Se ultrapassar → stream marcado como "problemático" e reportado

---

## Eventos Monitorados

| Evento | Severidade | Estratégia |
|--------|-----------|------------|
| `PLAYER_STALLED` | warn | Reload manifest |
| `HLS_FATAL_ERROR` | error | Recriação do player |
| `STREAM_TIMEOUT` | error | Troca de proxy |
| `MANIFEST_ERROR` | error | Reload manifest |
| `SEGMENT_ERROR` | warn | Reload manifest |
| `API_5XX` | error | Aguarda e repete |
| `IMAGE_FAILURE` | info | Marca para auditoria |
| `BACKEND_UNHEALTHY` | critical | Alerta imediato Master |

---

## Incidentes Globais

O `agentEventBus.js` correlaciona eventos globais:

**Regra**: ≥ 5 usuários distintos com o mesmo tipo de erro no mesmo stream em 3 minutos → `GlobalIncident` criado.

**Ação do Sentinela**:
1. Registra incidente em `agent_global_incidents`
2. Notifica Master Inbox com urgência
3. Pode sinalizar canal como "em manutenção" no catálogo

---

## Auditoria (`agent_runs`)

Cada ação do Sentinela é registrada:

```json
{
  "agent": "sentinel",
  "trigger": "HLS_FATAL_ERROR",
  "started_at": "2026-09-19T...",
  "finished_at": "2026-09-19T...",
  "status": "SUCCESS | FAILED | ESCALATED",
  "actions_count": 2,
  "result": "Player recriado com sucesso",
  "correlation_id": "corr_xxx"
}
```

---

## Kill Switch

**Configuração**: `system_settings.sentinel_auto_heal = 'false'`

Quando desativado, o Sentinela **apenas registra** os eventos sem executar nenhuma ação de recuperação.

---

## Integração com o Cliente (VideoPlayer.jsx)

O player envia eventos de telemetria para o Event Bus via API:

```javascript
// Exemplo: player stalled por mais de 3s
agentEventBus.publish({
  type: 'PLAYER_STALLED',
  severity: 'warn',
  source: 'client_player',
  userId: user.id,
  sessionId: sessionId,
  streamId: currentStreamId,
  context: {
    stallDurationMs: 3500,
    bufferLength: 0.2,
    networkType: 'wifi'
  }
});
```

O Sentinela recebe o evento e pode responder com uma instrução de recuperação que o cliente executa de forma segura.
