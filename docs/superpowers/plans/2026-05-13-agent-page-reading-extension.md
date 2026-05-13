# Agent Page Reading Extension Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build a Chrome MV3 extension that renders Agent-provided page summaries as a floating panel and inline quote highlights.

**Architecture:** Agent interpretation JSON is pasted into the popup, validated, saved for the active tab URL, and sent to the content script. The content script uses quote-based anchoring to wrap matched text nodes, render a side panel, and support click-to-source navigation.

**Tech Stack:** Chrome Manifest V3, vanilla JavaScript, CSS, Node.js built-in test runner.

---

## Files
- `package.json`: test scripts and project metadata.
- `extension/manifest.json`: extension definition.
- `extension/src/agentSchema.js`: validates and normalizes Agent JSON.
- `extension/src/quoteMatcher.js`: normalizes text and finds exact/fuzzy quote matches.
- `extension/src/content.js`: page overlay, highlighting, cleanup, message handling.
- `extension/src/content.css`: overlay and highlight styles.
- `extension/src/popup.html`: popup UI.
- `extension/src/popup.css`: popup styles.
- `extension/src/popup.js`: popup behavior, storage, messaging.
- `tests/agentSchema.test.js`: JSON contract tests.
- `tests/quoteMatcher.test.js`: quote matching tests.
- `fixtures/sample-agent-summary.json`: sample input for manual testing.
- `fixtures/sample-article.html`: local page for manual extension testing.

## Tasks

### Task 1: Schema and quote matcher tests
- [ ] Create failing tests for valid schema normalization, invalid inputs, exact quote matching, and whitespace-insensitive matching.
- [ ] Run `node --test tests/*.test.js` and confirm missing modules fail.

### Task 2: Pure schema and matcher implementation
- [ ] Implement `validateAgentSummary`, `normalizeText`, and `findQuoteInText`.
- [ ] Run `node --test tests/*.test.js` and confirm tests pass.

### Task 3: Extension shell
- [ ] Add MV3 manifest, popup HTML/CSS/JS, content CSS, sample fixture files.
- [ ] Popup validates pasted JSON, stores it by URL, and sends `AGENT_READER_RENDER` to the active tab.

### Task 4: Content script overlay and highlighting
- [ ] Content script validates data, removes existing overlay, highlights evidence quotes, renders side panel, supports clear and scroll.
- [ ] Avoid script/style/noscript/textarea/input nodes while matching text.

### Task 5: Verification
- [ ] Run `node --test tests/*.test.js`.
- [ ] Run a syntax check over extension JavaScript with `node --check`.
- [ ] Inspect file layout and provide Chrome loading instructions.
