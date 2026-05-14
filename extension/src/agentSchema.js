(function (root, factory) {
  if (typeof module === 'object' && module.exports) {
    module.exports = factory();
  } else {
    root.AgentReaderSchema = factory();
  }
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  function cleanString(value) {
    return typeof value === 'string' ? value.trim() : '';
  }

  function normalizeEvidence(rawEvidence) {
    if (!Array.isArray(rawEvidence)) return [];

    return rawEvidence
      .map((item) => {
        const quote = cleanString(item && item.quote);
        if (!quote) return null;
        const confidence = Number(item && item.confidence);
        return {
          quote,
          confidence: Number.isFinite(confidence) ? Math.max(0, Math.min(1, confidence)) : null,
          selector: cleanString(item && item.selector) || null
        };
      })
      .filter(Boolean);
  }

  function normalizeAliases(rawAliases) {
    if (!Array.isArray(rawAliases)) return [];
    const seen = new Set();
    const aliases = [];
    for (const rawAlias of rawAliases) {
      const alias = cleanString(rawAlias);
      if (!alias || seen.has(alias)) continue;
      seen.add(alias);
      aliases.push(alias);
    }
    return aliases;
  }

  function validateAgentSummary(input) {
    const errors = [];
    if (!input || typeof input !== 'object' || Array.isArray(input)) {
      return { ok: false, error: 'Agent summary must be a JSON object.', data: null };
    }

    const summary = cleanString(input.summary);
    if (!summary) errors.push('summary is required');

    if (!Array.isArray(input.keyPoints) || input.keyPoints.length === 0) {
      errors.push('keyPoints must contain at least one item');
    }

    const keyPoints = Array.isArray(input.keyPoints)
      ? input.keyPoints.map((point, index) => ({
          id: cleanString(point && point.id) || `point-${index + 1}`,
          parentId: cleanString(point && point.parentId),
          claim: cleanString(point && point.claim),
          explanation: cleanString(point && point.explanation),
          evidence: normalizeEvidence(point && point.evidence)
        })).filter((point) => point.claim || point.explanation || point.evidence.length > 0)
      : [];

    if (Array.isArray(input.keyPoints) && keyPoints.length === 0) {
      errors.push('keyPoints must include at least one readable claim, explanation, or evidence quote');
    }

    if (errors.length > 0) {
      return { ok: false, error: errors.join('; '), data: null };
    }

    return {
      ok: true,
      error: null,
      data: {
        url: cleanString(input.url),
        aliases: normalizeAliases(input.aliases),
        title: cleanString(input.title),
        summary,
        keyPoints
      }
    };
  }

  return { validateAgentSummary };
});
