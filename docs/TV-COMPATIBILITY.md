# Matriz de Compatibilidade — VSAIPTV Smart TV

A classificação abaixo reflete o status real de desenvolvimento, simulações automatizadas e disponibilidade de hardware físico para validação.

| Plataforma / Fabricante | Sistema Operacional | Engine Principal | Status | Observações |
| :--- | :--- | :--- | :--- | :--- |
| **PC / Desktop / Notebook** | Windows / Linux / macOS | Hls.js / HTML5 | **CONFIRMADO** | Suporte total com mouse, teclado, atalhos e PiP. |
| **Mobile / Tablets** | Android / iOS | Hls.js / Native HLS | **CONFIRMADO** | Gestos de toque, rotação de tela, fullscreen adaptativo. |
| **Smart TV Genérica (Navegador)** | Chromium / WebKit TV | Hls.js / Native HLS | **CONFIRMADO (SIMULADO)** | D-Pad 2D, interface escalada para 3 metros e safe area. |
| **Samsung Smart TV** | Tizen OS (>= 3.0) | Hls.js / AVPlay | **IMPLEMENTADO / AGUARDANDO TESTE REAL** | Pacote `dist/tizen/config.xml` pronto; suporte a AVPlay quando disponível. |
| **LG Smart TV** | webOS (>= 3.0) | Hls.js / Native HLS | **IMPLEMENTADO / AGUARDANDO TESTE REAL** | Pacote `dist/webos/appinfo.json` pronto; Magic Remote e back key mapeados. |
| **Android TV / Google TV** | Android 9+ / Android TV | Hls.js | **IMPLEMENTADO / AGUARDANDO TESTE REAL** | Navegação por D-Pad e keycodes Android testados na suíte. |
| **Fire TV (Amazon)** | Fire OS (Android fork) | Hls.js | **IMPLEMENTADO / AGUARDANDO TESTE REAL** | Opera via navegador Silk ou WebView nativo com D-Pad. |
| **VIDAA (Hisense / Toshiba)** | VIDAA OS | Hls.js / HTML5 | **IMPLEMENTADO / AGUARDANDO TESTE REAL** | Adapter com tratamento para tecla Back e restrição de memória. |
| **Philips / TCL / Sony** | Android TV / Google TV | Hls.js | **IMPLEMENTADO / AGUARDANDO TESTE REAL** | Mapeamento D-Pad idêntico ao Android TV. |
| **Roku** | Roku OS (BrightScript) | N/A | **REQUER CLIENTE ESPECÍFICO** | Requer aplicação nativa em BrightScript/SceneGraph. Documentado em `docs/ROKU-ARCHITECTURE.md`. |
| **Apple TV (tvOS)** | tvOS | Native HLS | **FALLBACK WEB / PWA** | Acesso via navegador AirPlay ou browser empacotado. |

## Legenda dos Status
- **CONFIRMADO**: Testado diretamente no ambiente com resultados operacionais garantidos.
- **IMPLEMENTADO / AGUARDANDO TESTE REAL**: Código completo, lógica de adapters, chaves de controle e pacotes prontos; aguarda validação em televisão física específica.
- **FALLBACK WEB**: Funciona por meio do navegador embarcado do sistema com capacidades padrão.
- **REQUER CLIENTE ESPECÍFICO**: O sistema operacional do dispositivo não executa aplicações web padrão e exige código nativo proprietário.
