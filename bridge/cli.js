#!/usr/bin/env node
const fs = require('node:fs');
const path = require('node:path');
const { spawn, execFileSync } = require('node:child_process');
const { createBridgeServer } = require('./server');
const { summarizeUrl } = require('./summarizer');

const DEFAULT_PORT = Number(process.env.AGENT_READER_BRIDGE_PORT || 8765);
const DEFAULT_STORE = path.join(process.cwd(), '.agent-reader-bridge.json');

function usage() {
  console.log(`ReadLens bridge

Usage:
  readlens serve [--port 8765] [--store .agent-reader-bridge.json]
  readlens stop [--port 8765]
  readlens put <summary.json> [--port 8765]
  readlens get <url> [--port 8765]
  readlens summarize <url> [--port 8765] [--alias <url>] [--no-open]

Compatibility alias:
  agent-reader <command> [...args]

Examples:
  readlens summarize https://example.com/article
  readlens summarize fixtures/sample-article.html
`);
}

function readFlag(args, name, fallback) {
  const index = args.indexOf(name);
  if (index === -1) return fallback;
  return args[index + 1] || fallback;
}

function hasFlag(args, name) {
  return args.includes(name);
}

async function requestJson(url, options) {
  const response = await fetch(url, options);
  const text = await response.text();
  let body;
  try {
    body = JSON.parse(text);
  } catch (error) {
    throw new Error(`Invalid bridge JSON response: ${text.slice(0, 120)}`);
  }
  if (!response.ok || !body.ok) {
    throw new Error(body.error || `HTTP ${response.status}`);
  }
  return body;
}

async function isBridgeRunning(port) {
  try {
    await requestJson(`http://127.0.0.1:${port}/health`);
    return true;
  } catch (_error) {
    return false;
  }
}

async function ensureBridgeRunning(port) {
  if (await isBridgeRunning(port)) return false;

  const logPath = path.join(process.cwd(), '.agent-reader-bridge.log');
  const logFd = fs.openSync(logPath, 'a');
  const child = spawn(process.execPath, [__filename, 'serve', '--port', String(port), '--store', DEFAULT_STORE], {
    detached: true,
    stdio: ['ignore', logFd, logFd]
  });
  child.unref();

  for (let attempt = 0; attempt < 40; attempt += 1) {
    await new Promise((resolve) => setTimeout(resolve, 100));
    if (await isBridgeRunning(port)) return true;
  }

  throw new Error(`ReadLens bridge did not start at http://127.0.0.1:${port}. See ${logPath}`);
}

function findListeningPids(port) {
  try {
    const output = execFileSync('lsof', ['-tiTCP:' + String(port), '-sTCP:LISTEN'], { encoding: 'utf8' });
    return output.split(/\s+/)
      .map((value) => Number(value))
      .filter((pid) => Number.isInteger(pid) && pid > 0 && pid !== process.pid);
  } catch (_error) {
    return [];
  }
}

async function waitForBridgeStopped(port) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    if (!(await isBridgeRunning(port))) return true;
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  return false;
}

async function stopBridge(port) {
  const pids = findListeningPids(port);
  if (pids.length === 0) {
    console.log(`ReadLens bridge is not running on http://127.0.0.1:${port}`);
    return;
  }

  for (const pid of pids) {
    try {
      process.kill(pid, 'SIGTERM');
    } catch (_error) {
      // The process may have already exited between lsof and kill.
    }
  }

  if (!(await waitForBridgeStopped(port))) {
    throw new Error(`ReadLens bridge did not stop on http://127.0.0.1:${port}. PIDs: ${pids.join(', ')}`);
  }

  console.log(`ReadLens bridge stopped on http://127.0.0.1:${port}. PIDs: ${pids.join(', ')}`);
}

async function putSummaryData(summary, port) {
  return requestJson(`http://127.0.0.1:${port}/summary`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(summary)
  });
}

async function readStdin() {
  return new Promise((resolve, reject) => {
    let body = '';
    process.stdin.setEncoding('utf8');
    process.stdin.on('data', (chunk) => { body += chunk; });
    process.stdin.on('end', () => resolve(body));
    process.stdin.on('error', reject);
  });
}

async function putSummary(file, port) {
  const body = file === '-' ? await readStdin() : fs.readFileSync(file, 'utf8');
  const response = await fetch(`http://127.0.0.1:${port}/summary`, {
    method: 'PUT',
    headers: { 'content-type': 'application/json' },
    body
  });
  const text = await response.text();
  console.log(text);
  if (!response.ok) process.exitCode = 1;
}

async function getSummary(url, port) {
  const response = await fetch(`http://127.0.0.1:${port}/latest?url=${encodeURIComponent(url || '')}`);
  const text = await response.text();
  console.log(text);
  if (!response.ok) process.exitCode = 1;
}

function normalizeInputUrl(input) {
  if (/^https?:\/\//i.test(input) || input.startsWith('file://')) return input;
  return path.resolve(input);
}

function browserUrlForInput(input) {
  if (/^https?:\/\//i.test(input) || input.startsWith('file://')) return input;
  return new URL(`file://${path.resolve(input)}`).href;
}

function openUrl(url) {
  const opener = process.platform === 'darwin' ? 'open' : process.platform === 'win32' ? 'cmd' : 'xdg-open';
  const args = process.platform === 'win32' ? ['/c', 'start', '', url] : [url];
  const child = spawn(opener, args, { detached: true, stdio: 'ignore' });
  child.unref();
}

async function summarizeCommand(input, port, shouldOpen, aliases) {
  const summaryUrl = browserUrlForInput(input);
  const readUrl = normalizeInputUrl(input);
  const summary = await summarizeUrl(readUrl);
  summary.url = summaryUrl;
  summary.aliases = Array.from(new Set([...(summary.aliases || []), ...aliases, input]
    .map((value) => value && browserUrlForInput(value))
    .filter((value) => value && value !== summaryUrl)));

  const startedBridge = await ensureBridgeRunning(port);

  await putSummaryData(summary, port);
  console.log(JSON.stringify({ ok: true, bridgeStarted: startedBridge, url: summary.url, title: summary.title, keyPoints: summary.keyPoints.length }, null, 2));
  if (shouldOpen) openUrl(summary.url);
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];
  const port = Number(readFlag(args, '--port', DEFAULT_PORT));

  if (command === 'serve') {
    const store = readFlag(args, '--store', DEFAULT_STORE);
    const server = createBridgeServer({ persistPath: store });
    server.listen(port, '127.0.0.1', () => {
      console.log(`ReadLens bridge listening on http://127.0.0.1:${port}`);
      console.log(`Store: ${path.resolve(store)}`);
    });
    return;
  }

  if (command === 'stop') {
    await stopBridge(port);
    return;
  }

  if (command === 'put') {
    const file = args[1];
    if (!file) {
      usage();
      process.exitCode = 1;
      return;
    }
    await putSummary(file, port);
    return;
  }

  if (command === 'get') {
    await getSummary(args[1] || '', port);
    return;
  }

  if (command === 'summarize') {
    const input = args[1];
    if (!input) {
      usage();
      process.exitCode = 1;
      return;
    }
    const aliases = [];
    for (let index = 0; index < args.length; index += 1) {
      if (args[index] === '--alias' && args[index + 1]) aliases.push(args[index + 1]);
    }
    await summarizeCommand(input, port, !hasFlag(args, '--no-open'), aliases);
    return;
  }

  usage();
  process.exitCode = command ? 1 : 0;
}

main().catch((error) => {
  console.error(error.stack || error.message);
  process.exitCode = 1;
});
