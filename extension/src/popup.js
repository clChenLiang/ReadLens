(function () {
  const textarea = document.getElementById('agent-json');
  const renderButton = document.getElementById('render');
  const loadBridgeButton = document.getElementById('load-bridge');
  const clearButton = document.getElementById('clear');
  const status = document.getElementById('status');
  const { validateAgentSummary } = globalThis.AgentReaderSchema;
  const BRIDGE_BASE_URL = 'http://127.0.0.1:8765';

  function setStatus(message, kind) {
    status.textContent = message;
    status.className = kind || '';
  }

  function storageKey(url) {
    return `agent-reader:${url}`;
  }

  async function getActiveTab() {
    const tabs = await chrome.tabs.query({ active: true, currentWindow: true });
    return tabs[0];
  }

  async function sendToTab(tabId, message) {
    try {
      await chrome.tabs.sendMessage(tabId, message);
    } catch (error) {
      await chrome.scripting.executeScript({
        target: { tabId },
        files: ['src/quoteMatcher.js', 'src/agentSchema.js', 'src/content.js']
      });
      await chrome.tabs.sendMessage(tabId, message);
    }
  }

  async function renderDataToActiveTab(data) {
    const validation = validateAgentSummary(data);
    if (!validation.ok) {
      setStatus(`数据格式不正确：${validation.error}`, 'error');
      return false;
    }

    const tab = await getActiveTab();
    if (!tab || !tab.id || !tab.url) {
      setStatus('没有找到当前标签页。', 'error');
      return false;
    }

    await chrome.storage.local.set({ [storageKey(tab.url)]: validation.data });
    await sendToTab(tab.id, { type: 'AGENT_READER_RENDER', payload: validation.data });
    textarea.value = JSON.stringify(validation.data, null, 2);
    setStatus(`已渲染。当前页：${tab.url}`, 'ok');
    return true;
  }

  async function hydrate() {
    const tab = await getActiveTab();
    if (!tab || !tab.url) return;
    const stored = await chrome.storage.local.get(storageKey(tab.url));
    const value = stored[storageKey(tab.url)];
    if (value) textarea.value = JSON.stringify(value, null, 2);
  }

  renderButton.addEventListener('click', async () => {
    let parsed;
    try {
      parsed = JSON.parse(textarea.value);
    } catch (error) {
      setStatus(`JSON 解析失败：${error.message}`, 'error');
      return;
    }

    const rendered = await renderDataToActiveTab(parsed);
    if (rendered) setStatus('已渲染到当前页面。', 'ok');
  });

  loadBridgeButton.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (!tab || !tab.url) {
      setStatus('没有找到当前标签页 URL。', 'error');
      return;
    }

    setStatus('正在从 Agent Bridge 加载...', '');
    try {
      const response = await fetch(`${BRIDGE_BASE_URL}/latest?url=${encodeURIComponent(tab.url)}`);
      const body = await response.json();
      if (!response.ok || !body.ok) {
        throw new Error(body.error || `Bridge 返回 HTTP ${response.status}`);
      }
      const rendered = await renderDataToActiveTab(body.data);
      if (rendered) setStatus(`已从 Agent Bridge 加载：${body.data.title || body.data.url || '未命名页面'}`, 'ok');
    } catch (error) {
      setStatus(`Bridge 加载失败：${error.message}。请确认已运行 readlens serve 或 readlens summarize <url>。`, 'error');
    }
  });

  clearButton.addEventListener('click', async () => {
    const tab = await getActiveTab();
    if (tab && tab.url) await chrome.storage.local.remove(storageKey(tab.url));
    if (tab && tab.id) await sendToTab(tab.id, { type: 'AGENT_READER_CLEAR' });
    setStatus('已清除当前页面标注。', 'ok');
  });

  hydrate().catch((error) => setStatus(error.message, 'error'));
})();
