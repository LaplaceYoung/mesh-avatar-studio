import { readFile, writeFile, mkdir, realpath } from 'node:fs/promises';
import { resolve, relative, dirname, basename } from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { chromium } from '@playwright/test';
import { validateRig } from '../packages/runtime/src/rig/validate.ts';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const poses = [
  ['rest', {}], ['eyes-half', { eyeLOpen: 0.5, eyeROpen: 0.5 }],
  ['eyes-closed', { eyeLOpen: 0, eyeROpen: 0 }], ['mouth-open', { mouthOpen: 1 }],
  ['turn-left', { angleX: -30 }], ['turn-right', { angleX: 30 }],
  ['look-up', { angleY: 15 }], ['look-down', { angleY: -15 }],
  ['tilt-left', { angleZ: -15 }], ['tilt-right', { angleZ: 15 }],
  ['body-left', { bodyAngleZ: -8 }], ['body-right', { bodyAngleZ: 8 }],
  // live expressions; they show the drawn expression eyes when the avatar has them
  ['angry', {}, 'angry'], ['sad', {}, 'sad'], ['surprise', {}, 'surprise'],
];

async function main() {
  const rawArgs = process.argv.slice(2);
  const hideEyeCreases = rawArgs.includes('--hide-eye-creases');
  const blinkSequence = rawArgs.includes('--blink-sequence');
  const blinkSweep = rawArgs.includes('--blink-sweep');
  const args = rawArgs.filter(arg => !['--hide-eye-creases', '--blink-sweep', '--blink-sequence'].includes(arg));
  if (blinkSequence && blinkSweep) throw new Error('Choose --blink-sequence or --blink-sweep, not both.');
  const renderPoses = blinkSequence ? Array.from({ length: 21 }, (_, index) => [`blink-${String(index).padStart(2, '0')}`, { eyeLOpen: Math.abs(index - 10) / 10, eyeROpen: Math.abs(index - 10) / 10 }]) : blinkSweep ? Array.from({ length: 11 }, (_, index) => [`blink-${String(index).padStart(2, '0')}`, { eyeLOpen: 1 - index / 10, eyeROpen: 1 - index / 10 }]) : poses;
  if (args.includes('--help')) {
    console.log('Usage: npm run render-poses -- <project> [--hide-eye-creases] [--blink-sweep | --blink-sequence]');
    return;
  }
  if (args.length !== 1) throw new Error('Usage: npm run render-poses -- <project> [--hide-eye-creases] [--blink-sweep | --blink-sequence]');
  const project = await realpath(resolve(args[0]));
  if (relative(root, project).startsWith('..')) throw new Error('project must stay inside the repository');
  const rigBytes = await readFile(resolve(project, 'rig.json'));
  const rigSha256 = createHash('sha256').update(rigBytes).digest('hex');
  const rig = JSON.parse(rigBytes.toString('utf8'));
  const errors = validateRig(rig);
  if (errors.length) throw new Error(errors.join('\n'));
  const built = await realpath(resolve(project, 'built'));
  if (relative(project, built).startsWith('..')) throw new Error('built folder must stay inside the project');
  const assets = {};
  async function asset(name) {
    const path = await realpath(resolve(built, name));
    if (relative(built, path).startsWith('..')) throw new Error(`asset escapes built folder: ${name}`);
    assets[name] = `data:${name.endsWith('.png') ? 'image/png' : 'application/json'};base64,${(await readFile(path)).toString('base64')}`;
  }
  await asset('layers.json');
  const layers = JSON.parse(await readFile(resolve(built, 'layers.json'), 'utf8'));
  await Promise.all(['base', 'hairmask', ...Object.keys(layers.layers)].map(name => asset(`${name}.png`)));
  try {
    await asset('sprites/sprites.json');
  } catch (error) {
    if (error.code !== 'ENOENT') throw error;
    console.log('Optional drawn sprites absent; reviewing generated eye/mouth layers.');
  }
  if (assets['sprites/sprites.json']) {
    const sprites = JSON.parse(await readFile(resolve(built, 'sprites/sprites.json'), 'utf8'));
    await Promise.all(Object.keys(sprites.layers).map(name => asset(`sprites/${name}.png`)));
  }
  const server = await createServer({ root, configFile: false, publicDir: false, appType: 'custom', cacheDir: 'node_modules/.vite-pose-review', optimizeDeps: { noDiscovery: true, entries: [] },
    plugins: [{ name: 'pose-review-page', configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url !== '/__pose_review__') return next();
        res.setHeader('Content-Type', 'text/html');
        res.end('<!doctype html><html><body style="margin:0"><canvas id="avatar"></canvas></body></html>');
      });
    } }],
    server: { host: '127.0.0.1', port: 0, strictPort: false, hmr: false, watch: null, preTransformRequests: false }, logLevel: 'error' });
  let browser;
  try {
    await server.listen();
    const address = server.httpServer.address();
    const origin = `http://127.0.0.1:${address.port}`;
    browser = await chromium.launch();
    const page = await browser.newPage({ viewport: { width: Math.ceil(rig.image.width * 1.2), height: Math.ceil(rig.image.height * 1.1) }, deviceScaleFactor: 1 });
    const browserErrors = [];
    page.on('pageerror', error => browserErrors.push(error.message));
    // Only the local code server may be contacted; private images use data URLs.
    await page.route('**/*', route => new URL(route.request().url()).origin === origin ? route.continue() : route.abort());
    await page.goto(`${origin}/__pose_review__`);
    const result = await page.evaluate(async ({ rig, assets, poses, hideEyeCreases, blinkSequence }) => {
      const { createMeshAvatar, PARAMS } = await import('/packages/runtime/src/index.ts');
      const canvas = document.getElementById('avatar');
      const width = Math.ceil(rig.image.width * 1.2), height = Math.ceil(rig.image.height * 1.1);
      canvas.style.width = `${width}px`; canvas.style.height = `${height}px`;
      const defaults = Object.fromEntries(PARAMS.map(p => [p.id, p.def]));
      const pictures = [];
      if (hideEyeCreases) {
        // Preserve required texture dimensions while isolating crease visibility.
        for (const name of ['eye0_crease.png', 'eye1_crease.png']) {
          const image = new Image(); image.src = assets[name]; await image.decode();
          const blank = document.createElement('canvas');
          blank.width = image.width; blank.height = image.height;
          assets[name] = blank.toDataURL();
        }
      }
      async function avatar() {
        const av = await createMeshAvatar(canvas, { rig, assets, manual: true, padTop: 0.1, padSide: 0.1 });
        av.setAutoIdle(false); av.setAutoMotion(false); av.setParameters(defaults);
        return av;
      }
      const continuous = blinkSequence ? await avatar() : null;
      for (const [name, values, expression] of poses) {
        const av = continuous ?? await avatar();
        av.setParameters({ ...defaults, ...values });
        if (expression) av.setExpression(expression);
        av.advance(blinkSequence ? 1 / 60 : 1, 60);
        pictures.push([name, canvas.toDataURL()]); if (!continuous) av.destroy();
      }
      continuous?.destroy();
      const av = await avatar();
      av.setParameters({ ...defaults, angleX: 30 }); av.advance(0.2, 60);
      av.setParameters(defaults);
      for (const [i, seconds] of [0.05, 0.08, 0.12, 0.15, 0.2, 0.3].entries()) {
        av.advance(seconds, 60); pictures.push([`hair-sway-${i}`, canvas.toDataURL()]);
      }
      av.destroy();
      const scale = Math.min(width / (rig.image.width * 1.2), height / (rig.image.height * 1.1));
      const ox = (width - rig.image.width * scale) / 2, oy = height - rig.image.height * scale;
      const bounds = points => {
        const xs = points.map(p => p[0]), ys = points.map(p => p[1]);
        const margin = 80;
        const x = Math.max(0, Math.floor(ox + (Math.min(...xs) - margin) * scale));
        const y = Math.max(0, Math.floor(oy + (Math.min(...ys) - margin) * scale));
        return [x, y, Math.min(width - x, Math.ceil((Math.max(...xs) - Math.min(...xs) + margin * 2) * scale)),
          Math.min(height - y, Math.ceil((Math.max(...ys) - Math.min(...ys) + margin * 2) * scale))];
      };
      const eyes = bounds(rig.eyes.flatMap(e => e.roi));
      const m = rig.mouth.area;
      const mouth = bounds([[m.cx - m.rx, m.cy - m.ry], [m.cx + m.rx, m.cy + m.ry]]);
      const crops = [];
      const sheet = document.createElement('canvas'); sheet.width = 1200; sheet.height = Math.ceil(pictures.length / 4) * 390;
      const ctx = sheet.getContext('2d'); ctx.fillStyle = '#dedfe5'; ctx.fillRect(0, 0, sheet.width, sheet.height);
      for (const [i, [name, url]] of pictures.entries()) {
        const img = new Image(); img.src = url; await img.decode();
        const x = (i % 4) * 300, y = Math.floor(i / 4) * 390;
        const k = Math.min(288 / width, 350 / height);
        ctx.drawImage(img, x + (300 - width * k) / 2, y + 30, width * k, height * k);
        ctx.fillStyle = '#171b23'; ctx.font = '16px sans-serif'; ctx.fillText(name, x + 8, y + 22);
        for (const [part, rect] of [['eyes', eyes], ['mouth', mouth]]) {
          const crop = document.createElement('canvas'); crop.width = 1000; crop.height = Math.round(rect[3] / rect[2] * 1000);
          const context = crop.getContext('2d'); context.fillStyle = '#919191'; context.fillRect(0, 0, crop.width, crop.height);
          context.imageSmoothingEnabled = false; context.drawImage(img, ...rect, 0, 0, crop.width, crop.height);
          crops.push([`${name}-${part}`, crop.toDataURL()]);
        }
      }
      // Label last so all thumbnails have a consistently readable header.
      for (const [i, [name]] of pictures.entries()) {
        const x = (i % 4) * 300, y = Math.floor(i / 4) * 390;
        ctx.fillStyle = '#dedfe5'; ctx.fillRect(x, y, 300, 30);
        ctx.fillStyle = '#171b23'; ctx.font = '16px sans-serif'; ctx.fillText(name, x + 8, y + 22);
      }
      const detailSheets = [];
      for (const part of ['eyes', 'mouth']) {
        const entries = crops.filter(([name]) => name.endsWith(`-${part}`));
        const detail = document.createElement('canvas'); detail.width = 1200;
        const cellHeight = part === 'eyes' ? 260 : 440;
        detail.height = Math.ceil(entries.length / 2) * cellHeight;
        const context = detail.getContext('2d');
        context.fillStyle = '#919191'; context.fillRect(0, 0, detail.width, detail.height);
        for (const [i, [name, url]] of entries.entries()) {
          const image = new Image(); image.src = url; await image.decode();
          const x = i % 2 * 600, y = Math.floor(i / 2) * cellHeight;
          const scale = Math.min(584 / image.width, (cellHeight - 40) / image.height);
          context.drawImage(image, x + (600 - image.width * scale) / 2, y + 32, image.width * scale, image.height * scale);
          context.fillStyle = '#171b23'; context.font = '18px sans-serif'; context.fillText(name, x + 8, y + 23);
        }
        detailSheets.push([`${part}-sheet`, detail.toDataURL()]);
      }
      return { images: [...pictures, ...crops, ...detailSheets, ['contact-sheet', sheet.toDataURL()]], width, height, cropBounds: { eyes, mouth }, padTop: 0.1, padSide: 0.1 };
    }, { rig, assets, poses: renderPoses, hideEyeCreases, blinkSequence });
    if (browserErrors.length) throw new Error(browserErrors.join('\n'));
    const review = resolve(project, blinkSequence ? `work/blink-sequence${hideEyeCreases ? '-without-creases' : ''}` : blinkSweep ? `work/blink-sweep${hideEyeCreases ? '-without-creases' : ''}` : hideEyeCreases ? 'work/review-without-eye-creases' : 'review'); await mkdir(review, { recursive: true });
    if (relative(project, await realpath(review)).startsWith('..')) throw new Error('review folder must stay inside the project');
    for (const [name, url] of result.images) await writeFile(resolve(review, `${name}.png`), Buffer.from(url.split(',')[1], 'base64'));
    const { images, ...metadata } = result;
    await writeFile(resolve(review, 'poses.json'), JSON.stringify({ ...metadata, rigSha256, ...(blinkSequence || blinkSweep || hideEyeCreases ? { diagnosticOnly: true, diagnostic: blinkSequence ? 'blink-sequence' : blinkSweep ? 'blink-sweep' : 'hidden-creases', hiddenLayers: hideEyeCreases ? ['eye0_crease', 'eye1_crease'] : [] } : {}), project: basename(project), fixedFps: 60, ...(blinkSequence ? { sequence: { frameCount: renderPoses.length, durationSeconds: renderPoses.length / 60, autoIdle: false, autoMotion: false, physics: 'enabled', note: 'Hair and accessory wind remains time-dependent. Equal eye-open values need not yield identical crop pixels; crop differences are not a blink-quality verdict.' } } : {}), poseSeconds: blinkSequence ? 1 / 60 : 1, poses: renderPoses.map(([name, parameters, expression], index) => ({ name, parameters, ...(blinkSequence ? { frame: index, timeSeconds: (index + 1) / 60 } : {}), ...(expression && { expression }) })), hairFrames: 6, files: images.map(([name]) => `${name}.png`) }, null, 2) + '\n');
    console.log(`Rendered ${renderPoses.length + 6} poses, eye/mouth crops and contact-sheet.png in ${relative(root, review)}/`);
  } finally {
    await browser?.close();
    await server.close();
  }
}

main().catch(error => { console.error(`render-poses: ${error.message}`); process.exitCode = 1; });
