import { createHash, randomUUID } from 'node:crypto';
import { mkdir, realpath, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import { PNG } from 'pngjs';
import type { Plugin } from 'vite';
import { localRequest } from './agent-bridge';
import { inspectImagePreflight } from './image-preflight';
import { removeConnectedLightBackground } from './background-removal';
export { removeConnectedLightBackground } from './background-removal';

const MAX_BYTES = 24 * 1024 * 1024;
const MAX_PIXELS = 16_000_000;
const API_URL = 'https://api.mosi.cn/v1/images/generations';
const MODEL = 'moss-image-sft-1.0';
export const LIVE2D_IMAGE_PROMPT = `Create a production-ready 2D avatar source illustration for mesh-based Live2D-style deformation.
Subject: a single original character, front-facing or near-front-facing, head and shoulders visible, centered with generous margins.
Composition: one complete character only, symmetric face, clear separate eyes with visible whites and irises, closed-mouth neutral expression, visible jawline, neck and shoulders.
Layer-friendly design: hair is separated into readable locks with a clear hairline; side hair, buns, ribbons and pendants are visually distinct from the face; hands and props must not cover the eyes or mouth; keep facial features away from hair overlap.
Rendering: clean high-resolution illustration, crisp silhouette, consistent linework, soft controlled shading, simple uncluttered clothing shapes, no tiny texture noise.
Background: perfectly flat solid white (#FFFFFF), without gradients, texture, checkerboard, cast shadows or objects. Do not draw a transparency checkerboard. Keep the full hair, ribbons and shoulders inside the frame with at least 8% margin at the top and sides. Keep white costume details bounded by a clear dark contour.
The result must be useful as a source image to trace face, eyes, mouth, hair, accessories, hands, body and mesh regions in source-image pixel coordinates. Do not create a sheet, turnaround, multiple poses, cropped head, or text.`;
export const LIVE2D_NEGATIVE_PROMPT = 'multiple characters, side profile, three-quarter extreme angle, cropped head, cropped shoulders, face covered, eyes covered, mouth covered, hand over face, prop over face, glasses crossing eyes, tangled hair over eyes, merged silhouette, complex background, gradient background, cast shadow, floor, scenery, text, logo, watermark, signature, collage, character sheet, turnaround, multiple poses, open mouth with unclear lips, asymmetrical eyes, low resolution, blur, noisy texture, photorealistic, transparent checkerboard';

type Upload = { sourceSha256: string; id: string; source: string; projectName: string; width: number; height: number; transparent: boolean; generated: true; model: string; prompt: string; backgroundProcessed: boolean; preflight: ReturnType<typeof inspectImagePreflight>; warning?: string };
function reply(res: import('node:http').ServerResponse, status: number, data: object) { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); }

function pngInfo(bytes: Buffer) {
  if (bytes.length < 33 || !bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])) || bytes.toString('ascii', 12, 16) !== 'IHDR') throw new Error('Mosi returned a non-PNG image.');
  const width = bytes.readUInt32BE(16), height = bytes.readUInt32BE(20);
  if (!width || !height || width > 8192 || height > 8192 || width * height > MAX_PIXELS) throw new Error('Generated image exceeds the local processing limit.');
  const image = PNG.sync.read(bytes, { checkCRC: true });
  if (!image.width || !image.height || image.width > 8192 || image.height > 8192 || image.width * image.height > MAX_PIXELS) throw new Error('Generated image exceeds the local processing limit.');
  const preflight = inspectImagePreflight(image);
  return { width: image.width, height: image.height, transparent: preflight.method === 'alpha', preflight };
}
export function mosiImagePlugin(root: string): Plugin {
  return { name: 'studio-mosi-image', apply: 'serve', configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url !== '/__studio/mosi-image') return next();
      if (!localRequest(req, true)) return reply(res, 403, { error: 'Local same-origin requests only.' });
      if (req.method !== 'POST') return reply(res, 405, { error: 'Use POST.' });
      const key = process.env.MOSS_API_KEY;
      if (!key) return reply(res, 503, { error: 'MOSS_API_KEY is not configured in the local development environment.' });
      try {
        let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 20_000) return reply(res, 413, { error: 'Prompt request is too large.' }); }
        const input = JSON.parse(body) as { subject?: unknown; projectName?: unknown; removeBackground?: unknown };
        const subject = typeof input.subject === 'string' ? input.subject.trim() : '';
        const projectName = typeof input.projectName === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(input.projectName) ? input.projectName : `generated-${randomUUID().slice(0, 8)}`;
        const prompt = subject ? `${LIVE2D_IMAGE_PROMPT}\nCharacter brief: ${subject}` : LIVE2D_IMAGE_PROMPT;
        if (prompt.length > 4000) return reply(res, 400, { error: 'Character brief is too long. Shorten it before generating.' });
        const response = await fetch(API_URL, { method: 'POST', signal: AbortSignal.timeout(180_000), headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model: MODEL, prompt, negative_prompt: LIVE2D_NEGATIVE_PROMPT, n: 1, size: '1024x1024', response_format: 'url', output_watermark: { enabled: false } }) });
        const payload = await response.json() as { data?: Array<{ url?: unknown }>; error?: { message?: string } };
        if (!response.ok) return reply(res, response.status === 401 ? 502 : response.status, { error: payload.error?.message ?? `Mosi image request failed (${response.status}).` });
        const url = payload.data?.[0]?.url;
        if (typeof url !== 'string' || !/^https?:\/\//.test(url)) return reply(res, 502, { error: 'Mosi returned no downloadable image URL.' });
        const imageResponse = await fetch(url, { signal: AbortSignal.timeout(60_000) }); if (!imageResponse.ok) return reply(res, 502, { error: 'Could not download the generated image.' });
        if (Number(imageResponse.headers.get('content-length')) > MAX_BYTES) return reply(res, 413, { error: 'Generated image exceeds 24 MiB.' });
        if (!imageResponse.body) throw new Error('Image response has no body.');
        const reader = imageResponse.body.getReader(), chunks: Buffer[] = []; let total = 0;
        try {
          while (true) {
            const { done, value } = await reader.read(); if (done) break;
            total += value.length;
            if (total > MAX_BYTES) { await reader.cancel(); throw new Error('Generated image exceeds 24 MiB.'); }
            chunks.push(Buffer.from(value));
          }
        } finally { reader.releaseLock(); }
        const original = Buffer.concat(chunks);
        const originalInfo = pngInfo(original);
        const backgroundProcessed = input.removeBackground === true && !originalInfo.transparent;
        const bytes = backgroundProcessed ? PNG.sync.write(removeConnectedLightBackground(PNG.sync.read(original, { checkCRC: true }))) : original;
        const info = pngInfo(bytes);
        const repository = await realpath(root), base = join(repository, 'projects', '.uploads'); await mkdir(base, { recursive: true, mode: 0o700 });
        if (!(await realpath(base)).startsWith(repository + sep)) throw new Error('Upload directory must stay inside the repository.');
        const id = randomUUID(), directory = join(base, id); await mkdir(directory, { mode: 0o700 });
        await writeFile(join(directory, 'original.png'), original, { flag: 'wx', mode: 0o600 });
        await writeFile(join(directory, 'source.png'), bytes, { flag: 'wx', mode: 0o600 });
        const upload: Upload = { sourceSha256: createHash('sha256').update(bytes).digest('hex'), id, source: `projects/.uploads/${id}/source.png`, projectName, ...info, generated: true, model: MODEL, prompt, backgroundProcessed, ...(backgroundProcessed || info.preflight.warnings.length ? { warning: [...(backgroundProcessed ? ['Background removal is approximate. Inspect light hair, clothing edges and gaps before rigging. The unmodified original.png is preserved.'] : []), ...info.preflight.warnings].join(' ') } : {}) };
        await writeFile(join(directory, 'upload.json'), JSON.stringify(upload, null, 2), { flag: 'wx', mode: 0o600 });
        reply(res, 201, upload);
      } catch (error) { reply(res, 422, { error: error instanceof Error ? error.message : 'Generated image failed validation.' }); }
    });
  } };
}
