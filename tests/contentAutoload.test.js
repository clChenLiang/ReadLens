const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const contentSource = fs.readFileSync(path.join(__dirname, '..', 'extension', 'src', 'content.js'), 'utf8');

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
