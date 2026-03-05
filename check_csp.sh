#!/bin/bash
echo "Checking Content Security Policy compliance..."
issues=0

# Check for inline scripts in HTML files
for html_file in views/*.html; do
  if grep -q "<script>" "$html_file"; then
    echo "✗ Inline script found in $html_file"
    ((issues++))
  elif grep -q 'onclick\|onload\|onerror' "$html_file"; then
    echo "✗ Inline event handler found in $html_file"
    ((issues++))
  else
    echo "✓ No inline scripts in $html_file"
  fi
done

# Check for unsafe eval patterns
if grep -r "eval(" src/ --include="*.js" 2>/dev/null; then
  echo "✗ Found eval() usage"
  ((issues++))
else
  echo "✓ No eval() usage"
fi

# Check for new Function patterns
if grep -r "new Function" src/ --include="*.js" 2>/dev/null; then
  echo "✗ Found new Function() usage"
  ((issues++))
else
  echo "✓ No new Function() usage"
fi

# Check CSP in manifest
if grep -q "content_security_policy" manifest.json; then
  echo "✓ CSP defined in manifest"
  grep "content_security_policy" -A 3 manifest.json
else
  echo "⚠️  No explicit CSP in manifest"
fi

echo "---"
if [ $issues -eq 0 ]; then
  echo "✅ CSP compliant!"
else
  echo "❌ Found $issues CSP issues"
fi
