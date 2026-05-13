(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AgentReaderQuoteMatcher = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function normalizeText(value) {
    return String(value || '')
      .replace(/[\u00a0\u2000-\u200b\u2028\u2029]/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
  }

  function buildNormalizedMap(text) {
    const normalizedChars = [];
    const originalIndexes = [];
    let previousWasSpace = true;

    for (let index = 0; index < text.length; index += 1) {
      const char = text[index];
      if (/\s|\u00a0|[\u2000-\u200b\u2028\u2029]/.test(char)) {
        if (!previousWasSpace) {
          normalizedChars.push(' ');
          originalIndexes.push(index);
          previousWasSpace = true;
        }
      } else {
        normalizedChars.push(char);
        originalIndexes.push(index);
        previousWasSpace = false;
      }
    }

    if (normalizedChars[normalizedChars.length - 1] === ' ') {
      normalizedChars.pop();
      originalIndexes.pop();
    }

    return {
      normalized: normalizedChars.join(''),
      originalIndexes
    };
  }

  function findQuoteInText(text, quote) {
    const pageText = String(text || '');
    const rawQuote = String(quote || '').trim();
    const normalizedQuote = normalizeText(rawQuote);

    if (normalizedQuote.length < 8) {
      return { found: false, start: -1, end: -1, strategy: 'none', score: 0 };
    }

    const exactStart = pageText.indexOf(rawQuote);
    if (exactStart >= 0) {
      return {
        found: true,
        start: exactStart,
        end: exactStart + rawQuote.length,
        strategy: 'exact',
        score: 1
      };
    }

    const mapped = buildNormalizedMap(pageText);
    const normalizedStart = mapped.normalized.indexOf(normalizedQuote);
    if (normalizedStart >= 0) {
      const normalizedEnd = normalizedStart + normalizedQuote.length - 1;
      const start = mapped.originalIndexes[normalizedStart];
      const end = mapped.originalIndexes[normalizedEnd] + 1;
      return {
        found: true,
        start,
        end,
        strategy: 'normalized',
        score: 0.95
      };
    }

    return { found: false, start: -1, end: -1, strategy: 'none', score: 0 };
  }

  return { normalizeText, findQuoteInText };
});
