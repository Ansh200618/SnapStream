#!/bin/bash
echo "Checking for unused files..."

# Check for unused JS files in src that are not imported anywhere
unused_files=0
for file in src/*.js; do
  filename=$(basename "$file" .js)
  # Skip test files and known entry points
  if [[ "$filename" == *.test || "$filename" == "defaults" || "$filename" == "html" || "$filename" == "utils" || "$filename" == "popup" || "$filename" == "options" || "$filename" == "sendImages" || "$filename" == "robustDownload" ]]; then
    continue
  fi
  
  # Check if file is imported anywhere
  if ! grep -r "from.*${filename}" src/ --include="*.js" --include="*.ts" >/dev/null 2>&1; then
    echo "⚠️  Potentially unused: src/${filename}.js"
    ((unused_files++))
  fi
done

if [ $unused_files -eq 0 ]; then
  echo "✓ No unused files detected in src/"
fi
