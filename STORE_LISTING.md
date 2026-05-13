# ReadLens Chrome Web Store Draft

## Name
ReadLens

## Short description
AI page explanations anchored to the original source.

## Full description
ReadLens renders agent-generated summaries, key points, and source-linked highlights on top of the original webpage.

Use it with the local `readlens` / `agent-reader` bridge:

1. Ask your agent to summarize a URL with exact source quotes.
2. Store the structured summary in the local bridge.
3. Open the original page.
4. ReadLens automatically detects matching data, opens a floating interpretation panel, and highlights the quoted source text.

ReadLens is designed for source-grounded reading: every key point can link back to the original quote on the page.

## Single purpose statement
ReadLens displays locally supplied, quote-linked AI reading notes on the webpage the notes refer to.

## Category
Productivity

## Privacy summary
ReadLens reads webpage text locally in the browser only to match quoted evidence and render highlights. It does not send page content, browsing history, summaries, or analytics to any remote server. It only talks to the local bridge at `http://127.0.0.1:8765` or `http://localhost:8765` when the user runs the companion CLI.

## Permission justification
- `activeTab`: lets the popup render or clear notes in the current tab.
- `storage`: stores manually pasted summaries for the current page.
- `scripting`: injects the content script if the popup is used before the content script is available.
- host permissions: required to render the overlay on user-selected webpages and to fetch summaries from the local bridge.
