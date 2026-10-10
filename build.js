const fs = require('fs');
const path = require('path');

function copyDir(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  for (const entry of fs.readdirSync(src, { withFileTypes: true })) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDir(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

// Ensure public directory exists
fs.mkdirSync('public', { recursive: true });

// Copy static frontend assets into public/
fs.copyFileSync('index.html', path.join('public', 'index.html'));
copyDir('css', path.join('public', 'css'));
copyDir('js', path.join('public', 'js'));

console.log('Successfully prepared public directory for Vercel deployment');
