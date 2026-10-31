import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdtemp, mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';

const exec = promisify(execFile);
const root = fileURLToPath(new URL('../', import.meta.url));
const temporary = await mkdtemp(join(tmpdir(), 'dashboard-icon-'));
const iconset = join(temporary, 'Dashboard.iconset');
const destination = join(root, 'desktop/assets');
try {
  await mkdir(iconset);
  await mkdir(destination, { recursive: true });
  const conversions = [];
  for (const size of [16, 32, 128, 256, 512]) {
    for (const scale of [1, 2]) {
      const pixels = String(size * scale);
      const name = `icon_${size}x${size}${scale === 2 ? '@2x' : ''}.png`;
      conversions.push(exec('/usr/bin/sips', ['-z', pixels, pixels, join(root, 'public/icon-512.png'), '--out', join(iconset, name)]));
    }
  }
  const results = await Promise.allSettled(conversions);
  for (const result of results) if (result.status === 'rejected') throw result.reason;
  await exec('/usr/bin/iconutil', ['-c', 'icns', iconset, '-o', join(destination, 'dashboard-mac.icns')]);
  console.log('Icona macOS generata in tutte le dimensioni, incluse le varianti Retina.');
} finally {
  await rm(temporary, { recursive: true, force: true });
}
