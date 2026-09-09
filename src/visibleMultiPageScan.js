import { downloadImageRobustly } from './robustDownload.js';

const WORKSPACE_STATE_KEY = 'snapstreamWorkspaceSnapshotV3';
const SETTINGS_KEY = 'snapstreamVisibleMultiPageSettings';
const DEFAULT_SETTINGS = {
  enabled: true,
  maxPages: 100,
};
const PAGE_SIZE = 120;
const BULK_THRESHOLD = 10;

const $ = (id) => document.getElementById(id);

const state = {
  settings: { ...DEFAULT_SETTINGS },
  running: false,
  cancelled: false,
  tabId: null,
  createdTab: false,
  pageIndex: 0,
  expectedPages: 0,
  elementsChecked: 0,
  targetUrl: '',
  lastDomain: '',
  images: new Map(),
  selected: new Set(),
  visitedPages: new Set(),
  renderLimit: PAGE_SIZE,
  currentPreviewUrl: '',
};

function normalizeUrl(value) {
  const raw = String(value || '').trim();
  if (!raw) throw new Error('Paste a website URL first.');
  const withScheme = /^[a-z][a-z0-9+.-]*:/i.test(raw) ? raw : `https://${raw}`;
  const url = new URL(withScheme);
  if (!['http:', 'https:'].includes(url.protocol)) throw new Error('Only normal http:// or https:// websites can be scanned.');
  url.hash = '';
  return url.href;
}

function stripHash(value) {
  try {
    const url = new URL(value);
    url.hash = '';
    return url.href;
  } catch (_) {
    return String(value || '');
  }
}

function isNormalWebTab(tab) {
  return Boolean(tab && tab.id && tab.url && /^https?:\/\//i.test(tab.url));
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

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

function setScanStatus(title, detail, percent = null) {
  $('scan-status')?.classList.remove('hidden');
  const titleEl = $('scan-status-title');
  const detailEl = $('scan-status-detail');
  const bar = $('scan-progress-bar');
  if (titleEl) titleEl.textContent = title;
  if (detailEl) detailEl.textContent = detail || '';
  if (bar && percent !== null) bar.style.width = `${Math.max(2, Math.min(100, percent))}%`;
}

function setRunningUi(running) {
  state.running = running;
  const start = $('start-scan');
  const stop = $('stop-scan');
  const spinner = $('scan-spinner');
  if (start) {
    start.disabled = running;
    const label = start.querySelector('span');
    if (label) label.textContent = running ? 'Scanning pages…' : 'Start scan';
  }
  if (stop) stop.classList.toggle('hidden', !running);
  if (spinner) spinner.classList.toggle('done', !running && state.images.size > 0);
}

function pageProgressPercent() {
  const target = state.expectedPages > 0 ? state.expectedPages : state.settings.maxPages;
  return Math.min(98, 8 + (state.pageIndex / Math.max(1, target)) * 88);
}

function updateMetrics() {
  const total = state.images.size;
  const visible = getFilteredImages().length;
  if ($('result-count')) $('result-count').textContent = total.toLocaleString();
  if ($('visible-count')) $('visible-count').textContent = visible.toLocaleString();
  if ($('metric-found')) $('metric-found').textContent = total.toLocaleString();
  if ($('metric-pass')) $('metric-pass').textContent = state.pageIndex.toLocaleString();
  if ($('metric-elements')) $('metric-elements').textContent = state.elementsChecked.toLocaleString();
  if ($('selected-count')) $('selected-count').textContent = state.selected.size.toLocaleString();
  if ($('side-count')) $('side-count').textContent = `${total.toLocaleString()} image${total === 1 ? '' : 's'}`;
  if ($('side-domain')) $('side-domain').textContent = state.lastDomain || 'No website scanned';
  if ($('total-target-count')) {
    $('total-target-count').textContent = state.expectedPages > 0
      ? `${state.pageIndex.toLocaleString()}/${state.expectedPages.toLocaleString()} pages`
      : `${state.pageIndex.toLocaleString()} visible pages`;
  }
  if ($('count-caption')) {
    $('count-caption').textContent = state.pageIndex > 0
      ? `${total.toLocaleString()} unique images collected from ${state.pageIndex.toLocaleString()} visible browser page${state.pageIndex === 1 ? '' : 's'}`
      : `${total.toLocaleString()} unique images collected from this page`;
  }
  const download = $('download-selected');
  if (download) download.disabled = state.selected.size === 0;
}

function snapshotImage(item) {
  return {
    url: item.url,
    source: item.source || 'image',
    sources: Array.isArray(item.sources) ? item.sources : [item.source || 'image'],
    alt: item.alt || '',
    width: Number(item.width) || 0,
    height: Number(item.height) || 0,
    frameUrl: item.frameUrl || item.pageUrl || '',
    pageUrl: item.pageUrl || '',
    orderIndex: Number(item.orderIndex) || 0,
    discoveryIndex: Number(item.discoveryIndex) || 0,
  };
}

async function persistSnapshot() {
  try {
    const snapshot = {
      targetUrl: state.targetUrl,
      lastDomain: state.lastDomain,
      images: Array.from(state.images.values()).map(snapshotImage),
      selected: Array.from(state.selected),
      renderLimit: state.renderLimit,
      galleryTotal: state.expectedPages,
      galleryCompleted: state.pageIndex,
      galleryFailed: 0,
      nextDiscoveryIndex: state.images.size,
      savedAt: Date.now(),
    };
    await chrome.storage.local.set({ [WORKSPACE_STATE_KEY]: snapshot });
  } catch (error) {
    console.warn('[SnapStream] Could not save visible multi-page snapshot:', error);
  }
}

async function restoreSnapshot() {
  try {
    const stored = await chrome.storage.local.get([WORKSPACE_STATE_KEY]);
    const snapshot = stored[WORKSPACE_STATE_KEY];
    if (!snapshot || !Array.isArray(snapshot.images)) return;
    state.images.clear();
    state.selected.clear();
    state.targetUrl = snapshot.targetUrl || '';
    state.lastDomain = snapshot.lastDomain || '';
    state.pageIndex = Number(snapshot.galleryCompleted) || 0;
    state.expectedPages = Number(snapshot.galleryTotal) || 0;
    state.renderLimit = Math.max(PAGE_SIZE, Number(snapshot.renderLimit) || PAGE_SIZE);
    snapshot.images.forEach((item) => {
      if (!item || !item.url) return;
      state.images.set(item.url, snapshotImage(item));
    });
    (snapshot.selected || []).forEach((url) => {
      if (state.images.has(url)) state.selected.add(url);
    });
    renderGallery();
  } catch (_) {}
}

function resetResults() {
  state.images.clear();
  state.selected.clear();
  state.visitedPages.clear();
  state.pageIndex = 0;
  state.expectedPages = 0;
  state.elementsChecked = 0;
  state.renderLimit = PAGE_SIZE;
  state.currentPreviewUrl = '';
  renderGallery();
}

async function loadPluginSettings() {
  try {
    const stored = await chrome.storage.local.get([SETTINGS_KEY]);
    state.settings = { ...DEFAULT_SETTINGS, ...(stored[SETTINGS_KEY] || {}) };
  } catch (_) {
    state.settings = { ...DEFAULT_SETTINGS };
  }
}

async function savePluginSettings() {
  await chrome.storage.local.set({ [SETTINGS_KEY]: state.settings });
}

function injectUi() {
  if ($('visible-crawl-panel')) return;
  injectStyles();

  const scanStatus = $('scan-status');
  if (scanStatus) {
    const panel = document.createElement('div');
    panel.id = 'visible-crawl-panel';
    panel.className = 'visible-crawl-panel';
    panel.innerHTML = `
      <div>
        <strong>Visible multi-page crawl</strong>
        <small>Opens the next page in the browser, scans it, then continues through pagination.</small>
      </div>
      <label class="visible-toggle"><input id="visible-crawl-enabled" type="checkbox" /> <span>Follow next pages</span></label>
      <label class="visible-page-limit"><span>Max pages</span><input id="visible-crawl-max" type="number" min="1" max="500" step="1" /></label>
    `;
    scanStatus.insertAdjacentElement('beforebegin', panel);
  }

  const settingScanGroup = document.querySelector('.setting-group');
  if (settingScanGroup && !$('setting-visible-crawl-enabled')) {
    const wrapper = document.createElement('div');
    wrapper.className = 'visible-settings-block';
    wrapper.innerHTML = `
      <label class="setting-row"><span><strong>Visible multi-page crawl</strong><small>Navigate through Next / pagination pages in the real browser tab and keep collecting images.</small></span><input id="setting-visible-crawl-enabled" type="checkbox" /></label>
      <label class="setting-row stacked"><span><strong>Maximum pages</strong><small>Safety limit for long galleries. Default is 100 pages.</small></span><input id="setting-visible-crawl-max" type="number" min="1" max="500" step="1" /></label>
    `;
    settingScanGroup.appendChild(wrapper);
  }

  syncSettingsUi();
  ['visible-crawl-enabled', 'setting-visible-crawl-enabled'].forEach((id) => {
    $(id)?.addEventListener('change', async (event) => {
      state.settings.enabled = Boolean(event.target.checked);
      syncSettingsUi();
      await savePluginSettings();
    });
  });
  ['visible-crawl-max', 'setting-visible-crawl-max'].forEach((id) => {
    $(id)?.addEventListener('input', async (event) => {
      state.settings.maxPages = Math.max(1, Math.min(500, Number(event.target.value) || DEFAULT_SETTINGS.maxPages));
      syncSettingsUi();
      await savePluginSettings();
    });
  });
}

function syncSettingsUi() {
  ['visible-crawl-enabled', 'setting-visible-crawl-enabled'].forEach((id) => {
    const input = $(id);
    if (input) input.checked = Boolean(state.settings.enabled);
  });
  ['visible-crawl-max', 'setting-visible-crawl-max'].forEach((id) => {
    const input = $(id);
    if (input) input.value = String(state.settings.maxPages || DEFAULT_SETTINGS.maxPages);
  });
}

function injectStyles() {
  if ($('snapstream-visible-crawl-styles')) return;
  const style = document.createElement('style');
  style.id = 'snapstream-visible-crawl-styles';
  style.textContent = `
    .visible-crawl-panel{display:grid;grid-template-columns:minmax(0,1fr) auto auto;gap:14px;align-items:center;margin:16px 0;padding:15px 16px;border:1px solid rgba(92,73,242,.18);border-radius:18px;background:linear-gradient(135deg,#f8f7ff,#eef4ff);box-shadow:0 18px 45px rgba(76,91,140,.08)}
    .visible-crawl-panel strong{display:block;color:#111827;font-size:15px}.visible-crawl-panel small{display:block;color:#64748b;margin-top:4px;font-size:12.5px;line-height:1.4}.visible-toggle,.visible-page-limit{display:flex;align-items:center;gap:9px;color:#334155;font-size:12px;font-weight:800}.visible-toggle input{width:18px;height:18px;accent-color:#5c49f2}.visible-page-limit input{width:76px;border:1px solid #dbe3f0;border-radius:12px;padding:9px 10px;color:#111827;font-weight:800}.visible-settings-block{display:contents}.page-badge{position:absolute;left:10px;bottom:10px;padding:6px 9px;border-radius:999px;background:rgba(15,23,42,.72);color:white;font-size:11px;font-weight:850;backdrop-filter:blur(8px)}
    @media (max-width:760px){.visible-crawl-panel{grid-template-columns:1fr}.visible-toggle,.visible-page-limit{justify-content:space-between}.visible-page-limit input{width:120px}}
  `;
  document.head.appendChild(style);
}

async function getRecentWebTab() {
  const tabs = await chrome.tabs.query({ currentWindow: true });
  const webTabs = tabs.filter(isNormalWebTab);
  webTabs.sort((a, b) => (b.lastAccessed || 0) - (a.lastAccessed || 0));
  return webTabs[0] || null;
}

async function resolveTargetTab(targetUrl) {
  const normalized = stripHash(targetUrl);
  const [active] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (isNormalWebTab(active) && stripHash(active.url) === normalized) return { tab: active, created: false };

  const allTabs = await chrome.tabs.query({});
  const existing = allTabs.find((tab) => isNormalWebTab(tab) && stripHash(tab.url) === normalized);
  if (existing) {
    await chrome.tabs.update(existing.id, { active: true });
    return { tab: existing, created: false };
  }

  const recent = await getRecentWebTab();
  if (recent && stripHash(recent.url) === normalized) {
    await chrome.tabs.update(recent.id, { active: true });
    return { tab: recent, created: false };
  }

  const created = await chrome.tabs.create({ url: targetUrl, active: true });
  return { tab: created, created: true };
}

async function waitForTabComplete(tabId) {
  const started = Date.now();
  while (Date.now() - started < 70000) {
    const tab = await chrome.tabs.get(tabId);
    if (tab.status === 'complete' && isNormalWebTab(tab)) return tab;
    await sleep(300);
  }
  return chrome.tabs.get(tabId);
}

async function openOrNavigatePage(url, firstPage) {
  if (firstPage || !state.tabId) {
    const resolved = await resolveTargetTab(url);
    state.tabId = resolved.tab.id;
    state.createdTab = resolved.created;
    await chrome.tabs.update(state.tabId, { active: true });
  } else {
    await chrome.tabs.update(state.tabId, { url, active: true });
  }
  return waitForTabComplete(state.tabId);
}

async function startVisibleMultiPageScan() {
  if (state.running) return;

  let target;
  try {
    target = normalizeUrl($('target-url')?.value || '');
    if ($('target-url')) $('target-url').value = target;
  } catch (error) {
    showToast('Invalid website URL', error.message, 'error');
    return;
  }

  resetResults();
  state.targetUrl = target;
  state.cancelled = false;
  setRunningUi(true);
  setScanStatus('Starting visible page crawl…', 'SnapStream will open pages in the browser and scan them one by one.', 4);

  let nextUrl = target;

  try {
    while (!state.cancelled && nextUrl && state.pageIndex < state.settings.maxPages) {
      const normalized = stripHash(nextUrl);
      if (state.visitedPages.has(normalized)) break;
      state.visitedPages.add(normalized);

      const pageNumber = state.pageIndex + 1;
      setScanStatus(`Opening page ${pageNumber}…`, nextUrl, pageProgressPercent());
      const tab = await openOrNavigatePage(nextUrl, pageNumber === 1);
      state.lastDomain = new URL(tab.url).hostname;
      await chrome.runtime.sendMessage({ origin: new URL(tab.url).origin }).catch(() => {});
      await sleep(750);

      setScanStatus(`Scanning visible page ${pageNumber}…`, state.lastDomain, pageProgressPercent());
      const results = await chrome.scripting.executeScript({
        target: { tabId: state.tabId, allFrames: true },
        func: scanVisiblePage,
        args: [{
          scanDepth: readBasicScanDepth(),
          includeBackgrounds: readChecked('setting-backgrounds', true),
          includeLinked: readChecked('setting-linked', true),
          includeSrcset: readChecked('setting-srcset', true),
        }],
      });

      let topResult = null;
      for (const result of results || []) {
        const value = result?.result;
        if (!value) continue;
        if (value.isTopFrame) topResult = value;
        mergePageResult(value, pageNumber);
      }

      state.pageIndex = pageNumber;
      if (topResult?.counter?.total) state.expectedPages = Math.max(state.expectedPages, Number(topResult.counter.total) || 0);
      updateMetrics();
      renderGallery();
      await persistSnapshot();

      const foundNext = topResult?.nextUrl ? stripHash(topResult.nextUrl) : '';
      if (!foundNext || state.visitedPages.has(foundNext)) break;
      nextUrl = foundNext;
    }

    finishVisibleScan(true, state.cancelled ? 'Visible crawl stopped. Results found so far are ready.' : 'Visible multi-page crawl complete.');
  } catch (error) {
    finishVisibleScan(false, error.message || String(error));
  }
}

function readBasicScanDepth() {
  return $('setting-scan-depth')?.value || 'deep';
}

function readChecked(id, fallback) {
  const input = $(id);
  return input ? Boolean(input.checked) : fallback;
}

function stopVisibleScan() {
  if (!state.running) return;
  state.cancelled = true;
  setScanStatus('Stopping after current page…', 'SnapStream is keeping everything already collected.', null);
}

function finishVisibleScan(success, detail) {
  setRunningUi(false);
  updateMetrics();
  renderGallery();
  persistSnapshot().catch(() => {});

  if (success) {
    setScanStatus('Scan complete', `${state.images.size.toLocaleString()} images collected from ${state.pageIndex.toLocaleString()} visible browser page${state.pageIndex === 1 ? '' : 's'}.`, 100);
    showToast('Scan complete', `${state.images.size.toLocaleString()} images discovered across ${state.pageIndex.toLocaleString()} page${state.pageIndex === 1 ? '' : 's'}.`);
  } else {
    setScanStatus('Scan failed', detail || 'Unknown error', 100);
    showToast('Scan failed', detail || 'Unknown error', 'error');
  }
}

function mergePageResult(result, pageNumber) {
  const images = Array.isArray(result.images) ? result.images : [];
  state.elementsChecked += Number(result.elementsChecked) || 0;
  images.forEach((item, index) => {
    if (!item?.url) return;
    const existing = state.images.get(item.url);
    const orderIndex = (pageNumber * 100000) + (Number(item.orderIndex) || index + 1);
    if (existing) {
      existing.width = Math.max(existing.width || 0, Number(item.width) || 0);
      existing.height = Math.max(existing.height || 0, Number(item.height) || 0);
      existing.alt = existing.alt || item.alt || '';
      existing.sources = Array.from(new Set([...(existing.sources || [existing.source]), item.source || 'image']));
      existing.pageUrl = existing.pageUrl || result.pageUrl || item.pageUrl || '';
      return;
    }
    state.images.set(item.url, {
      url: item.url,
      source: item.source || 'image',
      sources: [item.source || 'image'],
      alt: item.alt || '',
      width: Number(item.width) || 0,
      height: Number(item.height) || 0,
      frameUrl: result.pageUrl || item.pageUrl || '',
      pageUrl: result.pageUrl || item.pageUrl || '',
      pageNumber,
      discoveryIndex: state.images.size + 1,
      orderIndex,
    });
  });
}

function activeSortOrder() {
  return $('sort-order')?.value || 'website';
}

function getFilteredImages() {
  const query = ($('filter-query')?.value || '').trim().toLowerCase();
  const source = $('filter-source')?.value || 'all';
  const size = $('filter-size')?.value || 'all';
  const filtered = Array.from(state.images.values()).filter((item) => {
    if (query) {
      const haystack = `${item.url} ${item.alt || ''} ${(item.sources || []).join(' ')} ${item.pageUrl || ''}`.toLowerCase();
      if (!haystack.includes(query)) return false;
    }
    if (source !== 'all' && !(item.sources || [item.source]).includes(source)) return false;
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

  const area = (item) => (Number(item.width) || 0) * (Number(item.height) || 0);
  const order = activeSortOrder();
  filtered.sort((a, b) => {
    if (order === 'newest') return (b.discoveryIndex || 0) - (a.discoveryIndex || 0);
    if (order === 'largest') return area(b) - area(a) || (a.orderIndex || 0) - (b.orderIndex || 0);
    if (order === 'smallest') return area(a) - area(b) || (a.orderIndex || 0) - (b.orderIndex || 0);
    if (order === 'source') return String(a.source).localeCompare(String(b.source)) || (a.orderIndex || 0) - (b.orderIndex || 0);
    return (a.orderIndex || a.discoveryIndex || 0) - (b.orderIndex || b.discoveryIndex || 0);
  });
  return filtered;
}

function displayName(item) {
  if (item.alt) return item.alt;
  try {
    const name = decodeURIComponent(new URL(item.url).pathname.split('/').filter(Boolean).pop() || 'Image');
    return name || 'Image';
  } catch (_) {
    return 'Image';
  }
}

function dimensionsLabel(item) {
  return item.width && item.height ? `${item.width.toLocaleString()} × ${item.height.toLocaleString()}` : 'Dimensions loading…';
}

function renderGallery() {
  const grid = $('gallery-grid');
  if (!grid) return;
  const filtered = getFilteredImages();
  const visible = filtered.slice(0, state.renderLimit);
  grid.textContent = '';
  $('empty-state')?.classList.toggle('hidden', state.images.size > 0);
  grid.classList.toggle('hidden', state.images.size === 0);
  const loadMore = $('load-more');
  if (loadMore) {
    loadMore.classList.toggle('hidden', visible.length >= filtered.length);
    loadMore.textContent = `Show more · ${(filtered.length - visible.length).toLocaleString()} remaining`;
  }
  const fragment = document.createDocumentFragment();
  visible.forEach((item) => fragment.appendChild(createImageCard(item)));
  grid.appendChild(fragment);
  const selectVisible = $('select-visible');
  if (selectVisible) {
    const selectedVisible = filtered.filter((item) => state.selected.has(item.url)).length;
    selectVisible.textContent = filtered.length > 0 && selectedVisible === filtered.length ? 'Deselect visible' : 'Select visible';
  }
  updateMetrics();
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
    current.width = img.naturalWidth || current.width || 0;
    current.height = img.naturalHeight || current.height || 0;
    persistSnapshot().catch(() => {});
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

  const sourceBadge = document.createElement('span');
  sourceBadge.className = 'source-badge';
  sourceBadge.textContent = item.source === 'image' ? 'page image' : item.source;
  stage.appendChild(sourceBadge);

  const orderBadge = document.createElement('span');
  orderBadge.className = 'order-badge';
  orderBadge.textContent = `#${(item.discoveryIndex || 0).toLocaleString()}`;
  stage.appendChild(orderBadge);

  const pageBadge = document.createElement('span');
  pageBadge.className = 'page-badge';
  pageBadge.textContent = `Page ${item.pageNumber || 1}`;
  stage.appendChild(pageBadge);

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

  const download = document.createElement('button');
  download.type = 'button';
  download.className = 'card-action';
  download.title = 'Download image';
  download.innerHTML = '<svg viewBox="0 0 24 24"><path d="M12 3v12"/><path d="m7 10 5 5 5-5"/><path d="M5 21h14"/></svg>';
  download.addEventListener('click', (event) => {
    event.stopPropagation();
    downloadOne(item);
  });
  footer.appendChild(download);

  body.append(title, footer);
  card.append(stage, body);
  return card;
}

function toggleSelected(url) {
  if (state.selected.has(url)) state.selected.delete(url);
  else state.selected.add(url);
  renderGallery();
  persistSnapshot().catch(() => {});
}

function selectVisible() {
  const filtered = getFilteredImages();
  const allSelected = filtered.length > 0 && filtered.every((item) => state.selected.has(item.url));
  filtered.forEach((item) => {
    if (allSelected) state.selected.delete(item.url);
    else state.selected.add(item.url);
  });
  renderGallery();
  persistSnapshot().catch(() => {});
}

function sanitizeSegment(value, fallback = '') {
  const cleaned = String(value || '')
    .replace(/[<>:"|?*\x00-\x1F]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/^\/+|\/+$/g, '')
    .trim();
  return cleaned || fallback;
}

function filenameFor(item, index, total) {
  const folder = sanitizeSegment($('setting-folder')?.value || 'SnapStream');
  const prefix = sanitizeSegment($('setting-prefix')?.value || 'image', 'image');
  const digits = String(Math.max(total, 1)).length;
  const number = String(index + 1).padStart(digits, '0');
  const page = item.pageNumber ? `_p${String(item.pageNumber).padStart(3, '0')}` : '';
  return `${folder ? `${folder}/` : ''}${prefix}${page}_${number}`;
}

async function downloadOne(item) {
  const result = await downloadImageRobustly(item.url, { filename: filenameFor(item, 0, 1), item, pageUrl: item.pageUrl, saveAs: false });
  if (result.success) showToast('Download started', result.filename || displayName(item));
  else showToast('Download failed', result.error || 'The image could not be downloaded.', 'error');
}

async function downloadSelected() {
  const items = Array.from(state.selected)
    .map((url) => state.images.get(url))
    .filter(Boolean)
    .sort((a, b) => (a.orderIndex || 0) - (b.orderIndex || 0));
  if (!items.length) return;

  if (items.length > BULK_THRESHOLD) {
    await persistSnapshot();
    showToast('ZIP recommended', 'Use Download ZIP for large selections to avoid repeated browser prompts.');
  }

  const button = $('download-selected');
  if (button) button.disabled = true;
  let successful = 0;
  let failed = 0;
  for (let i = 0; i < items.length; i += 1) {
    const label = button?.querySelector('span');
    if (label) label.textContent = `Downloading ${i + 1}/${items.length}`;
    const result = await downloadImageRobustly(items[i].url, { filename: filenameFor(items[i], i, items.length), item: items[i], pageUrl: items[i].pageUrl, saveAs: false });
    if (result.success) successful += 1;
    else failed += 1;
  }
  const label = button?.querySelector('span');
  if (label) label.textContent = 'Download selected';
  if (button) button.disabled = state.selected.size === 0;
  showToast('Bulk download finished', `${successful} downloaded${failed ? ` · ${failed} failed` : ''}.`, failed ? 'error' : 'info');
}

function openPreview(url) {
  const item = state.images.get(url);
  if (!item) return;
  state.currentPreviewUrl = url;
  if ($('preview-image')) $('preview-image').src = item.url;
  if ($('preview-title')) $('preview-title').textContent = displayName(item);
  if ($('preview-meta')) $('preview-meta').textContent = `${dimensionsLabel(item)} · page ${item.pageNumber || 1} · ${(item.sources || [item.source]).join(', ')}`;
  if ($('preview-url')) $('preview-url').textContent = item.url;
  $('preview-modal')?.classList.remove('hidden');
}

function closePreview() {
  state.currentPreviewUrl = '';
  $('preview-modal')?.classList.add('hidden');
  $('preview-image')?.removeAttribute('src');
}

function ownsResults() {
  return state.running || state.images.size > 0 || state.settings.enabled;
}

function wireEvents() {
  $('start-scan')?.addEventListener('click', (event) => {
    if (!state.settings.enabled) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    startVisibleMultiPageScan();
  }, true);

  $('stop-scan')?.addEventListener('click', (event) => {
    if (!state.running) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    stopVisibleScan();
  }, true);

  $('select-visible')?.addEventListener('click', (event) => {
    if (!ownsResults()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    selectVisible();
  }, true);

  $('download-selected')?.addEventListener('click', (event) => {
    if (!ownsResults()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    downloadSelected();
  }, true);

  $('load-more')?.addEventListener('click', (event) => {
    if (!ownsResults()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    state.renderLimit += PAGE_SIZE;
    renderGallery();
  }, true);

  $('clear-filters')?.addEventListener('click', (event) => {
    if (!ownsResults()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    if ($('filter-query')) $('filter-query').value = '';
    if ($('filter-source')) $('filter-source').value = 'all';
    if ($('filter-size')) $('filter-size').value = 'all';
    renderGallery();
  }, true);

  ['filter-query', 'filter-source', 'filter-size', 'sort-order'].forEach((id) => {
    $(id)?.addEventListener(id === 'filter-query' ? 'input' : 'change', (event) => {
      if (!ownsResults()) return;
      event.stopImmediatePropagation();
      state.renderLimit = PAGE_SIZE;
      renderGallery();
      persistSnapshot().catch(() => {});
    }, true);
  });

  $('preview-close')?.addEventListener('click', (event) => {
    if (!ownsResults()) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    closePreview();
  }, true);

  $('preview-download')?.addEventListener('click', (event) => {
    if (!ownsResults() || !state.currentPreviewUrl) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    const item = state.images.get(state.currentPreviewUrl);
    if (item) downloadOne(item);
  }, true);
}

function scanVisiblePage(options = {}) {
  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
  const currentPageUrl = location.href;
  const isTopFrame = window === window.top;
  const seen = new Set();
  const images = [];
  let orderIndex = 0;
  let elementsChecked = 0;

  function absoluteUrl(value, base = document.baseURI) {
    if (!value || typeof value !== 'string') return null;
    const raw = value.trim().replace(/^['\"]|['\"]$/g, '');
    if (!raw || raw === 'none' || raw.startsWith('blob:')) return null;
    if (raw.startsWith('data:image/')) return raw;
    try {
      const url = new URL(raw, base);
      if (!['http:', 'https:'].includes(url.protocol)) return null;
      url.hash = '';
      return url.href;
    } catch (_) {
      return null;
    }
  }

  function parseSrcset(value) {
    if (!value) return [];
    return value.split(',').map((part) => part.trim().split(/\s+/)[0]).filter(Boolean);
  }

  function cssUrls(value) {
    if (!value || value === 'none') return [];
    const urls = [];
    const regex = /url\((['\"]?)(.*?)\1\)/gi;
    let match;
    while ((match = regex.exec(value))) urls.push(match[2]);
    return urls;
  }

  function looksLikeImage(url) {
    return /\.(?:avif|bmp|gif|jpe?g|jfif|png|svg|tiff?|webp)(?:$|[?#])/i.test(url || '');
  }

  function junkUrl(url) {
    if (!url || url.startsWith('data:image/')) return false;
    return /(?:^|[\/_\-.])(logo|sprite|icon|favicon|badge|button|btn|arrow|loader|loading|spinner|spacer|pixel|blank|transparent|social|advert|advertise|advertisement|banner|ads?|tracking)(?:[\/_\-.]|$)/i.test(url);
  }

  function junkDimensions(width, height) {
    width = Number(width) || 0;
    height = Number(height) || 0;
    if (!width || !height) return false;
    if (width <= 90 || height <= 70) return true;
    const ratio = Math.max(width, height) / Math.max(1, Math.min(width, height));
    return ratio >= 5 && Math.min(width, height) < 300;
  }

  function add(raw, source, element, extra = {}) {
    const url = absoluteUrl(raw, extra.pageUrl || document.baseURI);
    if (!url || seen.has(url)) return;
    const width = Number(extra.width || (element && (element.naturalWidth || element.videoWidth || element.getAttribute?.('width'))) || 0);
    const height = Number(extra.height || (element && (element.naturalHeight || element.videoHeight || element.getAttribute?.('height'))) || 0);
    if (source !== 'meta' && source !== 'linked' && (junkUrl(url) || junkDimensions(width, height))) return;
    seen.add(url);
    orderIndex += 1;
    images.push({
      url,
      source,
      alt: extra.alt || (element?.getAttribute?.('alt') || element?.getAttribute?.('title') || ''),
      width,
      height,
      pageUrl: currentPageUrl,
      orderIndex,
    });
  }

  function inspectElement(element, computed = false) {
    if (!element || element.nodeType !== Node.ELEMENT_NODE) return;
    elementsChecked += 1;
    const tag = element.tagName.toLowerCase();
    if (tag === 'img') {
      add(element.currentSrc, 'image', element);
      add(element.src, 'image', element);
      ['data-src','data-lazy-src','data-original','data-image','data-url','data-fallback-src'].forEach((name) => add(element.getAttribute(name), 'image', element));
      if (options.includeSrcset !== false) {
        parseSrcset(element.getAttribute('srcset')).forEach((url) => add(url, 'image', element));
        parseSrcset(element.getAttribute('data-srcset')).forEach((url) => add(url, 'image', element));
      }
    } else if (tag === 'source' && options.includeSrcset !== false) {
      parseSrcset(element.getAttribute('srcset')).forEach((url) => add(url, 'image', element));
    } else if (tag === 'a' && options.includeLinked !== false) {
      if (looksLikeImage(element.href)) add(element.href, 'linked', element);
    } else if (tag === 'meta') {
      const property = (element.getAttribute('property') || element.getAttribute('name') || '').toLowerCase();
      if (['og:image','og:image:url','og:image:secure_url','twitter:image','twitter:image:src'].includes(property)) add(element.content, 'meta', element);
    } else if (tag === 'video') {
      add(element.poster, 'background', element);
    }
    ['data-bg','data-background','data-background-image','data-bg-src','poster'].forEach((name) => add(element.getAttribute?.(name), 'background', element));
    if (options.includeBackgrounds !== false) {
      cssUrls(element.getAttribute?.('style')).forEach((url) => add(url, 'background', element));
      if (computed) {
        try {
          const style = getComputedStyle(element);
          cssUrls(style.backgroundImage).forEach((url) => add(url, 'background', element));
          cssUrls(style.borderImageSource).forEach((url) => add(url, 'background', element));
        } catch (_) {}
      }
    }
  }

  function inspectDocument(deepBackground = false) {
    document.querySelectorAll('img,source,picture,a,image,input[type="image"],video,object,meta,link,[data-src],[data-lazy-src],[data-original],[data-image],[data-url],[data-bg],[data-bg-src],[data-background],[data-background-image],[poster],[style]').forEach((el) => inspectElement(el, false));
    if (deepBackground && options.includeBackgrounds !== false) document.querySelectorAll('*').forEach((el) => inspectElement(el, true));
    try {
      performance.getEntriesByType('resource').forEach((entry) => {
        if (entry.initiatorType === 'img' || looksLikeImage(entry.name)) add(entry.name, 'resource', null);
      });
    } catch (_) {}
  }

  function readCounter() {
    const text = `${document.querySelector('[class*="count"],[class*="counter"],[class*="page"],[id*="count"],[id*="counter"],[id*="page"]')?.textContent || ''} ${(document.body?.innerText || document.body?.textContent || '').slice(0, 120000)}`;
    const match = text.replace(/\s+/g, ' ').match(/\b(\d{1,5})\s*(?:\/|of)\s*(\d{1,5})\b/i);
    if (!match) return null;
    const current = Number(match[1]);
    const total = Number(match[2]);
    return current > 0 && total >= current ? { current, total } : null;
  }

  function numericSeries(value) {
    try {
      const url = new URL(value, location.href);
      const match = url.pathname.match(/^(.*?[-_])(\d+)(\.html?)$/i);
      if (!match) return null;
      return { origin: url.origin, prefix: match[1], number: Number(match[2]), suffix: match[3], search: url.search };
    } catch (_) {
      return null;
    }
  }

  function scoreNextAnchor(anchor, counter) {
    const href = absoluteUrl(anchor.getAttribute('href'), currentPageUrl);
    if (!href || href === currentPageUrl) return null;
    let score = 0;
    const text = `${anchor.textContent || ''} ${anchor.getAttribute('aria-label') || ''} ${anchor.getAttribute('title') || ''} ${anchor.getAttribute('rel') || ''} ${anchor.className || ''} ${anchor.id || ''}`.toLowerCase();
    if (/\bnext\b|nextpage|next-page|pager-next|pagination-next|\bolder\b|more/i.test(text)) score += 45;
    if (/[›»→]/.test(text.trim())) score += 30;
    if (/\bprev\b|previous|back|newer|[‹«←]/i.test(text)) score -= 80;
    if (/disabled|inactive|current/i.test(text)) score -= 40;
    if (/page|pager|pagination|gallery|slide|photo/i.test(text)) score += 10;
    const numberText = (anchor.textContent || '').trim().match(/^\d{1,5}$/);
    if (counter && numberText && Number(numberText[0]) === counter.current + 1) score += 55;
    const currentSeries = numericSeries(currentPageUrl);
    const hrefSeries = numericSeries(href);
    if (currentSeries && hrefSeries && currentSeries.origin === hrefSeries.origin && currentSeries.prefix === hrefSeries.prefix && currentSeries.suffix.toLowerCase() === hrefSeries.suffix.toLowerCase()) {
      const distance = Math.abs(hrefSeries.number - currentSeries.number);
      if (distance === 1) score += 22;
      else if (distance <= 5) score += 10;
    }
    try {
      if (new URL(href).hostname !== location.hostname) score -= 70;
    } catch (_) {}
    return score > 0 ? { href, score } : null;
  }

  function detectNextUrl(counter) {
    const relNext = document.querySelector('link[rel~="next"], a[rel~="next"]');
    const relUrl = absoluteUrl(relNext?.getAttribute('href'), currentPageUrl);
    if (relUrl) return relUrl;

    const candidates = Array.from(document.querySelectorAll('a[href]'))
      .map((anchor) => scoreNextAnchor(anchor, counter))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    if (candidates.length) return candidates[0].href;

    for (const element of document.querySelectorAll('button,[role="button"],[onclick]')) {
      const raw = `${element.getAttribute('onclick') || ''} ${element.getAttribute('data-href') || ''} ${element.getAttribute('data-url') || ''}`;
      const match = raw.match(/(?:location\.href|window\.location|href)\s*=\s*['\"]([^'\"]+)['\"]/i) || raw.match(/['\"](https?:\/\/[^'\"]+|[^'\"]+\.html?)['\"]/i);
      const url = absoluteUrl(match?.[1], currentPageUrl);
      const text = `${element.textContent || ''} ${element.getAttribute('aria-label') || ''} ${element.className || ''}`.toLowerCase();
      if (url && /next|older|more|›|»|→/i.test(text) && !/prev|previous|back|newer/i.test(text)) return url;
    }
    return null;
  }

  return (async () => {
    const originalX = window.scrollX;
    const originalY = window.scrollY;
    const depth = options.scanDepth || 'deep';
    const rounds = depth === 'balanced' ? 8 : depth === 'exhaustive' ? 22 : 14;
    const delay = depth === 'balanced' ? 320 : depth === 'exhaustive' ? 520 : 420;
    inspectDocument(true);
    let lastHeight = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
    let stable = 0;
    for (let pass = 0; pass < rounds; pass += 1) {
      const viewport = Math.max(window.innerHeight || 0, 650);
      const height = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
      const maxScroll = Math.max(0, height - viewport);
      const nextY = Math.min(maxScroll, window.scrollY + Math.max(420, Math.round(viewport * 0.82)));
      window.scrollTo({ top: nextY, behavior: 'auto' });
      await sleep(delay);
      inspectDocument(pass % 4 === 0);
      const currentHeight = Math.max(document.documentElement.scrollHeight, document.body?.scrollHeight || 0);
      if (window.scrollY + viewport >= currentHeight - 16 && currentHeight <= lastHeight + 2) stable += 1;
      else stable = 0;
      lastHeight = currentHeight;
      if (stable >= 4) break;
    }
    inspectDocument(true);
    const counter = isTopFrame ? readCounter() : null;
    const nextUrl = isTopFrame ? detectNextUrl(counter) : null;
    window.scrollTo(originalX, originalY);
    return { isTopFrame, pageUrl: currentPageUrl, title: document.title || '', counter, nextUrl, images, elementsChecked };
  })();
}

async function init() {
  await loadPluginSettings();
  injectUi();
  wireEvents();
  await restoreSnapshot();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init, { once: true });
} else {
  init();
}
