# Especificação Arquitetural para Integração Roku — VSAIPTV

## 1. Por que o Roku exige tratamento especial?
Os dispositivos **Roku** utilizam um sistema operacional fechado e proprietário (**Roku OS**) que **não possui motor de renderização HTML5/DOM padrão (Blink/WebKit)**. Diferente de TVs Samsung, LG ou Android, os canais (apps) do Roku são desenvolvidos obrigatoriamente na linguagem **BrightScript** utilizando o framework de interface **SceneGraph (RSG - Roku SceneGraph)**.

Por essa razão, tentar forçar a execução de um bundle React/Vite no Roku resultaria em uma aplicação falsa e inoperante.

## 2. Reutilização de Infraestrutura do VSAIPTV
A arquitetura do VSAIPTV foi desenhada para permitir que um futuro cliente nativo do Roku consuma exatamente a mesma infraestrutura de backend já existente:

```
┌────────────────────────────────────────────────────────┐
│               VSAIPTV Backend (Node/Express)          │
│               Porta 5000 / SQLite / JWT                │
└───────────┬────────────────────────────────┬───────────┘
            │                                │
            ▼                                ▼
┌───────────────────────┐        ┌───────────────────────┐
│  Universal Web Client │        │   Roku Native Client  │
│  (React 19 + Vite 8)  │        │ (BrightScript / RSG)  │
│  - PC / Mobile        │        │ - Roku Express        │
│  - Samsung Tizen      │        │ - Roku Premiere       │
│  - LG webOS           │        │ - Roku Streaming Stick│
│  - Android TV         │        │ - Roku TV (AOC, TCL)  │
└───────────────────────┘        └───────────────────────┘
```

### Endpoints Compatíveis para o Cliente Roku:
1. **Autenticação**:
   - `POST /api/auth/client-login` (retorna JWT e dados de expiração).
2. **Catálogo de Canais e VOD**:
   - `GET /api/client/content`
   - `GET /api/client/categories`
3. **Reprodução e Proxy**:
   - `/media/proxy?src=<m3u8_url>` (ou reprodução direta via Video Node do SceneGraph com suporte HLS nativo do Roku).
4. **Progresso / Continuar Assistindo**:
   - `POST /api/client/progress`

## 3. Estrutura Proposta para o Repositório Roku (Futuro)
```
roku-client/
├── manifest
├── source/
│   ├── Main.brs
│   ├── ApiClient.brs
│   └── PlayerController.brs
└── components/
    ├── MainScene.xml
    ├── MainScene.brs
    ├── ChannelGrid.xml
    └── VideoScreen.xml
```
Dessa forma, o projeto Web/Smart TV atual permanece 100% limpo, estável e livre de código incompatível, com o ecossistema preparado para receber o aplicativo Roku dedicado.
