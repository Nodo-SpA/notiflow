#!/usr/bin/env node
const fs = require('fs');
const path = require('path');

// No-op renamer: keep the default _next folder so Next.js asset paths stay intact.
const outDir = path.join(__dirname, '../out');
const legacyNext = path.join(outDir, 'next');

// Clean up any previous "next" folder so only _next is served.
if (fs.existsSync(legacyNext)) {
  fs.rmSync(legacyNext, { recursive: true, force: true });
  console.log('✓ Removed legacy /next folder (using default /_next)');
} else {
  console.log('✓ Keeping default /_next (no rename needed)');
}
