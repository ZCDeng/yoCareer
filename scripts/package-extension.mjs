#!/usr/bin/env node
/**
 * Package extension/ into a zip file for store submission.
 * Excludes: form-fill/ (empty placeholder), .DS_Store, *.log
 */
import { createWriteStream } from 'fs';
import { readdirSync, statSync } from 'fs';
import { join } from 'path';

const EXT_DIR = 'extension';
const OUT_FILE = 'store-assets/yoCareer-extension-v2.0.0.zip';

// Check if archiver is available
try {
  await import('archiver');
} catch {
  console.error('archiver not installed. Run: npm install archiver');
  process.exit(1);
}

const { default: createArchive } = await import('archiver');
const output = createWriteStream(OUT_FILE);
const archive = createArchive('zip', { zlib: { level: 9 } });

archive.on('warning', (err) => {
  if (err.code === 'ENOENT') console.warn('Warning:', err.message);
  else throw err;
});
archive.on('error', (err) => { throw err; });

archive.pipe(output);

function addDirectory(dir, prefix = '') {
  const entries = readdirSync(dir);
  for (const entry of entries) {
    if (entry === '.DS_Store' || entry.endsWith('.log')) continue;
    const fullPath = join(dir, entry);
    const stat = statSync(fullPath);
    const archivePath = prefix ? join(prefix, entry) : entry;
    
    if (stat.isDirectory()) {
      if (entry === 'form-fill') continue; // skip empty placeholder
      addDirectory(fullPath, archivePath);
    } else {
      archive.file(fullPath, { name: archivePath });
    }
  }
}

addDirectory(EXT_DIR);

await archive.finalize();
await new Promise((resolve, reject) => {
  output.on('close', resolve);
  output.on('error', reject);
});

const sizeKB = (archive.pointer() / 1024).toFixed(1);
console.log(`✓ Packaged: ${OUT_FILE} (${sizeKB} KB)`);
