(() => {
  if (globalThis.__snapStreamDeepScannerInstalled) return;
  globalThis.__snapStreamDeepScannerInstalled = true;

  const cancelledScans = new Set();

  chrome.runtime.onMessage.addListener((message) => {
    if (!message || !message.type) return;
    if (message.type === 'SNAPSTREAM_CANCEL_SCAN' && message.scanId) {
      cancelledScans.add(message.scanId);
      return;
    }
    if (message.type === 'SNAPSTREAM_RUN_SCAN' && message.scanId) {
      runScan(message.scanId, message.options || {}).catch((error) => {
        safeSend({
          type: 'SNAPSTREAM_SCAN_ERROR',
          scanId: message.scanId,
          message: error && error.message ? error.message : String(error),
          frameUrl: location.href,
        });
      });
    }
  });

  function safeSend(payload) {
    try { chrome.runtime.sendMessage(payload).catch(() => {}); } catch (_) {}
  }

  const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

  function absoluteUrl(value, base = document.baseURI) {
    if (!value || typeof value !== 'string') return null;
    const raw = value.trim().replace(/^['\"]|['\"]$/g, '');
    if (!raw || raw === 'none' || raw.startsWith('blob:')) return null;
    if (raw.startsWith('data:image/')) return raw;
    try {
      const parsed = new URL(raw, base);
      if (!['http:', 'https:'].includes(parsed.protocol)) return null;
      parsed.hash = '';
      return parsed.href;
    } catch (_) { return null; }
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

  function looksLikeImageLink(url) {
    return /\.(?:avif|bmp|gif|jpe?g|jfif|png|svg|tiff?|webp)(?:$|[?#])/i.test(url || '');
  }

  const JUNK_URL_RE = /(?:^|[\/_\-.])(logo|sprite|icon|favicon|branding|badge|button|btn|arrow|loader|loading|spinner|spacer|pixel|blank|transparent|social|facebook|twitter|youtube|instagram|whatsapp|google|advert|advertise|advertisement|banner|ads?|tracking)(?:[\/_\-.]|$)/i;
  const JUNK_CONTEXT_RE = /\b(ad|ads|advert|advertisement|banner|branding|logo|sprite|icon|header|footer|nav|navigation|social|share|widget|promo|promotion|tracking)\b/i;
  const CONTENT_CONTEXT_RE = /\b(photo|photos|picture|pictures|image|images|still|stills|gallery|slide|slideshow|content|main|article|actress|actor|celebrity)\b/i;

  function isLikelyJunkUrl(url) {
    if (!url || url.startsWith('data:image/')) return false;
    try {
      const parsed = new URL(url);
      return JUNK_URL_RE.test(`${parsed.hostname}${parsed.pathname}`) || /\.ico$/i.test(parsed.pathname);
    } catch (_) { return JUNK_URL_RE.test(url); }
  }

  function isObviouslyJunkDimensions(width, height) {
    width = Number(width) || 0;
    height = Number(height) || 0;
    if (!width || !height) return false;
    if (width <= 90 || height <= 70) return true;
    const ratio = Math.max(width, height) / Math.max(1, Math.min(width, height));
    return ratio >= 5 && Math.min(width, height) < 300;
  }

  function subjectTokens(doc = document) {
    const raw = `${doc.querySelector('h1')?.textContent || ''} ${doc.title || ''}`.toLowerCase();
    const stop = new Set(['photos','photo','pictures','picture','stills','still','images','image','gallery','latest','wallpaper','wallpapers','the','and','for','with','aka']);
    return Array.from(new Set(raw.split(/[^a-z0-9]+/).filter((token) => token.length >= 3 && !stop.has(token)))).slice(0, 12);
  }

  function readGalleryCounterFromText(text) {
    const clean = String(text || '').replace(/\s+/g, ' ');
    const match = clean.match(/\b(\d{1,5})\s*(?:\/|of)\s*(\d{1,5})\b/i);
    if (!match) return null;
    const current = Number(match[1]);
    const total = Number(match[2]);
    if (!Number.isInteger(current) || !Number.isInteger(total) || current < 1 || total < 3 || current > total || total > 10000) return null;
    return { current, total };
  }

  function readGalleryCounter(doc) {
    const likely = Array.from(doc.querySelectorAll('[class*="count"],[class*="counter"],[class*="page"],[id*="count"],[id*="counter"],[id*="page"]'))
      .map((node) => node.textContent || '')
      .join(' ');
    return readGalleryCounterFromText(likely) || readGalleryCounterFromText((doc.body?.innerText || doc.body?.textContent || '').slice(0, 160000));
  }

  function numericSeries(urlValue) {
    try {
      const url = new URL(urlValue);
      const match = url.pathname.match(/^(.*?[-_])(\d+)(\.html?)$/i);
      if (!match) return null;
      return { origin: url.origin, prefix: match[1], number: Number(match[2]), suffix: match[3], search: url.search };
    } catch (_) { return null; }
  }

  function sameSeriesUrl(urlValue, series) {
    const parsed = numericSeries(urlValue);
    return Boolean(parsed && parsed.origin === series.origin && parsed.prefix === series.prefix && parsed.suffix.toLowerCase() === series.suffix.toLowerCase());
  }

  function detectNumberedGallery(doc = document, pageUrl = location.href) {
    if (window !== window.top && doc === document) return null;
    const counter = readGalleryCounter(doc);
    const series = numericSeries(pageUrl);
    if (!counter || !series) return null;
    return { ...counter, ...series, tokens: subjectTokens(doc) };
  }

  function bestImageUrlFromElement(img, pageUrl) {
    const candidates = [];
    parseSrcset(img.getAttribute('srcset')).forEach((value) => candidates.push(value));
    parseSrcset(img.getAttribute('data-srcset')).forEach((value) => candidates.push(value));
    ['data-original','data-lazy-src','data-src','data-image','data-url','data-fallback-src','src'].forEach((name) => {
      const value = img.getAttribute(name);
      if (value) candidates.push(value);
    });
    for (let i = candidates.length - 1; i >= 0; i -= 1) {
      const resolved = absoluteUrl(candidates[i], pageUrl);
      if (resolved && !isLikelyJunkUrl(resolved)) return resolved;
    }
    return null;
  }

  function scoreGalleryImage(img, pageUrl, tokens) {
    const url = bestImageUrlFromElement(img, pageUrl);
    if (!url) return null;
    const width = Number(img.getAttribute('width')) || Number(img.dataset.width) || 0;
    const height = Number(img.getAttribute('height')) || Number(img.dataset.height) || 0;
    if (isObviouslyJunkDimensions(width, height)) return null;

    const alt = `${img.getAttribute('alt') || ''} ${img.getAttribute('title') || ''}`.trim();
    const contextNode = img.closest('figure,article,main,section,div,a');
    const context = `${img.className || ''} ${img.id || ''} ${contextNode?.className || ''} ${contextNode?.id || ''}`.toLowerCase();
    const haystack = `${url} ${alt}`.toLowerCase();
    let score = 0;

    if (CONTENT_CONTEXT_RE.test(context)) score += 8;
    if (JUNK_CONTEXT_RE.test(context)) score -= 14;
    if (width >= 500 && height >= 500) score += 7;
    else if (width >= 300 && height >= 300) score += 4;
    if (width && height && Math.max(width, height) / Math.max(1, Math.min(width, height)) < 3.2) score += 3;
    if (/watermark/i.test(haystack)) score -= 1;

    let tokenHits = 0;
    for (const token of tokens) if (haystack.includes(token)) tokenHits += 1;
    score += Math.min(15, tokenHits * 4);

    const parentLink = img.closest('a[href]');
    if (parentLink && /[-_]\d+\.html?(?:$|[?#])/i.test(parentLink.href || '')) score += 4;
    if (isLikelyJunkUrl(url)) score -= 18;
    return { url, alt, width, height, score };
  }

  function extractPrimaryGalleryImage(doc, pageUrl, tokens) {
    const candidates = Array.from(doc.querySelectorAll('img'))
      .map((img) => scoreGalleryImage(img, pageUrl, tokens))
      .filter(Boolean)
      .sort((a, b) => b.score - a.score);
    return candidates.length && candidates[0].score >= 3 ? candidates[0] : null;
  }

  function extractSeriesLinks(doc, pageUrl, series) {
    const links = new Set();
    doc.querySelectorAll('a[href]').forEach((anchor) => {
      const resolved = absoluteUrl(anchor.getAttribute('href'), pageUrl);
      if (resolved && sameSeriesUrl(resolved, series)) links.add(resolved);
    });
    return Array.from(links);
  }

  async function fetchGalleryPage(pageUrl, tokens) {
    const response = await fetch(pageUrl, { credentials: 'include', cache: 'no-store' });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const html = await response.text();
    const doc = new DOMParser().parseFromString(html, 'text/html');
    return {
      doc,
      counter: readGalleryCounter(doc),
      image: extractPrimaryGalleryImage(doc, pageUrl, tokens),
    };
  }

  async function determineSeriesDirection(info) {
    if (info.total <= 1) return null;
    const probes = [info.number + 1, info.number - 1].filter((value) => value > 0);
    const results = await Promise.all(probes.map(async (number) => {
      const pageUrl = `${info.origin}${info.prefix}${number}${info.suffix}${info.search}`;
      try {
        const page = await fetchGalleryPage(pageUrl, info.tokens);
        return { number, pageUrl, counter: page.counter, image: page.image };
      } catch (_) { return null; }
    }));
    for (const result of results.filter(Boolean)) {
      if (!result.counter) continue;
      const deltaPosition = result.counter.current - info.current;
      const deltaNumber = result.number - info.number;
      if (Math.abs(deltaPosition) === 1 && Math.abs(deltaNumber) === 1 && deltaPosition === deltaNumber) return 1;
      if (Math.abs(deltaPosition) === 1 && Math.abs(deltaNumber) === 1 && deltaPosition === -deltaNumber) return -1;
    }
    return null;
  }

  async function crawlNumberedGallery(scanId, info, add, flush) {
    let completed = 0;
    let failed = 0;
    const visited = new Set();
    const queued = new Set();
    const queue = [];
    const targetTotal = info.total;
    const series = info;

    const enqueue = (url) => {
      if (!url || queued.has(url) || visited.has(url) || !sameSeriesUrl(url, series)) return;
      queued.add(url);
      queue.push(url);
    };

    const currentUrl = location.href;
    enqueue(currentUrl);
    extractSeriesLinks(document, currentUrl, series).forEach(enqueue);

    const direction = await determineSeriesDirection(info);
    if (direction) {
      for (let position = 1; position <= targetTotal; position += 1) {
        const number = info.number + direction * (position - info.current);
        if (number <= 0) continue;
        enqueue(`${info.origin}${info.prefix}${number}${info.suffix}${info.search}`);
      }
    }

    let currentDocHandled = false;
    const concurrency = direction ? 8 : 4;

    const report = () => {
      safeSend({
        type: 'SNAPSTREAM_SCAN_STATUS',
        scanId,
        pass: completed,
        found: undefined,
        elementsChecked: completed,
        phase: 'gallery-crawl',
        frameUrl: location.href,
        isTopFrame: true,
        galleryTotal: targetTotal,
        galleryCompleted: completed,
        galleryFailed: failed,
      });
      flush('gallery-crawl');
    };

    async function processUrl(pageUrl) {
      if (visited.has(pageUrl) || cancelledScans.has(scanId)) return;
      visited.add(pageUrl);
      queued.delete(pageUrl);
      try {
        let doc;
        let counter;
        let image;
        if (!currentDocHandled && pageUrl === currentUrl) {
          currentDocHandled = true;
          doc = document;
          counter = readGalleryCounter(document);
          image = extractPrimaryGalleryImage(document, currentUrl, info.tokens);
        } else {
          const page = await fetchGalleryPage(pageUrl, info.tokens);
          doc = page.doc;
          counter = page.counter;
          image = page.image;
        }

        if (image) add(image.url, 'gallery', null, { alt: image.alt, width: image.width, height: image.height, pageUrl });
        extractSeriesLinks(doc, pageUrl, series).forEach(enqueue);

        if (counter && counter.total === targetTotal && !direction) {
          const pageSeries = numericSeries(pageUrl);
          if (pageSeries) {
            const diffPosition = counter.current - info.current;
            const diffNumber = pageSeries.number - info.number;
            if (diffPosition !== 0 && Math.abs(diffPosition) === Math.abs(diffNumber)) {
              const inferredDirection = Math.sign(diffPosition / diffNumber);
              for (let position = 1; position <= targetTotal; position += 1) {
                const number = info.number + inferredDirection * (position - info.current);
                if (number > 0) enqueue(`${info.origin}${info.prefix}${number}${info.suffix}${info.search}`);
              }
            }
          }
        }
      } catch (_) {
        failed += 1;
      } finally {
        completed += 1;
        if (completed % 5 === 0 || completed === targetTotal || queue.length === 0) report();
      }
    }

    while (!cancelledScans.has(scanId)) {
      if (!queue.length) {
        if (visited.size >= targetTotal) break;
        await sleep(120);
        if (!queue.length) break;
      }

      const batch = queue.splice(0, concurrency);
      await Promise.all(batch.map(processUrl));

      if (visited.size >= targetTotal) break;
    }

    report();
    return { completed: visited.size, failed, expected: targetTotal };
  }

  function scrollConfig(depth) {
    if (depth === 'balanced') return { delay: 320, stableRounds: 5, step: 0.92 };
    if (depth === 'exhaustive') return { delay: 520, stableRounds: 12, step: 0.72 };
    return { delay: 440, stableRounds: 8, step: 0.8 };
  }

  async function runScan(scanId, options) {
    cancelledScans.delete(scanId);
    const config = scrollConfig(options.scanDepth || 'deep');
    const isTopFrame = window === window.top;
    const originalX = window.scrollX;
    const originalY = window.scrollY;
    const seenUrls = new Set();
    const queued = new Map();
    const backgroundInspected = new WeakSet();
    const observedRoots = new WeakSet();
    let elementsChecked = 0;
    let pass = 0;
    let stableRounds = 0;
    let previousHeight = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
    let previousCount = 0;

    const add = (raw, source, element, extra = {}) => {
      const url = absoluteUrl(raw, extra.pageUrl || document.baseURI);
      if (!url || seenUrls.has(url)) return;
      const width = Number(extra.width || (element && (element.naturalWidth || element.videoWidth)) || 0);
      const height = Number(extra.height || (element && (element.naturalHeight || element.videoHeight)) || 0);
      if (source !== 'gallery' && (isLikelyJunkUrl(url) || isObviouslyJunkDimensions(width, height))) return;
      seenUrls.add(url);
      queued.set(url, {
        url,
        source,
        frameUrl: location.href,
        pageUrl: extra.pageUrl || document.location.href,
        alt: extra.alt || (element && element.getAttribute && (element.getAttribute('alt') || element.getAttribute('title'))) || '',
        width,
        height,
      });
    };

    const flush = (phase) => {
      if (queued.size) {
        const images = Array.from(queued.values());
        queued.clear();
        safeSend({ type: 'SNAPSTREAM_SCAN_BATCH', scanId, images, pass, elementsChecked, phase, frameUrl: location.href });
      }
      safeSend({ type: 'SNAPSTREAM_SCAN_STATUS', scanId, pass, found: seenUrls.size, elementsChecked, phase, frameUrl: location.href, isTopFrame });
    };

    const gallery = detectNumberedGallery();
    if (gallery && isTopFrame) {
      safeSend({
        type: 'SNAPSTREAM_SCAN_STATUS', scanId, pass: 0, found: 0, elementsChecked: 0,
        phase: 'gallery-crawl', frameUrl: location.href, isTopFrame: true,
        galleryTotal: gallery.total, galleryCompleted: 0,
      });

      const result = await crawlNumberedGallery(scanId, gallery, add, flush);
      pass = result.completed;
      elementsChecked = result.completed;
      flush(cancelledScans.has(scanId) ? 'cancelled' : 'finalizing');
      safeSend({
        type: 'SNAPSTREAM_SCAN_FRAME_DONE', scanId, found: seenUrls.size, pass, elementsChecked,
        frameUrl: location.href, isTopFrame: true, cancelled: cancelledScans.has(scanId),
        galleryTotal: gallery.total, galleryCompleted: result.completed, galleryFailed: result.failed,
      });
      return;
    }

    const inspectPseudo = (element, pseudo) => {
      try {
        const style = getComputedStyle(element, pseudo);
        cssUrls(style.backgroundImage).forEach((url) => add(url, 'background', element));
        cssUrls(style.content).forEach((url) => add(url, 'background', element));
        cssUrls(style.maskImage).forEach((url) => add(url, 'background', element));
      } catch (_) {}
    };

    const inspectElement = (element, includeComputedBackground = false) => {
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
      } else if (tag === 'image') {
        add(element.getAttribute('href') || element.getAttribute('xlink:href'), 'image', element);
      } else if (tag === 'input' && element.type === 'image') {
        add(element.src, 'image', element);
      } else if (tag === 'video') {
        add(element.poster, 'background', element);
      } else if (tag === 'object' && element.type && element.type.startsWith('image/')) {
        add(element.data, 'image', element);
      } else if (tag === 'a' && options.includeLinked !== false) {
        if (looksLikeImageLink(element.href)) add(element.href, 'linked', element);
      } else if (tag === 'meta') {
        const property = (element.getAttribute('property') || element.getAttribute('name') || '').toLowerCase();
        if (['og:image','og:image:url','og:image:secure_url','twitter:image','twitter:image:src'].includes(property)) add(element.content, 'meta', element);
      } else if (tag === 'link') {
        const rel = (element.rel || '').toLowerCase();
        if (rel === 'image_src' || (rel.includes('preload') && element.as === 'image')) add(element.href, 'resource', element);
      }

      ['data-bg','data-background','data-background-image','data-bg-src','poster'].forEach((name) => add(element.getAttribute && element.getAttribute(name), 'background', element));

      if (options.includeBackgrounds !== false) {
        cssUrls(element.getAttribute && element.getAttribute('style')).forEach((url) => add(url, 'background', element));
        if (includeComputedBackground && !backgroundInspected.has(element)) {
          backgroundInspected.add(element);
          try {
            const style = getComputedStyle(element);
            cssUrls(style.backgroundImage).forEach((url) => add(url, 'background', element));
            cssUrls(style.borderImageSource).forEach((url) => add(url, 'background', element));
            cssUrls(style.maskImage).forEach((url) => add(url, 'background', element));
            cssUrls(style.listStyleImage).forEach((url) => add(url, 'background', element));
          } catch (_) {}
          inspectPseudo(element, '::before');
          inspectPseudo(element, '::after');
        }
      }
    };

    const inspectResources = () => {
      try {
        performance.getEntriesByType('resource').forEach((entry) => {
          if (entry.initiatorType === 'img' || looksLikeImageLink(entry.name)) add(entry.name, 'resource', null);
        });
      } catch (_) {}
    };

    const collectRoots = (root, roots = []) => {
      roots.push(root);
      if (!root.querySelectorAll) return roots;
      root.querySelectorAll('*').forEach((element) => { if (element.shadowRoot) collectRoots(element.shadowRoot, roots); });
      return roots;
    };

    const inspectRoot = (root, deepBackgroundSweep) => {
      if (!root.querySelectorAll) return;
      root.querySelectorAll('img,source,picture,a,image,input[type="image"],video,object,meta,link,[data-src],[data-lazy-src],[data-original],[data-image],[data-url],[data-bg],[data-bg-src],[data-background],[data-background-image],[poster],[style]').forEach((el) => inspectElement(el, false));
      if (deepBackgroundSweep && options.includeBackgrounds !== false) root.querySelectorAll('*').forEach((el) => inspectElement(el, true));
    };

    const inspectDocument = (deepBackgroundSweep = false) => {
      collectRoots(document).forEach((root) => inspectRoot(root, deepBackgroundSweep));
      inspectResources();
    };

    let observeShadowRoots;
    const observer = new MutationObserver((mutations) => {
      for (const mutation of mutations) {
        if (mutation.type === 'attributes') inspectElement(mutation.target, true);
        mutation.addedNodes.forEach((node) => {
          if (node.nodeType !== Node.ELEMENT_NODE) return;
          inspectElement(node, true);
          if (node.querySelectorAll) node.querySelectorAll('img,source,a,image,input[type="image"],video,object,[style],[data-src],[data-bg]').forEach((el) => inspectElement(el, true));
          observeShadowRoots(node);
        });
      }
    });

    const observeRoot = (root) => {
      if (!root || observedRoots.has(root)) return;
      observedRoots.add(root);
      observer.observe(root, {
        subtree: true, childList: true, attributes: true,
        attributeFilter: ['src','srcset','href','style','class','content','data-src','data-srcset','data-lazy-src','data-original','data-image','data-url','data-bg','data-bg-src','data-background','poster'],
      });
    };

    observeShadowRoots = (root) => collectRoots(root).forEach(observeRoot);
    observeRoot(document.documentElement);
    observeShadowRoots(document);
    inspectDocument(true);
    flush('initial');

    if (!isTopFrame) {
      for (let waitPass = 0; waitPass < 12 && !cancelledScans.has(scanId); waitPass += 1) {
        await sleep(700);
        pass += 1;
        observeShadowRoots(document);
        inspectDocument(false);
        flush('frame-watch');
      }
      observer.disconnect();
      safeSend({ type: 'SNAPSTREAM_SCAN_FRAME_DONE', scanId, found: seenUrls.size, pass, elementsChecked, frameUrl: location.href, isTopFrame: false });
      return;
    }

    safeSend({ type: 'SNAPSTREAM_SCAN_STATUS', scanId, pass, found: seenUrls.size, elementsChecked, phase: 'scrolling', frameUrl: location.href, isTopFrame: true });

    // Deliberately no fixed pass/time limit. Completion is based only on reaching the real
    // bottom and observing no document growth and no new images for several verification rounds.
    while (!cancelledScans.has(scanId)) {
      pass += 1;
      const viewport = Math.max(window.innerHeight || 0, 600);
      const beforeHeight = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
      const maxScroll = Math.max(0, beforeHeight - viewport);
      const nextY = Math.min(maxScroll, window.scrollY + Math.max(420, Math.round(viewport * config.step)));
      window.scrollTo({ top: nextY, behavior: 'auto' });
      await sleep(config.delay);

      observeShadowRoots(document);
      inspectDocument(pass % 8 === 0);
      flush('scrolling');

      const currentHeight = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
      const atBottom = window.scrollY + viewport >= currentHeight - 12;
      const noGrowth = currentHeight <= previousHeight + 2;
      const noNewImages = seenUrls.size === previousCount;

      if (atBottom && noGrowth && noNewImages) {
        stableRounds += 1;
        // Re-trigger common lazy loaders before declaring completion.
        window.dispatchEvent(new Event('scroll'));
        window.dispatchEvent(new Event('resize'));
        await sleep(Math.min(900, config.delay + 220));
      } else {
        stableRounds = 0;
      }

      previousHeight = currentHeight;
      previousCount = seenUrls.size;
      if (atBottom && stableRounds >= config.stableRounds) break;
    }

    await sleep(650);
    observeShadowRoots(document);
    inspectDocument(true);
    flush(cancelledScans.has(scanId) ? 'cancelled' : 'finalizing');
    observer.disconnect();

    if (options.restoreScroll !== false) window.scrollTo(originalX, originalY);

    safeSend({
      type: 'SNAPSTREAM_SCAN_FRAME_DONE', scanId, found: seenUrls.size, pass, elementsChecked,
      frameUrl: location.href, isTopFrame: true, cancelled: cancelledScans.has(scanId),
    });
  }
})();
