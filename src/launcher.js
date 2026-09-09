(() => {
  const sidePanelButton = document.getElementById('open-side-panel');
  const workspaceButton = document.getElementById('open-workspace');

  async function activeBrowserTab() {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    if (tab) return tab;
    const [fallback] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    return fallback || null;
  }

  function dashboardUrlFor(tab) {
    const params = new URLSearchParams();
    if (tab && tab.id) params.set('tabId', String(tab.id));
    if (tab && tab.url && /^https?:\/\//i.test(tab.url)) params.set('url', tab.url);
    const query = params.toString();
    return `${chrome.runtime.getURL('views/dashboard.html')}${query ? `?${query}` : ''}`;
  }

  async function createTabInSameWindow(url, tab) {
    const options = { url, active: true };
    if (Number.isInteger(tab?.windowId)) options.windowId = tab.windowId;
    try {
      return await chrome.tabs.create(options);
    } catch (error) {
      console.warn('[SnapStream] Could not create tab in the current window, using browser default window:', error);
      return chrome.tabs.create({ url, active: true });
    }
  }

  sidePanelButton.addEventListener('click', async () => {
    try {
      const tab = await activeBrowserTab();
      if (!tab) throw new Error('No active tab found');
      await chrome.sidePanel.open({ windowId: tab.windowId });
      window.close();
    } catch (error) {
      console.error('[SnapStream] Could not open side panel:', error);
      sidePanelButton.querySelector('small').textContent = 'Side panel unavailable — try full workspace';
    }
  });

  workspaceButton.addEventListener('click', async () => {
    try {
      const tab = await activeBrowserTab();
      await createTabInSameWindow(dashboardUrlFor(tab), tab);
      window.close();
    } catch (error) {
      console.error('[SnapStream] Could not open workspace:', error);
      workspaceButton.querySelector('small').textContent = 'Workspace could not open — try again';
    }
  });
})();
