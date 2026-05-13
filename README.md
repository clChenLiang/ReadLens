# ReadLens

A Chrome MV3 extension prototype for Agent-assisted page reading.

The intended workflow is now:

```text
readlens summarize <url> -> bridge stores summary -> browser opens URL -> extension auto-loads summary -> page shows overlay and highlights
```

The current summarizer is an MVP heuristic extractor. It fetches or reads the page, extracts visible text, creates quote-linked key points, and writes them into the local bridge. Later this command can be replaced by a real Agent/AI summarizer while keeping the same bridge and extension contract.

## Install the extension

1. Open `chrome://extensions/`.
2. Enable Developer Mode.
3. Click **Load unpacked**.
4. Select this directory:

```text
./extension
```

## One-command summarize workflow

Summarize and open a URL. If the local bridge is not running, this command starts it automatically in the background:

```bash
bin/readlens summarize fixtures/sample-article.html
```

For a remote article:

```bash
bin/readlens summarize https://example.com/article
```

What happens:

1. `readlens summarize <url>` starts the bridge if needed. `agent-reader` remains as a compatibility alias.
2. It reads the page.
3. It generates Agent-summary-compatible JSON.
4. It PUTs the JSON into `http://127.0.0.1:8765/summary`.
5. It opens the URL in the browser.
6. The extension content script auto-requests `http://127.0.0.1:8765/latest?url=<current-page-url>`.
7. If a matching summary exists, the page shows a top-right ReadLens orb and auto-renders the panel with quote highlights.
8. The panel supports **图谱 / 文本** modes: the graph view gives a knowledge-map overview, while the text view keeps detailed explanations and source links.

The floating orb stays in the top-right corner, expands on hover, and uses color to show states: checking, bridge offline, no summary, waking Codex, waiting for a result, summary ready, and rendered.

When the current page has no stored interpretation, click the orb to ask the local bridge to wake Codex in Terminal with a `readlens` skill prompt for the current URL. Keep `bin/readlens serve` running so the extension can call the local bridge. After Codex writes the summary back with `readlens put -`, the extension polls and renders it automatically.

If the readable page URL differs from the URL you entered, store the entered URL as an alias:

```bash
bin/readlens summarize https://x.com/RobinSeun/article/2054139315052310724 \
  --alias https://x.com/RobinSeun/status/2054139315052310724
```

The bridge also ignores URL hashes, common tracking parameters such as `utm_*`, and query parameter ordering when matching summaries.

You can still run the bridge manually if you want foreground logs:

```bash
bin/readlens serve
```

Stop the local bridge when needed:

```bash
bin/readlens stop
```

Use `--no-open` if you only want to generate and store the summary:

```bash
bin/readlens summarize fixtures/sample-article.html --no-open
```

## Manual workflows

Push an existing Agent JSON file into the bridge:

```bash
bin/readlens put fixtures/sample-agent-summary.json
```

Get the latest summary for a URL:

```bash
bin/readlens get "file:///absolute/path/to/readlens/fixtures/sample-article.html"
```

Or paste JSON manually in the extension popup and click **渲染到页面**.

## Agent JSON contract

```json
{
  "url": "https://example.com/article",
  "aliases": ["https://example.com/status/123"],
  "title": "Article title",
  "summary": "Short page summary.",
  "keyPoints": [
    {
      "id": "point-1",
      "claim": "A key point",
      "explanation": "Why it matters",
      "evidence": [
        {
          "quote": "A short exact quote from the original page",
          "confidence": 0.8
        }
      ]
    }
  ]
}
```

For the MVP, `quote` should be short and close to exact source text. The plugin normalizes whitespace, but it does not yet perform semantic fuzzy matching.


## Agent reply jump links

Agent replies can link directly into a specific interpretation point by appending a hash to the original page URL:

```text
https://example.com/article#readlens=point-3
```

When the Chrome extension is installed and the bridge has a matching summary, that link opens the original page, renders the floating panel, selects the matching key-point card, scrolls to the source quote, and flashes the highlight.

## Skill package

The companion Codex/agent skill is available at:

```text
skills/readlens
```

The Chrome extension is bundled inside the skill at:

```text
skills/readlens/references/readlens-extension
```

See `RELEASE.md` for release artifact details.

## Bridge API

```text
GET /health
PUT /summary
GET /latest?url=<url>
POST /wake-codex
```

## Development

Run tests:

```bash
npm test
```

Run syntax checks:

```bash
npm run check
```
