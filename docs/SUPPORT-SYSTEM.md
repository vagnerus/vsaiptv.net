# VSAIPTV — Sistema de Suporte ao Usuário

## Visão Geral

O sistema de suporte do VSAIPTV oferece atendimento 24/7 via IA com escalonamento transparente para suporte humano (Dev/Master).

---

## Interface do Usuário: Balão de Suporte

O balão flutuante (`SupportBubble.jsx`) aparece no canto inferior direito para todos os usuários autenticados.

### Comportamento em Fullscreen

**OBRIGATÓRIO**: O balão e qualquer modal aberto **desaparecem completamente** ao entrar em tela cheia e **reaparecem suavemente** ao sair. Implementado via `document.addEventListener('fullscreenchange', ...)` com suporte a variantes webkit.

### Quick Actions

Ao abrir o chat pela primeira vez, o usuário vê chips rápidos:
- 🔎 Encontrar conteúdo
- 📺 Problema ao assistir
- 🔐 Problema na conta
- 💳 Pagamento
- ❓ Outra dúvida

### Cards de Conteúdo

Quando o usuário pergunta sobre um filme/série/canal, o sistema retorna cards ricos com capa, título, categoria e botão **[ASSISTIR]** direto.

### Indicador de Modo

- **IA ativa**: Badge ciano/azul — "Assistente VSAIPTV"
- **Suporte humano**: Badge âmbar — "Suporte Técnico Humano (Dev)"

---

## Rotas da API de Suporte

### Rotas de Usuário

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/support/conversation` | Obtém ou cria conversa ativa |
| GET | `/api/support/conversation/:id/messages` | Histórico paginado |
| POST | `/api/support/message` | Envia mensagem |
| POST | `/api/support/escalate` | Escala para humano |

### Rotas Administrativas

| Método | Rota | Descrição |
|--------|------|-----------|
| GET | `/api/admin/support/inbox` | Lista de chamados com filtros |
| POST | `/api/admin/support/:id/reply` | Resposta do Dev |
| POST | `/api/admin/support/:id/mode` | Alterna AI ↔ HUMAN |
| POST | `/api/admin/support/:id/suggest` | Copiloto: sugestão de resposta |
| GET | `/api/admin/agents/status` | Status dos agentes e kill switches |
| POST | `/api/admin/agents/toggle` | Ativa/desativa kill switches |

---

## WebSocket em Tempo Real

**Endpoint**: `ws://servidor/ws/support`

### Mensagens do Servidor → Cliente

- `support:message` — Nova mensagem do Dev/IA
- `support:mode_change` — Mudança de modo (AI/HUMAN)
- `support:typing` — Indicador de digitação

### Mensagens do Master Dashboard

**Endpoint**: `ws://servidor/ws/support?role=admin`

- `admin:new_conversation` — Novo chamado aberto
- `admin:new_message` — Nova mensagem de usuário
- `admin:agent_run` — Execução de agente

---

## Modo Copiloto Dev

O Dev pode solicitar sugestão de resposta ao clicar em **[✨ SUGERIR RESPOSTA (COPILOTO IA)]**:

1. Sistema envia histórico completo para VSAIROUTER
2. IA analisa o contexto e redige sugestão
3. Sugestão aparece na caixa de texto do Dev para **revisão e edição antes de enviar**
4. Dev pode aceitar, editar ou descartar

---

## Regras de Escalonamento

A IA escala automaticamente para humano quando:
- O usuário solicita explicitamente falar com humano
- O problema envolve reembolso/estorno
- Problema persiste após 2 tentativas de diagnóstico automático
- Incidente global detectado pelo Sentinela afeta o usuário

---

## Banco de Dados

### `support_conversations`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | INTEGER | Chave primária |
| `user_id` | INTEGER | FK → users |
| `status` | TEXT | `OPEN`, `AI_HANDLING`, `WAITING_USER`, `WAITING_ADMIN`, `ADMIN_HANDLING`, `RESOLVED`, `CLOSED` |
| `priority` | TEXT | `P1`, `P2`, `P3`, `P4` |
| `mode` | TEXT | `AI`, `HUMAN` |
| `subject` | TEXT | Assunto do chamado |
| `assigned_admin_id` | INTEGER | Dev responsável |
| `last_message_at` | TEXT | Timestamp da última mensagem |

### `support_messages`

| Campo | Tipo | Descrição |
|-------|------|-----------|
| `id` | INTEGER | Chave primária |
| `conversation_id` | INTEGER | FK → support_conversations |
| `sender_type` | TEXT | `USER`, `AI`, `ADMIN`, `SYSTEM` |
| `message` | TEXT | Conteúdo da mensagem |
| `metadata` | TEXT | JSON com cards ricos, diagnósticos |
| `read_at` | TEXT | Timestamp de leitura |
