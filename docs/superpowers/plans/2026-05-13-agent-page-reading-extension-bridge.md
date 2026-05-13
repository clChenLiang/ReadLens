# Agent Page Reading Bridge Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a local HTTP bridge so Agent output can be saved by URL and loaded by the browser extension without manual JSON paste.

**Architecture:** A small Node.js server stores validated Agent summaries in memory and optionally in a JSON file. The extension popup gets a "load from bridge" button that calls `http://127.0.0.1:8765/latest?url=<current-url>` and then renders the returned summary into the current tab.

**Tech Stack:** Node.js built-in `http`, Chrome MV3 popup fetch, existing schema validator, Node test runner.

---

## Files
- `bridge/server.js`: local bridge creation, request routing, storage, and validation.
- `bridge/cli.js`: CLI entrypoint for `serve`, `put`, and `get`.
- `tests/bridgeServer.test.js`: HTTP API tests.
- `extension/manifest.json`: add localhost host permission.
- `extension/src/popup.html`: add bridge load button.
- `extension/src/popup.js`: fetch bridge data for active tab and render.
- `README.md`: usage instructions.
- `package.json`: scripts for bridge and tests.

## API
- `GET /health` -> `{ "ok": true }`
- `PUT /summary` with Agent JSON body -> validates and stores by `url`.
- `GET /latest?url=<url>` -> latest summary for the requested URL, or latest stored summary if URL is omitted.

## Tasks
- [ ] Write tests for health, PUT validation, GET by URL, and 404 missing summary.
- [ ] Implement bridge server to satisfy tests.
- [ ] Add CLI commands for starting server and putting/getting summaries.
- [ ] Add popup button to load from `127.0.0.1:8765`.
- [ ] Update docs with manual paste and bridge workflows.
- [ ] Verify tests, syntax checks, and CLI smoke test.
