const http = require('http');
const https = require('https');
const db = require('../db/database');

/**
 * VsaiRouterClient — Cliente Resiliente para VSAIROUTER (OpenAI-compatible /v1)
 * Suporta chat completions com chamada de ferramentas (tool calling).
 * Possui timeout estrito, fallback amigável e nunca trava o servidor se o provedor cair.
 */
class VsaiRouterClient {
  constructor() {
    this.defaultTimeoutMs = 7000;
  }

  getConfig() {
    let baseUrl = process.env.VSAIROUTER_URL;
    let apiKey = process.env.VSAIROUTER_API_KEY || 'vsai-default-key';
    let model = process.env.VSAIROUTER_MODEL || 'gpt-4o-mini';

    try {
      const urlRow = db.prepare("SELECT value FROM system_settings WHERE key = 'vsairouter_url'").get();
      if (urlRow?.value) baseUrl = urlRow.value;
      const modelRow = db.prepare("SELECT value FROM system_settings WHERE key = 'vsairouter_model'").get();
      if (modelRow?.value) model = modelRow.value;
    } catch (e) {}

    baseUrl = (baseUrl || 'http://localhost:8000/v1').replace(/\/+$/, '');
    return { baseUrl, apiKey, model };
  }

  async checkHealth() {
    const config = this.getConfig();
    const startTime = Date.now();
    try {
      const u = new URL(`${config.baseUrl}/models`);
      const isHttps = u.protocol === 'https:';
      const client = isHttps ? https : http;

      return await new Promise((resolve) => {
        const req = client.get(u.href, {
          headers: {
            'Authorization': `Bearer ${config.apiKey}`,
            'User-Agent': 'VSAIPTV-Agent/1.0'
          },
          timeout: 3000
        }, (res) => {
          const latency = Date.now() - startTime;
          if (res.statusCode >= 200 && res.statusCode < 400) {
            resolve({ status: 'ONLINE', latency_ms: latency, model: config.model, endpoint: config.baseUrl });
          } else {
            resolve({ status: 'DEGRADADO', statusCode: res.statusCode, latency_ms: latency });
          }
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({ status: 'OFFLINE', error: 'Timeout de conexão com VSAIROUTER' });
        });

        req.on('error', (err) => {
          resolve({ status: 'OFFLINE', error: err.message });
        });
      });
    } catch (err) {
      return { status: 'OFFLINE', error: err.message };
    }
  }

  async chatCompletion({ messages, tools = null, temperature = 0.3 }) {
    const config = this.getConfig();
    const payload = {
      model: config.model,
      messages,
      temperature,
      max_tokens: 800
    };

    if (tools && Array.isArray(tools) && tools.length > 0) {
      payload.tools = tools;
      payload.tool_choice = 'auto';
    }

    try {
      const postData = JSON.stringify(payload);
      const u = new URL(`${config.baseUrl}/chat/completions`);
      const isHttps = u.protocol === 'https:';
      const client = isHttps ? https : http;

      return await new Promise((resolve) => {
        const req = client.request(u.href, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Content-Length': Buffer.byteLength(postData),
            'Authorization': `Bearer ${config.apiKey}`,
            'User-Agent': 'VSAIPTV-Agent/1.0'
          },
          timeout: this.defaultTimeoutMs
        }, (res) => {
          let body = '';
          res.on('data', chunk => body += chunk);
          res.on('end', () => {
            if (res.statusCode >= 200 && res.statusCode < 300) {
              try {
                const parsed = JSON.parse(body);
                resolve({ success: true, data: parsed });
              } catch (parseErr) {
                resolve({ success: false, unavailable: true, error: 'Resposta inválida da IA' });
              }
            } else {
              resolve({ success: false, unavailable: true, statusCode: res.statusCode, error: body });
            }
          });
        });

        req.on('timeout', () => {
          req.destroy();
          resolve({ success: false, unavailable: true, error: 'VSAIROUTER demorou para responder (timeout)' });
        });

        req.on('error', (err) => {
          resolve({ success: false, unavailable: true, error: err.message });
        });

        req.write(postData);
        req.end();
      });
    } catch (err) {
      return { success: false, unavailable: true, error: err.message };
    }
  }
}

const vsaiRouterClientInstance = new VsaiRouterClient();
module.exports = vsaiRouterClientInstance;
