// SnapStream background service worker (Manifest V3)

const DOWNLOAD_REFERRER_RULE_ID = 1;

chrome.runtime.onInstalled.addListener((details) => {
  if (
    details.reason === 'update' &&
    /^(((0|1)\..*)|(2\.(0|1)(\..*)?))$/.test(details.previousVersion)
  ) {
    chrome.storage.local.clear();
  }
});

chrome.runtime.onMessage.addListener((message, _sender, sendResponse) => {
  if (!message) return undefined;

  if (message.type === 'SNAPSTREAM_PREPARE_DOWNLOAD') {
    updateDownloadReferrerRule(message)
      .then(() => sendResponse({ ok: true }))
      .catch((error) => {
        console.error('[SnapStream] Failed to prepare download referrer rule:', error);
        sendResponse({ ok: false, error: error?.message || String(error) });
      });
    return true;
  }

  if (message.origin || message.referrerUrl) {
    updateDownloadReferrerRule({
      referrerUrl: message.referrerUrl || message.origin,
      resourceUrl: message.resourceUrl || message.url || message.origin,
    }).catch((error) => console.error('[SnapStream] Failed to update referrer rule:', error));
  }

  return undefined;
});

function normalizeHttpUrl(value) {
  try {
    const url = new URL(String(value || '').trim());
    if (!['http:', 'https:'].includes(url.protocol)) return null;
    url.hash = '';
    return url.href;
  } catch (_) {
    return null;
  }
}

function requestHost(value) {
  try {
    const url = new URL(String(value || '').trim());
    return ['http:', 'https:'].includes(url.protocol) ? url.hostname : null;
  } catch (_) {
    return null;
  }
}

async function updateDownloadReferrerRule(message) {
  const resourceUrl = normalizeHttpUrl(message.resourceUrl || message.url || '');
  const referrerUrl = normalizeHttpUrl(message.referrerUrl || message.pageUrl || message.origin || '');
  const host = requestHost(resourceUrl || referrerUrl || '');

  await chrome.declarativeNetRequest.updateDynamicRules({
    removeRuleIds: [DOWNLOAD_REFERRER_RULE_ID],
  });

  if (!referrerUrl || !host) return;

  await chrome.declarativeNetRequest.updateDynamicRules({
    addRules: [
      {
        id: DOWNLOAD_REFERRER_RULE_ID,
        priority: 10,
        action: {
          type: 'modifyHeaders',
          requestHeaders: [
            { header: 'Referer', operation: 'set', value: referrerUrl },
          ],
        },
        condition: {
          requestDomains: [host],
          resourceTypes: ['image', 'media', 'xmlhttprequest', 'other', 'main_frame'],
        },
      },
    ],
  });
}
