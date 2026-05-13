const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const { execFile, execFileSync } = require('node:child_process');
const { validateAgentSummary } = require('../extension/src/agentSchema');

function sendJson(response, statusCode, body) {
  const payload = JSON.stringify(body, null, 2);
  response.writeHead(statusCode, {
    'content-type': 'application/json; charset=utf-8',
    'access-control-allow-origin': '*',
    'access-control-allow-methods': 'GET, PUT, POST, OPTIONS',
    'access-control-allow-headers': 'content-type',
    'cache-control': 'no-store'
  });
  response.end(payload);
}

function isSupportedWakeUrl(value) {
  try {
    const parsed = new URL(String(value || '').trim());
    return ['http:', 'https:', 'file:'].includes(parsed.protocol);
  } catch (_error) {
    return false;
  }
}

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function appleScriptQuote(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function findCodexBinary() {
  if (process.env.READLENS_CODEX_BIN) return process.env.READLENS_CODEX_BIN;
  try {
    return execFileSync('/bin/zsh', ['-lc', 'command -v codex'], { encoding: 'utf8' }).trim() || 'codex';
  } catch (_error) {
    return 'codex';
  }
}

function buildCodexWakeCommand(url, options = {}) {
  const cwd = options.cwd || path.resolve(__dirname, '..');
  const codexBin = options.codexBin || findCodexBinary();
  const prompt = [
    '使用 readlens skill 总结这个链接：',
    url,
    '请直接完成解析并写入 ReadLens bridge。',
    '要求：读取页面内容，生成符合 ReadLens JSON contract 的 JSON，包含 url/title/summary/keyPoints/evidence.quote。',
    'quote 要尽量使用页面中的短原文，方便浏览器插件定位。',
    '完成后执行：readlens put -，把生成的 JSON 从 stdin 写入本地 bridge。',
    '如果 readlens 命令不可用，请使用当前仓库的 bin/readlens put -。'
  ].join(' ');
  return `${shellQuote(codexBin)} exec --skip-git-repo-check -C ${shellQuote(cwd)} ${shellQuote(prompt)}`;
}

function runAppleScript(script) {
  return new Promise((resolve, reject) => {
    execFile('/usr/bin/osascript', ['-e', script], (error) => {
      if (error) reject(error);
      else resolve();
    });
  });
}

async function defaultWakeCodex({ url }, options = {}) {
  const command = buildCodexWakeCommand(url, options);
  const script = [
    'tell application "Terminal"',
    'activate',
    `do script "${appleScriptQuote(command)}"`,
    'end tell'
  ].join('\n');
  await runAppleScript(script);
  return { ok: true, mode: 'terminal', command };
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
  const wakeCodex = options.wakeCodex || ((payload) => defaultWakeCodex(payload, options));

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

    if (request.method === 'POST' && url.pathname === '/wake-codex') {
      try {
        const body = await readJsonBody(request);
        const targetUrl = String(body.url || '').trim();
        if (!isSupportedWakeUrl(targetUrl)) {
          sendJson(response, 400, { ok: false, error: 'Unsupported URL. Only http, https, and file URLs can wake Codex.' });
          return;
        }
        const result = await wakeCodex({ url: targetUrl });
        sendJson(response, 200, { ok: true, ...result });
      } catch (error) {
        sendJson(response, 500, { ok: false, error: error.message });
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

module.exports = { createBridgeServer, createStore, canonicalizeUrl, buildCodexWakeCommand, defaultWakeCodex };
