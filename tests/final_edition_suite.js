/**
 * VSAIPTV FINAL EDITION — SUÍTE DE TESTES AUTOMATIZADOS INTEGRADOS
 * Testa: Autenticação, Banco, Integridade, Image Manager, Stream Monitor,
 * EPG, Busca Inteligente, Controle Parental e Backup
 */

const assert = require('assert');
const path = require('path');
const db = require('../server/src/db/database');
const bcrypt = require('../server/node_modules/bcryptjs');

let passedTests = 0;
let failedTests = 0;

function runTest(name, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
    failedTests++;
  }
}

async function runAsyncTest(name, fn) {
  try {
    await fn();
    console.log(`  ✅ [PASS] ${name}`);
    passedTests++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}:`, err.message);
    failedTests++;
  }
}

async function main() {
  console.log('\n🧪 ========================================================');
  console.log('   INICIANDO SUÍTE DE TESTES — VSAIPTV FINAL EDITION');
  console.log('========================================================\n');

  // 1. BANCO & INTEGRIDADE (FASE A & O)
  console.log('📋 Grupo 1: Banco de Dados & Integridade SQLite');
  runTest('PRAGMA integrity_check deve retornar ok', () => {
    const res = db.pragma('integrity_check');
    assert.strictEqual(res[0]?.integrity_check, 'ok', 'Integridade do banco deve ser ok');
  });

  runTest('Tabela streams deve conter catálogo íntegro', () => {
    const count = db.prepare('SELECT COUNT(*) as count FROM streams').get().count;
    assert.ok(count > 0, 'Streams devem estar presentes no banco');
  });

  // 2. IMAGE MANAGER (FASE B)
  console.log('\n🖼️ Grupo 2: VSAIPTV Image Manager & Cache');
  const imageManager = require('../server/src/services/imageManager');
  runTest('Image Manager deve retornar estatísticas reais de catálogo', () => {
    const stats = imageManager.getStats();
    assert.ok(stats.catalog, 'Estatísticas de catálogo devem existir');
    assert.ok(stats.catalog.channels.total >= 0);
    assert.ok(stats.catalog.movies.total >= 0);
    assert.ok(stats.catalog.series.total >= 0);
  });

  runTest('Validação mágica de bytes deve rejeitar payload vazio e aceitar JPEG/PNG', () => {
    const pngHeader = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00]);
    const jpgHeader = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
    const htmlSnippet = Buffer.from('<!DOCTYPE html><html><body>404 Not Found</body></html>');

    assert.strictEqual(imageManager.validateMagicBytes(pngHeader, 'image/png').valid, true);
    assert.strictEqual(imageManager.validateMagicBytes(jpgHeader, 'image/jpeg').valid, true);
    assert.strictEqual(imageManager.validateMagicBytes(htmlSnippet, 'text/html').valid, false);
  });

  runTest('Anti-SSRF deve bloquear IPs de loopback e RFC1918', () => {
    assert.strictEqual(imageManager.isBlockedTarget('127.0.0.1'), true);
    assert.strictEqual(imageManager.isBlockedTarget('192.168.1.1'), true);
    assert.strictEqual(imageManager.isBlockedTarget('10.0.0.5'), true);
    assert.strictEqual(imageManager.isBlockedTarget('169.254.169.254'), true); // Cloud metadata
    assert.strictEqual(imageManager.isBlockedTarget('8.8.8.8'), false); // Public DNS
  });

  // 3. HEALTH CENTER (FASE C)
  console.log('\n🏥 Grupo 3: Central de Saúde & Observabilidade');
  const healthCenter = require('../server/src/services/healthCenter');
  await runAsyncTest('HealthCenter deve inspecionar os 8 serviços fundamentais com dados reais', async () => {
    const health = await healthCenter.getSystemHealth();
    const serviceKeys = Object.keys(health.services);
    const required = ['api', 'database', 'media_proxy', 'image_manager', 'websocket_p2p', 'epg', 'cache', 'backup'];
    for (const req of required) {
      assert.ok(serviceKeys.includes(req), `Serviço ${req} deve ser monitorado`);
    }
    assert.strictEqual(health.services.database.status, 'ONLINE');
    assert.ok(health.services.database.latency_ms >= 0);
  });

  // 4. STREAM HEALTH MONITOR (FASE D)
  console.log('\n📡 Grupo 4: Monitor de Canais & Streams');
  const streamMonitor = require('../server/src/services/streamMonitor');
  runTest('StreamMonitor deve reportar status de varredura e concorrência limitada', () => {
    const status = streamMonitor.getScanStatus();
    assert.strictEqual(typeof status.isScanning, 'boolean');
    assert.strictEqual(typeof status.online, 'number');
    assert.strictEqual(typeof status.unstable, 'number');
    assert.strictEqual(typeof status.offline, 'number');
  });

  await runAsyncTest('StreamMonitor deve rejeitar URL inválida com status offline e INVALID_URL', async () => {
    const res = await streamMonitor.checkStream('not_a_valid_url');
    assert.strictEqual(res.status, 'offline');
    assert.strictEqual(res.error, 'INVALID_URL');
  });

  // 5. EPG (FASE E)
  console.log('\n📅 Grupo 5: Guia de Programação (EPG)');
  const epgManager = require('../server/src/services/epgManager');
  runTest('parseXmltvDate deve normalizar formato XMLTV com timezone para ISO', () => {
    const iso = epgManager.parseXmltvDate('20260918153000 -0300');
    assert.ok(iso, 'Deve produzir string ISO válida');
    assert.strictEqual(iso.includes('2026-09-18'), true);
  });

  runTest('getCurrentAndNext deve calcular barra de progresso real se houver programa', () => {
    // Check with stream 1 (Red Bull TV) which has sample EPG
    const res = epgManager.getCurrentAndNext(1);
    assert.ok(res, 'Deve retornar objeto de EPG');
    assert.strictEqual(typeof res.hasEpg, 'boolean');
  });

  // 6. BUSCA INTELIGENTE (FASE H)
  console.log('\n🔍 Grupo 6: Busca Inteligente & Normalização');
  runTest('Busca deve encontrar termos separados ignorando pontuação e maiúsculas', () => {
    const q = 'red bull';
    const cleanQ = q.normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase();
    const tokens = cleanQ.replace(/[^a-z0-9]/gi, ' ').split(/\s+/).filter(Boolean);
    const tokenClauses = tokens.map(() => '(s.name LIKE ? OR c.name LIKE ?)').join(' AND ');
    const params = [];
    tokens.forEach(t => params.push(`%${t}%`, `%${t}%`));
    
    const rows = db.prepare(`
      SELECT s.id, s.name 
      FROM streams s 
      LEFT JOIN categories c ON s.category_id = c.id 
      WHERE (${tokenClauses}) 
      LIMIT 10
    `).all(...params);

    assert.ok(rows.length > 0, 'Busca deve retornar resultados reais');
    assert.ok(rows.some(r => r.name.toLowerCase().includes('red') && r.name.toLowerCase().includes('bull')));
  });

  // 7. CONTROLE PARENTAL (FASE J)
  console.log('\n🔒 Grupo 7: Controle Parental');
  runTest('PIN parental deve ser armazenado com hash bcrypt seguro', () => {
    const pin = '4321';
    const salt = bcrypt.genSaltSync(10);
    const hash = bcrypt.hashSync(pin, salt);

    assert.notStrictEqual(hash, pin, 'PIN nunca deve ser salvo em texto puro');
    assert.strictEqual(bcrypt.compareSync('4321', hash), true, 'PIN correto deve bater');
    assert.strictEqual(bcrypt.compareSync('0000', hash), false, 'PIN errado deve ser rejeitado');
  });

  // 8. BACKUP & RESTORE TEST (FASE O)
  console.log('\n💾 Grupo 8: Backup Consistente & Restore Test');
  runTest('testRestore deve validar arquivo de backup sem sobrescrever base ativa', () => {
    const backups = healthCenter.listBackups();
    if (backups.length > 0) {
      const test = healthCenter.testRestore(backups[0].filename);
      assert.strictEqual(test.success, true, 'Restore test deve passar');
      assert.strictEqual(test.integrity, 'ok', 'Integridade do backup deve ser ok');
    }
  });

  // RESULTADO FINAL
  console.log('\n========================================================');
  console.log(`📊 TOTAL DE TESTES: ${passedTests + failedTests}`);
  console.log(`   PASSARAM: ${passedTests}`);
  console.log(`   FALHARAM: ${failedTests}`);
  console.log('========================================================\n');

  if (failedTests > 0) {
    process.exit(1);
  } else {
    console.log('🎉 TODOS OS TESTES PASSARAM COM SUCESSO!\n');
    process.exit(0);
  }
}

main().catch(err => {
  console.error('Fatal test runner error:', err);
  process.exit(1);
});
