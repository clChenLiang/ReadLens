const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { validateAgentSummary } = require('../extension/src/agentSchema');

function sendJson(response, statusCode, body) {
  const payload = JSON.stringify(body, null, 2);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, PUT, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'cache-control': 'no-store'
  });
  response.end(payload);
}

function readJsonBody(request) {
  return new Promise((resolve, reject) => {
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => {
      body += chunk;
      if (body.length > 2_000_000) {
        reject(new Error('Request body is too large.'));
        request.destroy();
      }
    });
    request.on('end', () => {
      try {
        resolve(JSON.parse(body || '{}'));
      } catch (error) {
        reject(new Error(`Invalid JSON: ${error.message}`));
      }
    });
    request.on('error', reject);
  });
}

function canonicalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';

  try {
    const parsed = new URL(raw);
    parsed.hash = '';
    for (const key of Array.from(parsed.searchParams.keys())) {
      if (/^(utm_|fbclid$|gclid$|yclid$|mc_cid$|mc_eid$)/i.test(key)) {
        parsed.searchParams.delete(key);
      }
    }
    parsed.searchParams.sort();
    if ((parsed.protocol === 'http:' && parsed.port === '80') || (parsed.protocol === 'https:' && parsed.port === '443')) {
      parsed.port = '';
    }
    if (parsed.pathname.length > 1) parsed.pathname = parsed.pathname.replace(/\/+$/, '');
    return parsed.href;
  } catch (_error) {
    return raw.replace(/#.*$/, '');
  }
}

function createStore(options = {}) {
  const summariesByUrl = new Map();
  const canonicalUrlIndex = new Map();
  let latest = null;
  const persistPath = options.persistPath ? path.resolve(options.persistPath) : null;

  function indexSummary(summary) {
    const urls = [summary.url, ...(summary.aliases || [])].filter(Boolean);
    for (const url of urls) {
      summariesByUrl.set(url, summary);
      const canonical = canonicalizeUrl(url);
      if (canonical) canonicalUrlIndex.set(canonical, summary);
    }
  }

  function load() {
    if (!persistPath || !fs.existsSync(persistPath)) return;
    const raw = JSON.parse(fs.readFileSync(persistPath, 'utf8'));
    for (const item of raw.summaries || []) {
      const validation = validateAgentSummary(item);
      if (validation.ok && validation.data.url) indexSummary(validation.data);
    }
    latest = raw.latest ? validateAgentSummary(raw.latest).data : null;
  }

  function save() {
    if (!persistPath) return;
    fs.mkdirSync(path.dirname(persistPath), { recursive: true });
    fs.writeFileSync(persistPath, JSON.stringify({
      latest,
      summaries: Array.from(summariesByUrl.values())
    }, null, 2));
  }

  function put(summary) {
    latest = summary;
    if (summary.url) indexSummary(summary);
    save();
  }

  function get(url) {
    if (url && summariesByUrl.has(url)) return summariesByUrl.get(url);
    const canonical = canonicalizeUrl(url);
    if (canonical && canonicalUrlIndex.has(canonical)) return canonicalUrlIndex.get(canonical);
    if (!url && latest) return latest;
    return null;
  }

  load();
  return { put, get };
}

function createBridgeServer(options = {}) {
  const store = options.store || createStore({ persistPath: options.persistPath });

  return http.createServer(async (request, response) => {
    const url = new URL(request.url, 'http://127.0.0.1');

    if (request.method === 'OPTIONS') {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === 'GET' && url.pathname === '/health') {
      sendJson(response, 200, { ok: true });
      return;
    }

    if (request.method === 'PUT' && url.pathname === '/summary') {
      try {
        const body = await readJsonBody(request);
        const validation = validateAgentSummary(body);
        if (!validation.ok) {
          sendJson(response, 400, { ok: false, error: validation.error });
          return;
        }
        store.put(validation.data);
        sendJson(response, 200, { ok: true, data: validation.data });
      } catch (error) {
        sendJson(response, 400, { ok: false, error: error.message });
      }
      return;
    }

    if (request.method === 'GET' && url.pathname === '/latest') {
      const requestedUrl = url.searchParams.get('url') || '';
      const data = store.get(requestedUrl);
      if (!data) {
        sendJson(response, 404, { ok: false, error: 'No summary found for requested URL.' });
        return;
      }
      sendJson(response, 200, { ok: true, data });
      return;
    }

    sendJson(response, 404, { ok: false, error: 'Not found.' });
  });
}

module.exports = { createBridgeServer, createStore, canonicalizeUrl };
