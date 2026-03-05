#!/bin/bash
echo "=== COMPREHENSIVE SNAPSTREAM AUDIT ==="
echo ""
echo "1. MANIFEST VALIDATION"
echo "   Manifest version: $(grep '"manifest_version"' manifest.json)"
echo "   Min Chrome version: $(grep '"minimum_chrome_version"' manifest.json)"
echo "   Background service worker: $(grep -A 1 '"background"' manifest.json | grep 'service_worker')"

echo ""
echo "2. MV3 API COMPLIANCE"
echo -n "   chrome.action: "
grep -q '"action"' manifest.json && echo "✓ Present" || echo "✗ Missing"
echo -n "   chrome.declarativeNetRequest: "
grep -q 'declarativeNetRequest' manifest.json && echo "✓ Present" || echo "✗ Missing"
echo -n "   chrome.runtime.getURL: "
grep -r "chrome.runtime.getURL\|chrome.runtime.sendMessage\|chrome.runtime.onMessage" src/ --include="*.js" >/dev/null 2>&1 && echo "✓ Used" || echo "⚠️  Not used"

echo ""
echo "3. FILE STRUCTURE"
echo "   Total JS files: $(find src -name "*.js" | wc -l)"
echo "   Total TS files: $(find src -name "*.ts" | wc -l)"
echo "   Component files: $(find src/components -name "*.js" | wc -l)"
echo "   Hook files: $(find src/hooks -name "*.js" | wc -l)"
echo "   Test files: $(find src -name "*.test.*" | wc -l)"
echo "   Service worker file: $(test -f src/background/service-worker.js && echo "✓" || echo "✗")"

echo ""
echo "4. HTML FILES"
for html in views/*.html; do
  echo "   $(basename $html):"
  if grep -q "type=\"module\"" "$html"; then
    echo "     ✓ Uses module scripts"
  fi
  if grep -q "<style>" "$html"; then
    echo "     ✓ Uses embedded styles (CSP compliant)"
  fi
  if grep -q "<script\s*>" "$html"; then
    echo "     ✗ Has inline scripts"
  fi
done

echo ""
echo "5. BUILD OUTPUT"
if [ -d "build" ]; then
  echo "   ✓ Build directory exists"
  echo "   Files in build:"
  ls -1 build/ | sed 's/^/     /'
else
  echo "   ✗ No build directory"
fi

echo ""
echo "6. TEST STATUS"
echo -n "   Test results: "
npx jest --no-watch --no-coverage 2>&1 | tail -1

