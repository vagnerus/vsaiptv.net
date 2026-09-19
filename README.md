# 🚀 Nexus IPTV & P2P Multi-Nível + Aplicativo Android Nativo (APK)

Sistema completo de distribuição e gerenciamento de IPTV/OTT e P2P com arquitetura multi-nível (**Administrador Master**, **Revendedor** e **Cliente Final**), acompanhado de um **Aplicativo Android Nativo (APK)** moderno desenvolvido com **AndroidX Media3 (ExoPlayer HLS)**, compatível tanto com **Smart TVs / Android TV / TV Box (Controle Remoto / D-Pad)** quanto com **Smartphones e Tablets (Touchscreen)**.

O sistema destina-se exclusivamente à distribuição de conteúdo legal, próprio ou licenciado.

## Expansão do catálogo para 30 mil — 17/09/2026

O banco local foi ampliado de 15.759 para **30.000 registros publicados**:
5.900 canais, 14.000 filmes e 10.100 séries, com 181.422 episódios contabilizados separadamente.
Foram adicionados 14.241 títulos/canais e 25.446 episódios das playlists locais.
As fontes remotas não foram necessárias nesta execução.

**Importante:** o status `online` significa publicação no catálogo, não reprodução comprovada.
Na amostra aleatória de 21 itens, 7 filmes e 7 episódios responderam com HTTP 206 e `video/mp4`;
os 7 canais falharam (401, 404 ou HTML). Não houve teste de decodificação ou reprodução completa,
nem validação de todos os links. Canais com erro continuam publicados; sua correção permanece pendente.
Não foram inseridos vídeos substitutos de demonstração. Séries novas têm limite padrão de 30 episódios,
portanto a importação não garante temporadas completas. Não houve teste visual no Android/Smart TV.

### Comandos (PowerShell)

```powershell
# Simulação somente leitura
$env:DRY_RUN='1'
node 'c:\Users\Vagner\Desktop\IPTV\expand_catalog_30000.js'
Remove-Item Env:\DRY_RUN

# Importação aditiva, com backup SQLite consistente e deduplicação
node 'c:\Users\Vagner\Desktop\IPTV\expand_catalog_30000.js'

# Integração em cópia temporária: banco, API cliente, Xtream, M3U e idempotência
node 'c:\Users\Vagner\Desktop\IPTV\test_catalog_30000.js'

# Diagnóstico externo por amostragem; salva relatório sem URLs/credenciais
node 'c:\Users\Vagner\Desktop\IPTV\test_catalog_media_sample.js'
```

`DB_PATH` seleciona outro banco existente para importação; `TEST_SOURCE_DB` seleciona a origem
que a suíte copia, permitindo repetir a importação desde um backup anterior.
Backup desta execução:
`c:\Users\Vagner\Desktop\IPTV\server\data\iptv.db.before_catalog_30000.1789653855461`.
Relatório de amostragem: `c:\Users\Vagner\Desktop\IPTV\catalog_media_sample.json`.
O teste de integração não inicia o scheduler nem altera usuários/sessões do banco principal.
Gzip não foi implementado nesta etapa. Use apenas fontes cuja distribuição esteja autorizada.


---

## 📱 1. Aplicativo Android (APK Pronto para Instalação)

O APK já foi compilado e está pronto para instalação no Android:

- 📦 **Arquivo APK Gerado:** [`NexusIPTV-v1.0.apk`](file:///c:/Users/Vagner/Desktop/IPTV/NexusIPTV-v1.0.apk) (9.6 MB)
- 📂 **Código-fonte Android:** [`android_app/`](file:///c:/Users/Vagner/Desktop/IPTV/android_app/)
- 🎯 **Compatibilidade:** Android 5.0 (Lollipop) até Android 14.0+ (API 34)
- 📺 **Modo TV:** Suporte nativo a navegação por controle remoto (D-Pad / setas direcionais, Enter para Play/Pause, Voltar e avanço/retrocesso de 10s).

### 🖥️ Telas e Recursos do App Android:
1. **Tela de Login:**
   - Campo para URL/DNS do Servidor (ex: `http://10.0.2.2:5000` ou IP de rede).
   - Usuário e Senha com validação de assinatura e limites.
   - Botão **"Entrar como Demonstração"** para testes imediatos sem digitar credenciais.
   - Salvamento seguro da sessão em cache local.
2. **Tela Inicial (Home):**
   - Saudação personalizada e status da conta.
   - Data de validade e badge de telas simultâneas ativas vs permitidas.
   - Cards grandes e modernos para **TV Ao Vivo**, **Filmes (VOD)**, **Séries** e **Favoritos**.
   - Carrossel de canais em destaque com início rápido.
3. **Canais Ao Vivo:**
   - Categorias organizadas e extraídas do repositório `Iptv-Brasil-2026`:
     - *Canais Abertos* (Globo, SBT, Record, Band, AgroMais, TV Cultura...)
     - *Notícias & Jornalismo* (CNN Brasil, BandNews, Jovem Pan News, Record News, Euronews...)
     - *Filmes e Séries* (Telecine Premium, Pipoca, Action, Cult, HBO, AMC...)
     - *Esportes & PPV* (SporTV 1/2/3, ESPN, Premiere, Red Bull TV...)
     - *Documentários & Ciência* (NASA TV, Animal Planet, Discovery, History...)
     - *Infantis & Animação* (Cartoon Network, Disney Channel, Gloob...)
     - *Variedades & Entretenimento* (A&E, Multishow, GNT...)
     - *Religiosos* (TV Aparecida, Canção Nova...)
   - Exibição de programa atual (No Ar) e próximo programa (EPG).
   - Estrela de favoritos com 1 clique.
4. **Filmes (VOD):**
   - Catálogo com posters em alta resolução, ano de lançamento, classificação e sinopse.
5. **Séries:**
   - Catálogo com episódios, temporadas e reprodução sequencial.
6. **Player de Vídeo Integrado:**
   - Motor **AndroidX Media3 (ExoPlayer)** com suporte nativo a manifestos HLS (`.m3u8`) e arquivos MP4.
   - Controles de reprodução: Play/Pause, avançar 10s, retroceder 10s.
   - Reconexão automática em caso de oscilação de rede.
   - Indicador de P2P Mesh ativo.
7. **Busca Global:**
   - Filtro unificado em tempo real entre canais, filmes e séries.
8. **Favoritos:**
   - Lista dedicada com os canais e conteúdos marcados pelo usuário.
9. **Perfil da Conta:**
   - Dados do assinante, plano ativo, status, data de expiração, revendedor responsável e botão de Logout.
10. **Configurações & Controle Parental:**
    - Definição de código PIN numérico de 4 dígitos para bloqueio de categorias.
    - Botão de limpeza de cache local.
    - Aviso e termos de uso legal.

---

## ⚙️ 2. Servidor Backend & Painel Administrativo

O backend foi desenvolvido em **Node.js + Express** com persistência em **SQLite (WAL Mode)** e suporte completo à API **Xtream Codes** e **M3U Plus**.

- 📡 **Porta padrão:** `5000`
- 🌐 **Painel Web (Vite + React):** Integrado e servido diretamente pelo backend em `http://localhost:5000` ou rodando em modo dev na porta `3000`.

### Níveis de Acesso:
1. **👑 Administrador Master (`vagner`):**
   - Monitoramento em tempo real: Conexões simultâneas, consumo de banda (Mbps), porcentagem de economia P2P Mesh, CPU e RAM.
   - Gestão de Revendedores: Criar revenda, adicionar/debitar créditos com histórico de auditoria, suspender e excluir.
   - Catálogo & Importador: Criar canais, filmes e séries, e **Importar Playlists M3U em Lote** via texto.
   - Gestão Global de Clientes: Visualizar todos os clientes de todas as revendas e **Transferir Clientes** entre revendedores.
   - Firewall & Segurança: Tabela de bloqueio de IPs suspeitos ou com conexões abusivas.
   - Relatórios Financeiros e Logs de Auditoria.
2. **💼 Revendedor Oficial (`revenda1` / `revenda123`):**
   - Painel isolado (só enxerga seus próprios clientes).
   - Carteira de créditos com alerta visual de saldo baixo.
   - **Gerador de Testes Rápidos (2h, 4h, 6h)**: Cria teste instantâneo e gera mensagem pré-formatada pronta para envio no WhatsApp com 1 clique.
   - Ativação de novos clientes (1 crédito por mês).
   - Renovação de planos (+1, +3, +6 meses), suspensão e exclusão.
   - Monitor de telas ativas dos seus clientes com botão de desconectar.
3. **📺 Cliente Final (WebTV Player) (`joaosilva` / `cliente123`):**
   - Interface OTT moderna estilo Netflix / Smarters.
   - Reprodução HLS com widget de telemetria P2P Mesh (pares conectados e taxa de economia de tráfego).
   - EPG ao vivo e detalhes da assinatura.

---

## 📡 3. Endpoints Compatíveis com Xtream Codes & Aplicativos Externos

Qualquer aplicativo de IPTV do mercado (IPTV Smarters Pro, TiviMate, XCIPTV, OTT Navigator, VLC) pode se conectar diretamente ao servidor:

| Tipo | URL / Endpoint |
|---|---|
| **Xtream Codes API** | `http://localhost:5000/player_api.php?username=...&password=...` |
| **Lista M3U Plus** | `http://localhost:5000/get.php?username=...&password=...&type=m3u_plus&output=ts` |
| **Guia EPG XMLTV** | `http://localhost:5000/xmltv.php` |
| **Stream Ao Vivo** | `http://localhost:5000/live/:username/:password/:streamId.m3u8` |
| **Filme VOD** | `http://localhost:5000/movie/:username/:password/:streamId.mp4` |
| **Série VOD (Episódio)**| `http://localhost:5000/series/:username/:password/:episodeId.mp4` |

---

## 🎬 4. Player de Vídeo e Experiência Web/PWA (VSAIPTV)

O aplicativo web/PWA conta com um componente dedicado de reprodução em [`client/src/components/VideoPlayer.jsx`](file:///c:/Users/Vagner/Desktop/IPTV/client/src/components/VideoPlayer.jsx):

- **Reprodução HLS & MP4:** Suporte integrado a HLS (`.m3u8`) via `hls.js` e suporte nativo em Safari/iOS/Android WebView.
- **Tratamento de Autoplay Moderno:** Detecção de bloqueio de áudio/vídeo pelo navegador com overlay interativo "Clique para Iniciar".
- **Ao Vivo vs VOD:** Indicador pulsante "AO VIVO" sem linha de tempo para canais ao vivo; barra de progresso interativa com tempo decorrido e duração total para filmes e episódios.
- **Controles Completos:** Play/Pause, Volume com slider, Mudo/Desmutar, Alternância de Qualidade e Tela Cheia.
- **Limpeza de Recursos:** Destruição automática e segura da instância do `Hls` ao trocar de stream ou fechar o player.
- **Fluxo de Séries:** Ao clicar em uma série, abre-se a gaveta com lista de episódios; o player só inicia ao clicar em um episódio específico.
- **Responsividade Mobile:** Em smartphones (< 768px), o layout empilha o player no topo em proporção 16:9 e exibe o catálogo em rolagem fluida abaixo, com chips horizontais para categorias e abas, sem sobreposições.
- **PWA & Service Worker:** O Service Worker ([`client/public/sw.js`](file:///c:/Users/Vagner/Desktop/IPTV/client/public/sw.js)) ignora tráfego de streaming (`.m3u8`, `.ts`, `.mp4`, `/live/`, `/movie/`, `/series/`), garantindo que os vídeos nunca fiquem travados em cache.

---

## 🛠️ 5. Como Executar e Compilar o Projeto

### Frontend (React / Vite)
```bash
cd client
npm install
npm run build
```
Para rodar em desenvolvimento:
```bash
npm run dev
```

### Backend (Node.js / Express)
```bash
cd server
npm install
npm start
```

### Compilar o Aplicativo Android (APK)
```powershell
cd android_app
$env:JAVA_HOME = "C:\Program Files\Microsoft\jdk-17.0.20.101-hotspot"
$env:ANDROID_HOME = "C:\Users\Vagner\AppData\Local\Android\Sdk"
.\gradlew.bat assembleDebug
```
O APK final é gerado em `android_app/app/build/outputs/apk/debug/app-debug.apk` e copiado para [`VSAIPTV-v1.0.apk`](file:///c:/Users/Vagner/Desktop/IPTV/VSAIPTV-v1.0.apk).

---

## 🔒 6. Segurança e Conformidade
- Campos de login limpos por padrão (sem credenciais salvas no frontend).
- Botões de acesso rápido / demo restritos ao ambiente de desenvolvimento (`VITE_ENABLE_DEMO_LOGIN=true`).
- Streams servidos apenas mediante autorização por sessão ou credenciais válidas.

| **P2P WebSocket Tracker** | `ws://localhost:5000/tracker` |

# vsaiptv.net
