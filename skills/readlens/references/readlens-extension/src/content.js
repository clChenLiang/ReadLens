(function () {
  if (globalThis.__readLensLoaded) return;
  globalThis.__readLensLoaded = true;

  const { validateAgentSummary } = globalThis.AgentReaderSchema;
  const { findQuoteInText } = globalThis.AgentReaderQuoteMatcher;
  const BRIDGE_BASE_URL = 'http://127.0.0.1:8765';
  const SERVE_COMMAND = 'readlens serve';
  const POLL_INTERVAL_MS = 1000;
  const MAX_WAKE_POLL_ATTEMPTS = 180;
  const SVG_NS = 'http://www.w3.org/2000/svg';
  const state = {
    launcher: null,
    panel: null,
    highlights: [],
    originalTitle: new Map(),
    lastRenderedSignature: '',
    detectedSummary: null,
    detectedUrl: '',
    detectTimer: null,
    wakePollTimer: null,
    loadingTimer: null,
    lastKnownHref: location.href,
    pendingPointId: null,
    viewMode: 'map',
    isInterpreting: false,
    wakeStartedAt: 0,
    launcherStatus: '',
    bridgeGuide: null
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

  function createSvgElement(tag, attrs = {}) {
    const element = document.createElementNS(SVG_NS, tag);
    Object.entries(attrs).forEach(([key, value]) => {
      if (value === undefined || value === null) return;
      element.setAttribute(key, String(value));
    });
    return element;
  }

  function truncateText(value, maxLength) {
    const text = String(value || '').replace(/\s+/g, ' ').trim();
    if (text.length <= maxLength) return text;
    return `${text.slice(0, Math.max(0, maxLength - 1))}…`;
  }

  function positionMapTooltip(event, tooltip, container) {
    const rect = container.getBoundingClientRect();
    const tooltipRect = tooltip.getBoundingClientRect();
    const x = Math.min(Math.max(event.clientX - rect.left + 14, 10), Math.max(10, rect.width - tooltipRect.width - 10));
    const y = Math.min(Math.max(event.clientY - rect.top + 14, 10), Math.max(10, rect.height - tooltipRect.height - 10));
    tooltip.style.left = `${x}px`;
    tooltip.style.top = `${y}px`;
  }

  function setMapTooltipContent(tooltip, point, matchedCount) {
    tooltip.textContent = '';
    const title = document.createElement('strong');
    title.textContent = point.claim || '未命名关键点';
    const detail = document.createElement('p');
    detail.textContent = point.explanation || '没有补充解释。';
    const quote = document.createElement('blockquote');
    quote.textContent = point.evidence && point.evidence[0] && point.evidence[0].quote
      ? `“${truncateText(point.evidence[0].quote, 96)}”`
      : '暂无原文 quote';
    const meta = document.createElement('span');
    meta.textContent = matchedCount > 0 ? `已关联 ${matchedCount} 处原文，点击跳转` : '未匹配到原文引用';
    tooltip.append(title, detail, quote, meta);
  }

  function buildPointHierarchy(points) {
    const nodes = points.map((point, index) => ({
      point,
      index,
      parent: null,
      children: [],
      depth: 0,
      row: 0,
      outline: '',
      x: 0,
      y: 0
    }));
    const byId = new Map(nodes.map((node) => [node.point.id, node]));
    const roots = [];

    for (const node of nodes) {
      const parentId = node.point.parentId;
      const parent = parentId && parentId !== node.point.id ? byId.get(parentId) : null;
      if (parent) {
        node.parent = parent;
        parent.children.push(node);
      } else {
        roots.push(node);
      }
    }

    const ordered = [];
    function visit(node, depth, outline) {
      node.depth = depth;
      node.outline = outline;
      node.row = ordered.length;
      node.x = 170 + depth * 150;
      node.y = 82 + node.row * 78;
      ordered.push(node);
      node.children.forEach((child, childIndex) => visit(child, depth + 1, `${outline}.${childIndex + 1}`));
    }

    roots.forEach((root, rootIndex) => visit(root, 0, `${rootIndex + 1}`));
    return { nodes, roots, ordered };
  }

  function ensureLauncher() {
    if (state.launcher && state.launcher.isConnected) return state.launcher;

    const launcher = document.createElement('button');
    launcher.type = 'button';
    launcher.className = 'agent-reader-launcher agent-reader-launcher-checking';
    launcher.innerHTML = '<span class="agent-reader-orb-mark">R</span><span class="agent-reader-launcher-text">ReadLens</span><span class="agent-reader-launcher-loading-text" aria-live="polite"></span>';
    launcher.title = '正在检测 ReadLens 解读...';
    launcher.addEventListener('click', async () => {
      if (state.isInterpreting) return;
      if (state.launcherStatus === 'offline') {
        showBridgeOfflineGuide();
        return;
      }
      if (state.detectedSummary) {
        renderReader(state.detectedSummary, { focusPointId: state.pendingPointId });
        setLauncherStatus('rendered', `已渲染 ${state.detectedSummary.keyPoints.length} 个关键点`);
        return;
      }
      await wakeCodexForCurrentPage();
    });
    document.documentElement.append(launcher);
    state.launcher = launcher;
    return launcher;
  }

  function formatElapsedSeconds(startedAt) {
    const elapsed = Math.max(0, Math.floor((Date.now() - startedAt) / 1000));
    const minutes = Math.floor(elapsed / 60);
    const seconds = String(elapsed % 60).padStart(2, '0');
    return `${minutes}:${seconds}`;
  }

  function stopLauncherLoadingTimer() {
    if (!state.loadingTimer) return;
    clearInterval(state.loadingTimer);
    state.loadingTimer = null;
  }

  function updateLauncherLoadingText() {
    const launcher = ensureLauncher();
    const loadingText = launcher.querySelector('.agent-reader-launcher-loading-text');
    if (!loadingText || !state.wakeStartedAt) return;
    loadingText.textContent = `正在解读 ${formatElapsedSeconds(state.wakeStartedAt)}`;
  }

  function startLauncherLoadingTimer() {
    state.isInterpreting = true;
    if (!state.wakeStartedAt) state.wakeStartedAt = Date.now();
    updateLauncherLoadingText();
    if (state.loadingTimer) return;
    state.loadingTimer = setInterval(updateLauncherLoadingText, 1000);
  }

  function setLauncherStatus(status, label) {
    const launcher = ensureLauncher();
    const isLoadingStatus = status === 'waking' || status === 'waiting';
    if (state.launcherStatus !== status) {
      launcher.className = `agent-reader-launcher agent-reader-launcher-${status}`;
    }
    state.launcherStatus = status;
    const text = launcher.querySelector('.agent-reader-launcher-text');
    if (text) text.textContent = label;

    if (isLoadingStatus) {
      startLauncherLoadingTimer();
    } else {
      state.isInterpreting = false;
      state.wakeStartedAt = 0;
      stopLauncherLoadingTimer();
      const loadingText = launcher.querySelector('.agent-reader-launcher-loading-text');
      if (loadingText) loadingText.textContent = '';
    }

    const titles = {
      checking: '正在检测 Agent Bridge...',
      ready: '检测到当前页面已有 Agent 解读，点击展开。',
      rendered: 'Agent 解读已渲染，点击重新打开。',
      empty: '当前页面暂无解读，点击解读此页。',
      waking: '正在唤醒 Codex 解读此页...',
      waiting: '正在解读此页，完成后会自动加载。',
      offline: 'Agent Bridge 未连接，请先启动 readlens serve。',
      error: 'ReadLens 检测失败，点击重试。'
    };
    launcher.title = titles[status] || label;
  }

  function showBridgeOfflineGuide() {
    if (state.bridgeGuide && state.bridgeGuide.isConnected) {
      state.bridgeGuide.classList.remove('agent-reader-hidden');
      return;
    }

    const guide = document.createElement('aside');
    guide.className = 'agent-reader-bridge-guide';

    const header = document.createElement('div');
    header.className = 'agent-reader-bridge-guide-header';
    const title = document.createElement('strong');
    title.textContent = '启动 ReadLens Bridge';
    const close = createButton('×', 'agent-reader-bridge-guide-close');
    close.setAttribute('aria-label', '关闭启动指引');
    close.addEventListener('click', () => guide.remove());
    header.append(title, close);

    const description = document.createElement('p');
    description.textContent = '浏览器插件无法直接启动本地 Codex/Node 服务。请在终端运行下面命令，启动后本页会自动检测并可继续解读。';

    const command = document.createElement('code');
    command.className = 'agent-reader-bridge-command';
    command.textContent = SERVE_COMMAND;

    const copy = createButton('复制命令', 'agent-reader-bridge-copy');
    copy.addEventListener('click', async () => {
      try {
        await navigator.clipboard.writeText(SERVE_COMMAND);
        copy.textContent = '已复制';
      } catch (_error) {
        copy.textContent = '复制失败';
      }
      setTimeout(() => { copy.textContent = '复制命令'; }, 1400);
    });

    const fallback = document.createElement('small');
    fallback.textContent = '如果 readlens 不可用，请在 ReadLens 目录尝试 ./bin/readlens serve 或 bin/agent-reader serve。';

    guide.append(header, description, command, copy, fallback);
    document.documentElement.append(guide);
    state.bridgeGuide = guide;
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

    const viewToggle = document.createElement('div');
    viewToggle.className = 'agent-reader-view-toggle';
    const mapTab = createButton('图谱', 'agent-reader-tab agent-reader-tab-active');
    const textTab = createButton('文本', 'agent-reader-tab');
    viewToggle.append(mapTab, textTab);

    const summaryText = document.createElement('p');
    summaryText.className = 'agent-reader-summary';
    summaryText.textContent = summary.summary;

    const mapView = document.createElement('div');
    mapView.className = 'agent-reader-view agent-reader-map';
    const mapFrame = document.createElement('div');
    mapFrame.className = 'agent-reader-map-frame';
    const mapSvg = document.createElementNS(SVG_NS, 'svg');
    mapSvg.setAttribute('class', 'agent-reader-map-svg');
    mapSvg.setAttribute('role', 'img');
    mapSvg.setAttribute('aria-label', 'ReadLens knowledge map');
    const mapLinks = createSvgElement('g', { class: 'agent-reader-map-links' });
    const mapNodes = createSvgElement('g', { class: 'agent-reader-map-nodes' });
    mapSvg.append(mapLinks, mapNodes);
    const mapTooltip = document.createElement('div');
    mapTooltip.className = 'agent-reader-tooltip agent-reader-tooltip-hidden';
    mapFrame.append(mapSvg, mapTooltip);
    mapView.append(mapFrame);

    const textView = document.createElement('div');
    textView.className = 'agent-reader-view agent-reader-text agent-reader-hidden';
    const pointsTitle = document.createElement('h3');
    pointsTitle.className = 'agent-reader-section-title';
    pointsTitle.textContent = '关键点';
    textView.append(pointsTitle);

    body.append(viewToggle, summaryText, mapView, textView);

    const hierarchy = buildPointHierarchy(summary.keyPoints);
    const nodeByPointId = new Map(hierarchy.nodes.map((node) => [node.point.id, node]));

    let unmatchedCount = 0;
    for (const point of summary.keyPoints) {
      const hierarchyNode = nodeByPointId.get(point.id);
      const matchedCount = (matchesByPoint.get(point.id) || []).length;
      if (matchedCount === 0) unmatchedCount += 1;

      const pointButton = createButton('', 'agent-reader-point agent-reader-text-point');
      pointButton.dataset.agentReaderPointId = point.id;
      const claim = document.createElement('p');
      claim.className = 'agent-reader-claim';
      const outlineLabel = document.createElement('span');
      outlineLabel.className = 'agent-reader-outline-label';
      outlineLabel.textContent = hierarchyNode ? hierarchyNode.outline : '';
      const claimText = document.createElement('span');
      claimText.textContent = point.claim || '未命名关键点';
      claim.append(outlineLabel, claimText);
      const explanation = document.createElement('p');
      explanation.className = 'agent-reader-explanation';
      explanation.textContent = point.explanation || '没有补充解释。';
      const meta = document.createElement('span');
      meta.className = 'agent-reader-meta';
      meta.textContent = matchedCount > 0 ? `已关联 ${matchedCount} 处原文` : '未匹配到原文引用';
      pointButton.append(claim, explanation, meta);
      pointButton.addEventListener('click', () => scrollToPoint(point.id));
      textView.append(pointButton);
    }

    const rows = Math.max(hierarchy.ordered.length, 1);
    const maxDepth = hierarchy.ordered.reduce((depth, node) => Math.max(depth, node.depth), 0);
    const mapWidth = Math.max(520, 270 + maxDepth * 150);
    const mapHeight = Math.max(250, 120 + rows * 78);
    const centerX = 72;
    const centerY = Math.max(88, mapHeight / 2);
    mapSvg.setAttribute('viewBox', `0 0 ${mapWidth} ${mapHeight}`);
    mapSvg.style.minWidth = `${mapWidth}px`;

    const centerNode = createSvgElement('g', { class: 'agent-reader-map-overview', tabindex: '0', transform: `translate(${centerX}, ${centerY})` });
    const centerHalo = createSvgElement('circle', { cx: 0, cy: 0, r: 50, class: 'agent-reader-map-halo' });
    const centerCircle = createSvgElement('circle', { cx: 0, cy: 0, r: 42, class: 'agent-reader-map-center-node' });
    const centerLabel = createSvgElement('text', { x: 0, y: -6, 'text-anchor': 'middle', class: 'agent-reader-map-center-label' });
    centerLabel.textContent = '总览';
    const centerHint = createSvgElement('text', { x: 0, y: 15, 'text-anchor': 'middle', class: 'agent-reader-map-center-hint' });
    centerHint.textContent = `${summary.keyPoints.length} 个关键点`;
    centerNode.append(centerHalo, centerCircle, centerLabel, centerHint);
    centerNode.addEventListener('mouseenter', (event) => {
      mapTooltip.textContent = '';
      const title = document.createElement('strong');
      title.textContent = summary.title || '页面总览';
      const detail = document.createElement('p');
      detail.textContent = summary.summary || '暂无总览。';
      const meta = document.createElement('span');
      meta.textContent = '向右展开主要论点与从属关系';
      mapTooltip.append(title, detail, meta);
      mapTooltip.classList.remove('agent-reader-tooltip-hidden');
      positionMapTooltip(event, mapTooltip, mapFrame);
    });
    centerNode.addEventListener('mousemove', (event) => positionMapTooltip(event, mapTooltip, mapFrame));
    centerNode.addEventListener('mouseleave', () => mapTooltip.classList.add('agent-reader-tooltip-hidden'));
    mapNodes.append(centerNode);

    hierarchy.ordered.forEach((hierarchyNode) => {
      const point = hierarchyNode.point;
      const matchedCount = (matchesByPoint.get(point.id) || []).length;
      const x = hierarchyNode.x;
      const y = hierarchyNode.y;
      const parentX = hierarchyNode.parent ? hierarchyNode.parent.x : centerX;
      const parentY = hierarchyNode.parent ? hierarchyNode.parent.y : centerY;
      const link = createSvgElement('path', {
        class: `agent-reader-map-link ${matchedCount > 0 ? 'agent-reader-map-link-matched' : 'agent-reader-map-link-unmatched'}`,
        d: `M ${parentX + 38} ${parentY} C ${parentX + 84} ${parentY}, ${x - 84} ${y}, ${x - 38} ${y}`
      });
      mapLinks.append(link);

      const node = createSvgElement('g', {
        class: `agent-reader-map-node agent-reader-point ${hierarchyNode.children.length ? 'agent-reader-map-node-parent' : 'agent-reader-map-node-leaf'} ${matchedCount > 0 ? 'agent-reader-map-node-matched' : 'agent-reader-map-node-unmatched'}`,
        tabindex: '0',
        'data-agent-reader-point-id': point.id,
        transform: `translate(${x}, ${y})`
      });
      const bubble = createSvgElement('circle', { cx: 0, cy: 0, r: 30 });
      const indexText = createSvgElement('text', { x: 0, y: -4, 'text-anchor': 'middle', class: 'agent-reader-map-node-index' });
      indexText.textContent = hierarchyNode.outline;
      const metaText = createSvgElement('text', { x: 0, y: 14, 'text-anchor': 'middle', class: 'agent-reader-map-node-meta' });
      metaText.textContent = matchedCount > 0 ? `${matchedCount} 引用` : '未匹配';
      const label = createSvgElement('text', {
        x: 0,
        y: 46,
        'text-anchor': 'middle',
        class: 'agent-reader-map-node-label'
      });
      label.textContent = truncateText(point.claim || '未命名关键点', 15);
      node.append(bubble, indexText, metaText, label);
      node.addEventListener('mouseenter', (event) => {
        setMapTooltipContent(mapTooltip, point, matchedCount);
        mapTooltip.classList.remove('agent-reader-tooltip-hidden');
        positionMapTooltip(event, mapTooltip, mapFrame);
      });
      node.addEventListener('mousemove', (event) => positionMapTooltip(event, mapTooltip, mapFrame));
      node.addEventListener('mouseleave', () => mapTooltip.classList.add('agent-reader-tooltip-hidden'));
      node.addEventListener('click', () => scrollToPoint(point.id));
      node.addEventListener('keydown', (event) => {
        if (event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          scrollToPoint(point.id);
        }
      });
      mapNodes.append(node);
    });

    if (unmatchedCount > 0) {
      const empty = document.createElement('p');
      empty.className = 'agent-reader-empty';
      empty.textContent = `${unmatchedCount} 个关键点没有在当前页面找到对应 quote。可以让 Agent 输出更短、更精确的原文句子。`;
      textView.append(empty);
    }

    function setViewMode(mode) {
      state.viewMode = mode;
      mapView.classList.toggle('agent-reader-hidden', mode !== 'map');
      textView.classList.toggle('agent-reader-hidden', mode !== 'text');
      mapTab.classList.toggle('agent-reader-tab-active', mode === 'map');
      textTab.classList.toggle('agent-reader-tab-active', mode === 'text');
    }

    mapTab.addEventListener('click', () => setViewMode('map'));
    textTab.addEventListener('click', () => setViewMode('text'));
    setViewMode(state.viewMode);

    collapse.addEventListener('click', () => {
      panel.classList.toggle('agent-reader-collapsed');
      collapse.textContent = panel.classList.contains('agent-reader-collapsed') ? '展开' : '收起';
    });
    close.addEventListener('click', clearReader);

    panel.append(header, body);
    document.documentElement.append(panel);
    state.panel = panel;
  }

  function scheduleWakePolling() {
    if (state.wakePollTimer) return;
    let attempts = 0;
    state.wakePollTimer = setInterval(() => {
      attempts += 1;
      detectSummaryForCurrentPage({ force: true, renderIfFound: true, keepWaiting: true });
      if (attempts >= MAX_WAKE_POLL_ATTEMPTS || state.detectedSummary) {
        clearInterval(state.wakePollTimer);
        state.wakePollTimer = null;
      }
    }, POLL_INTERVAL_MS);
  }

  async function wakeCodexForCurrentPage() {
    if (!/^https?:|^file:/.test(location.protocol)) return;
    setLauncherStatus('waking', '正在解读');
    try {
      const response = await fetch(`${BRIDGE_BASE_URL}/wake-codex`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ url: location.href })
      });
      const body = await response.json().catch(() => ({}));
      if (!response.ok || !body.ok) throw new Error(body.error || 'Codex wake failed');
      state.wakeStartedAt = body.task && body.task.startedAt ? body.task.startedAt : Date.now();
      setLauncherStatus('waiting', '正在解读');
      scheduleWakePolling();
    } catch (_error) {
      setLauncherStatus('offline', 'Bridge 未连接');
    }
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
    const response = await fetch(`${BRIDGE_BASE_URL}/status?url=${encodeURIComponent(url)}`);
    const body = await response.json();
    if (!response.ok || !body.ok) return { status: 'error', data: null };
    return { status: body.state || 'empty', data: body.data || null, task: body.task || null };
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
      if (result.status === 'pending') {
        state.detectedSummary = null;
        state.wakeStartedAt = result.task.startedAt;
        setLauncherStatus('waiting', '正在解读');
        scheduleWakePolling();
        return;
      }
      if (result.status === 'empty') {
        state.detectedSummary = null;
        if (options.keepWaiting) {
          setLauncherStatus('waiting', '正在解读');
        } else {
          setLauncherStatus('empty', '解读此页');
        }
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
