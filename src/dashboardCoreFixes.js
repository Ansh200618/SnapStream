import { downloadSelectedImagesAsZip } from './robustDownload.js';

const ZIP_BUTTON_ID = 'download-zip';
const SELECTED_COUNT_ID = 'selected-count';
const MULTI_PAGE_SETTINGS_KEY = 'snapstreamVisibleMultiPageSettings';

const $ = (id) => document.getElementById(id);

function showToast(title, detail = '', kind = 'info') {
  const stack = $('toast-stack');
  if (!stack) return;

  const toast = document.createElement('div');
  toast.className = `toast ${kind === 'error' ? 'error' : ''}`;

  const strong = document.createElement('strong');
  strong.textContent = title;
  toast.appendChild(strong);

  if (detail) {
    const span = document.createElement('span');
    span.textContent = detail;
    toast.appendChild(span);
  }

  stack.appendChild(toast);
  setTimeout(() => toast.remove(), 5200);
}

function selectedCount() {
  const raw = ($('selected-count')?.textContent || '0').replace(/[^0-9]/g, '');
  return Number(raw) || 0;
}

function syncZipButtonState() {
  const button = $(ZIP_BUTTON_ID);
  if (!button) return;
  button.disabled = selectedCount() <= 0;
}

function ensureZipButton() {
  if ($(ZIP_BUTTON_ID)) {
    syncZipButtonState();
    return;
  }

  const actions = document.querySelector('.result-actions');
  if (!actions) return;

  const button = document.createElement('button');
  button.className = 'secondary-button';
  button.id = ZIP_BUTTON_ID;
  button.type = 'button';
  button.disabled = true;
  button.innerHTML = '<span>Download ZIP</span>';
  actions.appendChild(button);

  button.addEventListener('click', async (event) => {
    event.preventDefault();
    event.stopImmediatePropagation();

    if (selectedCount() <= 0) {
      showToast('No images selected', 'Select images first, then use Download ZIP.', 'error');
      return;
    }

    button.disabled = true;
    const label = button.querySelector('span');
    if (label) label.textContent = 'Preparing ZIP…';

    try {
      // dashboard.js stores the live selected list after every selection. This small wait
      // avoids packaging before a just-clicked selection has finished writing to storage.
      await new Promise((resolve) => setTimeout(resolve, 450));
      await downloadSelectedImagesAsZip();
    } catch (error) {
      showToast('ZIP download failed', error?.message || String(error), 'error');
    } finally {
      if (label) label.textContent = 'Download ZIP';
      syncZipButtonState();
    }
  }, true);

  const selected = $(SELECTED_COUNT_ID);
  if (selected) {
    new MutationObserver(syncZipButtonState).observe(selected, {
      childList: true,
      characterData: true,
      subtree: true,
    });
  }

  syncZipButtonState();
}

async function openDashboardInSameWindow(event) {
  const button = $('open-full-workspace');
  if (!button) return;

  event.preventDefault();
  event.stopImmediatePropagation();

  const params = new URLSearchParams();
  const targetUrl = $('target-url')?.value || '';
  if (targetUrl) params.set('url', targetUrl);

  let activeTab = null;
  try {
    [activeTab] = await chrome.tabs.query({ active: true, currentWindow: true });
  } catch (_) {}

  if (activeTab?.id) params.set('tabId', String(activeTab.id));

  const query = params.toString();
  const dashboardUrl = `${chrome.runtime.getURL('views/dashboard.html')}${query ? `?${query}` : ''}`;
  const createOptions = { url: dashboardUrl, active: true };
  if (Number.isInteger(activeTab?.windowId)) createOptions.windowId = activeTab.windowId;

  try {
    await chrome.tabs.create(createOptions);
  } catch (error) {
    await chrome.tabs.create({ url: dashboardUrl, active: true });
    showToast('Opened full workspace', 'Browser did not provide a window id, so SnapStream used the default window.');
  }
}

function keepWorkspaceInsideCurrentWindow() {
  const button = $('open-full-workspace');
  if (!button || button.dataset.snapstreamCoreFixed === '1') return;
  button.dataset.snapstreamCoreFixed = '1';
  button.addEventListener('click', openDashboardInSameWindow, true);
}

async function disableBrokenLegacyVisibleCrawler() {
  try {
    const stored = await chrome.storage.local.get([MULTI_PAGE_SETTINGS_KEY]);
    const settings = stored[MULTI_PAGE_SETTINGS_KEY] || {};
    if (settings.enabled === true && settings.userConfigured !== true) {
      await chrome.storage.local.set({
        [MULTI_PAGE_SETTINGS_KEY]: {
          ...settings,
          enabled: false,
          userConfigured: false,
          disabledBy: 'snapstream-5.0.9-deep-scan-restore',
        },
      });
    }
  } catch (_) {}
}

async function init() {
  await disableBrokenLegacyVisibleCrawler();
  ensureZipButton();
  keepWorkspaceInsideCurrentWindow();

  const observer = new MutationObserver(() => {
    ensureZipButton();
    keepWorkspaceInsideCurrentWindow();
  });
  observer.observe(document.documentElement, { childList: true, subtree: true });
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
