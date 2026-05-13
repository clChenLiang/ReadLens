# ReadLens v0.1.0 Release Notes

ReadLens connects an agent-generated page interpretation with the original webpage.

## What is included

- Chrome MV3 extension that auto-detects matching summaries from a local bridge.
- Floating page panel with summary, key points, and quote-linked highlights.
- `readlens` local CLI (`agent-reader` compatibility alias) and bridge API for storing/retrieving structured summaries.
- `readlens` Codex/agent skill with the Chrome extension bundled in `references/`.
- Agent reply jump links such as `#readlens=point-3`, which open the page, render the panel, select the point, and scroll to the original quote.

## Install from the full package

1. Unzip `readlens-0.1.0.zip`.
2. Install the Chrome extension:
   - Open `chrome://extensions/`.
   - Enable Developer mode.
   - Click Load unpacked.
   - Select the package's `extension/` directory.
3. Start using the CLI:

```bash
cd readlens-0.1.0
bin/readlens summarize https://example.com/article
```

## Install the skill package

1. Unzip `readlens-skill-0.1.0.zip` into your agent skills directory as `readlens/`.
2. Install the bundled Chrome extension from:

```text
readlens/references/readlens-extension
```

The current skill points to this development workspace for the bridge CLI. For another machine, either install the full package at the same path or update `SKILL.md` command paths to that machine's full package path.

## Verify

```bash
npm run check
npm test
curl -fsS http://127.0.0.1:8765/health
```

## Known limitations

- The built-in `readlens summarize` command is a heuristic MVP; best results come from a real agent writing the JSON with exact page quotes.
- Quote matching is text-based with whitespace normalization, not semantic matching.
- Chrome Web Store publishing will need icons, screenshots, privacy copy, and store listing metadata.
