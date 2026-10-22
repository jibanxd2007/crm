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

function copyFileIfExists(src, dest) {
  if (fs.existsSync(src)) {
    const destDir = path.dirname(dest);
    if (!fs.existsSync(destDir)) fs.mkdirSync(destDir, { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

// Ensure public directory exists
fs.mkdirSync('public', { recursive: true });

// Copy static frontend assets into public/
copyFileIfExists('index.html', path.join('public', 'index.html'));
copyFileIfExists('download.html', path.join('public', 'download.html'));
copyFileIfExists('favicon.ico', path.join('public', 'favicon.ico'));
copyFileIfExists('robots.txt', path.join('public', 'robots.txt'));
copyDir('css', path.join('public', 'css'));
copyDir('js', path.join('public', 'js'));
copyDir('assets', path.join('public', 'assets'));
copyDir('images', path.join('public', 'images'));

console.log('Successfully prepared public directory for Vercel deployment');
