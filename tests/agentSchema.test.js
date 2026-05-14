const test = require('node:test');
const assert = require('node:assert/strict');
const { validateAgentSummary } = require('../extension/src/agentSchema');

test('normalizes a valid agent summary', () => {
  const result = validateAgentSummary({
    url: 'https://example.com/a',
    aliases: [' https://example.com/a?utm_source=test ', '', 'https://example.com/a#section'],
    title: '  Example title  ',
    summary: '  Main summary. ',
    keyPoints: [
      {
        id: 'custom-id',
        claim: '  Claim one ',
        explanation: ' Explanation one ',
        evidence: [
          { quote: ' Original quoted sentence. ', confidence: 0.7 }
        ]
      }
    ]
  });

  assert.equal(result.ok, true);
  assert.deepEqual(result.data.aliases, ['https://example.com/a?utm_source=test', 'https://example.com/a#section']);
  assert.deepEqual(result.data.keyPoints[0], {
    id: 'custom-id',
    parentId: '',
    claim: 'Claim one',
    explanation: 'Explanation one',
    evidence: [
      { quote: 'Original quoted sentence.', confidence: 0.7, selector: null }
    ]
  });
});

test('rejects missing summary and key points', () => {
  const result = validateAgentSummary({ title: 'Only title' });

  assert.equal(result.ok, false);
  assert.match(result.error, /summary/i);
  assert.match(result.error, /keyPoints/i);
});

test('adds stable ids and ignores blank evidence', () => {
  const result = validateAgentSummary({
    summary: 'Summary',
    keyPoints: [
      {
        claim: 'Claim',
        evidence: [{ quote: '   ' }, { quote: 'Useful quote' }]
      }
    ]
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.keyPoints[0].id, 'point-1');
  assert.equal(result.data.keyPoints[0].evidence.length, 1);
  assert.equal(result.data.keyPoints[0].explanation, '');
});


test('preserves optional key point hierarchy parent ids', () => {
  const result = validateAgentSummary({
    summary: 'Summary',
    keyPoints: [
      { id: 'point-1', claim: 'Parent point' },
      { id: 'point-1-1', parentId: ' point-1 ', claim: 'Child point' }
    ]
  });

  assert.equal(result.ok, true);
  assert.equal(result.data.keyPoints[0].parentId, '');
  assert.equal(result.data.keyPoints[1].parentId, 'point-1');
});
