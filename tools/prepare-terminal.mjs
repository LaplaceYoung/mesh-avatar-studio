import { chmod, stat } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
// node-pty 1.1.0's packaged macOS helper can lose its executable bit during npm extraction.
if (process.platform === 'darwin') {
  const require = createRequire(import.meta.url);
  const root = dirname(require.resolve('node-pty/package.json'));
  const helper = join(root, 'prebuilds', `darwin-${process.arch}`, 'spawn-helper');
  try { const info = await stat(helper); if (!(info.mode & 0o100)) await chmod(helper, info.mode | 0o100); }
  catch (error) { if (error.code !== 'ENOENT') throw error; }
}
