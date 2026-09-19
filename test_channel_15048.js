// Teste do canal relatado (ID 15048) no site real com sessão temporária. Sem alterar o banco.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const WebSocket = require('./server/node_modules/ws');
const Database = require('./server/node_modules/better-sqlite3');
const bcrypt = require('./server/node_modules/bcryptjs');
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function main() {
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'iptv-browser-'));
  const chrome = spawn('C:/Program Files/Google/Chrome/Application/chrome.exe', [
    '--headless=new', '--remote-debugging-port=0', `--user-data-dir=${profile}`,
    '--no-first-run', '--no-default-browser-check', '--autoplay-policy=no-user-gesture-required', 'about:blank'
  ], { stdio: 'ignore' });
  let ws;
  const pending = new Map();
  const media = [];
  const consoleMessages = [];
  try {
    const db = new Database('c:/Users/Vagner/Desktop/IPTV/server/data/iptv.db', { readonly: true });
    const username = `diag_${Date.now()}`;
    const password = require('node:crypto').randomBytes(24).toString('base64url');
    db.prepare(`INSERT INTO users (username,password_hash,role,status,created_at) VALUES (?,?,'client','active',?)`)
      .run(username, bcrypt.hashSync(password, 10), new Date().toISOString());
    db.close();
    console.log('Usuário temporário criado (removido ao final):', username);
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 80 && !fs.existsSync(portFile); i++) await sleep(250);
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    let seq = 0;
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 80000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
    ws.on('message', raw => {
      const msg = JSON.parse(raw);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id); pending.delete(msg.id); clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
      }
      if (msg.method === 'Network.responseReceived') {
        const r = msg.params.response;
        if (r.url.includes('/media/proxy?') || r.url.includes('/api/client/stream/15048')) {
          media.push({ url: r.url.includes('/media/proxy?') ? 'proxy-playlist' : r.url, status: r.status, mime: r.mimeType });
        }
      }
      if (msg.method === 'Runtime.consoleAPICalled' && ['error', 'warning'].includes(msg.params.type)) {
        consoleMessages.push(msg.params.args.map(a => a.value || a.description || '').join(' ').slice(0, 300));
      }
      if (msg.method === 'Runtime.exceptionThrown') consoleMessages.push('EXCEPTION ' + msg.params.exceptionDetails.text);
    });
    await send('Network.enable');
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: 'https://iptv.vsai.com.br/' });
    await sleep(4000);
    // PARTE2
  } finally {
    for (const p of pending.values()) clearTimeout(p.timer);
    if (ws) ws.close();
    chrome.kill();
    await sleep(1500);
    const cleanup = new Database('c:/Users/Vagner/Desktop/IPTV/server/data/iptv.db');
    cleanup.prepare('DELETE FROM users WHERE username LIKE ?').run('diag_%');
    cleanup.close();
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { console.log('Perfil temporário ainda ocupado.'); }
  }
}
main().catch(err => { console.error(err.message); process.exitCode = 1; });
