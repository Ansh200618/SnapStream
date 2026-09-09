import { downloadImageRobustly } from './robustDownload.js';

const DEFAULT_SETTINGS = {
  scanDepth: 'deep',
  includeBackgrounds: true,
  includeLinked: true,
  includeSrcset: true,
  closeTemporaryTab: true,
  restoreScroll: true,
  minWidth: 0,
  minHeight: 0,
  autoSelectHd: false,
  downloadFolder: 'SnapStream',
  filenamePrefix: 'image',
  confirmBulkDownload: true,
};

const PAGE_SIZE = 120;
const BULK_DOWNLOAD_WARNING_THRESHOLD = 10;
const WORKSPACE_STATE_KEY = 'snapstreamWorkspaceSnapshotV2';

const state = {
  settings: { ...DEFAULT_SETTINGS },
  images: new Map(),
  selected: new Set(),
  scanId: null,
  scanTabId: null,
  scanTabCreated: false,
  scanInProgress: false,
  scanPass: 0,
  elementsChecked: 0,
  renderLimit: PAGE_SIZE,
  previewUrl: null,
  initialTabId: null,
  initialUrl: '',
  lastDomain: '',
  bulkResolver: null,
};

const $ = (id) => document.getElementById(id);
const els = {
  targetUrl: $('target-url'),
  useCurrentPage: $('use-current-page'),
  startScan: $('start-scan'),
  stopScan: $('stop-scan'),
  scanStatus: $('scan-status'),
  scanSpinner: $('scan-spinner'),
  scanStatusTitle: $('scan-status-title'),
  scanStatusDetail: $('scan-status-detail'),
  scanProgressBar: $('scan-progress-bar'),
  metricFound: $('metric-found'),
  metricPass: $('metric-pass'),
  metricElements: $('metric-elements'),
  resultCount: $('result-count'),
  sideCount: $('side-count'),
  sideDomain: $('side-domain'),
  galleryGrid: $('gallery-grid'),
  emptyState: $('empty-state'),
  loadMore: $('load-more'),
  selectVisible: $('select-visible'),
  downloadSelected: $('download-selected'),
  selectedCount: $('selected-count'),
  filterQuery: $('filter-query'),
  filterSource: $('filter-source'),
  filterSize: $('filter-size'),
  clearFilters: $('clear-filters'),
  previewModal: $('preview-modal'),
  previewClose: $('preview-close'),
  previewImage: $('preview-image'),
  previewTitle: $('preview-title'),
  previewMeta: $('preview-meta'),
  previewUrl: $('preview-url'),
  previewDownload: $('preview-download'),
  bulkDownloadModal: $('bulk-download-modal'),
  bulkClose: $('bulk-close'),
  bulkCancel: $('bulk-cancel'),
  bulkCount: $('bulk-count'),
  bulkFolder: $('bulk-folder'),
  bulkOpenDownloadSettings: $('bulk-open-download-settings'),
  bulkReadyContinue: $('bulk-ready-continue'),
  bulkContinueAnyway: $('bulk-continue-anyway'),
  settingsModal: $('settings-modal'),
  settingsButton: $('settings-button'),
  settingsClose: $('settings-close'),
  saveSettings: $('save-settings'),
  resetSettings: $('reset-settings'),
  openFullWorkspace: $('open-full-workspace'),
  depthPill: $('depth-pill'),
  toastStack: $('toast-stack'),
};

let renderTimer = null;
let persistTimer = null;
let pendingCloseTabId = null;

function escapeForDisplay(value) {
  return String(value || '').replace(/[\r\n\t]+/g, ' ').trim();
}

function stripHash(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.href;
  } catch (_) {
    return value || '';
  }
}

function normalizeWebUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) return '';
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withScheme);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only normal http:// or https:// websites can be scanned.');
  return url.href;
}

function isNormalWebTab(tab) {
  return Boolean(tab && tab.id && tab.url && /^https?:\/\//i.test(tab.url));
}

function maxPasses() {
  if (state.settings.scanDepth === 'balanced') return 80;
  if (state.settings.scanDepth === 'exhaustive') return 240;
  return 160;
}

function showToast(title, detail = '', kind = 'info') {
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
  els.toastStack.appendChild(toast);
  setTimeout(() => toast.remove(), 4800);
}

function setScanStatus(title, detail, progress = null) {
  els.scanStatus.classList.remove('hidden');
  els.scanStatusTitle.textContent = title;
  els.scanStatusDetail.textContent = detail || '';
  if (progress !== null) els.scanProgressBar.style.width = `${Math.max(2, Math.min(100, progress))}%`;
}

function updateMetrics() {
  const count = state.images.size;
  els.metricFound.textContent = count.toLocaleString();
  els.metricPass.textContent = state.scanPass.toLocaleString();
  els.metricElements.textContent = state.elementsChecked.toLocaleString();
  els.resultCount.textContent = count.toLocaleString();
  els.sideCount.textContent = `${count.toLocaleString()} image${count === 1 ? '' : 's'}`;
  els.sideDomain.textContent = state.lastDomain || 'No website scanned';
}

function setScanningUi(scanning) {
  state.scanInProgress = scanning;
  els.startScan.disabled = scanning;
  els.startScan.querySelector('span').textContent = scanning ? 'Scanning…' : 'Start scan';
  els.stopScan.classList.toggle('hidden', !scanning);
  els.scanSpinner.classList.toggle('done', !scanning && state.images.size > 0);
}

function snapshotImage(item) {
  return {
    url: item.url,
    source: item.source || 'image',
    sources: Array.isArray(item.sources) ? item.sources : [item.source || 'image'],
    alt: item.alt || '',
    width: Number(item.width) || 0,
    height: Number(item.height) || 0,
    frameUrl: item.frameUrl || '',
    pageUrl: item.pageUrl || '',
  };
}

function currentSnapshotTarget() {
  return stripHash(els.targetUrl.value || state.initialUrl || '');
}

async function persistWorkspaceSnapshot() {
  try {
    const snapshot = {
      targetUrl: currentSnapshotTarget(),
      lastDomain: state.lastDomain,
      images: Array.from(state.images.values()).map(snapshotImage),
      selected: Array.from(state.selected),
      renderLimit: state.renderLimit,
      savedAt: Date.now(),
    };
    await chrome.storage.local.set({ [WORKSPACE_STATE_KEY]: snapshot });
  } catch (error) {
    console.warn('[SnapStream] Could not persist workspace snapshot:', error);
  }
}

function schedulePersistWorkspace() {
  clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    persistWorkspaceSnapshot().catch(() => {});
  }, 350);
}

async function flushWorkspaceSnapshot() {
  clearTimeout(persistTimer);
  persistTimer = null;
  await persistWorkspaceSnapshot();
}

async function restoreWorkspaceSnapshot() {
  try {
    const stored = await chrome.storage.local.get(WORKSPACE_STATE_KEY);
    const snapshot = stored[WORKSPACE_STATE_KEY];
    if (!snapshot || !Array.isArray(snapshot.images)) return;

    const activeTarget = currentSnapshotTarget();
    const snapshotTarget = stripHash(snapshot.targetUrl || '');
    if (activeTarget && snapshotTarget && activeTarget !== snapshotTarget) return;

    state.images.clear();
    state.selected.clear();

    for (const item of snapshot.images) {
      if (!item || !item.url) continue;
      state.images.set(item.url, snapshotImage(item));
    }

    for (const url of snapshot.selected || []) {
      if (state.images.has(url)) state.selected.add(url);
    }

    if (snapshot.targetUrl && !els.targetUrl.value) els.targetUrl.value = snapshot.targetUrl;
    state.lastDomain = snapshot.lastDomain || state.lastDomain;
    state.renderLimit = Math.max(PAGE_SIZE, Number(snapshot.renderLimit) || PAGE_SIZE);
    updateMetrics();
  } catch (error) {
    console.warn('[SnapStream] Could not restore workspace snapshot:', error);
  }
}

async function loadSettings() {
  const stored = await chrome.storage.local.get('snapstreamWorkspaceSettings');
  state.settings = { ...DEFAULT_SETTINGS, ...(stored.snapstreamWorkspaceSettings || {}) };
  populateSettingsForm();
  updateDepthPill();
}

function populateSettingsForm() {
  $('setting-scan-depth').value = state.settings.scanDepth;
  $('setting-backgrounds').checked = state.settings.includeBackgrounds;
  $('setting-linked').checked = state.settings.includeLinked;
  $('setting-srcset').checked = state.settings.includeSrcset;
  $('setting-close-tab').checked = state.settings.closeTemporaryTab;
  $('setting-restore-scroll').checked = state.settings.restoreScroll;
  $('setting-min-width').value = state.settings.minWidth;
  $('setting-min-height').value = state.settings.minHeight;
  $('setting-auto-select-hd').checked = state.settings.autoSelectHd;
  $('setting-folder').value = state.settings.downloadFolder;
  $('setting-prefix').value = state.settings.filenamePrefix;
  $('setting-confirm').checked = state.settings.confirmBulkDownload;
}

function readSettingsForm() {
  return {
    scanDepth: $('setting-scan-depth').value,
    includeBackgrounds: $('setting-backgrounds').checked,
    includeLinked: $('setting-linked').checked,
    includeSrcset: $('setting-srcset').checked,
    closeTemporaryTab: $('setting-close-tab').checked,
    restoreScroll: $('setting-restore-scroll').checked,
    minWidth: Math.max(0, Number($('setting-min-width').value) || 0),
    minHeight: Math.max(0, Number($('setting-min-height').value) || 0),
    autoSelectHd: $('setting-auto-select-hd').checked,
    downloadFolder: String($('setting-folder').value || '').trim(),
    filenamePrefix: String($('setting-prefix').value || '').trim(),
    confirmBulkDownload: $('setting-confirm').checked,
  };
}

async function saveSettings() {
  state.settings = readSettingsForm();
  await chrome.storage.local.set({ snapstreamWorkspaceSettings: state.settings });
  updateDepthPill();
  closeSettings();
  scheduleRender();
  schedulePersistWorkspace();
  showToast('Settings saved', 'Your scanner and download preferences were updated.');
}

function updateDepthPill() {
  const label = state.settings.scanDepth.charAt(0).toUpperCase() + state.settings.scanDepth.slice(1);
  els.depthPill.lastChild.textContent = ` ${label} mode`;
}

function openSettings() {
  populateSettingsForm();
  els.settingsModal.classList.remove('hidden');
}

function closeSettings() {
  els.settingsModal.classList.add('hidden');
}

async function getRecentWebTab() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const webTabs = tabs.filter(isNormalWebTab);
  webTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return webTabs[0] || null;
}

async function initializeTargetFromContext() {
  const params = new URLSearchParams(location.search);
  const tabId = Number(params.get('tabId'));
  const url = params.get('url') || '';

  if (Number.isInteger(tabId) && tabId > 0) state.initialTabId = tabId;
  if (url) state.initialUrl = url;

  if (state.initialUrl) {
    els.targetUrl.value = state.initialUrl;
    return;
  }

  const recent = await getRecentWebTab();
  if (recent) {
    state.initialTabId = recent.id;
    state.initialUrl = recent.url;
    els.targetUrl.value = recent.url;
  }
}

async function useCurrentPage() {
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  let tab = isNormalWebTab(active) ? active : null;
  if (!tab && state.initialTabId) {
    try {
      const initial = await chrome.tabs.get(state.initialTabId);
      if (isNormalWebTab(initial)) tab = initial;
    } catch (_) {}
  }
  if (!tab) tab = await getRecentWebTab();
  if (!tab) {
    showToast('No website found', 'Open a normal webpage first, or paste its URL above.', 'error');
    return;
  }
  state.initialTabId = tab.id;
  state.initialUrl = tab.url;
  els.targetUrl.value = tab.url;
  schedulePersistWorkspace();
  showToast('Current page selected', new URL(tab.url).hostname);
}

async function waitForTabComplete(tabId) {
  const startedAt = Date.now();
  while (Date.now() - startedAt < 60000) {
    let tab;
    try {
      tab = await chrome.tabs.get(tabId);
    } catch (_) {
      throw new Error('The target tab was closed before scanning could start.');
    }
    if (tab.status === 'complete') return tab;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  return chrome.tabs.get(tabId);
}

async function resolveTargetTab(targetUrl) {
  const normalized = targetUrl ? normalizeWebUrl(targetUrl) : '';

  if (state.initialTabId) {
    try {
      const initial = await chrome.tabs.get(state.initialTabId);
      if (isNormalWebTab(initial) && (!normalized || stripHash(initial.url) === stripHash(normalized))) {
        return { tab: initial, created: false };
      }
    } catch (_) {}
  }

  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (isNormalWebTab(active) && (!normalized || stripHash(active.url) === stripHash(normalized))) {
    return { tab: active, created: false };
  }

  if (!normalized) {
    const recent = await getRecentWebTab();
    if (recent) return { tab: recent, created: false };
    throw new Error('Paste a website URL or open a webpage to scan.');
  }

  const allTabs = await chrome.tabs.query({});
  const existing = allTabs.find((tab) => isNormalWebTab(tab) && stripHash(tab.url) === stripHash(normalized));
  if (existing) return { tab: existing, created: false };

  const created = await chrome.tabs.create({ url: normalized, active: false });
  return { tab: created, created: true };
}

function resetResults() {
  state.images.clear();
  state.selected.clear();
  state.scanPass = 0;
  state.elementsChecked = 0;
  state.renderLimit = PAGE_SIZE;
  updateMetrics();
  renderGallery();
  schedulePersistWorkspace();
}

async function startScan() {
  if (state.scanInProgress) return;

  let target;
  try {
    target = normalizeWebUrl(els.targetUrl.value);
    els.targetUrl.value = target;
  } catch (error) {
    showToast('Invalid website URL', error.message, 'error');
    return;
  }

  resetResults();
  state.scanId = crypto.randomUUID ? crypto.randomUUID() : `scan-${Date.now()}-${Math.random()}`;
  setScanningUi(true);
  setScanStatus('Opening scan source…', target, 3);

  try {
    const resolved = await resolveTargetTab(target);
    state.scanTabCreated = resolved.created;
    state.scanTabId = resolved.tab.id;
    pendingCloseTabId = null;

    const readyTab = await waitForTabComplete(resolved.tab.id);
    if (!isNormalWebTab(readyTab)) throw new Error('This page cannot be scanned by a browser extension.');

    state.initialTabId = readyTab.id;
    state.initialUrl = readyTab.url;
    state.lastDomain = new URL(readyTab.url).hostname;
    updateMetrics();
    schedulePersistWorkspace();

    setScanStatus('Injecting deep scanner…', state.lastDomain, 6);

    await chrome.runtime.sendMessage({ origin: new URL(readyTab.url).origin }).catch(() => {});

    await chrome.scripting.executeScript({
      target: { tabId: readyTab.id, allFrames: true },
      files: ['src/deepScan.js'],
    });

    setScanStatus('Scanning page…', 'Collecting visible, lazy-loaded and background images.', 8);

    await chrome.tabs.sendMessage(readyTab.id, {
      type: 'SNAPSTREAM_RUN_SCAN',
      scanId: state.scanId,
      options: {
        scanDepth: state.settings.scanDepth,
        includeBackgrounds: state.settings.includeBackgrounds,
        includeLinked: state.settings.includeLinked,
        includeSrcset: state.settings.includeSrcset,
        restoreScroll: state.settings.restoreScroll,
      },
    });
  } catch (error) {
    finishScan(false, error.message || String(error));
  }
}

async function stopScan() {
  if (!state.scanInProgress || !state.scanId || !state.scanTabId) return;
  setScanStatus('Stopping scan…', 'Keeping everything found so far.', null);
  try {
    await chrome.tabs.sendMessage(state.scanTabId, { type: 'SNAPSTREAM_CANCEL_SCAN', scanId: state.scanId });
  } catch (_) {
    finishScan(true, 'Scan stopped.');
  }
}

function mergeImage(item) {
  if (!item || !item.url) return false;
  const existing = state.images.get(item.url);
  if (existing) {
    const merged = {
      ...existing,
      alt: existing.alt || item.alt || '',
      width: Math.max(existing.width || 0, item.width || 0),
      height: Math.max(existing.height || 0, item.height || 0),
      sources: Array.from(new Set([...(existing.sources || [existing.source]), item.source].filter(Boolean))),
    };
    state.images.set(item.url, merged);
    schedulePersistWorkspace();
    return false;
  }

  state.images.set(item.url, {
    url: item.url,
    source: item.source || 'image',
    sources: [item.source || 'image'],
    alt: escapeForDisplay(item.alt),
    width: Number(item.width) || 0,
    height: Number(item.height) || 0,
    frameUrl: item.frameUrl || '',
    pageUrl: item.pageUrl || '',
  });
  schedulePersistWorkspace();
  return true;
}

function onScanMessage(message) {
  if (!message || !message.scanId || message.scanId !== state.scanId) return;

  if (message.type === 'SNAPSTREAM_SCAN_BATCH') {
    let added = 0;
    (message.images || []).forEach((item) => { if (mergeImage(item)) added += 1; });
    state.scanPass = Math.max(state.scanPass, Number(message.pass) || 0);
    state.elementsChecked = Math.max(state.elementsChecked, Number(message.elementsChecked) || 0);
    if (added) scheduleRender();
    updateMetrics();
    updateScanProgress(message.phase);
    return;
  }

  if (message.type === 'SNAPSTREAM_SCAN_STATUS') {
    if (message.isTopFrame) {
      state.scanPass = Math.max(state.scanPass, Number(message.pass) || 0);
      state.elementsChecked = Math.max(state.elementsChecked, Number(message.elementsChecked) || 0);
      updateMetrics();
      updateScanProgress(message.phase);
      schedulePersistWorkspace();
    }
    return;
  }

  if (message.type === 'SNAPSTREAM_SCAN_ERROR') {
    if (message.frameUrl === state.initialUrl || !state.images.size) showToast('A page frame could not be scanned', message.message, 'error');
    return;
  }

  if (message.type === 'SNAPSTREAM_SCAN_FRAME_DONE' && message.isTopFrame) {
    state.scanPass = Math.max(state.scanPass, Number(message.pass) || 0);
    state.elementsChecked = Math.max(state.elementsChecked, Number(message.elementsChecked) || 0);
    finishScan(true, message.cancelled ? 'Scan stopped. Results found so far are ready.' : 'Deep scan complete.');
  }
}

function updateScanProgress(phase) {
  const percent = phase === 'finalizing' ? 98 : Math.min(95, 8 + (state.scanPass / maxPasses()) * 87);
  const phaseTitle = phase === 'finalizing' ? 'Finalizing image list…' : 'Scanning page…';
  setScanStatus(
    phaseTitle,
    `${state.images.size.toLocaleString()} unique images found · pass ${state.scanPass.toLocaleString()}`,
    percent
  );
}

async function finishScan(success, detail) {
  const wasScanning = state.scanInProgress;
  setScanningUi(false);
  updateMetrics();
  scheduleRender();
  schedulePersistWorkspace();

  if (success) {
    setScanStatus('Scan complete', detail || `${state.images.size.toLocaleString()} images are ready.`, 100);
    els.scanSpinner.classList.add('done');
    if (wasScanning) showToast('Scan complete', `${state.images.size.toLocaleString()} unique images discovered.`);
  } else {
    els.scanStatus.classList.remove('hidden');
    els.scanStatusTitle.textContent = 'Scan could not start';
    els.scanStatusDetail.textContent = detail || 'Unknown scanner error';
    els.scanProgressBar.style.width = '100%';
    showToast('Scan failed', detail || 'Unknown scanner error', 'error');
  }

  if (state.scanTabCreated && state.settings.closeTemporaryTab && state.scanTabId) {
    pendingCloseTabId = state.scanTabId;
    setTimeout(async () => {
      const tabId = pendingCloseTabId;
      pendingCloseTabId = null;
      if (!tabId) return;
      try { await chrome.tabs.remove(tabId); } catch (_) {}
    }, 600);
  }
}

function getFilteredImages() {
  const query = els.filterQuery.value.trim().toLowerCase();
  const source = els.filterSource.value;
  const size = els.filterSize.value;
  const minWidth = Number(state.settings.minWidth) || 0;
  const minHeight = Number(state.settings.minHeight) || 0;

  return Array.from(state.images.values()).filter((item) => {
    if (query) {
      const haystack = `${item.url} ${item.alt || ''} ${(item.sources || []).join(' ')}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (source !== 'all' && !(item.sources || [item.source]).includes(source)) return false;
    if (item.width && item.width < minWidth) return false;
    if (item.height && item.height < minHeight) return false;

    if (size !== 'all') {
      if (!item.width || !item.height) return false;
      if (size === 'hd' && Math.max(item.width, item.height) < 1280) return false;
      if (size === 'large' && Math.max(item.width, item.height) < 2000) return false;
      if (size === 'square') {
        const ratio = item.width / item.height;
        if (ratio < 0.86 || ratio > 1.16) return false;
      }
    }
    return true;
  });
}

function scheduleRender() {
  clearTimeout(renderTimer);
  renderTimer = setTimeout(renderGallery, 120);
}

function displayName(item) {
  if (item.alt) return item.alt;
  if (item.url.startsWith('data:image/')) return 'Embedded image';
  try {
    const pathname = new URL(item.url).pathname;
    const name = decodeURIComponent(pathname.split('/').filter(Boolean).pop() || 'Image');
    return name || 'Image';
  } catch (_) {
    return 'Image';
  }
}

function dimensionsLabel(item) {
  return item.width && item.height ? `${item.width.toLocaleString()} × ${item.height.toLocaleString()}` : 'Dimensions loading…';
}

function iconButton(icon, label, handler) {
  const button = document.createElement('button');
  button.type = 'button';
  button.className = 'card-action';
  button.title = label;
  button.innerHTML = icon;
  button.addEventListener('click', (event) => {
    event.stopPropagation();
    handler();
  });
  return button;
}

function renderGallery() {
  const filtered = getFilteredImages();
  const visible = filtered.slice(0, state.renderLimit);
  els.galleryGrid.textContent = '';

  els.emptyState.classList.toggle('hidden', state.images.size > 0);
  els.galleryGrid.classList.toggle('hidden', state.images.size === 0);
  els.loadMore.classList.toggle('hidden', state.images.size === 0 || visible.length >= filtered.length);
  els.loadMore.textContent = `Show more · ${(filtered.length - visible.length).toLocaleString()} remaining`;

  const fragment = document.createDocumentFragment();
  visible.forEach((item) => fragment.appendChild(createImageCard(item)));
  els.galleryGrid.appendChild(fragment);
  updateSelectionUi(filtered);
}

function createImageCard(item) {
  const card = document.createElement('article');
  card.className = `image-card${state.selected.has(item.url) ? ' selected' : ''}`;
  card.dataset.url = item.url;

  const stage = document.createElement('div');
  stage.className = 'image-stage';
  stage.addEventListener('click', () => openPreview(item.url));

  const img = document.createElement('img');
  img.loading = 'lazy';
  img.decoding = 'async';
  img.alt = item.alt || 'Discovered image';
  img.src = item.url;
  img.addEventListener('load', () => {
    const current = state.images.get(item.url);
    if (!current) return;
    const width = img.naturalWidth || current.width || 0;
    const height = img.naturalHeight || current.height || 0;
    if (width !== current.width || height !== current.height) {
      current.width = width;
      current.height = height;
      if (state.settings.autoSelectHd && Math.max(width, height) >= 1280) state.selected.add(item.url);
      schedulePersistWorkspace();
      scheduleRender();
    }
  }, { once: true });
  stage.appendChild(img);

  const select = document.createElement('button');
  select.type = 'button';
  select.className = 'card-select';
  select.setAttribute('aria-label', state.selected.has(item.url) ? 'Deselect image' : 'Select image');
  select.addEventListener('click', (event) => {
    event.stopPropagation();
    toggleSelected(item.url);
  });
  stage.appendChild(select);

  const badge = document.createElement('span');
  badge.className = 'source-badge';
  badge.textContent = item.source === 'image' ? 'page image' : item.source;
  stage.appendChild(badge);

  const body = document.createElement('div');
  body.className = 'card-body';
  const title = document.createElement('div');
  title.className = 'card-title';
  const strong = document.createElement('strong');
  strong.textContent = displayName(item);
  const small = document.createElement('small');
  try { small.textContent = new URL(item.url).hostname || item.source; } catch (_) { small.textContent = item.source; }
  title.append(strong, small);

  const footer = document.createElement('div');
  footer.className = 'card-footer';
  const dimensions = document.createElement('span');
  dimensions.className = 'dimension-pill';
  dimensions.textContent = dimensionsLabel(item);
  footer.appendChild(dimensions);

  footer.appendChild(iconButton(
    '<svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>',
    'Download image',
    () => downloadOne(item.url)
  ));
  footer.appendChild(iconButton(
    '<svg viewBox="0 0 24 24"><path d="M9 9h10v10H9z"/><path d="M5 15H4a1 1 0 0 1-1-1V5a2 2 0 0 1 2-2h9a1 1 0 0 1 1 1v1"/></svg>',
    'Copy image URL',
    () => copyUrl(item.url)
  ));

  body.append(title, footer);
  card.append(stage, body);
  return card;
}

function toggleSelected(url) {
  if (state.selected.has(url)) state.selected.delete(url);
  else state.selected.add(url);
  schedulePersistWorkspace();
  renderGallery();
}

function updateSelectionUi(filtered = getFilteredImages()) {
  const selectedVisible = filtered.filter((item) => state.selected.has(item.url)).length;
  els.selectedCount.textContent = state.selected.size.toLocaleString();
  els.downloadSelected.disabled = state.selected.size === 0;
  els.selectVisible.textContent = filtered.length > 0 && selectedVisible === filtered.length ? 'Deselect visible' : 'Select visible';
}

function selectVisible() {
  const filtered = getFilteredImages();
  const allSelected = filtered.length > 0 && filtered.every((item) => state.selected.has(item.url));
  filtered.forEach((item) => {
    if (allSelected) state.selected.delete(item.url);
    else state.selected.add(item.url);
  });
  schedulePersistWorkspace();
  renderGallery();
}

function clearFilters() {
  els.filterQuery.value = '';
  els.filterSource.value = 'all';
  els.filterSize.value = 'all';
  state.renderLimit = PAGE_SIZE;
  renderGallery();
  schedulePersistWorkspace();
}

function sanitizeSegment(value, fallback = '') {
  const cleaned = String(value || '')
    .replace(/[<>:"|?*\x00-\x1F]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/^\/+|\/+$/g, '')
    .trim();
  return cleaned || fallback;
}

function filenameFor(index, total) {
  const folder = sanitizeSegment(state.settings.downloadFolder);
  const prefix = sanitizeSegment(state.settings.filenamePrefix, 'image');
  const digits = String(Math.max(total, 1)).length;
  const number = String(index + 1).padStart(digits, '0');
  return `${folder ? `${folder}/` : ''}${prefix}${total > 1 ? `_${number}` : ''}`;
}

function downloadFolderLabel() {
  const folder = sanitizeSegment(state.settings.downloadFolder);
  return folder ? `Downloads/${folder}` : 'your default Downloads folder';
}

async function openBrowserDownloadSettings() {
  try {
    await chrome.tabs.create({ url: 'chrome://settings/downloads', active: true });
    showToast('Download settings opened', 'Turn off “Ask where to save each file before downloading”, then return to SnapStream.');
  } catch (error) {
    showToast('Open download settings manually', 'Go to browser Settings → Downloads and turn off “Ask where to save each file”.', 'error');
  }
}

function showBulkDownloadGuide(count) {
  return new Promise((resolve) => {
    state.bulkResolver = resolve;
    els.bulkCount.textContent = count.toLocaleString();
    els.bulkFolder.textContent = downloadFolderLabel();
    els.bulkDownloadModal.classList.remove('hidden');
  });
}

function closeBulkDownloadGuide(result = 'cancel') {
  els.bulkDownloadModal.classList.add('hidden');
  const resolver = state.bulkResolver;
  state.bulkResolver = null;
  if (resolver) resolver(result);
}

async function downloadOne(url) {
  const result = await downloadImageRobustly(url, { filename: filenameFor(0, 1), saveAs: false });
  if (result.success) showToast('Download started', result.filename || displayName({ url }));
  else showToast('Download failed', result.error || 'The image could not be downloaded.', 'error');
}

async function downloadSelected() {
  const items = Array.from(state.selected).map((url) => state.images.get(url)).filter(Boolean);
  if (!items.length) return;

  if (items.length > BULK_DOWNLOAD_WARNING_THRESHOLD || (items.length > 1 && state.settings.confirmBulkDownload)) {
    const choice = await showBulkDownloadGuide(items.length);
    if (choice !== 'continue') {
      showToast('Download paused', `${items.length.toLocaleString()} selected images are still selected.`);
      return;
    }
  }

  els.downloadSelected.disabled = true;
  let successful = 0;
  let failed = 0;
  for (let i = 0; i < items.length; i += 1) {
    els.downloadSelected.querySelector('span').textContent = `Downloading ${i + 1}/${items.length}`;
    const result = await downloadImageRobustly(items[i].url, { filename: filenameFor(i, items.length), saveAs: false });
    if (result.success) successful += 1;
    else failed += 1;
  }
  els.downloadSelected.querySelector('span').textContent = 'Download selected';
  els.downloadSelected.disabled = state.selected.size === 0;
  showToast('Bulk download finished', `${successful} downloaded${failed ? ` · ${failed} failed` : ''}.`, failed ? 'error' : 'info');
}

async function copyUrl(url) {
  try {
    await navigator.clipboard.writeText(url);
    showToast('Image URL copied');
  } catch (_) {
    showToast('Could not copy URL', 'Clipboard permission was unavailable.', 'error');
  }
}

function openPreview(url) {
  const item = state.images.get(url);
  if (!item) return;
  state.previewUrl = url;
  els.previewImage.src = item.url;
  els.previewImage.alt = item.alt || 'Image preview';
  els.previewTitle.textContent = displayName(item);
  els.previewMeta.textContent = `${dimensionsLabel(item)} · ${(item.sources || [item.source]).join(', ')}`;
  els.previewUrl.textContent = item.url;
  els.previewModal.classList.remove('hidden');
}

function closePreview() {
  state.previewUrl = null;
  els.previewImage.removeAttribute('src');
  els.previewModal.classList.add('hidden');
}

async function openFullWorkspace() {
  const tabId = state.scanTabId || state.initialTabId || '';
  const url = els.targetUrl.value || state.initialUrl || '';
  const params = new URLSearchParams();
  if (tabId) params.set('tabId', String(tabId));
  if (url) params.set('url', url);
  await flushWorkspaceSnapshot();
  const query = params.toString();
  await chrome.tabs.create({ url: `${chrome.runtime.getURL('views/dashboard.html')}${query ? `?${query}` : ''}` });
}

function bindNav() {
  document.querySelectorAll('.nav-item').forEach((button) => {
    button.addEventListener('click', () => {
      const section = button.dataset.section;
      document.querySelectorAll('.nav-item').forEach((item) => item.classList.toggle('active', item === button));
      if (section === 'settings') openSettings();
      else if (section === 'gallery') $('gallery-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
      else $('scanner-section').scrollIntoView({ behavior: 'smooth', block: 'start' });
    });
  });
}

function bindEvents() {
  els.startScan.addEventListener('click', startScan);
  els.stopScan.addEventListener('click', stopScan);
  els.useCurrentPage.addEventListener('click', useCurrentPage);
  els.targetUrl.addEventListener('keydown', (event) => { if (event.key === 'Enter') startScan(); });
  els.filterQuery.addEventListener('input', () => { state.renderLimit = PAGE_SIZE; scheduleRender(); });
  els.filterSource.addEventListener('change', () => { state.renderLimit = PAGE_SIZE; renderGallery(); });
  els.filterSize.addEventListener('change', () => { state.renderLimit = PAGE_SIZE; renderGallery(); });
  els.clearFilters.addEventListener('click', clearFilters);
  els.selectVisible.addEventListener('click', selectVisible);
  els.downloadSelected.addEventListener('click', downloadSelected);
  els.loadMore.addEventListener('click', () => { state.renderLimit += PAGE_SIZE; renderGallery(); schedulePersistWorkspace(); });
  els.previewClose.addEventListener('click', closePreview);
  els.previewDownload.addEventListener('click', () => { if (state.previewUrl) downloadOne(state.previewUrl); });
  els.previewModal.addEventListener('click', (event) => { if (event.target === els.previewModal) closePreview(); });
  els.bulkClose.addEventListener('click', () => closeBulkDownloadGuide('cancel'));
  els.bulkCancel.addEventListener('click', () => closeBulkDownloadGuide('cancel'));
  els.bulkReadyContinue.addEventListener('click', () => closeBulkDownloadGuide('continue'));
  els.bulkContinueAnyway.addEventListener('click', () => closeBulkDownloadGuide('continue'));
  els.bulkOpenDownloadSettings.addEventListener('click', openBrowserDownloadSettings);
  els.bulkDownloadModal.addEventListener('click', (event) => { if (event.target === els.bulkDownloadModal) closeBulkDownloadGuide('cancel'); });
  els.settingsButton.addEventListener('click', openSettings);
  els.settingsClose.addEventListener('click', closeSettings);
  els.settingsModal.addEventListener('click', (event) => { if (event.target === els.settingsModal) closeSettings(); });
  els.saveSettings.addEventListener('click', saveSettings);
  els.resetSettings.addEventListener('click', () => { state.settings = { ...DEFAULT_SETTINGS }; populateSettingsForm(); });
  els.openFullWorkspace.addEventListener('click', openFullWorkspace);
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape') {
      if (!els.previewModal.classList.contains('hidden')) closePreview();
      else if (!els.bulkDownloadModal.classList.contains('hidden')) closeBulkDownloadGuide('cancel');
      else if (!els.settingsModal.classList.contains('hidden')) closeSettings();
    }
  });
  chrome.runtime.onMessage.addListener(onScanMessage);
  bindNav();
}

async function init() {
  await loadSettings();
  await initializeTargetFromContext();
  await restoreWorkspaceSnapshot();
  bindEvents();
  setScanningUi(false);
  updateMetrics();
  renderGallery();
}

init().catch((error) => {
  console.error('[SnapStream] Dashboard initialization failed:', error);
  showToast('Workspace initialization failed', error.message || String(error), 'error');
});