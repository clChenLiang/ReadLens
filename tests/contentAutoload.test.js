const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const contentSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'src', 'content.js'), 'utf8');
const contentCss = fs.readFileSync(path.join(__dirname, '..', 'extension', 'src', 'content.css'), 'utf8');

test('content script auto-renders a matching summary on initial page load', () => {
  assert.match(
    contentSource,
    /scheduleDetect\(250,\s*\{\s*renderIfFound:\s*true\s*\}\)/,
    'initial detection should pass renderIfFound: true so opening a page shows the interpretation without a click'
  );
});

test('content script auto-renders a matching summary after SPA URL changes', () => {
  assert.match(
    contentSource,
    /scheduleDetect\(350,\s*\{\s*renderIfFound:\s*true\s*\}\)/,
    'scheduled URL-change detection should auto-render matching summaries'
  );
  assert.match(
    contentSource,
    /detectSummaryForCurrentPage\(\{\s*force:\s*true,\s*renderIfFound:\s*true\s*\}\)/,
    'forced URL-change retry should auto-render matching summaries'
  );
});

test('content script supports readlens point links from assistant replies', () => {
  assert.match(
    contentSource,
    /function\s+getRequestedPointIdFromHash\s*\(/,
    'content script should parse #readlens=point-id links'
  );
  assert.match(
    contentSource,
    /pendingPointId\s*=\s*getRequestedPointIdFromHash\(\)/,
    'content script should remember the point requested by the URL hash'
  );
  assert.match(
    contentSource,
    /scrollToPoint\(options\.focusPointId\)/,
    'content script should jump to the requested point after rendering'
  );
  assert.match(
    contentSource,
    /renderReader\(validation\.data,\s*\{\s*focusPointId:\s*state\.pendingPointId\s*\}\)/,
    'auto-rendering should focus the point requested by the assistant link'
  );
});

test('content script can wake local Codex when the current page has no interpretation', () => {
  assert.match(
    contentSource,
    /function\s+wakeCodexForCurrentPage\s*\(/,
    'content script should expose a wake flow for unparsed pages'
  );
  assert.match(
    contentSource,
    /fetch\(`\$\{BRIDGE_BASE_URL\}\/wake-codex`/,
    'wake flow should call the local bridge wake endpoint'
  );
  assert.match(
    contentSource,
    /setLauncherStatus\('waking'/,
    'launcher should show a distinct waking state while Codex is starting'
  );
});

test('content script offers graph and text views for the interpretation panel', () => {
  assert.match(contentSource, /agent-reader-view-toggle/, 'panel should render a graph/text toggle');
  assert.match(contentSource, /agent-reader-map/, 'panel should include a graph-like knowledge map view');
  assert.match(contentSource, /agent-reader-text/, 'panel should keep a text view for detailed reading');
});

test('launcher is a top-right floating orb with state colors and hover expansion', () => {
  assert.match(contentCss, /\.agent-reader-launcher\s*\{[\s\S]*?top:\s*88px;[\s\S]*?right:\s*22px;[\s\S]*?bottom:\s*auto;/);
  assert.match(contentCss, /\.agent-reader-launcher\s*\{[\s\S]*?width:\s*54px;[\s\S]*?height:\s*54px;[\s\S]*?border-radius:\s*999px;/);
  assert.match(contentCss, /\.agent-reader-launcher:hover\s*\{[\s\S]*?width:\s*auto;/, 'hovering the orb should expand status text');
  assert.match(contentCss, /agent-reader-launcher-waking/, 'CSS should include a waking state color');
});
