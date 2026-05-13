---
name: readlens
description: Use when the user gives a web page URL or local HTML file and asks Codex to summarize, interpret, annotate, locate key points in the original page, render the result in Chrome, or use the ReadLens browser extension.
---

# ReadLens

Use this to produce a quote-linked page interpretation and render it through the local ReadLens Chrome extension.

## Required local tool

Use the ReadLens CLI from the installed repository/package. Prefer these commands in order:

```bash
readlens
bin/readlens
agent-reader
bin/agent-reader
```

If none is available, tell the user to install or clone ReadLens and run commands from the project root.

Bundled Chrome extension directory, when this skill is installed as `readlens`:

```text
<skills-dir>/readlens/references/readlens-extension
```

Install guide:

```text
<skills-dir>/readlens/references/install-chrome-extension.md
```

## First-run extension check

Before rendering in Chrome, check the bridge and whether the extension is likely installed. If the user has not installed the extension, tell them once:

```text
需要先安装 ReadLens Chrome 插件：
1. 打开 chrome://extensions/
2. 开启 Developer mode
3. 点击 Load unpacked
4. 选择 <skills-dir>/readlens/references/readlens-extension
```

If the extension was updated, tell the user to click Reload on the ReadLens card in `chrome://extensions/`.

## Workflow

1. Fetch/read the URL content yourself when possible. Use browser/Chrome if login, dynamic rendering, or visual context is needed.
2. Write a real Agent summary JSON with exact source quotes, not only the heuristic `summarize` output.
3. Store the JSON in the bridge:

```bash
cat /tmp/readlens-summary.json | readlens put -
```

4. Open the URL in Chrome. The extension content script auto-loads matching bridge data for `location.href`.
5. Return a short answer with the normal page link and point jump links.
6. If the user wants only a quick prototype result, `readlens summarize <url>` is acceptable, but say it is heuristic.

## Browser extension wake flow

If a page has no stored interpretation, the ReadLens floating orb can call the local bridge endpoint `POST /wake-codex`. The bridge opens Terminal and starts a non-interactive `codex exec --skip-git-repo-check -C <readlens-root>` run with a prompt to use this `readlens` skill for the current URL. After the new Codex run stores JSON via `readlens put -`, the extension polls `/latest` and renders the result.

For this to work, the bridge must be running:

```bash
readlens serve
```

If the orb reports that the bridge is offline, start the bridge and click the orb again.

## JSON contract

```json
{
  "url": "https://example.com/article",
  "aliases": ["https://example.com/article/"],
  "title": "Article title",
  "summary": "Concise overall interpretation.",
  "keyPoints": [
    {
      "id": "point-1",
      "claim": "Key point in your words.",
      "explanation": "Why it matters or how to read it.",
      "evidence": [
        {
          "quote": "Exact short quote copied from the source page.",
          "confidence": 0.9
        }
      ]
    }
  ]
}
```

## Quote rules

- Quotes must be exact substrings from visible page text whenever possible.
- Keep each quote short: one sentence or a distinctive phrase is best.
- Prefer 3-6 key points.
- If a page is long, choose quotes from the sections that support the main claims.
- If exact quotes are impossible because content is rendered dynamically or behind auth, explain the limitation and use Chrome/browser to inspect the page.

## URL matching

The JSON `url` must match what Chrome will load:

- Remote pages: use the exact `https://...` URL opened in Chrome.
- Add common aliases without trailing slash or localized path variants when useful.
- Local files: use an absolute `file://` URL, not a relative path.
- The bridge ignores URL hash for matching, so `#readlens=point-3` still resolves the same summary. `#agent-reader=point-3` remains supported as a compatibility alias.

For local file conversion:

```bash
node -e "console.log(new URL('file://' + require('path').resolve(process.argv[1])).href)" path/to/file.html
```

## Agent reply format

After storing the summary and opening Chrome, return links that users can click from the agent:

```markdown
已解读并写入插件。

打开页面：
[查看原文 + 自动加载解读](https://example.com/article)

关键跳转：
1. [关键点标题](https://example.com/article#readlens=point-1)
2. [关键点标题](https://example.com/article#readlens=point-2)
```

Rules:

- Build jump links as `<summary.url>#readlens=<point.id>`.
- Use the opened page URL as the base URL, without an existing hash.
- Keep link labels short and based on each point claim.
- The Chrome extension will auto-open the panel and scroll/highlight the quote for that point.

## Bridge operations

Start bridge manually if needed:

```bash
readlens serve
```

Health check:

```bash
curl -fsS http://127.0.0.1:8765/health
```

If `put -` fails because bridge is not running, start `serve` in the background or run `readlens summarize <url> --no-open` once to autostart it, then put your real JSON.
