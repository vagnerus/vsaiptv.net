# AI-SUBTITLES — Sistema Autônomo de Legendas (VSAIPTV)

Sistema que gera legendas PT-BR automaticamente (ASR + tradução via VSAIROUTER), processa em background, reutiliza a mesma legenda para todos os usuários e nunca regenera o que já está pronto.

## Arquitetura

```
Catálogo (streams / series_episodes)
        │
  SubtitleScanner  (varre VOD sem legenda pt-BR, em lotes)
        │
  subtitle_jobs (fila persistente em SQLite, dedup por UNIQUE)
        │
  SubtitleWorker (claim atômico = lock exclusivo)
        │
  FFmpeg (ffprobe → duração; ffmpeg → WAV mono 16kHz por segmento)
        │
  ASR Provider (abstração: whisper-local / external-api, exige timestamps)
        │
  VSAIROUTER (tradução em blocos com janela de contexto)
        │
  vttBuilder (gera, normaliza e valida WebVTT/SRT)
        │
  Storage (/data/subtitles/<tipo>/<id>/...) + ai_subtitles (fonte de verdade)
        │
  Player (menu de legendas → "Português (IA)")
```

## Componentes

| Arquivo | Papel |
|---|---|
| `server/src/db/subtitleSchema.js` | Tabelas `ai_subtitles`, `subtitle_jobs`, `subtitle_job_segments` + índices de deduplicação |
| `server/src/services/subtitles/subtitleAgent.js` | Scanner, fila, worker, pipeline, retry/backoff, checkpoints, stats |
| `server/src/services/subtitles/vttBuilder.js` | Funções puras: cues, WebVTT, SRT, parse, validação temporal e anti-alucinação |
| `server/src/services/subtitles/ffmpegMedia.js` | FFmpeg/ffprobe via `execFile` (sem shell), timeout, temporários por job |
| `server/src/services/subtitles/asrProvider.js` | Abstração `transcribe({audioPath, languageHint})` → segments com start/end em ms |
| `server/src/services/subtitles/resourceManager.js` | CPU/RAM/disco, janela horária, limites diários, backpressure |
| `server/src/routes/subtitles.js` | Endpoints cliente + administração (auth JWT; admin exige role master) |

## Garantias principais

1. **Uma legenda, uma geração**: legenda READY é reutilizada; job ativo é deduplicado (`idx_subtitle_jobs_active_identity`); 100 pedidos simultâneos = 1 job.
2. **Checkpoint por segmento**: filmes longos são divididos (padrão 10 min) e cada segmento pronto é persistido — restart continua de onde parou.
3. **Revisão humana é intocável**: `reviewed = 1` nunca é sobrescrito pelo agente (FASE 54).
4. **Validação antes de READY**: header WEBVTT, timestamps válidos, sem sobreposição, dentro da duração, cues mínimos.
5. **VSAIROUTER/ASR offline**: transcrição permanece nos checkpoints; job volta via retry com backoff (30s→2m→10m, máx. configurável).
6. **Player nunca bloqueia**: consulta é opcional; enquanto gera, aparece aviso com progresso (15s de polling enquanto job ativo).
7. **Segurança**: FFmpeg via `execFile` com args separados; nenhum path/URL do usuário é aceito — apenas IDs internos validados no catálogo; rate limit por usuário.

## Endpoints

| Método | Rota | Papel |
|---|---|---|
| GET | `/api/subtitles/content/:contentId?episodeId=` | Legendas READY + job ativo (progresso) |
| GET | `/api/subtitles/file/:subtitleId` | Servir VTT (Cache-Control 24h) |
| POST | `/api/subtitles/request` | Solicitar/elevar prioridade (priority=10, dedup, rate limit) |
| GET | `/api/subtitles/admin/dashboard` | Painel: fila, processando, prontas hoje, falhas, job atual |
| GET | `/api/subtitles/admin/jobs` | Listar fila |
| POST | `/api/subtitles/admin/jobs/:id/action` | `PAUSE` / `RESUME` / `RETRY` / `CANCEL` |
| POST | `/api/subtitles/admin/generate` | Gerar manualmente (priority=20) |
| POST | `/api/subtitles/admin/subtitles/:id/review` | Editor de revisão (nova versão, reviewed=1) |
| GET | `/api/subtitles/admin/health` | FFmpeg, ASR, VSAIROUTER, Storage, agente |

## Configuração (server/.env)

Ver `server/.env.example` (seção "Legendas IA" e "ASR"). Principais:
- `SUBTITLE_AI_ENABLED`, `SUBTITLE_BACKGROUND_ENABLED` — kill switches.
- `SUBTITLE_MAX_CONCURRENT_JOBS`, `SUBTITLE_MAX_QUEUE_SIZE`, `SUBTITLE_SCAN_BATCH_SIZE` — backpressure.
- `ASR_PROVIDER` (`whisper-local` | `external-api` | `none`), `ASR_API_URL`, `ASR_MODEL`.
- `SUBTITLE_BACKGROUND_START_HOUR/END_HOUR` — vazio = 24h.
- `SUBTITLE_DAILY_AUDIO_MINUTES` — teto diário (0 = ilimitado).

## Requisitos de infraestrutura

1. **FFmpeg + ffprobe** instalados e no PATH (ou `FFMPEG_PATH`/`FFPROBE_PATH`). Sem FFmpeg, jobs falham com `FFMPEG_MISSING` e o restante do sistema funciona normalmente (health mostra `MISSING`).
2. **Servidor ASR compatível com OpenAI** `/v1/audio/transcriptions` (ex.: faster-whisper-server em `http://localhost:9000/v1`) retornando `verbose_json` com segmentos.
3. **VSAIROUTER** (já existente no projeto) para tradução quando o idioma detectado ≠ português.

## Live TV

Canais ao vivo **não** entram no pipeline VOD (arquitetura futura: `LiveSubtitleService`). O scanner só processa `streams.type IN ('movie','series')` e episódios.

## Testes

```
node tests/subtitles.test.js
```

Cobre: formatação de timestamps, saneamento temporal, geração/validação de VTT, anti-alucinação na tradução, criação de schema, deduplicação de jobs, lock atômico e carregamento dos módulos.
