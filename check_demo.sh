#!/bin/bash
echo "Checking demo and preview files..."

echo "demo.html:"
if [ -f "demo.html" ]; then
  lines=$(wc -l < demo.html)
  # Check if it references working files
  if grep -q "image\|script\|link" demo.html; then
    echo "  ✓ File exists and has content ($lines lines)"
    echo "  - Referenced resources:"
    grep -o 'href=\|src=' demo.html | head -5 | sed 's/^/    /'
  fi
else
  echo "  ✗ File missing"
fi

echo ""
echo "preview-extension.html:"
if [ -f "preview-extension.html" ]; then
  lines=$(wc -l < preview-extension.html)
  if grep -q "image\|script\|link" preview-extension.html; then
    echo "  ✓ File exists and has content ($lines lines)"
    echo "  - Purpose: $(grep -o '<title>.*</title>' preview-extension.html | head -1)"
  fi
else
  echo "  ✗ File missing"
fi

echo ""
echo "Files included in build:"
grep "filesToCopy" scripts/config.js | grep -v "//"
