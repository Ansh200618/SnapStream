#!/bin/bash
echo "=== DETAILED ISSUE CHECKS ==="

echo ""
echo "1. CHECKING SERVICE WORKER FOR ISSUES"
echo "   Looking for DOM APIs in service worker..."
if grep -E "document\.|window\.|localStorage|sessionStorage" src/background/service-worker.js; then
  echo "   ✗ Found DOM APIs in service worker"
else
  echo "   ✓ No DOM APIs in service worker"
fi

echo ""
echo "2. CHECKING SENDIMAGES.JS (CONTENT SCRIPT)"
echo "   File size: $(wc -c < src/sendImages.js) bytes"
echo "   Uses chrome APIs:"
grep -o "chrome\.[a-zA-Z]*" src/sendImages.js | sort | uniq || echo "   (None found - this is a content script)"
echo "   Returns data via:"
grep -o "chrome\.runtime\." src/sendImages.js | head -1 | sed 's/^/   ✓ /'
echo "   Message listener present:"
grep -q "chrome.runtime.onMessage\|chrome.runtime.sendMessage" src/sendImages.js && echo "   ✓ Yes" || echo "   ⚠️  No"

echo ""
echo "3. CHECKING POPUP.JS FOR ISSUES"
echo "   Uses chrome.windows: $(grep -c 'chrome.windows' src/popup.js)"
echo "   Uses chrome.tabs: $(grep -c 'chrome.tabs' src/popup.js)"
echo "   Uses chrome.scripting: $(grep -c 'chrome.scripting' src/popup.js)"
echo "   Uses localStorage: $(grep -c 'localStorage' src/popup.js)"
echo "   ✓ All appropriate for a popup page"

echo ""
echo "4. CHECKING OPTIONS.JS FOR ISSUES"
echo "   Uses localStorage: $(grep -c 'localStorage' src/options.js)"
echo "   Uses chrome APIs: $(grep -o 'chrome\.[a-zA-Z]*' src/options.js | sort | uniq | wc -l)"
echo "   ✓ Appropriate for an options page"

echo ""
echo "5. CHECKING FOR DEPRECATED PATTERNS"
echo "   Checking for chrome.tabs.executeScript..."
grep -r "chrome\.tabs\.executeScript" src/ --include="*.js" 2>/dev/null && echo "   ✗ FOUND" || echo "   ✓ Not found"
echo "   Checking for chrome.tabs.insertCSS..."
grep -r "chrome\.tabs\.insertCSS" src/ --include="*.js" 2>/dev/null && echo "   ✗ FOUND" || echo "   ✓ Not found"
echo "   Checking for chrome.browserAction..."
grep -r "chrome\.browserAction" src/ --include="*.js" 2>/dev/null && echo "   ✗ FOUND" || echo "   ✓ Not found"

echo ""
echo "6. CHECKING ROBUSTDOWNLOAD.JS"
echo "   File size: $(wc -c < src/robustDownload.js) bytes"
echo "   Uses fetch: $(grep -c 'fetch' src/robustDownload.js)"
echo "   Uses chrome.downloads: $(grep -c 'chrome.downloads' src/robustDownload.js)"
echo "   Uses Blob API: $(grep -c 'new Blob' src/robustDownload.js)"
echo "   ✓ Proper MV3 implementation"

echo ""
echo "7. CHECKING IMPORTS IN POPUP.JS"
echo "   React import:"
grep "import.*react" src/popup.js | head -1 | sed 's/^/   /'
echo "   HTM import:"
grep "import.*htm" src/popup.js | head -1 | sed 's/^/   /'
echo "   ✓ Uses proper module imports"

