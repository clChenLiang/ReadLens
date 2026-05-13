const test = require('node:test');
const assert = require('node:assert/strict');
const { createBridgeServer, buildCodexWakeCommand } = require('../bridge/server');

function sampleSummary(url = 'https://example.com/article') {
  return {
    url,
    title: 'Example',
    summary: 'Example summary',
    keyPoints: [
      {
        claim: 'Claim',
        evidence: [{ quote: 'Example quoted sentence.' }]
      }
    ]
  };
}

async function withServer(fn, options = {}) {
  const app = createBridgeServer(options);
  const server = app.listen(0);
  await new Promise((resolve) => server.once('listening', resolve));
  const { port } = server.address();
  try {
    await fn(`http://127.0.0.1:${port}`);
  } finally {
    await new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  }
}

test('GET /health returns ok', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/health`);
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { ok: true });
  });
});

test('PUT /summary stores a valid summary and GET /latest retrieves it by URL', async () => {
  await withServer(async (baseUrl) => {
    const input = sampleSummary('https://example.com/specific');
    const putResponse = await fetch(`${baseUrl}/summary`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    });
    assert.equal(putResponse.status, 200);
    const putBody = await putResponse.json();
    assert.equal(putBody.ok, true);
    assert.equal(putBody.data.url, 'https://example.com/specific');

    const getResponse = await fetch(`${baseUrl}/latest?url=${encodeURIComponent(input.url)}`);
    assert.equal(getResponse.status, 200);
    const getBody = await getResponse.json();
    assert.equal(getBody.ok, true);
    assert.equal(getBody.data.summary, 'Example summary');
    assert.equal(getBody.data.keyPoints[0].id, 'point-1');
  });
});

test('PUT /summary rejects invalid summary', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/summary`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ title: 'Invalid only' })
    });
    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.match(body.error, /summary/i);
  });
});

test('GET /latest returns 404 when no summary exists', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/latest?url=${encodeURIComponent('https://missing.test')}`);
    assert.equal(response.status, 404);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.match(body.error, /No summary/i);
  });
});

test('GET /latest retrieves a summary by alias URL', async () => {
  await withServer(async (baseUrl) => {
    const input = {
      ...sampleSummary('https://x.com/RobinSeun/article/2054139315052310724'),
      aliases: ['https://x.com/RobinSeun/status/2054139315052310724']
    };
    await fetch(`${baseUrl}/summary`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    });

    const response = await fetch(`${baseUrl}/latest?url=${encodeURIComponent('https://x.com/RobinSeun/status/2054139315052310724')}`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.data.url, input.url);
    assert.deepEqual(body.data.aliases, input.aliases);
  });
});

test('GET /latest ignores common tracking params and hash while matching URLs', async () => {
  await withServer(async (baseUrl) => {
    const input = sampleSummary('https://example.com/article?b=2&a=1');
    await fetch(`${baseUrl}/summary`, {
      method: 'PUT',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(input)
    });

    const noisyUrl = 'https://example.com/article?a=1&b=2&utm_source=newsletter#comments';
    const response = await fetch(`${baseUrl}/latest?url=${encodeURIComponent(noisyUrl)}`);
    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.data.url, input.url);
  });
});

test('POST /wake-codex asks the injected wake runner to launch Codex for a URL', async () => {
  const calls = [];
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/wake-codex`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'https://example.com/to-read' })
    });

    assert.equal(response.status, 200);
    const body = await response.json();
    assert.equal(body.ok, true);
    assert.equal(body.mode, 'terminal');
    assert.match(body.command, /codex/);
    assert.deepEqual(calls, [{ url: 'https://example.com/to-read' }]);
  }, {
    wakeCodex: async ({ url }) => {
      calls.push({ url });
      return { ok: true, mode: 'terminal', command: `codex ${url}` };
    }
  });
});

test('POST /wake-codex rejects missing or unsupported URLs', async () => {
  await withServer(async (baseUrl) => {
    const response = await fetch(`${baseUrl}/wake-codex`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: 'javascript:alert(1)' })
    });

    assert.equal(response.status, 400);
    const body = await response.json();
    assert.equal(body.ok, false);
    assert.match(body.error, /Unsupported URL/i);
  }, {
    wakeCodex: async () => {
      throw new Error('should not run for invalid URL');
    }
  });
});

test('Codex wake command runs a non-interactive readlens document parse by default', () => {
  const command = buildCodexWakeCommand('https://example.com/article', {
    cwd: '/tmp/readlens',
    codexBin: '/usr/local/bin/codex'
  });

  assert.match(command, /codex' exec /, 'wake command should use codex exec so parsing actually starts');
  assert.match(command, /--skip-git-repo-check/, 'wake command should work from packaged skill directories');
  assert.match(command, /-C '\/tmp\/readlens'/, 'wake command should set the ReadLens project root');
  assert.match(command, /使用 readlens skill 总结这个链接/, 'wake prompt should explicitly invoke the readlens skill');
  assert.match(command, /readlens put -/, 'wake prompt should instruct Codex to write bridge-compatible JSON');
});
