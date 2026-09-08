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
    try {
      chrome.runtime.sendMessage(payload).catch(() => {});
    } catch (_) {}
  }

  function absoluteUrl(value) {
    if (!value || typeof value !== 'string') return null;
    const raw = value.trim().replace(/^['"]|['"]$/g, '');
    if (!raw || raw === 'none' || raw.startsWith('blob:')) return null;
    if (raw.startsWith('data:image/')) return raw;
    try {
      const parsed = new URL(raw, document.baseURI);
      if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null;
      parsed.hash = '';
      return parsed.href;
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
    const regex = /url\((['"]?)(.*?)\1\)/gi;
    let match;
    while ((match = regex.exec(value))) urls.push(match[2]);
    return urls;
  }

  function looksLikeImageLink(url) {
    return /\.(?:avif|bmp|gif|ico|jpe?g|jfif|png|svg|tiff?|webp)(?:$|[?#])/i.test(url || '');
  }

  function settingsForDepth(depth) {
    if (depth === 'exhaustive') return { maxRounds: 240, delay: 520, stableRounds: 10, step: 0.72 };
    if (depth === 'balanced') return { maxRounds: 80, delay: 320, stableRounds: 4, step: 0.9 };
    return { maxRounds: 160, delay: 440, stableRounds: 7, step: 0.78 };
  }

  async function runScan(scanId, options) {
    cancelledScans.delete(scanId);
    const config = settingsForDepth(options.scanDepth || 'deep');
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
      const url = absoluteUrl(raw);
      if (!url || seenUrls.has(url)) return;
      seenUrls.add(url);
      queued.set(url, {
        url,
        source,
        frameUrl: location.href,
        pageUrl: document.location.href,
        alt: extra.alt || (element && element.getAttribute && (element.getAttribute('alt') || element.getAttribute('title'))) || '',
        width: Number(extra.width || (element && (element.naturalWidth || element.videoWidth)) || 0),
        height: Number(extra.height || (element && (element.naturalHeight || element.videoHeight)) || 0),
      });
    };

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
        if (rel === 'image_src' || rel.includes('icon') || (rel.includes('preload') && element.as === 'image')) add(element.href, 'resource', element);
      }

      ['data-bg','data-background','data-background-image','data-bg-src','poster'].forEach((name) => add(element.getAttribute && element.getAttribute(name), 'background', element));

      if (options.includeBackgrounds !== false) {
        const inlineStyle = element.getAttribute && element.getAttribute('style');
        cssUrls(inlineStyle).forEach((url) => add(url, 'background', element));
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
      root.querySelectorAll('*').forEach((element) => {
        if (element.shadowRoot) collectRoots(element.shadowRoot, roots);
      });
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

    const flush = (phase) => {
      if (queued.size) {
        const images = Array.from(queued.values());
        queued.clear();
        safeSend({ type: 'SNAPSTREAM_SCAN_BATCH', scanId, images, pass, elementsChecked, phase, frameUrl: location.href });
      }
      safeSend({ type: 'SNAPSTREAM_SCAN_STATUS', scanId, pass, found: seenUrls.size, elementsChecked, phase, frameUrl: location.href, isTopFrame });
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
        subtree: true,
        childList: true,
        attributes: true,
        attributeFilter: ['src','srcset','href','style','class','content','data-src','data-srcset','data-lazy-src','data-original','data-image','data-url','data-bg','data-bg-src','data-background','poster'],
      });
    };

    observeShadowRoots = (root) => {
      collectRoots(root).forEach((candidate) => observeRoot(candidate));
    };

    observeRoot(document.documentElement);
    observeShadowRoots(document);
    inspectDocument(true);
    flush('initial');

    if (!isTopFrame) {
      for (let waitPass = 0; waitPass < 12 && !cancelledScans.has(scanId); waitPass += 1) {
        await new Promise((resolve) => setTimeout(resolve, 700));
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

    for (let round = 0; round < config.maxRounds && !cancelledScans.has(scanId); round += 1) {
      pass = round + 1;
      const viewport = Math.max(window.innerHeight || 0, 600);
      const currentPageHeight = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
      const maxScroll = Math.max(0, currentPageHeight - viewport);
      const nextY = Math.min(maxScroll, window.scrollY + Math.max(420, Math.round(viewport * config.step)));
      window.scrollTo({ top: nextY, behavior: 'auto' });
      await new Promise((resolve) => setTimeout(resolve, config.delay));

      observeShadowRoots(document);
      inspectDocument(round % 8 === 0);
      flush('scrolling');

      const currentHeight = Math.max(document.documentElement.scrollHeight, document.body ? document.body.scrollHeight : 0);
      const atBottom = window.scrollY + viewport >= currentHeight - 8;
      const noGrowth = currentHeight <= previousHeight + 2;
      const noNewImages = seenUrls.size === previousCount;

      if (atBottom && noGrowth && noNewImages) stableRounds += 1;
      else stableRounds = 0;

      previousHeight = currentHeight;
      previousCount = seenUrls.size;
      if (atBottom && stableRounds >= config.stableRounds) break;
    }

    await new Promise((resolve) => setTimeout(resolve, 500));
    observeShadowRoots(document);
    inspectDocument(true);
    flush(cancelledScans.has(scanId) ? 'cancelled' : 'finalizing');
    observer.disconnect();

    if (options.restoreScroll !== false) window.scrollTo(originalX, originalY);

    safeSend({
      type: 'SNAPSTREAM_SCAN_FRAME_DONE',
      scanId,
      found: seenUrls.size,
      pass,
      elementsChecked,
      frameUrl: location.href,
      isTopFrame: true,
      cancelled: cancelledScans.has(scanId),
    });
  }
})();
