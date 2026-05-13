const fs = require('node:fs');
const path = require('node:path');

function decodeEntities(text) {
  return String(text || '')
    .replace(/&nbsp;/gi, ' ')
    .replace(/&amp;/gi, '&')
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&#(\d+);/g, (_, code) => String.fromCodePoint(Number(code)))
    .replace(/&#x([0-9a-f]+);/gi, (_, code) => String.fromCodePoint(parseInt(code, 16)));
}

function stripHtml(html) {
  return decodeEntities(String(html || '')
    .replace(/<script\b[^>]*>[\s\S]*?<\/script>/gi, ' ')
    .replace(/<style\b[^>]*>[\s\S]*?<\/style>/gi, ' ')
    .replace(/<noscript\b[^>]*>[\s\S]*?<\/noscript>/gi, ' ')
    .replace(/<\/(p|div|section|article|h[1-6]|li|blockquote|tr)>/gi, '\n')
    .replace(/<br\s*\/?\s*>/gi, '\n')
    .replace(/<[^>]+>/g, ' ')
    .replace(/[ \t\f\v]+/g, ' ')
    .replace(/\n\s+/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim());
}

function extractTitle(html) {
  const titleMatch = String(html || '').match(/<title\b[^>]*>([\s\S]*?)<\/title>/i);
  if (titleMatch) return stripHtml(titleMatch[1]);
  const h1Match = String(html || '').match(/<h1\b[^>]*>([\s\S]*?)<\/h1>/i);
  return h1Match ? stripHtml(h1Match[1]) : '';
}

function extractReadableText(html) {
  return {
    title: extractTitle(html),
    text: stripHtml(html)
  };
}

function splitSentences(text) {
  const normalized = String(text || '').replace(/\s+/g, ' ').trim();
  if (!normalized) return [];
  const matches = normalized.match(/[^。！？!?\.]+[。！？!?\.]?/g) || [];
  return matches
    .map((sentence) => sentence.trim())
    .filter((sentence) => sentence.length >= 12)
    .slice(0, 24);
}

function compactSummary(sentences) {
  const selected = sentences.slice(0, 3);
  if (selected.length === 0) return 'Agent 未能从该页面提取到足够正文。';
  return selected.join(' ').slice(0, 600);
}

function summarizeTextForUrl(url, title, text) {
  const sentences = splitSentences(text);
  const keySentences = sentences.slice(0, 5).filter((sentence) => sentence.length <= 220);
  const fallback = sentences.find((sentence) => sentence.length > 0) || String(text || '').slice(0, 180).trim();
  const points = (keySentences.length ? keySentences : [fallback]).filter(Boolean).slice(0, 5);

  return {
    url,
    title: title || url,
    summary: compactSummary(sentences),
    keyPoints: points.map((sentence, index) => ({
      id: `point-${index + 1}`,
      claim: sentence.length > 80 ? `${sentence.slice(0, 77)}...` : sentence,
      explanation: '这是根据页面正文自动抽取的关键句。后续可以替换为真正 Agent/AI 生成的解释。',
      evidence: [
        {
          quote: sentence,
          confidence: 0.6
        }
      ]
    }))
  };
}

async function readUrlContent(url) {
  if (url.startsWith('file://')) {
    const filePath = new URL(url);
    return fs.readFileSync(filePath, 'utf8');
  }

  if (!/^https?:\/\//i.test(url)) {
    const localPath = path.resolve(url);
    return fs.readFileSync(localPath, 'utf8');
  }

  const response = await fetch(url, {
    headers: {
      'user-agent': 'ReadLens/0.1 (+local prototype)'
    }
  });
  if (!response.ok) throw new Error(`Fetch failed with HTTP ${response.status}`);
  return response.text();
}

async function summarizeUrl(url) {
  const html = await readUrlContent(url);
  const readable = extractReadableText(html);
  return summarizeTextForUrl(url, readable.title, readable.text);
}

module.exports = {
  decodeEntities,
  extractReadableText,
  summarizeTextForUrl,
  summarizeUrl,
  splitSentences
};
