# Guia de Arquitetura & Desenvolvimento Smart TV — VSAIPTV

## 1. Visão Geral
O **VSAIPTV Universal Smart TV** foi concebido para unificar a reprodução de IPTV e catálogo de mídia sob uma arquitetura resiliente e adaptativa que atende:
- Navegadores Desktop & Notebook (Chrome, Edge, Firefox, Safari)
- Dispositivos Móveis (Android, iOS)
- Smart TVs Nativas e Embarcadas (Samsung Tizen, LG webOS, Android TV, Google TV, VIDAA, TV Box, Browsers de Smart TV Genéricos).

## 2. Princípios Centrais
1. **Nunca bloquear por marca**: A identificação de modelo ou fabricante é apenas um sinal auxiliar; a decisão de renderização e reprodução é 100% orientada a **detecção de capacidades reais** (MSE, HLS nativo, Pointer vs Remote, memória e performance).
2. **Progressive Enhancement & Graceful Degradation**:
   - Nível A: Fullscreen, PiP, MediaSession, Hls.js com buffer amplo e ABR.
   - Nível B: Sem PiP, Hls.js balanceado.
   - Nível C: Sem WebWorkers, buffer enxuto (15MB) para TVs de baixo custo.
   - Nível D: HLS nativo via `<video>` para browsers antigos ou Safari.
   - Nível E: HTML5 direto para fluxos diretos.
3. **Navegação Espacial sem Dependência de Mouse**: O usuário consegue operar o ecossistema completo exclusivamente através das setas do controle remoto (D-Pad), Enter, Voltar e Teclas de Mídia.

## 3. Estrutura de Diretórios Criada
```
client/src/
├── platform/
│   ├── capabilities.js             # TVCapabilityDetector (Hardware, codecs, MSE, APIs)
│   ├── deviceProfile.js            # DeviceProfile (Perfil consolidado)
│   ├── featureFlags.js             # Centralização de diretivas
│   ├── PlatformManager.js          # Ciclo de vida da plataforma
│   └── adapters/
│       ├── GenericTVAdapter.js     # Universal Smart TV
│       ├── TizenPlatformAdapter.js  # Samsung Tizen
│       ├── WebOSPlatformAdapter.js  # LG webOS
│       ├── AndroidTVAdapter.js     # Android TV / Google TV / Fire TV
│       └── VidaaAdapter.js         # Hisense / Toshiba VIDAA
├── player/
│   ├── PlayerEngine.js             # Contrato comum de engine
│   ├── PlayerEngineFactory.js      # Seleção e fallback automático
│   ├── PlaybackWatchdog.js         # Watchdog anti-stall e circuit breaker
│   └── engines/
│       ├── HlsJsEngine.js          # Hls.js ajustado para baixa memória
│       ├── NativeHlsEngine.js      # HLS nativo via tag <video>
│       ├── Html5Engine.js          # MP4 / fluxos diretos
│       └── TizenAVPlayEngine.js    # Samsung AVPlay nativo
├── navigation/
│   └── SpatialNavigationManager.js # Motor euclidiano de foco 2D e pilha de histórico
├── tv/
│   ├── TVModeContext.jsx           # Provedor React de modo TV
│   ├── TVOverlayDiagnostics.jsx    # HUD OSD de diagnóstico (VSAIPTV DEVICE INFO)
│   ├── TVLoginModal.jsx            # Autenticação por Pareamento / QR Code
│   └── tv.css                      # Safe area (4%), foco de alto contraste e layout TV
└── components/
    └── VirtualGrid.jsx             # Grade virtualizada para economia extrema de RAM
```

## 4. Teclas e Controles Mapeados
| Tecla / Evento | Função na Interface | Função no Player |
| :--- | :--- | :--- |
| **D-Pad Setas** | Move foco 2D para o elemento visualmente mais próximo | Esquerda/Direita: Seek 10s; Cima/Baixo: Volume / Canais |
| **OK / Enter** | Clica / Seleciona item focado | Play / Pause / Revela OSD |
| **Back / Escape** | Fecha modais, gavetas ou retorna ao menu anterior | Sai do player fullscreen ou fecha reprodução |
| **MediaPlay / MediaPause** | N/A | Play / Pause direto |
| **MediaFastForward / Rewind** | N/A | Avanço / Retrocesso de 15s |
| **ChannelUp / Down** | N/A | Troca canal consecutivo na lista |
| **Info / Tecla 'i' / Tecla Vermelha** | Abre/Fecha painel de Diagnóstico OSD | Revela estatísticas em tempo real (Buffer, FPS, Dropped Frames) |

## 5. Compilação e Geração de Pacotes
Execute na raiz do projeto:
```bash
node scripts/build_tv_packages.js
```
Os arquivos gerados serão salvos em:
- `dist/web/`: Bundle para servidores web convencionais.
- `dist/tv/`: Bundle estático otimizado para Smart TVs.
- `dist/tizen/`: Pacote Samsung Tizen com `config.xml` pronto para assinatura e empacotamento com o Tizen Studio (`tizen package -t wgt`).
- `dist/webos/`: Pacote LG webOS com `appinfo.json` pronto para empacotamento com o webOS CLI (`ares-package`).
