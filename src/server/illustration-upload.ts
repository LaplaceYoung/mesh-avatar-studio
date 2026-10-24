import { randomUUID } from 'node:crypto';
import { mkdir, realpath, writeFile, readFile, stat } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { PNG } from 'pngjs';
import type { Plugin } from 'vite';
import { localRequest } from './agent-bridge';

const MAX_BYTES = 24 * 1024 * 1024;
const MAX_PIXELS = 16_000_000;
export function illustrationUpload(root: string): Plugin {
  return { name: 'studio-illustration-upload', apply: 'serve', configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const reply = (status: number, data: object) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
      const pathname = new URL(req.url ?? '/', 'http://localhost').pathname;
      if (pathname !== '/__studio/illustrations' && !pathname.startsWith('/__studio/illustrations/')) return next();
      if (!localRequest(req, req.method !== 'GET')) return reply(403, { error: 'Local same-origin requests only.' });
      if (req.method === 'GET') {
        const id = pathname.slice('/__studio/illustrations/'.length);
        if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/.test(id)) return reply(400, { error: 'Invalid upload id.' });
        try {
          const repository = await realpath(root), directory = join(repository, 'projects', '.uploads', id);
          const actual = await realpath(join(directory, 'source.png'));
          if (!actual.startsWith(directory + sep)) return reply(403, { error: 'Image must stay in its upload directory.' });
          const info = await stat(actual);
          if (!info.isFile() || info.size > MAX_BYTES) return reply(413, { error: 'Invalid image size.' });
          const bytes = await readFile(actual);
          res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', 'Cross-Origin-Resource-Policy': 'same-origin' }); res.end(bytes);
        } catch { reply(404, { error: 'Image not found.' }); }
        return;
      }
      if (pathname !== '/__studio/illustrations') return reply(404, { error: 'Unknown upload operation.' });
      if (!localRequest(req, true)) return reply(403, { error: 'Local same-origin requests only.' });
      if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });
      if (req.headers['content-type'] !== 'image/png') return reply(415, { error: 'Please upload a PNG image.' });
      if (Number(req.headers['content-length']) > MAX_BYTES) return reply(413, { error: 'PNG must be at most 24 MiB.' });
      try {
        const chunks: Buffer[] = []; let size = 0;
        for await (const chunk of req) { size += chunk.length; if (size > MAX_BYTES) return reply(413, { error: 'PNG must be at most 24 MiB.' }); chunks.push(Buffer.from(chunk)); }
        const bytes = Buffer.concat(chunks);
        if (bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.toString('ascii', 12, 16) !== 'IHDR') return reply(422, { error: 'Invalid PNG header.' });
        const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
        if (!width || !height || width > 8192 || height > 8192 || width * height > MAX_PIXELS) return reply(422, { error: 'Image exceeds the 16 megapixel / 8192 px processing limit.' });
        let decoded: PNG;
        try { decoded = PNG.sync.read(bytes, { checkCRC: true }); } catch { return reply(422, { error: 'PNG could not be decoded. Export it again as a static PNG.' }); }
        let transparentPixels = 0;
        for (let index = 3; index < decoded.data.length; index += 4) if (decoded.data[index] < 255) transparentPixels++;
        const realRoot = await realpath(root), base = join(realRoot, 'projects', '.uploads');
        await mkdir(base, { recursive: true, mode: 0o700 });
        if (!(await realpath(base)).startsWith(realRoot + sep)) return reply(403, { error: 'Upload directory must stay inside this repository.' });
        const id = randomUUID(), directory = join(base, id);
        await mkdir(directory, { mode: 0o700 });
        await writeFile(join(directory, 'source.png'), bytes, { flag: 'wx', mode: 0o600 });
        const upload = { id, source: `projects/.uploads/${id}/source.png`, projectName: `avatar-${id.slice(0, 8)}`, width, height, transparent: transparentPixels > 0, uploadedAt: new Date().toISOString() };
        await writeFile(join(directory, 'upload.json'), JSON.stringify(upload, null, 2), { flag: 'wx', mode: 0o600 });
        reply(201, upload);
      } catch { reply(500, { error: 'Could not save the image locally. Check disk space and project permissions.' }); }
    });
  } };
}
