#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Rename _next to next after build
const oldPath = path.join(__dirname, '../out/_next');
const newPath = path.join(__dirname, '../out/next');

const getHtmlFilesRecursively = (dir) => {
  const entries = fs.readdirSync(dir, { withFileTypes: true });
  return entries.flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return getHtmlFilesRecursively(fullPath);
    return entry.isFile() && entry.name.endsWith('.html') ? [fullPath] : [];
  });
};

if (fs.existsSync(oldPath)) {
  fs.renameSync(oldPath, newPath);
  console.log('✓ Renamed _next to next');
  
  // Get all CSS files from next/static/css
  const cssDir = path.join(newPath, 'static/css');
  let cssContent = '';
  if (fs.existsSync(cssDir)) {
    const cssFiles = fs.readdirSync(cssDir).filter(f => f.endsWith('.css'));
    cssFiles.forEach(cssFile => {
      const cssPath = path.join(cssDir, cssFile);
      cssContent += fs.readFileSync(cssPath, 'utf8');
    });
  }
  
  // Replace _next with next and inline CSS in all HTML files
  const outDir = path.join(__dirname, '../out');
  const files = getHtmlFilesRecursively(outDir);
  
  files.forEach(filePath => {
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace _next with next
    content = content.replace(/_next/g, 'next');
    
    // Inline CSS into <head> before other styles
    if (cssContent && content.includes('<head>')) {
      const styleTag = `<style>${cssContent}</style>`;
      content = content.replace('<head>', `<head>${styleTag}`);
    }
    
    fs.writeFileSync(filePath, content);
    console.log(`✓ Updated ${path.relative(outDir, filePath)}`);
  });
} else {
  console.log('_next directory not found');
}
