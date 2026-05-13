const test = require('node:test');
const assert = require('node:assert/strict');
const { extractReadableText, summarizeTextForUrl } = require('../bridge/summarizer');

test('extractReadableText removes scripts, styles, tags, and decodes common entities', () => {
  const html = `<!doctype html><html><head><title>Demo &amp; Test</title><style>body{}</style></head>
    <body><script>alert(1)</script><article><h1>Demo &amp; Test</h1><p>First paragraph has useful content.</p></article></body></html>`;

  const result = extractReadableText(html);

  assert.equal(result.title, 'Demo & Test');
  assert.match(result.text, /Demo & Test/);
  assert.match(result.text, /First paragraph has useful content/);
  assert.doesNotMatch(result.text, /alert/);
  assert.doesNotMatch(result.text, /body\{\}/);
});

test('summarizeTextForUrl creates valid quote-linked key points', () => {
  const text = [
    'Agent 负责理解页面并输出结构化解读数据，浏览器插件负责把这些数据渲染回原网页。',
    '第一版不要求 Agent 提供精确 DOM selector，只要求它提供尽量短且准确的原文 quote。',
    '用户点击某个关键点时，页面会滚动到对应的原文高亮位置。'
  ].join('\n\n');

  const summary = summarizeTextForUrl('https://example.com/article', '示例标题', text);

  assert.equal(summary.url, 'https://example.com/article');
  assert.equal(summary.title, '示例标题');
  assert.match(summary.summary, /Agent 负责理解页面/);
  assert.equal(summary.keyPoints.length, 3);
  assert.equal(summary.keyPoints[0].id, 'point-1');
  assert.equal(summary.keyPoints[0].evidence[0].quote, 'Agent 负责理解页面并输出结构化解读数据，浏览器插件负责把这些数据渲染回原网页。');
});
