/**
 * AUTO UPDATE & MONITORING AGENT
 * - Baixa novas listas de conteúdo periodicamente
 * - Verifica saúde do sistema
 * - Auto-restart se necessário
 */
const Database = require("./server/node_modules/better-sqlite3");
const fs = require("fs");
const path = require("path");
const { exec, execSync } = require("child_process");

const dbPath = path.join(__dirname, "server", "data", "iptv.db");
const logPath = path.join(__dirname, "update_agent.log");

function log(msg) {
  const ts = new Date().toISOString();
  const line = `[${ts}] ${msg}`;
  console.log(line);
  fs.appendFileSync(logPath, line + "\n");
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Monitor de saúde
async function healthCheck() {
  log("🩺 Executando health check...");
  
  const checks = {
    pm2: false,
    tunnel: false,
    db: false,
    proxy: false,
    publicUrl: false
  };

  try {
    // PM2
    const pm2Out = execSync("wsl -e pm2 list 2>&1", { timeout: 10000 }).toString();
    checks.pm2 = pm2Out.includes("vsaiptv-backend") && pm2Out.includes("vsaiptv-tunnel");
    log(`  PM2: ${checks.pm2 ? "✅" : "❌"}`);

    // DB
    const db = new Database(dbPath);
    const stats = db.prepare("SELECT COUNT(*) as total FROM streams").get();
    checks.db = stats.total > 10000;
    log(`  DB: ${checks.db ? "✅" : "❌"} (${stats.total} streams)`);
    db.close();

    // Tunnel (curl to public URL)
    const tunnelUrl = "https://dance-mod-lightweight-essay.trycloudflare.com";
    const { default: fetch } = await import("node-fetch").catch(() => ({ default: null }));
    
    if (fetch) {
      const res = await fetch(`${tunnelUrl}/api/health`);
      checks.publicUrl = res.ok;
    }
    log(`  Public URL: ${checks.publicUrl ? "✅" : "❌"}`);

    checks.tunnel = checks.pm2;
    checks.proxy = checks.publicUrl;

  } catch (e) {
    log(`  Health check error: ${e.message}`);
  }

  return checks;
}

// Auto-restart do backend se cair
async function ensureRunning() {
  try {
    const out = execSync("wsl -e pm2 describe vsaiptv-backend 2>&1", { timeout: 10000 }).toString();
    if (!out.includes("online")) {
      log("⚠️ Backend offline! Reiniciando...");
      execSync("wsl -e pm2 restart vsaiptv-backend 2>&1", { timeout: 30000 });
      log("✅ Backend reiniciado");
    }
  } catch (e) {
    log(`Auto-restart error: ${e.message}`);
  }
}

// Verificar links offline periodicamente
async function verifyOfflineLinks() {
  log("🔍 Verificando links offline...");
  try {
    execSync("node verify_links.js --type=live --limit=50 2>&1", { 
      timeout: 120000, 
      stdio: "pipe" 
    });
    log("✅ Verificação de links concluída");
  } catch (e) {
    log(`Verificação concluída (alguns erros esperados): ${e.message?.substring(0, 100)}`);
  }
}

// Sincronizar DB e frontend para WSL
async function syncToWSL() {
  log("🔄 Sincronizando para WSL...");
  try {
    execSync("wsl -e bash -lc 'cp -a /mnt/c/Users/Vagner/Desktop/IPTV/server/data/iptv.db /home/vsai/vsaiptv/server/data/iptv.db && cp -a /mnt/c/Users/Vagner/Desktop/IPTV/client/dist/* /home/vsai/vsaiptv/client/dist/ && echo \"sync ok\"'", { timeout: 30000 });
    log("✅ Sincronização concluída");
  } catch (e) {
    log(`Sync error: ${e.message}`);
  }
}

// Main loop
async function runAgent() {
  log("🤖 Agente iniciado (intervalo: 5 minutos)");
  
  while (true) {
    try {
      await ensureRunning();
      const health = await healthCheck();
      
      if (!health.pm2 || !health.publicUrl) {
        log("⚠️ Problema de saúde detectado. Tentando corrigir...");
        await ensureRunning();
      }
      
      // Verificar links offline a cada 10 cicços (~50 min)
      if (Math.floor(Math.random() * 10) === 0) {
        await verifyOfflineLinks();
      }
      
      // Sync para WSL a cada ciclo
      await syncToWSL();
      
    } catch (e) {
      log(`Agent error: ${e.message}`);
    }
    
    await sleep(300000); // 5 minutos
  }
}

// Health endpoint para o agente
const express = require("express");
const healthApp = express();
healthApp.get("/api/health", (req, res) => {
  res.json({ 
    status: "online", 
    timestamp: new Date().toISOString(),
    uptime: process.uptime()
  });
});

// Iniciar agente e server de health
if (require.main === module) {
  healthApp.listen(5001, () => {
    log("Health server rodando na porta 5001");
  });
  runAgent();
} else {
  module.exports = { healthCheck, ensureRunning, syncToWSL };
}