#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// Rename _next to next after build
const oldPath = path.join(__dirname, '../out/_next');
const newPath = path.join(__dirname, '../out/next');

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
  const files = fs.readdirSync(outDir).filter(f => f.endsWith('.html'));
  
  files.forEach(file => {
    const filePath = path.join(outDir, file);
    let content = fs.readFileSync(filePath, 'utf8');
    
    // Replace _next with next
    content = content.replace(/_next/g, 'next');
    
    // Inline CSS into <head> before other styles
    if (cssContent && content.includes('<head>')) {
      const styleTag = `<style>${cssContent}</style>`;
      content = content.replace('<head>', `<head>${styleTag}`);
    }
    
    fs.writeFileSync(filePath, content);
    console.log(`✓ Updated ${file}`);
  });
} else {
  console.log('_next directory not found');
}

