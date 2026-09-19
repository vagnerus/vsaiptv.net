# SUBTITLE-AI-FINAL-REPORT.md

Relatório final — Sistema Autônomo de Legendas IA (VSAIPTV). Branch: `feature/universal-smart-tv`. Nenhum commit/push/deploy realizado.

## 1. Auditoria inicial (FASE 0)

- Stack real: **Express 5 + better-sqlite3 (SQLite WAL)** — o prompt solicitava PostgreSQL; como o projeto usa SQLite e a regra era "não reescrever o projeto", o schema conceitual foi implementado nativamente em SQLite com transações atômicas como lock (equivalente prático a `FOR UPDATE SKIP LOCKED` para uma conexão serializada).
- Sem Redis/BullMQ/RabbitMQ → fila persistente em banco.
- VSAIROUTER (`vsaiRouterClient.js`), SentinelAgent + AgentEventBus reaproveitados.
- Player (`VideoPlayer.jsx`) já suportava `subtitles=[{label,url}]` → integração real sem quebrar o existente.
- **FFmpeg não instalado** nesta máquina Windows: o worker detecta em runtime (`FFMPEG_MISSING`), o resto do sistema continua funcionando; health mostra `MISSING`.
- Estado inicial: lint/tests não configurados no server (`npm test` era echo); build do cliente validado antes e depois.

## 2. Arquivos criados

| Arquivo | Papel |
|---|---|
| `server/src/db/subtitleSchema.js` | Schema: `ai_subtitles`, `subtitle_jobs`, `subtitle_job_segments`, índices/UNIQUE de dedup |
| `server/src/services/subtitles/subtitleAgent.js` | SubtitleScanner + fila + worker + pipeline + retry + stats |
| `server/src/services/subtitles/vttBuilder.js` | Cues, WebVTT/SRT, parse, validação temporal e anti-alucinação (funções puras) |
| `server/src/services/subtitles/ffmpegMedia.js` | FFmpeg seguro (execFile, timeout, sem shell), probe, segmentação, temporários |
| `server/src/services/subtitles/asrProvider.js` | Abstração ASR (whisper-local / external-api), exige timestamps |
| `server/src/services/subtitles/resourceManager.js` | CPU/disco, janela horária, limites diários, backpressure |
| `server/src/routes/subtitles.js` | API cliente + admin (auth JWT + requireRole master) |
| `client/src/components/admin/MasterSubtitlesView.jsx` | Painel "Legendas IA" (dashboard, job atual, fila, ações, health) |
| `tests/subtitles.test.js` | 12 testes unitários/integração |
| `docs/AI-SUBTITLES.md` | Documentação operacional |

## 3. Arquivos alterados

- `server/src/server.js` — monta `/api/subtitles`, graceful shutdown do agente (SIGTERM/SIGINT).
- `server/.env.example` — variáveis de configuração (sem secrets).
- `client/src/views/ClientWebPlayer.jsx` — busca legendas IA, merge no menu "Português (IA)", polling de progresso, aviso não-bloqueante.
- `client/src/views/MasterDashboard.jsx` + `client/src/components/admin/MasterSidebar.jsx` — aba "Legendas IA".

## 4. Fluxo implementado (endpoints → storage → player)

`GET /api/subtitles/content/:id` → legendas READY + job ativo → player adiciona track "Português (IA)" → `GET /api/subtitles/file/:id` serve o VTT com cache HTTP (24h). Scanner background (a cada 10 min) cria jobs priorizados; pedidos de usuário criam/elevam job (priority 10) com dedup atômico.

## 5. ASR escolhido

Provedor configurável: `whisper-local` (ou qualquer endpoint compatível OpenAI em `/v1/audio/transcriptions` com `verbose_json`). O sistema exige segmentos com timestamps e converte offsets relativos em absolutos por segmento (FASE 16). Não baixa modelos automaticamente.

## 6. Segurança

- FFmpeg via `execFile` (nunca shell), timeout obrigatório, kill -9 no estouro.
- Nenhum input do usuário vira path/URL/args — apenas IDs validados contra `streams`/`series_episodes`.
- Rotas autenticadas (JWT); administração restrita a master.
- Rate limit por usuário (6/min, configurável) + dedup por UNIQUE no banco.

## 7. Testes e validação

- `node tests/subtitles.test.js` → **12/12 OK** (timestamps, VTT, validação, anti-alucinação, schema, dedup, lock, módulos).
- `npx vite build` (client) → **OK**.
- Boot do servidor com health 200 → **OK**.
- Tabela de comportamentos: reutilização (FASE 74) e concorrência (FASE 75) cobertos por deduplicação; restart (FASE 76) por checkpoints de segmento; falha da IA (FASE 47/48/77) por `WAITING_TRANSLATION`/retry com backoff preservando checkpoints.

## 8. Limitações conhecidas

1. FFmpeg não instalado localmente — pipelines de extração exigem instalação (deploy Linux/Docker) antes de gerar legendas de verdade.
2. ASR externo deve estar rodando (`ASR_API_URL`); sem ele, jobs ficam em retry — transcrição não se perde.
3. Live TV fora do escopo (marcado como `LiveSubtitleService` futuro).
4. Worker roda no mesmo processo da API (SQLite não suporta múltiplos processos com segurança nesta arquitetura); `SUBTITLE_MAX_CONCURRENT_JOBS=1` + backpressure protegem a API. Docker com worker separado fica como evolução.
5. Painel de edição de legenda no frontend (FASE 53) está disponível via API (`/admin/subtitles/:id/review`); UI dedicada de editor pode ser adicionada depois.
