# Agent Page Reading Extension Design

## Goal
Build a first Chrome extension MVP that lets an external Agent provide structured page interpretation data, then renders that interpretation as an overlay on the original webpage with quote-linked highlights.

## MVP Boundary
The extension does not call an AI API. The Agent, Codex, or another external tool is responsible for reading a link and producing JSON. The user pastes that JSON into the extension popup while viewing the target page. The extension stores the JSON for that tab, injects a content script, highlights matched quote text, and shows a floating interpretation panel.

## Data Contract
The first version accepts this JSON shape:

```json
{
  "url": "https://example.com/article",
  "title": "Article title",
  "summary": "A short summary of the page.",
  "keyPoints": [
    {
      "id": "p1",
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

`selector`, `xpath`, and offsets can be added later, but MVP anchoring is quote-based.

## UX
The popup has a textarea for Agent JSON and buttons to render or clear. The webpage gets a collapsible right-side panel containing title, summary, key points, and evidence counts. Matched source text is highlighted inline. Clicking a key point scrolls to its first matched quote. Hovering a highlight shows the key point claim.

## Architecture
- `extension/manifest.json`: Chrome MV3 declaration.
- `extension/src/popup.html`, `popup.css`, `popup.js`: data entry and extension command UI.
- `extension/src/content.css`, `content.js`: overlay rendering, DOM text matching, highlighting, cleanup, and scroll behavior.
- `extension/src/agentSchema.js`: validation and normalization for Agent JSON.
- `extension/src/quoteMatcher.js`: pure quote matching helpers shared by tests and content script.
- `tests/*.test.js`: Node tests for schema validation and quote matching.

## Safety
The content script only modifies the live DOM with temporary wrapper spans and overlay nodes. Clearing removes injected nodes and restores text nodes. No page content is persisted except the pasted interpretation in Chrome local storage keyed by tab URL.

## Future Extension
A later bridge can expose `http://127.0.0.1:8765/latest?url=...`, allowing the plugin to fetch Agent output automatically. The MVP keeps this out of scope to validate the interaction first.
