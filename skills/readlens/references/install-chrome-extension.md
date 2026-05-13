# Install ReadLens Chrome extension

The extension is bundled with this skill at:

```text
<skills-dir>/readlens/references/readlens-extension
```

Install or refresh it in Chrome:

1. Open `chrome://extensions/`.
2. Enable Developer mode.
3. Click Load unpacked.
4. Select the bundled extension directory above.
5. After code changes, click Reload on the ReadLens extension card.

When installed, the extension detects summaries from the local bridge at `http://127.0.0.1:8765` and renders a floating panel on matching pages.
