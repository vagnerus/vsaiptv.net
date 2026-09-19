# VSAIPTV — Arquitetura Autônoma de Agentes

## Visão Geral

O VSAIPTV opera com uma camada autônoma de 4 agentes especializados, orientados a eventos. Cada agente tem um escopo preciso e princípios de segurança rigorosos.

```
                      VSAIPTV
                         │
           ┌─────────────┴──────────────┐
           │       EVENT BUS            │
           │  (agentEventBus.js)        │
           └─────────────┬──────────────┘
                         │
     ┌───────────────────┼──────────────────────┐
     │                   │                      │
┌────┴─────┐    ┌────────┴────────┐    ┌────────┴────────┐
│ Sentinela│    │  Segurança      │    │  Suporte IA     │
│(sentinel)│    │ (security)      │    │ (supportAgent)  │
└──────────┘    └─────────────────┘    └─────────────────┘
                                               │
                                     ┌─────────┴──────────┐
                                     │  VSAIROUTER (LLM)  │
                                     └────────────────────┘
                                               │
                                     ┌─────────┴──────────┐
                                     │  Master Inbox       │
                                     │  (Central Dev)      │
                                     └────────────────────┘
```

---

## Agentes

### 1. Agente Sentinela (`sentinelAgent.js`)

**Responsabilidade**: Monitoramento operacional 24/7 e auto-recuperação determinística.

**Eventos monitorados**:
- `PLAYER_STALLED` — Player travado
- `HLS_FATAL_ERROR` — Erro fatal de HLS
- `STREAM_TIMEOUT` — Timeout de stream
- `MANIFEST_ERROR` — Falha no manifest
- `SEGMENT_ERROR` — Erro de segmento
- `API_5XX` — Erros de servidor
- `IMAGE_FAILURE` — Falha de imagem
- `BACKEND_UNHEALTHY` — Backend com problema

**Estratégias de recuperação** (em ordem):
1. Reload de manifest
2. Troca de proxy/rota
3. Recriação do player
4. Se falhar 3x → Escalona para Master Inbox como incidente

**Princípio**: Silencioso. Não incomoda o usuário quando resolve sozinho.

---

### 2. Agente de Segurança (`securityAgent.js`)

**Responsabilidade**: Detecção de ameaças e ações defensivas reversíveis.

**Detecta**:
- Brute-force de login (≥ 5 falhas/5 min por IP)
- Probes de rotas não autorizadas
- Divergência de IP/User-Agent em tokens de sessão

**Ações autorizadas** (todas reversíveis):
- Bloqueio temporário de IP (24h por padrão)
- Invalidação de sessão comprometida
- Auditoria de ações de segurança

**Ações BLOQUEADAS na raiz**:
- Excluir usuários
- Apagar banco de dados
- Executar comandos arbitrários do sistema

---

### 3. Agente de Suporte IA (`supportAgent.js`)

**Responsabilidade**: Atendimento ao usuário via chat com VSAIROUTER.

**Ferramentas disponíveis** (via `actionEngine.js`):
- `searchCatalog` — Busca real no SQLite por filmes/séries/canais
- `getContentDetails` — Metadados de streams
- `getPlayerDiagnostics` — Diagnóstico de reprodução
- `recoverPlayer` — Instrução de recuperação para o cliente
- `checkApiHealth` — Verificação de saúde da API
- `reportBrokenContent` — Marcar conteúdo para revisão
- `createSupportIncident` — Criar/escalonar chamado

**Escalonamento automático**: Quando não consegue resolver, abre chamado `WAITING_ADMIN` e notifica Master Inbox em tempo real.

---

### 4. Central Dev / Master Inbox

**Interface**: `MasterSupportInbox.jsx` + `MasterAgentsObservability.jsx`

**Funcionalidades**:
- Painel de chamados em tempo real via WebSocket (`/ws/support`)
- Visualização de histórico completo de conversas
- Modo AI ↔ HUMAN: pode assumir ou devolver para IA
- Copiloto: IA sugere resposta para o Dev analisar
- Kill switches de automação

---

## Barramento de Eventos (`agentEventBus.js`)

O Event Bus central é um `EventEmitter` com:
- **Normalização** de eventos: `{ id, type, severity, source, userId, sessionId, deviceId, streamId, timestamp, sanitizedContext, correlationId }`
- **Sanitização** automática de dados sensíveis (tokens, senhas, chaves de API)
- **Correlação de incidentes globais**: ≥ 5 usuários distintos com erro no mesmo stream em 3 minutos → cria `GlobalIncident`
- **Limpeza periódica** de janelas deslizantes

---

## Kill Switches

Configurados em `system_settings` e controláveis via painel Master:

| Chave | Padrão | Efeito ao desativar |
|-------|--------|---------------------|
| `sentinel_auto_heal` | `true` | Desativa auto-recuperação do Sentinela |
| `security_auto_action` | `true` | Desativa bloqueios automáticos de segurança |
| `ai_support_enabled` | `true` | Desativa respostas de IA no suporte |

---

## Resiliência

**Se o VSAIROUTER estiver offline**:
- Streaming, catálogo, TV e login continuam 100% normais
- Chat de suporte exibe mensagem amigável
- Mensagem vai direto para fila humana (Master Inbox)
- Nenhuma exceção não tratada é lançada no servidor

---

## Ciclo de Vida de um Chamado de Suporte

```
OPEN → AI_HANDLING → WAITING_USER ←→ AI_HANDLING
                   ↓
              WAITING_ADMIN
                   ↓
           ADMIN_HANDLING (modo HUMAN)
                   ↓
              RESOLVED → CLOSED
```

**Estados**: `OPEN`, `AI_HANDLING`, `WAITING_USER`, `WAITING_ADMIN`, `ADMIN_HANDLING`, `RESOLVED`, `CLOSED`

**Prioridades**: `P1` (crítico), `P2` (alto), `P3` (médio), `P4` (baixo)
