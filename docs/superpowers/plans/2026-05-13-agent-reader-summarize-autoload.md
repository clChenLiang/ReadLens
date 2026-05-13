# Agent Reader Summarize Autoload Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add `agent-reader summarize <url>` so a user can generate bridge data for a URL, open it in the browser, and have the extension auto-load the interpretation.

**Architecture:** The CLI gets page HTML, extracts readable text, builds a heuristic MVP summary JSON, PUTs it to the local bridge, and opens the URL. The content script auto-fetches `http://127.0.0.1:8765/latest?url=<location.href>` after page load and renders if data exists.

**Tech Stack:** Node.js built-in fetch/http/fs, shell wrapper, Chrome MV3 content script.

---

## Files
- `bridge/summarizer.js`: fetch/read URL content and produce MVP Agent summary JSON.
- `bridge/cli.js`: add `summarize <url>` command and bridge auto-start helper.
- `bin/agent-reader`: reusable command wrapper.
- `extension/src/content.js`: auto-load current page summary from bridge on page load.
- `tests/summarizer.test.js`: summary extraction tests.
- `README.md`: new one-command workflow.
