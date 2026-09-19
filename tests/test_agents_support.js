const assert = require('assert');
const path = require('path');
require(path.join(__dirname, '../server/node_modules/dotenv')).config({ path: path.join(__dirname, '../server/.env') });

const db = require('../server/src/db/database');
const eventBus = require('../server/src/services/agentEventBus');
const actionEngine = require('../server/src/services/actionEngine');
const sentinel = require('../server/src/services/sentinelAgent');
const security = require('../server/src/services/securityAgent');
const support = require('../server/src/services/supportAgent');

async function runTests() {
  console.log('====================================================');
  console.log('🧪 Iniciando Verificação de Agentes & Suporte VSAIPTV');
  console.log('====================================================');

  // Test 1: EventBus Sanitization & Publishing
  console.log('\n[1/6] Testando AgentEventBus & Sanitização...');
  const evt = eventBus.publish({
    type: 'PLAYER_STALLED',
    severity: 'warn',
    source: 'client_player',
    userId: 1,
    streamId: 999,
    context: {
      password: 'super_secret_password',
      token: 'jwt.token.here',
      safeParam: '1080p'
    }
  });

  assert.strictEqual(evt.sanitizedContext.password, '[REDACTED]', 'Senha deve ser ocultada');
  assert.strictEqual(evt.sanitizedContext.token, '[REDACTED]', 'Token deve ser ocultado');
  assert.strictEqual(evt.sanitizedContext.safeParam, '1080p', 'Parâmetro seguro deve ser mantido');
  console.log('✅ EventBus normalizou e higienizou dados com sucesso.');

  // Test 2: Global Incident Correlation
  console.log('\n[2/6] Testando Correlação de Incidentes Globais...');
  for (let i = 1; i <= 6; i++) {
    eventBus.publish({
      type: 'STREAM_TIMEOUT',
      severity: 'error',
      source: 'client_player',
      userId: 100 + i,
      sessionId: `sess_${i}`,
      streamId: 8888,
      context: { targetHost: 'origin-cdn-test' }
    });
  }

  const incident = db.prepare("SELECT * FROM agent_global_incidents WHERE source = '8888'").get();
  assert(incident, 'Incidente global deve ter sido aberto');
  assert.strictEqual(incident.status, 'ACTIVE', 'Status do incidente deve ser ACTIVE');
  console.log(`✅ Incidente global correlacionado com sucesso: ${incident.incident_code} (afetados: ${incident.affected_count})`);

  // Test 3: ActionEngine & Busca no Catálogo Real
  console.log('\n[3/6] Testando ActionEngine...');
  const searchRes = await actionEngine.executeAction('searchCatalog', { query: 'Tears', limit: 3 }, 'support');
  assert(searchRes.results && searchRes.results.length > 0, 'Busca deve retornar resultados reais');
  console.log(`✅ searchCatalog retornou ${searchRes.results.length} resultado(s) real(is): "${searchRes.results[0].name}"`);

  // Bloqueio de comando destrutivo
  let blocked = false;
  try {
    await actionEngine.executeAction('searchCatalog', { query: 'DROP TABLE users' }, 'support');
  } catch (e) {
    blocked = true;
  }
  assert(blocked, 'Tentativa de SQL injection/destrutivo deve ser bloqueada pelo ActionEngine');
  console.log('✅ Proteção contra comandos destrutivos validada.');

  // Test 4: Sentinel Deterministic Auto-Healing & Circuit Breaker
  console.log('\n[4/6] Testando Sentinela & Circuit Breaker...');
  const testSession = 'test_session_circuit_breaker';
  for (let i = 1; i <= 4; i++) {
    await sentinel.handleOperationalEvent({
      type: 'PLAYER_STALLED',
      sessionId: testSession,
      userId: 1,
      streamId: 999,
      correlationId: `corr_test_${i}`
    });
  }

  const runs = db.prepare("SELECT * FROM agent_runs WHERE agent = 'SentinelAgent' ORDER BY id DESC LIMIT 4").all();
  assert(runs.length >= 4, 'Runs do Sentinela devem estar gravados');
  const lastRun = runs[0];
  assert.strictEqual(lastRun.status, 'escalated', 'Quarta tentativa deve disparar circuit-breaker e escalar');
  console.log('✅ Sentinela executou auto-healing determinístico e ativou circuit-breaker após 3 tentativas.');

  // Test 5: SecurityAgent Defensive Reversible Action
  console.log('\n[5/6] Testando SecurityAgent...');
  const attackerIp = '198.51.100.77';
  for (let i = 1; i <= 9; i++) {
    await security.handleSecurityEvent({
      type: 'LOGIN_FAILED',
      correlationId: `corr_sec_${i}`,
      sanitizedContext: { ip: attackerIp }
    });
  }

  const fwRule = db.prepare("SELECT * FROM firewall_rules WHERE ip_address = ?").get(attackerIp);
  assert(fwRule, 'IP agressor deve ser adicionado ao firewall_rules');
  assert.strictEqual(fwRule.rule_type, 'block', 'Regra de firewall deve ser block');
  console.log(`✅ SecurityAgent aplicou bloqueio defensivo reversível no firewall para o IP ${attackerIp}.`);

  // Test 6: SupportAgent & Modo AI ↔ HUMAN
  console.log('\n[6/6] Testando SupportAgent & Transição AI/HUMAN...');
  const testUser = db.prepare("SELECT id FROM users LIMIT 1").get();
  const userId = testUser ? testUser.id : 7;

  // Cria conversa de teste
  const insConv = db.prepare(`
    INSERT INTO support_conversations (user_id, status, priority, mode, subject)
    VALUES (?, 'AI_HANDLING', 'P3', 'AI', 'Teste Automatizado')
  `).run(userId);
  const convId = insConv.lastInsertRowid;

  // Envia mensagem
  const aiReply = await support.processUserMessage({
    conversationId: convId,
    userId,
    userMessage: 'Tem filme de ação?'
  });

  assert(aiReply.message, 'Deve haver resposta gerada');
  console.log(`✅ SupportAgent respondeu com sucesso: "${aiReply.message.slice(0, 60)}..."`);

  // Escalar para HUMAN
  db.prepare("UPDATE support_conversations SET mode = 'HUMAN', status = 'WAITING_ADMIN' WHERE id = ?").run(convId);
  const humanReply = await support.processUserMessage({
    conversationId: convId,
    userId: 1,
    userMessage: 'Estou aguardando o suporte'
  });
  assert.strictEqual(humanReply.handledBy, 'HUMAN', 'IA não deve responder enquanto em modo HUMAN');
  console.log('✅ Modo HUMAN respeitado: IA pausou imediatamente na conversa.');

  // Teste de sugestão do Copiloto Dev
  const suggestion = await support.suggestDevReply({ conversationId: convId });
  assert(suggestion.suggestedReply, 'Copiloto deve sugerir resposta');
  console.log(`✅ Copiloto Dev gerou sugestão: "${suggestion.suggestedReply.slice(0, 60)}..."`);

  console.log('\n====================================================');
  console.log('🎉 TODOS OS TESTES PASSARAM COM 100% DE SUCESSO!');
  console.log('====================================================');
}

runTests().catch(err => {
  console.error('\n❌ Falha no teste:', err);
  process.exit(1);
});
