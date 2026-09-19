const assert = require('assert');
const db = require('../server/src/db/database');
const bcrypt = require('../server/node_modules/bcryptjs');
const imageManager = require('../server/src/services/imageManager');

console.log('🧪 ========================================================');
console.log('   SUÍTE DE TESTES ESPECÍFICA — MASTER PANEL PROFESSIONAL');
console.log('========================================================\n');

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✅ [PASS] ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ❌ [FAIL] ${name}`);
    console.error(`     Erro: ${err.message}`);
    failed++;
  }
}

async function run() {
  // 1. Password Security
  test('Usuários não devem possuir plain_password persistido no banco', () => {
    const plainUsers = db.prepare("SELECT COUNT(*) as count FROM users WHERE plain_password IS NOT NULL").get().count;
    assert.strictEqual(plainUsers, 0, 'Não deve haver senhas em texto puro salvas no banco');
  });

  test('Todos os usuários devem possuir hash bcrypt válido', () => {
    const users = db.prepare("SELECT id, username, password_hash FROM users").all();
    assert.ok(users.length > 0, 'Deve haver usuários no banco');
    for (const u of users) {
      assert.ok(u.password_hash && u.password_hash.startsWith('$2'), `Usuário ${u.username} deve ter hash bcrypt válido`);
    }
  });

  // 2. Novela Catalog & Image Stats
  test('Estatísticas do Image Manager devem refletir novelas reais e canais reais', () => {
    const stats = imageManager.getStats();
    assert.ok(stats.catalog.channels.total > 10000, 'Total de canais deve ser > 10.000');
    assert.ok(stats.catalog.novelas.total > 50000, 'Total de novelas deve ser > 50.000');
    assert.ok(stats.streamsTotal > 300000, 'Total de streams deve ser > 300.000');
  });

  // 3. Streams Pagination & Novela Filtering
  test('Paginação do catálogo deve retornar contagem real e página limitada sem timeout', () => {
    const countRow = db.prepare("SELECT COUNT(*) as total FROM streams").get();
    assert.ok(countRow.total > 300000, 'Total de streams deve ser superior a 300.000');
    
    const page1 = db.prepare("SELECT id, name, type FROM streams ORDER BY id DESC LIMIT 50 OFFSET 0").all();
    assert.strictEqual(page1.length, 50, 'Página 1 deve conter exatamente 50 itens');
  });

  test('Filtro de novelas deve retornar itens corretamente', () => {
    const novelas = db.prepare("SELECT COUNT(*) as total FROM streams WHERE category_id IN (147, 163, 350, 454, 472, 477, 481, 488) OR LOWER(name) LIKE '%novela%'").get();
    assert.ok(novelas.total > 50000, 'Deve encontrar mais de 50.000 novelas');
  });

  // 4. Magic Bytes Image Validator
  test('Validação Magic Bytes deve aprovar PNG e JPEG reais e rejeitar scripts executáveis', () => {
    const pngBuffer = Buffer.from([0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A, 0x00, 0x00]);
    const resPng = imageManager.validateMagicBytes(pngBuffer);
    assert.strictEqual(resPng.valid, true);
    assert.strictEqual(resPng.ext, 'png');

    const jpegBuffer = Buffer.from([0xFF, 0xD8, 0xFF, 0xE0, 0x00, 0x10]);
    const resJpeg = imageManager.validateMagicBytes(jpegBuffer);
    assert.strictEqual(resJpeg.valid, true);
    assert.strictEqual(resJpeg.ext, 'jpg');

    const phpBuffer = Buffer.from('<?php echo "evil"; ?>');
    const resPhp = imageManager.validateMagicBytes(phpBuffer);
    assert.strictEqual(resPhp.valid, false);
  });

  console.log('\n========================================================');
  console.log(`📊 TOTAL: ${passed + failed} | PASSARAM: ${passed} | FALHARAM: ${failed}`);
  console.log('========================================================\n');

  if (failed > 0) process.exit(1);
}

run();
