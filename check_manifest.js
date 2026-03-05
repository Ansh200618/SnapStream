const manifest = require('./manifest.json');
const fs = require('fs');
const path = require('path');

const filesToCheck = [
  manifest.action.default_popup,
  manifest.options_page,
  manifest.background.service_worker,
  ...Object.values(manifest.icons),
];

console.log('Checking critical files referenced in manifest.json:');
filesToCheck.forEach(file => {
  const exists = fs.existsSync(file);
  console.log(`${exists ? '✓' : '✗'} ${file}`);
});
