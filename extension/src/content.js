(function () {
  if (globalThis.__readLensLoaded) return;
  globalThis.__readLensLoaded = true;

  const { validateAgentSummary } = globalThis.AgentReaderSchema;
  const { findQuoteInText } = globalThis.AgentReaderQuoteMatcher;
  const BRIDGE_BASE_URL = 'http://127.0.0.1:8765';
  const state = {
    launcher: null,
    panel: null,
    highlights: [],
    originalTitle: new Map(),
    lastRenderedSignature: '',
    detectedSummary: null,
    detectedUrl: '',
    detectTimer: null,
    lastKnownHref: location.href,
    pendingPointId: null
  };

  function getRequestedPointIdFromHash() {
    const rawHash = String(location.hash || '').replace(/^#/, '');
    if (!rawHash) return null;

    const directMatch = rawHash.match(/^(?:readlens|agent-reader)=(point-[\w-]+)$/i);
    if (directMatch) return directMatch[1];

    try {
      const params = new URLSearchParams(rawHash);
      const value = params.get('readlens') || params.get('agent-reader');
      return value && /^point-[\w-]+$/i.test(value) ? value : null;
    } catch (_error) {
      return null;
    }
  }

  function updateRequestedPointFromHash() {
    state.pendingPointId = getRequestedPointIdFromHash();
    return state.pendingPointId;
  }

  function clearReader() {
    for (const highlight of state.highlights) {
      const parent = highlight.parentNode;
      if (!parent) continue;
      parent.replaceChild(document.createTextNode(highlight.textContent || ''), highlight);
      parent.normalize();
    }
    state.highlights = [];
    state.originalTitle.forEach((title, node) => {
      if (title) node.setAttribute('title', title);
      else node.removeAttribute('title');
    });
    state.originalTitle.clear();
    if (state.panel) state.panel.remove();
    state.panel = null;
  }

  function clearPageDecorations() {
    clearReader();
    state.lastRenderedSignature = '';
    state.detectedSummary = null;
  }

  function isSkippableNode(node) {
    if (!node || !node.parentElement) return true;
    const parent = node.parentElement;
    if (!node.nodeValue || !node.nodeValue.trim()) return true;
    if (parent.closest('.agent-reader-panel, .agent-reader-highlight')) return true;
    return Boolean(parent.closest('script, style, noscript, textarea, input, select, option, svg, canvas'));
  }

  function collectTextNodes() {
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode(node) {
        return isSkippableNode(node) ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT;
      }
    });
    const nodes = [];
    let current = walker.nextNode();
    while (current) {
      nodes.push(current);
      current = walker.nextNode();
    }
    return nodes;
  }

  function wrapRangeInTextNode(textNode, start, end, point, evidence) {
    const range = document.createRange();
    range.setStart(textNode, start);
    range.setEnd(textNode, end);
    const span = document.createElement('span');
    span.className = 'agent-reader-highlight';
    span.dataset.agentReaderPointId = point.id;
    span.dataset.agentReaderQuote = evidence.quote;
    span.setAttribute('title', point.claim || point.explanation || evidence.quote);
    range.surroundContents(span);
    state.highlights.push(span);
    return span;
  }

  function highlightEvidence(summary) {
    const textNodes = collectTextNodes();
    const matchesByPoint = new Map();

    for (const point of summary.keyPoints) {
      for (const evidence of point.evidence) {
        let matched = false;
        for (const textNode of textNodes) {
          if (!textNode.isConnected || textNode.parentElement.closest('.agent-reader-highlight')) continue;
          const match = findQuoteInText(textNode.nodeValue, evidence.quote);
          if (!match.found) continue;
          const span = wrapRangeInTextNode(textNode, match.start, match.end, point, evidence);
          if (!matchesByPoint.has(point.id)) matchesByPoint.set(point.id, []);
          matchesByPoint.get(point.id).push(span);
          matched = true;
          break;
        }
        if (matched) break;
      }
    }

    return matchesByPoint;
  }

  function scrollToPoint(pointId) {
    if (!pointId) return;
    document.querySelectorAll('.agent-reader-highlight.agent-reader-active')
      .forEach((node) => node.classList.remove('agent-reader-active'));
    document.querySelectorAll('.agent-reader-point.agent-reader-point-active')
      .forEach((node) => node.classList.remove('agent-reader-point-active'));
    const pointButton = document.querySelector(`.agent-reader-point[data-agent-reader-point-id="${CSS.escape(pointId)}"]`);
    if (pointButton) pointButton.classList.add('agent-reader-point-active');
    const target = document.querySelector(`.agent-reader-highlight[data-agent-reader-point-id="${CSS.escape(pointId)}"]`);
    if (!target) return;
    target.classList.add('agent-reader-active');
    target.scrollIntoView({ behavior: 'smooth', block: 'center' });
    setTimeout(() => target.classList.remove('agent-reader-active'), 1800);
  }

  function createButton(label, className) {
    const button = document.createElement('button');
    button.type = 'button';
    button.className = className;
    button.textContent = label;
    return button;
  }

  function ensureLauncher() {
    if (state.launcher && state.launcher.isConnected) return state.launcher;

    const launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.className = 'agent-reader-launcher agent-reader-launcher-checking';
    launcher.innerHTML = '<span class="agent-reader-launcher-dot"></span><span class="agent-reader-launcher-text">ReadLens</span>';
    launcher.title = '正在检测 ReadLens 解读...';
    launcher.addEventListener('click', () => {
      if (state.detectedSummary) {
        renderReader(state.detectedSummary, { focusPointId: state.pendingPointId });
        setLauncherStatus('rendered', `已渲染 ${state.detectedSummary.keyPoints.length} 个关键点`);
        return;
      }
      detectSummaryForCurrentPage({ force: true, renderIfFound: true });
    });
    document.documentElement.append(launcher);
    state.launcher = launcher;
    return launcher;
  }

  function setLauncherStatus(status, label) {
    const launcher = ensureLauncher();
    launcher.className = `agent-reader-launcher agent-reader-launcher-${status}`;
    const text = launcher.querySelector('.agent-reader-launcher-text');
    if (text) text.textContent = label;

    const titles = {
      checking: '正在检测 Agent Bridge...',
      ready: '检测到当前页面已有 Agent 解读，点击展开。',
      rendered: 'Agent 解读已渲染，点击重新打开。',
      empty: '当前页面暂无 Agent 解读，点击重新检测。',
      offline: 'Agent Bridge 未连接，点击重新检测。',
      error: 'ReadLens 检测失败，点击重试。'
    };
    launcher.title = titles[status] || label;
  }

  function renderPanel(summary, matchesByPoint) {
    const panel = document.createElement('aside');
    panel.className = 'agent-reader-panel';

    const header = document.createElement('div');
    header.className = 'agent-reader-header';
    const title = document.createElement('h2');
    title.className = 'agent-reader-title';
    title.textContent = summary.title || 'Agent 页面解读';
    const controls = document.createElement('div');
    controls.className = 'agent-reader-controls';
    const collapse = createButton('收起', 'agent-reader-button');
    const close = createButton('关闭', 'agent-reader-button');
    controls.append(collapse, close);
    header.append(title, controls);

    const body = document.createElement('div');
    body.className = 'agent-reader-body';
    const summaryTitle = document.createElement('h3');
    summaryTitle.className = 'agent-reader-section-title';
    summaryTitle.textContent = '总结';
    const summaryText = document.createElement('p');
    summaryText.className = 'agent-reader-summary';
    summaryText.textContent = summary.summary;
    const pointsTitle = document.createElement('h3');
    pointsTitle.className = 'agent-reader-section-title';
    pointsTitle.textContent = '关键点';
    body.append(summaryTitle, summaryText, pointsTitle);

    let unmatchedCount = 0;
    for (const point of summary.keyPoints) {
      const pointButton = createButton('', 'agent-reader-point');
      pointButton.dataset.agentReaderPointId = point.id;
      const claim = document.createElement('p');
      claim.className = 'agent-reader-claim';
      claim.textContent = point.claim || '未命名关键点';
      const explanation = document.createElement('p');
      explanation.className = 'agent-reader-explanation';
      explanation.textContent = point.explanation || '没有补充解释。';
      const matchedCount = (matchesByPoint.get(point.id) || []).length;
      const meta = document.createElement('span');
      meta.className = 'agent-reader-meta';
      meta.textContent = matchedCount > 0 ? `已关联 ${matchedCount} 处原文` : '未匹配到原文引用';
      if (matchedCount === 0) unmatchedCount += 1;
      pointButton.append(claim, explanation, meta);
      pointButton.addEventListener('click', () => scrollToPoint(point.id));
      body.append(pointButton);
    }

    if (unmatchedCount > 0) {
      const empty = document.createElement('p');
      empty.className = 'agent-reader-empty';
      empty.textContent = `${unmatchedCount} 个关键点没有在当前页面找到对应 quote。可以让 Agent 输出更短、更精确的原文句子。`;
      body.append(empty);
    }

    collapse.addEventListener('click', () => {
      panel.classList.toggle('agent-reader-collapsed');
      collapse.textContent = panel.classList.contains('agent-reader-collapsed') ? '展开' : '收起';
    });
    close.addEventListener('click', clearReader);

    panel.append(header, body);
    document.documentElement.append(panel);
    state.panel = panel;
  }

  function renderReader(payload, options = {}) {
    const validation = validateAgentSummary(payload);
    if (!validation.ok) {
      console.warn('[ReadLens] Invalid payload:', validation.error);
      return;
    }
    const signature = JSON.stringify(validation.data);
    if (state.lastRenderedSignature === signature && state.panel) {
      if (options.focusPointId) setTimeout(() => scrollToPoint(options.focusPointId), 50);
      return;
    }
    clearReader();
    state.lastRenderedSignature = signature;
    const matchesByPoint = highlightEvidence(validation.data);
    renderPanel(validation.data, matchesByPoint);
    if (options.focusPointId) setTimeout(() => scrollToPoint(options.focusPointId), 120);
  }

  async function fetchSummaryForUrl(url) {
    const response = await fetch(`${BRIDGE_BASE_URL}/latest?url=${encodeURIComponent(url)}`);
    if (response.status === 404) return { status: 'empty', data: null };
    const body = await response.json();
    if (!response.ok || !body.ok) return { status: 'error', data: null };
    return { status: 'ready', data: body.data };
  }

  async function detectSummaryForCurrentPage(options = {}) {
    if (!/^https?:|^file:/.test(location.protocol)) return;
    state.pendingPointId = getRequestedPointIdFromHash();
    const currentUrl = location.href;
    if (!options.force && state.detectedUrl === currentUrl && state.detectedSummary) return;
    state.detectedUrl = currentUrl;
    setLauncherStatus('checking', '检测中...');

    try {
      const result = await fetchSummaryForUrl(currentUrl);
      if (result.status === 'empty') {
        state.detectedSummary = null;
        setLauncherStatus('empty', '暂无解读');
        if (state.panel) clearPageDecorations();
        return;
      }
      if (result.status !== 'ready') {
        state.detectedSummary = null;
        setLauncherStatus('error', '检测失败');
        return;
      }

      const validation = validateAgentSummary(result.data);
      if (!validation.ok) {
        state.detectedSummary = null;
        setLauncherStatus('error', '数据异常');
        return;
      }

      state.detectedSummary = validation.data;
      setLauncherStatus('ready', `有解读 · ${validation.data.keyPoints.length} 点`);
      if (options.renderIfFound) {
        renderReader(validation.data, { focusPointId: state.pendingPointId });
        setLauncherStatus('rendered', `已渲染 ${validation.data.keyPoints.length} 点`);
      }
    } catch (_error) {
      state.detectedSummary = null;
      setLauncherStatus('offline', 'Bridge 未连接');
    }
  }

  function scheduleDetect(delay, options = {}) {
    if (state.detectTimer) clearTimeout(state.detectTimer);
    state.detectTimer = setTimeout(() => detectSummaryForCurrentPage(options), delay);
  }

  function handlePossibleUrlChange() {
    if (state.lastKnownHref === location.href) return;
    state.lastKnownHref = location.href;
    state.pendingPointId = getRequestedPointIdFromHash();
    clearPageDecorations();
    scheduleDetect(350, { renderIfFound: true });
    setTimeout(() => detectSummaryForCurrentPage({ force: true, renderIfFound: true }), 1500);
  }

  function installUrlChangeWatcher() {
    if (globalThis.__readLensUrlWatcherInstalled) return;
    globalThis.__readLensUrlWatcherInstalled = true;

    const notify = () => setTimeout(handlePossibleUrlChange, 0);
    for (const method of ['pushState', 'replaceState']) {
      const original = history[method];
      history[method] = function patchedHistoryMethod() {
        const result = original.apply(this, arguments);
        notify();
        return result;
      };
    }
    window.addEventListener('popstate', notify);
    window.addEventListener('hashchange', notify);
    setInterval(handlePossibleUrlChange, 1200);
  }

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || !message.type) return;
    if (message.type === 'AGENT_READER_RENDER') renderReader(message.payload);
    if (message.type === 'AGENT_READER_CLEAR') clearPageDecorations();
  });

  state.pendingPointId = getRequestedPointIdFromHash();
  ensureLauncher();
  installUrlChangeWatcher();

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', () => scheduleDetect(250, { renderIfFound: true }), { once: true });
  } else {
    scheduleDetect(250, { renderIfFound: true });
  }
})();
