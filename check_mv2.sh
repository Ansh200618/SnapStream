#!/bin/bash
echo "Checking for remaining MV2 patterns..."
issues=0

# Check for chrome.extension.getURL
if grep -r "chrome\.extension\." src/ --include="*.js" 2>/dev/null; then
  echo "✗ Found chrome.extension usage"
  ((issues++))
else
  echo "✓ No chrome.extension usage"
fi

# Check for background.page or background.scripts in manifest
if grep -q "\"page\":" manifest.json; then
  echo "✗ Found background.page in manifest"
  ((issues++))
else
  echo "✓ No background.page in manifest"
fi

if grep -q "\"scripts\":" manifest.json && grep -q "\"background\":" manifest.json; then
  echo "⚠️  Check for background.scripts in manifest"
else
  echo "✓ No background.scripts in manifest"
fi

# Check for activeTab permission (MV3 uses different approach)
if grep -q "\"activeTab\"" manifest.json; then
  echo "✓ activeTab permission present (valid in MV3)"
fi

# Check for declarativeNetRequest (MV3 way)
if grep -q "\"declarativeNetRequest\"" manifest.json; then
  echo "✓ declarativeNetRequest permission present (MV3 compliant)"
fi

# Check for webRequest (MV2 API)
if grep -r "chrome\.webRequest" src/ --include="*.js" 2>/dev/null; then
  echo "✗ Found chrome.webRequest usage (MV2)"
  ((issues++))
else
  echo "✓ No chrome.webRequest usage"
fi

echo "---"
if [ $issues -eq 0 ]; then
  echo "✅ All MV2 patterns resolved!"
else
  echo "❌ Found $issues MV2 pattern issues"
fi
