// SnapStream background service worker (Manifest V3)

chrome.runtime.onInstalled.addListener((details) => {
  if (
    details.reason === 'update' &&
    /^(((0|1)\..*)|(2\.(0|1)(\..*)?))$/.test(details.previousVersion)
  ) {
    chrome.storage.local.clear();
  }
});

// Image hosts frequently require the scanned website as Referer/Origin.
// Keep one dynamic rule aligned with the most recently scanned website.
chrome.runtime.onMessage.addListener((message) => {
  if (message && message.origin) updateReferrerRule(message.origin);
});

async function updateReferrerRule(activeTabOrigin) {
  try {
    await chrome.declarativeNetRequest.updateDynamicRules({
      removeRuleIds: [1],
      addRules: [
        {
          id: 1,
          priority: 1,
          action: {
            type: 'modifyHeaders',
            requestHeaders: [
              { header: 'Referer', operation: 'set', value: activeTabOrigin },
              { header: 'Origin', operation: 'set', value: activeTabOrigin },
            ],
          },
          condition: {
            initiatorDomains: [chrome.runtime.id],
            resourceTypes: ['image', 'media', 'other', 'xmlhttprequest'],
          },
        },
      ],
    });
  } catch (error) {
    console.error('[SnapStream] Failed to update referrer rule:', error);
  }
}
