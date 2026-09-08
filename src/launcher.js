(() => {
  const sidePanelButton = document.getElementById('open-side-panel');
  const workspaceButton = document.getElementById('open-workspace');

  sidePanelButton.addEventListener('click', async () => {
    try {
      const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
      if (!tab) throw new Error('No active tab found');
      await chrome.sidePanel.open({ windowId: tab.windowId });
      window.close();
    } catch (error) {
      console.error('[SnapStream] Could not open side panel:', error);
      sidePanelButton.querySelector('small').textContent = 'Side panel unavailable — try full workspace';
    }
  });

  workspaceButton.addEventListener('click', async () => {
    const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
    const params = new URLSearchParams();
    if (tab && tab.id) params.set('tabId', String(tab.id));
    if (tab && tab.url && /^https?:\/\//i.test(tab.url)) params.set('url', tab.url);
    const query = params.toString();
    await chrome.tabs.create({ url: `${chrome.runtime.getURL('views/dashboard.html')}${query ? `?${query}` : ''}` });
    window.close();
  });
})();
