// SnapStream Background Service Worker (Manifest V3)
// Combines functionality from handleUpdates.js and setReferrer.js

// === Handle Updates ===
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    // Open the options page after install
    chrome.runtime.openOptionsPage();
  } else if (
    details.reason === 'update' &&
    /^(((0|1)\..*)|(2\.(0|1)(\..*)?))$/.test(details.previousVersion)
  ) {
    // Clear data from versions before 2.1 after update
    chrome.storage.local.clear();
  }
});

// === Set Referrer via declarativeNetRequest ===
// Listen for messages from content scripts containing the active tab's origin,
// then update declarativeNetRequest dynamic rules to set the Referer header.
chrome.runtime.onMessage.addListener((message) => {
  if (message && message.origin) {
    updateReferrerRule(message.origin);
  }
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
              {
                header: 'Referer',
                operation: 'set',
                value: activeTabOrigin,
              },
              {
                header: 'Origin',
                operation: 'set',
                value: activeTabOrigin,
              },
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
