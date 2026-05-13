const test = require('node:test');
const assert = require('node:assert/strict');
const { normalizeText, findQuoteInText } = require('../extension/src/quoteMatcher');

test('normalizes whitespace and punctuation-like spaces', () => {
  assert.equal(normalizeText('  Agent\n\treads   pages  '), 'Agent reads pages');
});

test('finds an exact quote in text', () => {
  const text = 'Intro. This article says the market changed quickly. Outro.';
  const match = findQuoteInText(text, 'This article says the market changed quickly.');

  assert.deepEqual(match, {
    found: true,
    start: 7,
    end: 52,
    strategy: 'exact',
    score: 1
  });
});

test('finds a quote when page text has different whitespace', () => {
  const text = 'Intro. This article says\n the market   changed quickly. Outro.';
  const match = findQuoteInText(text, 'This article says the market changed quickly.');

  assert.equal(match.found, true);
  assert.equal(text.slice(match.start, match.end), 'This article says\n the market   changed quickly.');
  assert.equal(match.strategy, 'normalized');
});

test('returns not found for short or absent quotes', () => {
  assert.equal(findQuoteInText('Alpha beta gamma', 'missing phrase').found, false);
  assert.equal(findQuoteInText('Alpha beta gamma', 'a').found, false);
});
