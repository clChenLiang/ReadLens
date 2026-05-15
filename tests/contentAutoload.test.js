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

test('graph view uses SVG structure nodes with hover tooltips', () => {
  assert.match(contentSource, /createElementNS\(SVG_NS, 'svg'\)/, 'map view should draw an SVG instead of only stacked cards');
  assert.match(contentSource, /agent-reader-map-link/, 'map view should draw links between overview and key points');
  assert.match(contentSource, /agent-reader-map-node/, 'map view should draw visible point nodes');
  assert.match(contentSource, /agent-reader-tooltip/, 'map view should show a detailed hover tooltip');
  assert.match(contentSource, /positionMapTooltip/, 'tooltip should track the hovered SVG item');
});

test('launcher is a top-right floating orb with state colors and hover expansion', () => {
  assert.match(contentCss, /\.agent-reader-launcher\s*\{[\s\S]*?top:\s*88px;[\s\S]*?right:\s*22px;[\s\S]*?bottom:\s*auto;/);
  assert.match(contentCss, /\.agent-reader-launcher\s*\{[\s\S]*?width:\s*54px;[\s\S]*?height:\s*54px;[\s\S]*?border-radius:\s*999px;/);
  assert.match(contentCss, /\.agent-reader-launcher:hover\s*\{[\s\S]*?width:\s*auto;/, 'hovering the orb should expand status text');
  assert.match(contentCss, /agent-reader-launcher-waking/, 'CSS should include a waking state color');
});

test('empty and offline launcher states have high-contrast visible colors', () => {
  assert.match(contentCss, /\.agent-reader-launcher-empty\s*\{[\s\S]*?background:\s*#475569;/, 'empty page state should be a neutral gray orb');
  assert.match(contentCss, /\.agent-reader-launcher-empty\s+\.agent-reader-orb-mark\s*\{[\s\S]*?background:\s*#ffffff;/, 'empty state mark should be white for contrast');
  assert.match(contentCss, /\.agent-reader-launcher-offline\s*\{[\s\S]*?background:\s*#334155;/, 'offline state should be a dark slate orb');
});

test('launcher empty and interpreting states use clear product copy and disabled loading behavior', () => {
  assert.match(contentSource, /setLauncherStatus\('empty',\s*'解读此页'\)/, 'empty pages should show an action-oriented hover label');
  assert.match(contentSource, /agent-reader-launcher-loading-text/, 'interpreting state should render a timer/loading text element');
  assert.match(contentSource, /formatElapsedSeconds/, 'interpreting state should format elapsed loading time');
  assert.match(contentSource, /if \(state\.isInterpreting\) return;/, 'clicking while parsing should do nothing');
  assert.match(contentCss, /\.agent-reader-launcher-waking,\s*\n\.agent-reader-launcher-waiting\s*\{[\s\S]*?cursor:\s*wait;/, 'interpreting states should communicate waiting and non-clickability');
});

test('launcher state colors map to gray empty, blue interpreting, and green interpreted', () => {
  assert.match(contentCss, /\.agent-reader-launcher-empty\s*\{[\s\S]*?background:\s*#475569;/, 'empty/no-summary state should be gray');
  assert.match(contentCss, /\.agent-reader-launcher-waking,\s*\n\.agent-reader-launcher-waiting\s*\{[\s\S]*?background:\s*#1d4ed8;/, 'interpreting state should be clear blue');
  assert.match(contentCss, /\.agent-reader-launcher-ready,\s*\n\.agent-reader-launcher-rendered\s*\{[\s\S]*?background:\s*#047857;/, 'ready/rendered state should be green');
});


test('graph view lays out hierarchical points horizontally', () => {
  assert.match(contentSource, /function\s+buildPointHierarchy\s*\(/, 'content script should build parent-child hierarchy from keyPoints');
  assert.match(contentSource, /parentId/, 'content script should read optional parentId from keyPoints');
  assert.match(contentSource, /agent-reader-outline-label/, 'text and map views should show outline labels like 2.1');
  assert.match(contentSource, /depth\s*\*\s*150/, 'map x positions should move child nodes horizontally by depth');
  assert.match(contentCss, /\.agent-reader-map-frame\s*\{[\s\S]*?overflow-x:\s*auto;/, 'wide horizontal maps should scroll instead of clipping');
});

test('content script restores pending interpretation state after page refresh', () => {
  assert.match(contentSource, /fetch\(`\$\{BRIDGE_BASE_URL\}\/status\?url=/, 'content script should query bridge status, not only latest summary');
  assert.match(contentSource, /result\.status === 'pending'/, 'detect flow should recognize pending status');
  assert.match(contentSource, /state\.wakeStartedAt\s*=\s*result\.task\.startedAt/, 'pending status should restore the original elapsed timer start');
  assert.match(contentSource, /scheduleWakePolling\(\)/, 'pending status should resume polling after refresh');
});

test('offline launcher opens a start-service guide with copyable serve command', () => {
  assert.match(contentSource, /function\s+showBridgeOfflineGuide\s*\(/, 'content script should render a bridge startup guide');
  assert.match(contentSource, /readlens serve/, 'startup guide should tell users the command to start the bridge');
  assert.match(contentSource, /navigator\.clipboard\.writeText/, 'startup guide should support copying the serve command');
  assert.match(contentSource, /if \(state\.launcherStatus === 'offline'\) \{\s*showBridgeOfflineGuide\(\);\s*return;\s*\}/, 'clicking offline launcher should open the guide instead of trying wake-codex again');
  assert.match(contentCss, /agent-reader-bridge-guide/, 'CSS should style the startup guide panel');
});
