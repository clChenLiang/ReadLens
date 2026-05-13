const test = require('node:test');
const assert = require('node:assert/strict');
const { spawn } = require('node:child_process');
const net = require('node:net');
const path = require('node:path');

const CLI = path.join(__dirname, '..', 'bridge', 'cli.js');

function runCli(args, options = {}) {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [CLI, ...args], {
      cwd: path.join(__dirname, '..'),
      env: { ...process.env, ...options.env },
      stdio: ['ignore', 'pipe', 'pipe']
    });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    child.stdout.on('data', (chunk) => { stdout += chunk; });
    child.stderr.on('data', (chunk) => { stderr += chunk; });
    child.on('close', (code, signal) => resolve({ code, signal, stdout, stderr }));
  });
}

async function eventuallyRejectsFetch(url) {
  for (let attempt = 0; attempt < 40; attempt += 1) {
    try {
      await fetch(url);
    } catch (_error) {
      return;
    }
    await new Promise((resolve) => setTimeout(resolve, 100));
  }
  throw new Error(`Expected fetch to fail after server stopped: ${url}`);
}

function waitForOutput(child, pattern) {
  return new Promise((resolve, reject) => {
    let output = '';
    const timer = setTimeout(() => reject(new Error(`Timed out waiting for ${pattern}. Output: ${output}`)), 4000);
    child.stdout.setEncoding('utf8');
    child.stderr.setEncoding('utf8');
    const onData = (chunk) => {
      output += chunk;
      if (pattern.test(output)) {
        clearTimeout(timer);
        resolve(output);
      }
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
  });
}

function getFreePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.listen(0, '127.0.0.1', () => {
      const { port } = server.address();
      server.close((error) => error ? reject(error) : resolve(port));
    });
    server.on('error', reject);
  });
}

test('usage documents stop command', async () => {
  const result = await runCli([]);
  assert.equal(result.code, 0);
  assert.match(result.stdout, /readlens stop \[--port 8765\]/);
});

test('stop command shuts down a running bridge on the requested port', async () => {
  const port = await getFreePort();
  const server = spawn(process.execPath, [CLI, 'serve', '--port', String(port)], {
    cwd: path.join(__dirname, '..'),
    stdio: ['ignore', 'pipe', 'pipe']
  });

  await waitForOutput(server, new RegExp(`ReadLens bridge listening on http:\\/\\/127\\.0\\.0\\.1:${port}`));

  try {
    const health = await fetch(`http://127.0.0.1:${port}/health`);
    assert.equal(health.status, 200);

    const result = await runCli(['stop', '--port', String(port)]);
    assert.equal(result.code, 0, result.stderr);
    assert.match(result.stdout, /stopped/i);

    await eventuallyRejectsFetch(`http://127.0.0.1:${port}/health`);
  } finally {
    if (!server.killed) server.kill('SIGTERM');
  }
});
