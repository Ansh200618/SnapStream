#!/bin/bash
echo "Verifying imports..."
errors=0

# Check html.js
if [ ! -f "src/html.js" ]; then echo "✗ src/html.js missing"; ((errors++)); else echo "✓ src/html.js"; fi

# Check components
for file in src/components/*.js; do
  if [ ! -f "$file" ]; then echo "✗ $file missing"; ((errors++)); else echo "✓ $file"; fi
done

# Check hooks
for file in src/hooks/*.js; do
  if [ ! -f "$file" ]; then echo "✗ $file missing"; ((errors++)); else echo "✓ $file"; fi
done

# Check main files
for file in AdvancedFilters DownloadConfirmation Images ImageActions Support UrlFilterMode robustDownload utils defaults popup options sendImages; do
  if [ ! -f "src/${file}.js" ]; then echo "✗ src/${file}.js missing"; ((errors++)); else echo "✓ src/${file}.js"; fi
done

# Check lib files
for file in react-17.0.2.min.js react-dom-17.0.2.min.js htm.js; do
  if [ ! -f "lib/${file}" ]; then echo "✗ lib/${file} missing"; ((errors++)); else echo "✓ lib/${file}"; fi
done

echo "---"
if [ $errors -eq 0 ]; then
  echo "All files found!"
else
  echo "$errors files missing!"
fi
