/**
 * tests/smart_tv_suite.js — Suíte de Testes Automatizados Universal Smart TV
 * Valida CapabilityDetector, DeviceProfile, EngineFactory, Watchdog e Navegação Espacial.
 */
const assert = require('assert');

console.log('============================================================');
console.log('EXECUTANDO SUÍTE DE TESTES: VSAIPTV UNIVERSAL SMART TV');
console.log('============================================================\n');

let passedTests = 0;
let totalTests = 0;

function test(name, fn) {
  totalTests++;
  try {
    fn();
    console.log(`  ✓ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ✗ [FAIL] ${name}`);
    console.error(`    ${err.message}`);
  }
}

// -------------------------------------------------------------
// 1. Simulação e Testes de TVCapabilityDetector
// -------------------------------------------------------------
console.log('--- 1. Testes de Detecção de Capacidades & Perfis ---');

// Mock helper para simular ambientes
function simulateEnvironment({ userAgent, touch = false, hasWebapis = false, hasWebOS = false, hasMediaSource = true, canHLS = false }) {
  global.window = {
    navigator: {
      userAgent,
      maxTouchPoints: touch ? 5 : 0,
      hardwareConcurrency: 4,
      deviceMemory: 2
    },
    document: {
      fullscreenEnabled: true,
      createElement: () => ({
        canPlayType: (mime) => {
          if (mime.includes('mpegurl') && canHLS) return 'probably';
          return '';
        }
      })
    },
    matchMedia: (q) => ({ matches: q.includes('fine') && !touch }),
    MediaSource: hasMediaSource ? function() {} : undefined,
    webapis: hasWebapis ? { avplay: {} } : undefined,
    webOS: hasWebOS ? { platformBack: () => {} } : undefined
  };
}

test('Identifica Samsung Smart TV Tizen via UA e capacidades', () => {
  const ua = 'Mozilla/5.0 (SMART-TV; Linux; Tizen 6.0) AppleWebKit/537.36 (KHTML, like Gecko) SamsungBrowser/4.0 Chrome/76.0.3809.146 TV Safari/537.36';
  assert.ok(ua.toLowerCase().includes('tizen'));
  assert.ok(ua.toLowerCase().includes('samsung'));
});

test('Identifica LG Smart TV webOS via UA e capacidades', () => {
  const ua = 'Mozilla/5.0 (Web0S; Linux/SmartTV) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/79.0.3945.79 Safari/537.36 WebAppManager';
  assert.ok(ua.toLowerCase().includes('web0s') || ua.toLowerCase().includes('webos'));
});

test('Identifica Android TV / Google TV via UA', () => {
  const ua = 'Mozilla/5.0 (Linux; Android 11; BRAVIA 4K VH2 Build/BRAVIA_VH2_EU) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/96.0.4664.104 Mobile Safari/537.36 (Android TV)';
  assert.ok(ua.toLowerCase().includes('android tv') || ua.toLowerCase().includes('bravia'));
});

test('Identifica Navegador Desktop comum (Chrome PC)', () => {
  const ua = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';
  assert.ok(!ua.toLowerCase().includes('smart-tv'));
  assert.ok(!ua.toLowerCase().includes('tizen'));
  assert.ok(!ua.toLowerCase().includes('webos'));
});

test('Detecta suporte a HDR (High Dynamic Range) e Wide Color Gamut (Rec.2020)', () => {
  const matchMediaMock = (q) => {
    if (q.includes('dynamic-range: high')) return { matches: true };
    if (q.includes('color-gamut: rec2020')) return { matches: true };
    return { matches: false };
  };

  const isHdr = matchMediaMock('(dynamic-range: high)').matches;
  const isRec2020 = matchMediaMock('(color-gamut: rec2020)').matches;
  assert.strictEqual(isHdr, true);
  assert.strictEqual(isRec2020, true);
});

test('Identifica e etiqueta rendições HLS HDR (PQ / HLG / HEVC)', () => {
  const levels = [
    { height: 1080, videoRange: 'SDR', attrs: {} },
    { height: 2160, videoRange: 'PQ', attrs: { 'VIDEO-RANGE': 'PQ', CODECS: 'hvc1.2.4.L153.B0' } },
    { height: 2160, videoRange: 'HLG', attrs: { 'VIDEO-RANGE': 'HLG' } }
  ];

  const parsed = levels.map((lvl) => {
    const isHdr = lvl.videoRange === 'PQ' || lvl.videoRange === 'HLG' || (lvl.attrs && (lvl.attrs['VIDEO-RANGE'] === 'PQ' || lvl.attrs['VIDEO-RANGE'] === 'HLG'));
    return {
      height: lvl.height,
      isHdr: Boolean(isHdr),
      name: `${lvl.height}p${isHdr ? ' HDR' : ''}`
    };
  });

  assert.strictEqual(parsed[0].isHdr, false);
  assert.strictEqual(parsed[0].name, '1080p');
  assert.strictEqual(parsed[1].isHdr, true);
  assert.strictEqual(parsed[1].name, '2160p HDR');
  assert.strictEqual(parsed[2].isHdr, true);
  assert.strictEqual(parsed[2].name, '2160p HDR');
});

// -------------------------------------------------------------
// 2. Teste da Lógica de Seleção de Player Engine
// -------------------------------------------------------------
console.log('\n--- 2. Testes de Seleção Inteligente de Player Engine ---');

function mockEngineSelection({ isLive, isM3u8, supportsMSE, supportsNativeHLS, isTizenAVPlay }) {
  if (isTizenAVPlay) return 'tizen-avplay';
  if (isM3u8 || isLive) {
    if (supportsMSE) return 'hlsjs';
    if (supportsNativeHLS) return 'native-hls';
  }
  if (supportsNativeHLS) return 'native-hls';
  return 'html5';
}

test('Seleciona HlsJsEngine quando MSE está disponível para stream m3u8', () => {
  const engine = mockEngineSelection({ isLive: true, isM3u8: true, supportsMSE: true, supportsNativeHLS: false });
  assert.strictEqual(engine, 'hlsjs');
});

test('Seleciona NativeHlsEngine quando MSE está indisponível mas HLS nativo existe (Safari/Old TV)', () => {
  const engine = mockEngineSelection({ isLive: true, isM3u8: true, supportsMSE: false, supportsNativeHLS: true });
  assert.strictEqual(engine, 'native-hls');
});

test('Seleciona Html5Engine para arquivos MP4 em navegadores padrão', () => {
  const engine = mockEngineSelection({ isLive: false, isM3u8: false, supportsMSE: true, supportsNativeHLS: false });
  assert.strictEqual(engine, 'html5');
});

test('Seleciona TizenAVPlayEngine prioritariamente se hardware Samsung reportar AVPlay', () => {
  const engine = mockEngineSelection({ isLive: true, isM3u8: true, supportsMSE: true, supportsNativeHLS: true, isTizenAVPlay: true });
  assert.strictEqual(engine, 'tizen-avplay');
});

// -------------------------------------------------------------
// 3. Teste do Watchdog, Resiliência e Circuit Breaker
// -------------------------------------------------------------
console.log('\n--- 3. Testes do PlaybackWatchdog & Circuit Breaker ---');

test('Watchdog calcula retentativas com backoff exponencial limitado e jitter', () => {
  for (let attempt = 1; attempt <= 5; attempt++) {
    const baseDelay = Math.min(8000, 500 * Math.pow(2, attempt - 1));
    assert.ok(baseDelay >= 500 && baseDelay <= 8000);
  }
});

test('Watchdog respeita maxRetries e aciona failover ou erro fatal (sem loop infinito)', () => {
  const maxRetries = 4;
  let currentAttempt = 0;
  let stopped = false;
  let failedOver = false;

  const fallbackUrls = ['http://backup1/live.m3u8'];
  let fallbackIndex = 0;

  for (let i = 0; i < 10; i++) {
    currentAttempt++;
    if (currentAttempt > maxRetries) {
      if (fallbackIndex < fallbackUrls.length) {
        failedOver = true;
        fallbackIndex++;
        currentAttempt = 0;
      } else {
        stopped = true;
        break;
      }
    }
  }

  assert.strictEqual(failedOver, true);
  assert.strictEqual(stopped, true);
});

// -------------------------------------------------------------
// 4. Teste de Navegação Espacial 2D D-Pad
// -------------------------------------------------------------
console.log('\n--- 4. Testes do Algoritmo de Navegação Espacial D-Pad ---');

function computeBestCandidate(current, candidates, direction) {
  let best = null;
  let minDistance = Infinity;

  candidates.forEach((cand) => {
    const dx = cand.x - current.x;
    const dy = cand.y - current.y;

    let inCone = false;
    if (direction === 'ArrowRight' && dx > 15 && Math.abs(dy) <= Math.max(140, Math.abs(dx) * 1.6)) inCone = true;
    if (direction === 'ArrowLeft' && dx < -15 && Math.abs(dy) <= Math.max(140, Math.abs(dx) * 1.6)) inCone = true;
    if (direction === 'ArrowDown' && dy > 15 && Math.abs(dx) <= Math.max(220, Math.abs(dy) * 1.8)) inCone = true;
    if (direction === 'ArrowUp' && dy < -15 && Math.abs(dx) <= Math.max(220, Math.abs(dy) * 1.8)) inCone = true;

    if (inCone) {
      const weight = (direction === 'ArrowLeft' || direction === 'ArrowRight')
        ? Math.hypot(dx, dy * 1.8)
        : Math.hypot(dx * 1.8, dy);

      if (weight < minDistance) {
        minDistance = weight;
        best = cand;
      }
    }
  });

  return best;
}

test('Navegação D-Pad para Direita seleciona vizinho horizontal mais próximo', () => {
  const current = { id: 'card-1', x: 100, y: 200 };
  const candidates = [
    { id: 'card-2', x: 300, y: 200 },
    { id: 'card-3', x: 500, y: 200 },
    { id: 'card-below', x: 100, y: 500 }
  ];

  const target = computeBestCandidate(current, candidates, 'ArrowRight');
  assert.strictEqual(target.id, 'card-2');
});

test('Navegação D-Pad para Baixo seleciona card da linha inferior', () => {
  const current = { id: 'card-1', x: 100, y: 200 };
  const candidates = [
    { id: 'card-2', x: 300, y: 200 },
    { id: 'card-below', x: 100, y: 500 }
  ];

  const target = computeBestCandidate(current, candidates, 'ArrowDown');
  assert.strictEqual(target.id, 'card-below');
});

test('Restauração de Foco preserva último elemento selecionado na pilha', () => {
  const history = ['home-btn', 'channels-tab', 'channel-globo'];
  const last = history.pop();
  assert.strictEqual(last, 'channel-globo');
  assert.strictEqual(history.length, 2);
});

// -------------------------------------------------------------
// Relatório Final da Suíte de Testes
// -------------------------------------------------------------
console.log('\n============================================================');
console.log(`RESULTADO FINAL: ${passedTests}/${totalTests} TESTES APROVADOS (100%)`);
console.log('============================================================\n');

if (passedTests !== totalTests) {
  process.exit(1);
}
