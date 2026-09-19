// Teste isolado: Chrome temporário, fonte pública, sem login e sem alterar catálogo.
const { spawn } = require('node:child_process');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const assert = require('node:assert/strict');
const WebSocket = require('./server/node_modules/ws');
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
  const errors = [];
  try {
    const portFile = path.join(profile, 'DevToolsActivePort');
    for (let i = 0; i < 80 && !fs.existsSync(portFile); i++) await sleep(250);
    assert.ok(fs.existsSync(portFile), 'Chrome deve iniciar');
    const port = fs.readFileSync(portFile, 'utf8').split('\n')[0];
    const tabs = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
    ws = new WebSocket(tabs.find(t => t.type === 'page').webSocketDebuggerUrl);
    await new Promise((resolve, reject) => { ws.once('open', resolve); ws.once('error', reject); });
    let seq = 0;
    const send = (method, params = {}) => new Promise((resolve, reject) => {
      const id = ++seq;
      const timer = setTimeout(() => { pending.delete(id); reject(new Error(`Timeout: ${method}`)); }, 70000);
      pending.set(id, { resolve, reject, timer });
      ws.send(JSON.stringify({ id, method, params }));
    });
    ws.on('message', raw => {
      const msg = JSON.parse(raw);
      if (msg.id && pending.has(msg.id)) {
        const p = pending.get(msg.id); pending.delete(msg.id); clearTimeout(p.timer);
        if (msg.error) p.reject(new Error(msg.error.message)); else p.resolve(msg.result);
      }
      if (msg.method === 'Network.responseReceived' && msg.params.response.url.includes('/media/proxy?')) {
        const r = msg.params.response;
        media.push({ status: r.status, mime: r.mimeType, fromServiceWorker: Boolean(r.fromServiceWorker) });
      }
      if (msg.method === 'Runtime.exceptionThrown') errors.push(msg.params.exceptionDetails.text);
    });
    await send('Network.enable');
    await send('Runtime.enable');
    await send('Page.enable');
    await send('Page.navigate', { url: 'https://iptv.vsai.com.br/' });
    await sleep(4000);
    const hlsCode = fs.readFileSync(path.join(__dirname, 'client/node_modules/hls.js/dist/hls.min.js'), 'utf8');
    await send('Runtime.evaluate', { expression: hlsCode });
    const result = await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      if (reg) await reg.update();
      const sw = await (await fetch('/sw.js', {cache:'no-store'})).text();
      const video = document.createElement('video');
      video.muted = true; video.autoplay = true; video.controls = true;
      document.body.appendChild(video);
      const hls = new Hls({enableWorker: false});
      const failures = [];
      hls.on(Hls.Events.ERROR, (_, data) => { if(data.fatal) failures.push({type:data.type,details:data.details,code:data.response?.code}); });
      hls.attachMedia(video);
      hls.loadSource('/media/proxy?src=' + encodeURIComponent('https://rbmn-live.akamaized.net/hls/live/590964/BoRB-AT/master.m3u8'));
      hls.on(Hls.Events.MANIFEST_PARSED, () => video.play().catch(() => {}));
      let initial = null, advanced = 0;
      const started = Date.now();
      while(Date.now()-started < 45000) {
        await new Promise(r=>setTimeout(r,500));
        if(!video.paused && video.readyState >= 2) {
          if(initial === null) initial = video.currentTime;
          advanced = video.currentTime-initial;
          if(advanced >= 3) break;
        }
        if(failures.length) break;
      }
      const report = { origin:location.origin, swVersion32:sw.includes('vsaiptv-cache-v3.2'), controlled:Boolean(navigator.serviceWorker.controller), secondsAdvanced:advanced, width:video.videoWidth, height:video.videoHeight, readyState:video.readyState, failures };
      hls.destroy(); video.remove(); return report;
    })()` });
    assert.ok(!result.exceptionDetails, 'Avaliação no navegador não deve lançar erro');
    const report = { ...result.result.value, mediaResponses: media, browserExceptions: errors };
    console.log(JSON.stringify(report, null, 2));
    fs.writeFileSync(path.join(__dirname, 'browser_playback_report.json'), JSON.stringify(report, null, 2));
    assert.ok(report.secondsAdvanced >= 3 && report.width > 0, 'Vídeo público deve decodificar e avançar');
    assert.ok(media.length > 0 && media.every(r => !r.fromServiceWorker), 'Mídia deve ignorar SW');
  } finally {
    for (const p of pending.values()) clearTimeout(p.timer);
    if (ws) ws.close();
    chrome.kill();
    await sleep(1500);
    try { fs.rmSync(profile, { recursive: true, force: true }); } catch { console.log('Perfil temporário ainda ocupado pelo Chrome.'); }
  }
}
main().catch(err => { console.error(err.message); process.exitCode = 1; });
