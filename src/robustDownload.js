/**
 * Robust image download utility.
 * - Validates image responses when possible.
 * - Prepares a referrer rule for protected/hotlink-sensitive sites.
 * - Falls back to Chrome's native download path when a protected host blocks extension fetches.
 * - Builds dependency-free ZIP files for selected bulk downloads.
 */

const MIME_TYPE_TO_EXTENSION = {
  'image/jpeg': 'jpg',
  'image/jpg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'image/avif': 'avif',
  'image/svg+xml': 'svg',
  'image/bmp': 'bmp',
  'image/x-icon': 'ico',
  'image/vnd.microsoft.icon': 'ico',
  'image/tiff': 'tiff',
  'image/x-tiff': 'tiff',
  'image/jfif': 'jfif',
};

const SNAPSHOT_KEYS = [
  'snapstreamWorkspaceSnapshotV3',
  'snapstreamWorkspaceSnapshotV2',
  'snapstreamWorkspaceSettings',
];

const PROTECTED_STATUS_CODES = new Set([401, 403, 429]);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function getExtensionFromContentType(contentType) {
  if (!contentType) return null;
  const mimeType = contentType.split(';')[0].trim().toLowerCase();
  return MIME_TYPE_TO_EXTENSION[mimeType] || null;
}

function isHtmlContentType(contentType) {
  if (!contentType) return false;
  const mimeType = contentType.split(';')[0].trim().toLowerCase();
  return mimeType === 'text/html' || mimeType === 'application/xhtml+xml';
}

function isImageContentType(contentType) {
  if (!contentType) return false;
  const mimeType = contentType.split(';')[0].trim().toLowerCase();
  return mimeType.startsWith('image/');
}

function getExtensionFromUrl(url) {
  try {
    const path = new URL(url).pathname;
    const match = path.match(/\.([a-z0-9]{2,5})$/i);
    return match ? match[1].toLowerCase() : null;
  } catch (_) {
    return null;
  }
}

function extensionFor(url, contentType) {
  return getExtensionFromContentType(contentType) || getExtensionFromUrl(url) || 'jpg';
}

function sanitizeFilenameSegment(value, fallback = 'image') {
  const cleaned = String(value || '')
    .replace(/[<>:"/\\|?*\x00-\x1F]/g, '_')
    .replace(/\s+/g, '_')
    .replace(/_+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 80);
  return cleaned || fallback;
}

function sanitizeDownloadFolder(value) {
  return String(value || '')
    .replace(/[<>:"|?*\x00-\x1F]/g, '_')
    .replace(/\.\./g, '_')
    .replace(/^\/+|\/+$/g, '')
    .trim();
}

function normalizeHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return '';
    url.hash = '';
    return url.href;
  } catch (_) {
    return '';
  }
}

function sameOriginFallbackReferrer(url) {
  try {
    const parsed = new URL(url);
    return `${parsed.origin}/`;
  } catch (_) {
    return '';
  }
}

function filenameWithExtension(url, filename, extension) {
  let output = filename;
  if (!output) {
    try {
      const urlPath = new URL(url).pathname;
      const urlFilename = decodeURIComponent(urlPath.split('/').pop() || '');
      output = urlFilename && urlFilename.includes('.')
        ? urlFilename.replace(/\.[^.]+$/, `.${extension}`)
        : `image_${Date.now()}.${extension}`;
    } catch (_) {
      output = `image_${Date.now()}.${extension}`;
    }
  } else if (!output.includes('.')) {
    output = `${output}.${extension}`;
  } else {
    output = output.replace(/\.[^.]+$/, `.${extension}`);
  }
  return output;
}

async function getStoredImageContext(url) {
  if (typeof chrome === 'undefined' || !chrome.storage?.local) return null;
  try {
    const stored = await chrome.storage.local.get(SNAPSHOT_KEYS);
    const snapshot = stored.snapstreamWorkspaceSnapshotV3 || stored.snapstreamWorkspaceSnapshotV2 || {};
    const images = Array.isArray(snapshot.images) ? snapshot.images : [];
    const item = images.find((image) => image && image.url === url) || null;
    return item ? { ...item, targetUrl: snapshot.targetUrl || '' } : { targetUrl: snapshot.targetUrl || '' };
  } catch (_) {
    return null;
  }
}

async function prepareDownloadRequest(url, options = {}) {
  if (typeof chrome === 'undefined' || !chrome.runtime?.sendMessage) return '';

  const context = options.item || await getStoredImageContext(url);
  const referrerUrl = normalizeHttpUrl(
    options.referrerUrl ||
    options.pageUrl ||
    options.frameUrl ||
    context?.pageUrl ||
    context?.frameUrl ||
    context?.targetUrl ||
    sameOriginFallbackReferrer(url)
  );

  if (!referrerUrl) return '';

  try {
    await chrome.runtime.sendMessage({
      type: 'SNAPSTREAM_PREPARE_DOWNLOAD',
      resourceUrl: url,
      referrerUrl,
    });
    await sleep(90);
    return referrerUrl;
  } catch (error) {
    console.warn('[SnapStream] Could not prepare protected-site download referrer:', error);
    return referrerUrl;
  }
}

async function fetchWithPreparedReferrer(url, options = {}) {
  const referrerUrl = await prepareDownloadRequest(url, options);
  let response = await fetch(url, {
    credentials: 'include',
    cache: 'no-store',
    signal: options.signal,
  });

  if (!response.ok && PROTECTED_STATUS_CODES.has(response.status)) {
    const fallbackReferrer = sameOriginFallbackReferrer(url);
    if (fallbackReferrer && fallbackReferrer !== referrerUrl) {
      await prepareDownloadRequest(url, { ...options, referrerUrl: fallbackReferrer });
      response = await fetch(url, {
        credentials: 'include',
        cache: 'no-store',
        signal: options.signal,
      });
    }
  }

  return response;
}

function downloadObjectUrl(objectUrl, filename, options = {}) {
  return new Promise((resolve) => {
    chrome.downloads.download({
      url: objectUrl,
      filename,
      saveAs: Boolean(options.saveAs),
      conflictAction: 'uniquify',
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        URL.revokeObjectURL(objectUrl);
        resolve({
          success: false,
          error: chrome.runtime.lastError.message,
          url: options.originalUrl || objectUrl,
        });
        return;
      }

      const listener = (delta) => {
        if (delta.id === downloadId && delta.state) {
          if (delta.state.current === 'complete' || delta.state.current === 'interrupted') {
            chrome.downloads.onChanged.removeListener(listener);
            URL.revokeObjectURL(objectUrl);
          }
        }
      };
      chrome.downloads.onChanged.addListener(listener);

      resolve({
        success: true,
        downloadId,
        url: options.originalUrl || objectUrl,
        filename,
        extension: options.extension,
      });
    });
  });
}

async function nativeDownloadFallback(url, options = {}, reason = '') {
  await prepareDownloadRequest(url, options);
  const extension = extensionFor(url, '');
  const filename = filenameWithExtension(url, options.filename, extension);

  return new Promise((resolve) => {
    chrome.downloads.download({
      url,
      filename,
      saveAs: Boolean(options.saveAs),
      conflictAction: 'uniquify',
    }, (downloadId) => {
      if (chrome.runtime.lastError) {
        resolve({
          success: false,
          error: chrome.runtime.lastError.message,
          url,
          fallbackReason: reason,
        });
        return;
      }

      resolve({
        success: true,
        downloadId,
        url,
        filename,
        extension,
        usedNativeFallback: Boolean(reason),
        fallbackReason: reason,
      });
    });
  });
}

export async function downloadImageRobustly(url, options = {}) {
  try {
    const response = await fetchWithPreparedReferrer(url, options);

    if (!response.ok) {
      console.warn(`[SnapStream] Fetch returned HTTP ${response.status}; trying browser-native download fallback for: ${url}`);
      return nativeDownloadFallback(url, options, `HTTP ${response.status}`);
    }

    const contentType = response.headers.get('content-type') || '';

    if (isHtmlContentType(contentType)) {
      console.warn(`[SnapStream] Aborting: URL returned an HTML page, not an image: ${url}`);
      return {
        success: false,
        error: 'URL returned an HTML page, not an image',
        url,
        contentType,
      };
    }

    if (contentType && !isImageContentType(contentType)) {
      console.warn(`[SnapStream] Content-Type is not image/* (${contentType}); using file extension fallback for: ${url}`);
    }

    const extension = extensionFor(url, contentType);
    const blob = await response.blob();
    const objectUrl = URL.createObjectURL(blob);
    const filename = filenameWithExtension(url, options.filename, extension);

    return downloadObjectUrl(objectUrl, filename, {
      ...options,
      originalUrl: url,
      extension,
    });
  } catch (error) {
    if (error && error.name === 'AbortError') {
      return { success: false, error: 'Download cancelled', url };
    }

    console.warn(`[SnapStream] Fetch download failed; trying browser-native fallback for: ${url}`, error);
    return nativeDownloadFallback(url, options, error?.message || String(error));
  }
}

export async function downloadImagesRobustly(urls, options = {}) {
  const results = {
    total: urls.length,
    successful: 0,
    failed: 0,
    details: [],
  };

  for (const url of urls) {
    const result = await downloadImageRobustly(url, options);
    results.details.push(result);
    if (result.success) results.successful += 1;
    else results.failed += 1;
  }

  return results;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let i = 0; i < 256; i += 1) {
    let value = i;
    for (let bit = 0; bit < 8; bit += 1) {
      value = (value & 1) ? (0xedb88320 ^ (value >>> 1)) : (value >>> 1);
    }
    table[i] = value >>> 0;
  }
  return table;
})();

function crc32(bytes) {
  let crc = 0xffffffff;
  for (let i = 0; i < bytes.length; i += 1) {
    crc = CRC_TABLE[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
  }
  return (crc ^ 0xffffffff) >>> 0;
}

function writeUint16(view, offset, value) {
  view.setUint16(offset, value, true);
}

function writeUint32(view, offset, value) {
  view.setUint32(offset, value >>> 0, true);
}

function dosDateTime(date = new Date()) {
  const year = Math.max(1980, date.getFullYear());
  const dosTime = (date.getHours() << 11) | (date.getMinutes() << 5) | Math.floor(date.getSeconds() / 2);
  const dosDate = ((year - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate();
  return { dosTime, dosDate };
}

function buildZipBlob(entries) {
  const encoder = new TextEncoder();
  const localParts = [];
  const centralParts = [];
  const { dosTime, dosDate } = dosDateTime();
  let offset = 0;
  let centralSize = 0;

  for (const entry of entries) {
    const nameBytes = encoder.encode(entry.name);
    const data = new Uint8Array(entry.data);
    const crc = crc32(data);

    if (nameBytes.length > 0xffff) throw new Error(`Filename is too long: ${entry.name}`);
    if (data.length > 0xffffffff || offset > 0xffffffff) {
      throw new Error('This ZIP is too large for the built-in ZIP writer. Download fewer images at once.');
    }

    const localOffset = offset;
    const localHeader = new Uint8Array(30 + nameBytes.length);
    const localView = new DataView(localHeader.buffer);
    writeUint32(localView, 0, 0x04034b50);
    writeUint16(localView, 4, 20);
    writeUint16(localView, 6, 0x0800);
    writeUint16(localView, 8, 0);
    writeUint16(localView, 10, dosTime);
    writeUint16(localView, 12, dosDate);
    writeUint32(localView, 14, crc);
    writeUint32(localView, 18, data.length);
    writeUint32(localView, 22, data.length);
    writeUint16(localView, 26, nameBytes.length);
    writeUint16(localView, 28, 0);
    localHeader.set(nameBytes, 30);

    const centralHeader = new Uint8Array(46 + nameBytes.length);
    const centralView = new DataView(centralHeader.buffer);
    writeUint32(centralView, 0, 0x02014b50);
    writeUint16(centralView, 4, 20);
    writeUint16(centralView, 6, 20);
    writeUint16(centralView, 8, 0x0800);
    writeUint16(centralView, 10, 0);
    writeUint16(centralView, 12, dosTime);
    writeUint16(centralView, 14, dosDate);
    writeUint32(centralView, 16, crc);
    writeUint32(centralView, 20, data.length);
    writeUint32(centralView, 24, data.length);
    writeUint16(centralView, 28, nameBytes.length);
    writeUint16(centralView, 30, 0);
    writeUint16(centralView, 32, 0);
    writeUint16(centralView, 34, 0);
    writeUint16(centralView, 36, 0);
    writeUint32(centralView, 38, 0);
    writeUint32(centralView, 42, localOffset);
    centralHeader.set(nameBytes, 46);

    localParts.push(localHeader, data);
    centralParts.push(centralHeader);
    offset += localHeader.length + data.length;
    centralSize += centralHeader.length;
  }

  const centralOffset = offset;
  const eocd = new Uint8Array(22);
  const eocdView = new DataView(eocd.buffer);
  writeUint32(eocdView, 0, 0x06054b50);
  writeUint16(eocdView, 4, 0);
  writeUint16(eocdView, 6, 0);
  writeUint16(eocdView, 8, entries.length);
  writeUint16(eocdView, 10, entries.length);
  writeUint32(eocdView, 12, centralSize);
  writeUint32(eocdView, 16, centralOffset);
  writeUint16(eocdView, 20, 0);

  return new Blob([...localParts, ...centralParts, eocd], { type: 'application/zip' });
}

async function fetchZipEntry(item, index, total, settings, signal) {
  const response = await fetchWithPreparedReferrer(item.url, {
    item,
    pageUrl: item.pageUrl || settings.targetUrl,
    frameUrl: item.frameUrl,
    signal,
  });

  if (!response.ok) {
    throw new Error(`HTTP ${response.status}`);
  }

  const contentType = response.headers.get('content-type') || '';
  if (isHtmlContentType(contentType)) throw new Error('URL returned HTML instead of image');

  const blob = await response.blob();
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const extension = extensionFor(item.url, contentType || blob.type);
  const digits = String(Math.max(total, 1)).length;
  const number = String(index + 1).padStart(digits, '0');
  const prefix = sanitizeFilenameSegment(settings.filenamePrefix || 'image', 'image');
  const stem = `${prefix}_${number}`;

  return {
    name: `${stem}.${extension}`,
    data: bytes,
  };
}

function uniqueZipEntryNames(entries) {
  const seen = new Map();
  return entries.map((entry) => {
    const count = seen.get(entry.name) || 0;
    seen.set(entry.name, count + 1);
    if (!count) return entry;
    const dot = entry.name.lastIndexOf('.');
    const base = dot >= 0 ? entry.name.slice(0, dot) : entry.name;
    const ext = dot >= 0 ? entry.name.slice(dot) : '';
    return { ...entry, name: `${base}_${count + 1}${ext}` };
  });
}

async function readSelectedZipItems() {
  await sleep(420);

  const stored = await chrome.storage.local.get(SNAPSHOT_KEYS);
  const snapshot = stored.snapstreamWorkspaceSnapshotV3 || stored.snapstreamWorkspaceSnapshotV2 || {};
  const settings = { ...(stored.snapstreamWorkspaceSettings || {}), targetUrl: snapshot.targetUrl || '' };
  const images = new Map();
  const selected = new Set(Array.isArray(snapshot.selected) ? snapshot.selected : []);

  if (Array.isArray(snapshot.images)) {
    for (const image of snapshot.images) {
      if (image && image.url) images.set(image.url, image);
    }
  }

  document.querySelectorAll('.image-card.selected[data-url]').forEach((card) => {
    const url = card.dataset.url;
    if (!url) return;
    selected.add(url);
    if (!images.has(url)) {
      images.set(url, {
        url,
        alt: card.querySelector('.card-title strong')?.textContent || '',
        orderIndex: Number((card.querySelector('.order-badge')?.textContent || '').replace(/\D+/g, '')) || 0,
        pageUrl: snapshot.targetUrl || '',
      });
    }
  });

  const items = Array.from(selected)
    .map((url) => images.get(url))
    .filter((item) => item && item.url)
    .sort((a, b) => {
      const left = Number(a.orderIndex || a.discoveryIndex || 0);
      const right = Number(b.orderIndex || b.discoveryIndex || 0);
      return left - right;
    });

  return { items, settings };
}

function zipDownloadFilename(settings, count) {
  const folder = sanitizeDownloadFolder(settings.downloadFolder || 'SnapStream');
  const prefix = sanitizeFilenameSegment(settings.filenamePrefix || 'snapstream', 'snapstream');
  const stamp = new Date().toISOString().slice(0, 19).replace(/[-:T]/g, '');
  const name = `${prefix}_${count}_images_${stamp}.zip`;
  return folder ? `${folder}/${name}` : name;
}

let zipAbortController = null;
let zipDialogInstalled = false;

function ensureZipDialog() {
  if (zipDialogInstalled || typeof document === 'undefined') return;
  zipDialogInstalled = true;

  const overlay = document.createElement('div');
  overlay.id = 'zip-download-overlay';
  overlay.className = 'zip-download-overlay hidden';
  overlay.innerHTML = `
    <div class="zip-download-dialog" role="dialog" aria-modal="true" aria-label="ZIP download progress">
      <span class="zip-kicker">ZIP download</span>
      <h2 id="zip-dialog-title">Preparing ZIP</h2>
      <p id="zip-dialog-detail">Collecting selected images…</p>
      <div class="zip-progress-track"><div id="zip-progress-bar"></div></div>
      <div class="zip-dialog-actions">
        <button type="button" class="secondary-button" id="zip-dialog-close">Close</button>
        <button type="button" class="primary-button" id="zip-dialog-cancel">Cancel</button>
      </div>
    </div>`;
  document.body.appendChild(overlay);

  document.getElementById('zip-dialog-close')?.addEventListener('click', () => {
    if (!zipAbortController) overlay.classList.add('hidden');
  });
  document.getElementById('zip-dialog-cancel')?.addEventListener('click', () => {
    if (zipAbortController) zipAbortController.abort();
    else overlay.classList.add('hidden');
  });
}

function setZipDialog(title, detail, percent, running = true) {
  ensureZipDialog();
  const overlay = document.getElementById('zip-download-overlay');
  const titleEl = document.getElementById('zip-dialog-title');
  const detailEl = document.getElementById('zip-dialog-detail');
  const bar = document.getElementById('zip-progress-bar');
  const close = document.getElementById('zip-dialog-close');
  const cancel = document.getElementById('zip-dialog-cancel');

  if (!overlay || !titleEl || !detailEl || !bar || !close || !cancel) return;
  overlay.classList.remove('hidden');
  titleEl.textContent = title;
  detailEl.textContent = detail;
  bar.style.width = `${Math.max(2, Math.min(100, percent))}%`;
  close.style.display = running ? 'none' : '';
  cancel.textContent = running ? 'Cancel' : 'Done';
}

function showZipToast(title, detail = '', kind = 'info') {
  const stack = document.getElementById('toast-stack');
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

export async function downloadSelectedImagesAsZip() {
  if (zipAbortController) return;

  const { items, settings } = await readSelectedZipItems();
  if (!items.length) {
    showZipToast('No selected images', 'Select images first, then choose Download ZIP.', 'error');
    return;
  }

  zipAbortController = new AbortController();
  const signal = zipAbortController.signal;
  const entries = [];
  const failedItems = [];

  try {
    setZipDialog('Preparing ZIP', `${items.length.toLocaleString()} selected images will be saved as one ZIP file.`, 4, true);

    for (let i = 0; i < items.length; i += 1) {
      if (signal.aborted) throw new DOMException('ZIP cancelled', 'AbortError');
      const item = items[i];
      setZipDialog(
        'Adding images to ZIP',
        `Fetching image ${i + 1}/${items.length} · ${item.alt || item.url}`,
        5 + ((i + 1) / items.length) * 72,
        true,
      );
      try {
        entries.push(await fetchZipEntry(item, i, items.length, settings, signal));
      } catch (error) {
        failedItems.push({ item, error: error?.message || String(error) });
        console.warn('[SnapStream] Could not add image to ZIP:', item.url, error);
      }
    }

    if (!entries.length) {
      throw new Error('No images could be added to the ZIP file. The website may be blocking direct downloads. Try opening the image page once, then run ZIP again.');
    }

    setZipDialog('Building ZIP file', 'Creating one downloadable ZIP package…', 84, true);
    const zipBlob = buildZipBlob(uniqueZipEntryNames(entries));
    const objectUrl = URL.createObjectURL(zipBlob);
    const filename = zipDownloadFilename(settings, entries.length);

    setZipDialog('Starting ZIP download', `${entries.length.toLocaleString()} images packed into ${filename}.`, 96, true);

    await new Promise((resolve, reject) => {
      chrome.downloads.download({ url: objectUrl, filename, saveAs: false, conflictAction: 'uniquify' }, (downloadId) => {
        if (chrome.runtime.lastError) {
          URL.revokeObjectURL(objectUrl);
          reject(new Error(chrome.runtime.lastError.message));
          return;
        }

        const listener = (delta) => {
          if (delta.id === downloadId && delta.state) {
            if (delta.state.current === 'complete' || delta.state.current === 'interrupted') {
              chrome.downloads.onChanged.removeListener(listener);
              URL.revokeObjectURL(objectUrl);
            }
          }
        };
        chrome.downloads.onChanged.addListener(listener);
        resolve(downloadId);
      });
    });

    const failText = failedItems.length ? ` · ${failedItems.length.toLocaleString()} skipped by the site` : '';
    setZipDialog(
      'ZIP download started',
      `${entries.length.toLocaleString()} images added${failText}. Only one browser download was created.`,
      100,
      false,
    );
    showZipToast('ZIP download started', `${entries.length.toLocaleString()} images packed into one file${failText}.`);
  } catch (error) {
    const cancelled = error && error.name === 'AbortError';
    setZipDialog(
      cancelled ? 'ZIP download cancelled' : 'ZIP download failed',
      cancelled ? 'No ZIP file was downloaded.' : (error.message || String(error)),
      100,
      false,
    );
    showZipToast(cancelled ? 'ZIP cancelled' : 'ZIP failed', cancelled ? '' : (error.message || String(error)), cancelled ? 'info' : 'error');
  } finally {
    zipAbortController = null;
    updateZipButtons();
  }
}

function injectZipStyles() {
  if (document.getElementById('snapstream-zip-styles')) return;
  const style = document.createElement('style');
  style.id = 'snapstream-zip-styles';
  style.textContent = `
    .zip-download-button{white-space:nowrap;gap:8px}
    .zip-download-button:disabled{opacity:.48;cursor:not-allowed;box-shadow:none;transform:none}
    .bulk-zip-note{margin:12px 0 0;padding:12px 14px;border:1px solid rgba(92,73,242,.16);border-radius:14px;background:#f4f1ff;color:#4b3fd2;font-size:12px;line-height:1.45}
    .zip-download-overlay{position:fixed;inset:0;z-index:9999;display:grid;place-items:center;background:rgba(15,23,42,.58);backdrop-filter:blur(10px);padding:20px}
    .zip-download-overlay.hidden{display:none!important}
    .zip-download-dialog{width:min(92vw,560px);border:1px solid #e2e8f0;border-radius:28px;background:#fff;padding:28px;box-shadow:0 34px 100px rgba(15,23,42,.28)}
    .zip-kicker{display:block;color:#5c49f2;font-size:12px;font-weight:850;text-transform:uppercase;letter-spacing:.13em}
    .zip-download-dialog h2{margin:8px 0 0;color:#111827;font-size:28px;line-height:1.1;letter-spacing:-.04em}
    .zip-download-dialog p{margin:10px 0 20px;color:#64748b;font-size:14px;line-height:1.55;overflow-wrap:anywhere}
    .zip-progress-track{height:8px;border-radius:999px;background:#e5e7ef;overflow:hidden}
    .zip-progress-track>div{width:2%;height:100%;border-radius:inherit;background:linear-gradient(90deg,#5c49f2,#2563eb);transition:width .25s ease}
    .zip-dialog-actions{display:flex;justify-content:flex-end;gap:10px;margin-top:22px}
    @media (max-width:760px){.zip-download-button{width:100%;justify-content:center}.zip-dialog-actions{display:grid}.zip-download-dialog{padding:22px;border-radius:22px}.zip-download-dialog h2{font-size:23px}}
  `;
  document.head.appendChild(style);
}

function selectedCountFromUi() {
  const countText = document.getElementById('selected-count')?.textContent || '0';
  return Number(countText.replace(/[^0-9]/g, '')) || 0;
}

function updateZipButtons() {
  const count = selectedCountFromUi();
  document.querySelectorAll('[data-snapstream-zip-button]').forEach((button) => {
    button.disabled = count <= 0 || Boolean(zipAbortController);
    const badge = button.querySelector('.button-count');
    if (badge) badge.textContent = count.toLocaleString();
  });
}

function installZipWorkspaceUi() {
  if (typeof document === 'undefined' || typeof chrome === 'undefined' || !chrome.downloads) return;
  injectZipStyles();
  ensureZipDialog();

  const downloadSelected = document.getElementById('download-selected');
  if (downloadSelected && !document.getElementById('download-selected-zip')) {
    const zipButton = document.createElement('button');
    zipButton.type = 'button';
    zipButton.id = 'download-selected-zip';
    zipButton.className = 'secondary-button zip-download-button';
    zipButton.dataset.snapstreamZipButton = 'true';
    zipButton.innerHTML = '<span>Download ZIP</span><span class="button-count">0</span>';
    zipButton.addEventListener('click', downloadSelectedImagesAsZip);
    downloadSelected.insertAdjacentElement('afterend', zipButton);
  }

  const bulkActions = document.querySelector('.bulk-actions');
  if (bulkActions && !document.getElementById('bulk-download-zip')) {
    const zipBulkButton = document.createElement('button');
    zipBulkButton.type = 'button';
    zipBulkButton.id = 'bulk-download-zip';
    zipBulkButton.className = 'primary-button';
    zipBulkButton.dataset.snapstreamZipButton = 'true';
    zipBulkButton.innerHTML = '<span>Download as ZIP</span><span class="button-count">0</span>';
    zipBulkButton.addEventListener('click', () => {
      document.getElementById('bulk-cancel')?.click();
      setTimeout(downloadSelectedImagesAsZip, 100);
    });
    bulkActions.insertBefore(zipBulkButton, bulkActions.firstChild);
  }

  const bulkLead = document.querySelector('.bulk-lead');
  if (bulkLead && !document.querySelector('.bulk-zip-note')) {
    const note = document.createElement('p');
    note.className = 'bulk-zip-note';
    note.textContent = 'Recommended: choose Download as ZIP to save all selected images as one file. This avoids repeated Save dialogs and does not require changing browser download settings.';
    bulkLead.insertAdjacentElement('afterend', note);
  }

  updateZipButtons();
  const observer = new MutationObserver(updateZipButtons);
  const selectedCount = document.getElementById('selected-count');
  if (selectedCount) observer.observe(selectedCount, { childList: true, characterData: true, subtree: true });
  document.addEventListener('click', () => setTimeout(updateZipButtons, 80), true);
}

if (typeof document !== 'undefined') {
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', installZipWorkspaceUi, { once: true });
  } else {
    queueMicrotask(installZipWorkspaceUi);
  }
}
