import { createHash } from 'node:crypto';
import { open, readFile, realpath, readdir, stat, writeFile } from 'node:fs/promises';
import { join, sep } from 'node:path';
import type { Plugin } from 'vite';
import { validateRig } from '../../packages/runtime/src/index';
import { localRequest } from './agent-bridge';
import type { ProductionStage, ProductionStatus } from '../shared/production';

const safeName = /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/;
const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);
const regionAliases = {
  head: new Set(['head']),
  leftEye: new Set(['left_eye', 'eye_left', 'eye0', 'eye_a']),
  rightEye: new Set(['right_eye', 'eye_right', 'eye1', 'eye_b']),
  mouth: new Set(['mouth']),
  hair: new Set(['hair', 'hairline', 'bangs', 'bang_locks']),
  body: new Set(['body', 'shoulders', 'shoulders_body', 'chest']),
};
function hasRegion(names: Set<string>, required: Set<string>) { return [...required].some(name => names.has(name)); }
function regionGeometryIssues(region: { name: string; box: number[] }, width: number, height: number) {
  const [x0, y0, x1, y1] = region.box;
  const regionWidth = x1 - x0, regionHeight = y1 - y0;
  const issues: string[] = [];
  const minimums: Record<string, [number, number]> = {
    left_eye: [Math.max(8, Math.round(width * 0.008)), Math.max(4, Math.round(height * 0.004))],
    right_eye: [Math.max(8, Math.round(width * 0.008)), Math.max(4, Math.round(height * 0.004))],
    eye_left: [Math.max(8, Math.round(width * 0.008)), Math.max(4, Math.round(height * 0.004))],
    eye_right: [Math.max(8, Math.round(width * 0.008)), Math.max(4, Math.round(height * 0.004))],
    eye0: [Math.max(8, Math.round(width * 0.008)), Math.max(4, Math.round(height * 0.004))],
    eye1: [Math.max(8, Math.round(width * 0.008)), Math.max(4, Math.round(height * 0.004))],
    eye_a: [Math.max(8, Math.round(width * 0.008)), Math.max(4, Math.round(height * 0.004))],
    eye_b: [Math.max(8, Math.round(width * 0.008)), Math.max(4, Math.round(height * 0.004))],
    mouth: [Math.max(12, Math.round(width * 0.012)), Math.max(5, Math.round(height * 0.005))],
  };
  const minimum = minimums[region.name];
  if (minimum && (regionWidth < minimum[0] || regionHeight < minimum[1])) issues.push(`${region.name} box ${regionWidth}x${regionHeight}px is too small for reliable local evidence; inspect a tighter source crop before rigging.`);
  if ((region.name === 'left_eye' || region.name === 'right_eye' || region.name.startsWith('eye_') || /^eye[01ab]$/.test(region.name)) && regionWidth > regionHeight * 14) issues.push(`${region.name} box is unusually wide (${regionWidth}x${regionHeight}px); verify that it contains the eyelid and iris rather than a face strip.`);
  if (region.name === 'mouth' && regionWidth > regionHeight * 18) issues.push(`mouth box is unusually wide (${regionWidth}x${regionHeight}px); verify the lips and chin boundary in the detail crop.`);
  return issues;
}
function actionFor(stage: ProductionStage, name: string) {
  const lowConfidence = stage.issues.find(issue => issue.startsWith('Low-confidence regions require visual review:'));
  const geometryIssue = stage.issues.find(issue => issue.includes('box') && (issue.includes('too small') || issue.includes('unusually wide')));
  const motionIssue = stage.issues.find(issue => issue.startsWith('Motion review is missing'));
  const instruction: Record<ProductionStage['id'], string> = {
    source: `使用创建任务提供的本地源图运行 uv run tools/new-project.py <source.png> ${name}，确认 source.png 与上传源图尺寸和 SHA-256 一致。`,
    regions: geometryIssue
      ? `先处理区域几何诊断：${geometryIssue}。打开 source.png 和对应的 detail/grid，确认框是否只覆盖实际部件；修正 regions.json 后重新运行 uv run tools/vision-regions.py projects/${name} --regions projects/${name}/regions.json，并复查 overview/detail/grid。不要仅为通过检查而扩大或缩小框。`
      : lowConfidence
      ? `先打开并逐张检查当前 work/vision-* 的 overview、detail 和 grid，重点复核 ${lowConfidence.replace('Low-confidence regions require visual review: ', '')}。只有实际查看局部坐标后，才能修正 regions.json 的 box/observation/confidence；再运行 uv run tools/vision-regions.py projects/${name} --regions projects/${name}/regions.json，并重新检查 overview/detail/grid。不要把 low confidence 直接改成 high。`
      : `重新逐区查看 source.png，补齐核心区域并确保左右眼和 mouth 都使用 step=5 或更细，然后运行 uv run tools/vision-regions.py projects/${name} --regions projects/${name}/regions.json，并检查 overview/detail/grid。`,
    draft: `读取当前 regions.json 和匹配的 work/vision-* 证据包，完善 rig.draft.json，运行 validate-rig、overlay 和眼部放大叠加。`,
    rig: `修正 rig.draft.json 后运行 validate-rig 和 build-layers，确认眼球层只含眼白/虹膜、头发蒙版不含脸和衣服。`,
    layers: `检查 source.png、rig.json、built/layers.json 和关键 PNG 尺寸，必要时重新运行 build-layers。`,
    review: motionIssue
      ? `重新运行 npm run render-poses -- projects/${name}，确保 review/poses.json 覆盖闭眼、张嘴、左右转头、上下视线、左右倾斜、身体摆动、angry/sad/surprise 和 6 帧 hair-sway；然后逐帧检查眼部、嘴部、头发遮挡与裂缝。`
      : `运行 npm run render-poses -- projects/${name}，逐帧检查闭眼、张嘴、转头、倾斜和头发摆动。`,
  };
  return { stage: stage.id, reason: stage.issues[0] ?? (stage.state === 'missing' ? 'Required artifacts are missing.' : 'Artifact requires inspection.'), instruction: instruction[stage.id] };
}
export async function inspectProduction(root: string, name: string): Promise<ProductionStatus> {
  if (!safeName.test(name)) throw new Error('Invalid project name.');
  const repository = await realpath(root), project = join(repository, 'projects', name);
  const stages: ProductionStage[] = [];
  let projectExists = false;
  try { projectExists = (await stat(project)).isDirectory(); } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
  async function checkedFile(relative: string, limit: number) {
    const file = join(project, relative), actual = await realpath(file);
    if (!actual.startsWith(project + sep)) throw new Error('File path escapes this project.');
    const info = await stat(actual);
    if (!info.isFile() || info.size > limit) throw new Error('Not a regular file or exceeds size limit.');
    return { actual, modified: info.mtimeMs };
  }
  async function stage(id: ProductionStage['id'], action: (stage: ProductionStage) => Promise<void>) {
    const result: ProductionStage = { id, state: 'missing', files: [], issues: [] };
    try { await action(result); result.state = result.issues.length ? 'invalid' : 'observed'; }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === 'ENOENT') { if (result.files.length) { result.state = 'invalid'; result.issues.push('Some required files are missing.'); } }
      else { result.state = 'invalid'; result.issues.push(error instanceof Error ? error.message : 'Could not inspect artifact.'); }
    }
    stages.push(result);
  }
  async function json(file: string, result: ProductionStage) {
    const { actual } = await checkedFile(file, 2 * 1024 * 1024);
    const value = JSON.parse(await readFile(actual, 'utf8'));
    result.files.push(file); return value;
  }
  async function sourceHash() {
    const { actual: file } = await checkedFile('source.png', 64 * 1024 * 1024);
    return createHash('sha256').update(await readFile(file)).digest('hex');
  }
  async function png(file: string, result: ProductionStage) {
    const { actual, modified } = await checkedFile(file, 64 * 1024 * 1024);
    const handle = await open(actual, 'r');
    try {
      const header = Buffer.alloc(24); const { bytesRead } = await handle.read(header, 0, header.length, 0);
      if (bytesRead < 24 || !header.subarray(0, 8).equals(signature) || header.toString('ascii', 12, 16) !== 'IHDR') throw new Error(`${file}: invalid PNG header.`);
      result.files.push(file); return { width: header.readUInt32BE(16), height: header.readUInt32BE(20), modified };
    } finally { await handle.close(); }
  }
  let source: { width: number; height: number; modified: number } | undefined;
  let rigModified = 0, layersModified = 0, reviewModified = 0, signoffAt: string | undefined;
  let reviewSha256: string | undefined;
  let sourceSha256: string | undefined;
  await stage('source', async result => { source = await png('source.png', result); sourceSha256 = await sourceHash(); });
  await stage('regions', async result => {
    const regions: unknown = await json('regions.json', result);
    if (!Array.isArray(regions) || !regions.length || regions.length > 32) throw new Error('Expected 1–32 observed regions.');
    const names = new Set<string>();
    for (const region of regions) {
      if (!region || typeof region !== 'object' || !Array.isArray(region.box) || region.box.length !== 4 || !region.box.every(Number.isInteger) || typeof region.observation !== 'string' || !region.observation.trim()) throw new Error('Region needs source coordinates and a visual observation.');
      const [x0, y0, x1, y1] = region.box;
      if (!source || !(0 <= x0 && x0 < x1 && x1 <= source.width && 0 <= y0 && y0 < y1 && y1 <= source.height)) throw new Error('Region lies outside the current source image.');
      if (typeof region.name !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(region.name) || names.has(region.name)) throw new Error('Region names must be unique ASCII identifiers.');
      if (typeof region.step !== 'number' || !Number.isInteger(region.step) || region.step < 1 || region.step > 200) throw new Error('Region step must be an integer from 1 to 200.');
      if (region.confidence !== 'low' && region.confidence !== 'medium' && region.confidence !== 'high') throw new Error('Region confidence must be low, medium or high.');
      names.add(region.name);
    }
    const missing = Object.entries(regionAliases).filter(([, aliases]) => !hasRegion(names, aliases)).map(([key]) => key);
    if (missing.length) throw new Error(`Missing core visual regions: ${missing.join(', ')}. Add observed source-coordinate regions before rigging.`);
    const geometryIssues = regions.flatMap(region => regionGeometryIssues(region as { name: string; box: number[] }, source!.width, source!.height));
    if (geometryIssues.length) result.issues.push(...geometryIssues.slice(0, 8));
    const leftEye = [...regionAliases.leftEye].find(name => names.has(name)), rightEye = [...regionAliases.rightEye].find(name => names.has(name));
    if (leftEye && regions.find(region => region.name === leftEye)?.step > 5) throw new Error('The image-left eye region must use a grid step of 5 px or finer.');
    if (rightEye && regions.find(region => region.name === rightEye)?.step > 5) throw new Error('The image-right eye region must use a grid step of 5 px or finer.');
    const mouth = [...regionAliases.mouth].find(name => names.has(name));
    if (mouth && regions.find(region => region.name === mouth)?.step > 5) throw new Error('The mouth region must use a grid step of 5 px or finer for lip-sync deformation.');
    const expectedHash = sourceSha256;
    const work = join(project, 'work');
    let evidence: string | undefined;
    try {
      for (const entry of await readdir(work)) if (/^vision-[a-f0-9]{12}$/.test(entry)) {
        const candidate = join(work, entry, 'manifest.json');
        try {
          const manifest = JSON.parse(await readFile(candidate, 'utf8')) as { sourceSha256?: unknown; sourceSize?: unknown; status?: unknown; regions?: unknown };
          const manifestRegions = manifest.regions;
          const exactRegions = Array.isArray(manifestRegions) && manifestRegions.length === regions.length && regions.every((region, index) => {
            const item = manifestRegions[index];
            if (!item || typeof item !== 'object') return false;
            const candidate = item as { name?: unknown; box?: unknown; step?: unknown; observation?: unknown; confidence?: unknown };
            return candidate.name === region.name && JSON.stringify(candidate.box) === JSON.stringify(region.box) && candidate.step === (region.step ?? 5) && candidate.observation === region.observation && candidate.confidence === region.confidence;
          });
          if (manifest.sourceSha256 === expectedHash && manifest.status === 'proposals-require-visual-review' && Array.isArray(manifest.sourceSize) && manifest.sourceSize[0] === source?.width && manifest.sourceSize[1] === source?.height && exactRegions) evidence = candidate;
        } catch { /* Ignore incomplete evidence folders and inspect the next one. */ }
      }
    } catch (error) { if ((error as NodeJS.ErrnoException).code !== 'ENOENT') throw error; }
    if (!evidence) throw new Error('No evidence manifest matches the current source hash and regions. Run tools/vision-regions.py again.');
    const evidenceFolder = evidence.slice(0, evidence.length - `${sep}manifest.json`.length);
    const manifest = JSON.parse(await readFile(evidence, 'utf8')) as { regions: { name?: unknown; detail?: unknown; grid?: unknown }[] };
    const regionNames = regions.map(region => region.name as string);
    result.required = regionNames;
    const manifestRelative = evidence.replace(project + sep, '').replaceAll(sep, '/');
    const reviewedFiles: Record<string, string[]> = {};
    try {
      const review = JSON.parse(await readFile(join(project, 'regions-review.json'), 'utf8')) as { sourceSha256?: unknown; manifest?: unknown; files?: unknown };
      if (review.sourceSha256 === expectedHash && review.manifest === manifestRelative && review.files && typeof review.files === 'object') {
        for (const name of regionNames) {
          const values = (review.files as Record<string, unknown>)[name];
          if (Array.isArray(values)) reviewedFiles[name] = values.filter((value): value is string => value === 'detail' || value === 'grid');
        }
      }
    } catch { /* Missing or stale review keeps the region stage blocked. */ }
    const reviewed = new Set(regionNames.filter(name => reviewedFiles[name]?.includes('detail') && reviewedFiles[name]?.includes('grid')));
    result.reviewed = [...reviewed];
    result.reviewedFiles = reviewedFiles;
    const coreNames = new Set(Object.values(regionAliases).flatMap(names => [...names]));
    result.regionSummary = regions.map(region => ({ name: region.name as string, confidence: region.confidence as 'low' | 'medium' | 'high', step: region.step as number, core: coreNames.has(region.name as string), detailReviewed: reviewedFiles[region.name as string]?.includes('detail') ?? false, gridReviewed: reviewedFiles[region.name as string]?.includes('grid') ?? false }));
    // Human review is optional provenance, not an automation prerequisite.
    // Missing/stale evidence and uncertain regions remain artifact issues below.
    result.files.push(evidence.replace(project + sep, ''));
    await png(`${evidenceFolder.replace(project + sep, '')}/overview.png`, result);
    for (const region of manifest.regions) {
      if (typeof region.detail !== 'string' || typeof region.grid !== 'string') throw new Error('Evidence manifest is missing a detail or grid image.');
      if (!/^[A-Za-z][A-Za-z0-9_-]{0,48}-(detail|grid)\.png$/.test(region.detail) || !/^[A-Za-z][A-Za-z0-9_-]{0,48}-(detail|grid)\.png$/.test(region.grid)) throw new Error('Evidence manifest contains an invalid crop filename.');
      await png(`${evidenceFolder.replace(project + sep, '')}/${region.detail}`, result);
      await png(`${evidenceFolder.replace(project + sep, '')}/${region.grid}`, result);
    }
    const lowConfidence = regions.filter(region => region.confidence === 'low').map(region => region.name);
    if (lowConfidence.length) result.issues.push(`Low-confidence regions require visual review: ${lowConfidence.join(', ')}.`);
  });
  for (const id of ['draft', 'rig'] as const) await stage(id, async result => {
    const file = id === 'draft' ? 'rig.draft.json' : 'rig.json';
    const rig = await json(file, result);
    result.issues.push(...validateRig(rig, { draft: id === 'draft' }).slice(0, 8));
    if (source && (rig?.image?.width !== source.width || rig?.image?.height !== source.height)) result.issues.push('Rig and source dimensions differ.');
    if (id === 'rig') rigModified = (await checkedFile(file, 2 * 1024 * 1024)).modified;
  });
  await stage('layers', async result => {
    const metadata = await json('built/layers.json', result);
    if (!metadata || !metadata.layers || typeof metadata.layers !== 'object' || Array.isArray(metadata.layers)) throw new Error('Invalid layer metadata.');
    const names = Object.keys(metadata.layers);
    if (!names.length || names.length > 128 || names.some(key => !/^[A-Za-z0-9_-]+$/.test(key))) throw new Error('Invalid layer filenames.');
    if (source && (metadata.size?.[0] !== source.width || metadata.size?.[1] !== source.height)) result.issues.push('Layer dimensions differ from the source image.');
    await png('built/base.png', result); await png('built/hairmask.png', result);
    for (const key of names) await png(`built/${key}.png`, result);
    layersModified = (await checkedFile('built/layers.json', 2 * 1024 * 1024)).modified;
    if (source && source.modified > layersModified) result.issues.push('Source is newer than built layers; rebuild required.');
  });
  await stage('review', async result => {
    const metadata = await json('review/poses.json', result);
    if (metadata.diagnosticOnly || metadata.hiddenLayers?.length) result.issues.push('Diagnostic renders hide layers and cannot serve as official visual review evidence. Re-render without diagnostic flags.');
    if (!Array.isArray(metadata.files) || !metadata.files.length || metadata.files.length > 256 || metadata.files.some((name: unknown) => typeof name !== 'string' || !/^[A-Za-z0-9_-]+\.png$/.test(name))) throw new Error('Invalid review image list.');
    const reviewFiles = new Set(metadata.files as string[]);
    const requiredPoses = ['rest', 'eyes-half', 'eyes-closed', 'mouth-open', 'turn-left', 'turn-right', 'look-up', 'look-down', 'tilt-left', 'tilt-right', 'body-left', 'body-right', 'angry', 'sad', 'surprise'];
    const missingPoses = requiredPoses.filter(name => !reviewFiles.has(`${name}.png`));
    const hairFrames = [...reviewFiles].filter(name => /^hair-sway-[0-9]+\.png$/.test(name));
    if (missingPoses.length) result.issues.push(`Motion review is missing required poses: ${missingPoses.join(', ')}.`);
    if (hairFrames.length < 6) result.issues.push(`Motion review is missing hair-sway frames: expected 6, found ${hairFrames.length}.`);
    const poseNames = Array.isArray(metadata.poses) ? metadata.poses.map((pose: unknown) => pose && typeof pose === 'object' && typeof (pose as { name?: unknown }).name === 'string' ? (pose as { name: string }).name : '') : [];
    if (poseNames.length !== requiredPoses.length || requiredPoses.some(name => !poseNames.includes(name))) result.issues.push('Motion review metadata does not describe the complete standard pose set. Re-render poses instead of editing poses.json by hand.');
    const expectedPoseParameters: Record<string, Record<string, number>> = {
      'eyes-half': { eyeLOpen: 0.5, eyeROpen: 0.5 },
      'eyes-closed': { eyeLOpen: 0, eyeROpen: 0 },
      'mouth-open': { mouthOpen: 1 },
      'turn-left': { angleX: -30 },
      'turn-right': { angleX: 30 },
      'look-up': { angleY: 15 },
      'look-down': { angleY: -15 },
      'tilt-left': { angleZ: -15 },
      'tilt-right': { angleZ: 15 },
      'body-left': { bodyAngleZ: -8 },
      'body-right': { bodyAngleZ: 8 },
    };
    if (Array.isArray(metadata.poses)) for (const pose of metadata.poses) {
      if (!pose || typeof pose !== 'object' || typeof (pose as { name?: unknown }).name !== 'string') continue;
      const name = (pose as { name: string }).name, expected = expectedPoseParameters[name];
      if (expected) {
        const parameters = (pose as { parameters?: unknown }).parameters;
        if (!parameters || typeof parameters !== 'object' || Object.entries(expected).some(([key, value]) => (parameters as Record<string, unknown>)[key] !== value)) result.issues.push(`Motion pose ${name} has unexpected parameters; re-render from the current renderer.`);
      }
      const expression = (pose as { expression?: unknown }).expression;
      if (['angry', 'sad', 'surprise'].includes(name) && expression !== name) result.issues.push(`Motion pose ${name} is missing its matching expression metadata; re-render from the current renderer.`);
    }
    if (metadata.fixedFps !== 60) result.issues.push('Motion review must be rendered at a fixed 60 FPS for comparable frame checks.');
    if (metadata.hairFrames !== 6) result.issues.push('Motion review metadata must contain 6 hair-sway frames.');
    const cropBounds = metadata.cropBounds as { eyes?: unknown; mouth?: unknown } | undefined;
    const renderWidth = metadata.width, renderHeight = metadata.height;
    if (!Number.isInteger(renderWidth) || !Number.isInteger(renderHeight) || renderWidth < 1 || renderHeight < 1 || renderWidth > 10000 || renderHeight > 10000) result.issues.push('Motion review metadata has invalid render dimensions; re-render poses from the current rig.');
    for (const name of ['eyes', 'mouth'] as const) {
      const bounds = cropBounds?.[name];
      if (!Array.isArray(bounds) || bounds.length !== 4 || !bounds.every((value: unknown) => Number.isInteger(value) && Number(value) >= 0)) result.issues.push(`Motion review ${name} crop bounds are missing or invalid; re-render poses from the current rig.`);
      else if (Number.isInteger(renderWidth) && Number.isInteger(renderHeight) && (bounds[0] + bounds[2] > renderWidth || bounds[1] + bounds[3] > renderHeight || bounds[2] < 1 || bounds[3] < 1)) result.issues.push(`Motion review ${name} crop bounds exceed the rendered canvas; re-render poses from the current rig.`);
    }
    if (!reviewFiles.has('contact-sheet.png')) result.issues.push('Review contact-sheet.png is missing; render-poses must produce the full motion sheet.');
    if (![...reviewFiles].some(name => /-eyes\.png$/.test(name))) result.issues.push('Eye crop evidence is missing; inspect a rendered eyes crop before visual signoff.');
    if (![...reviewFiles].some(name => /-mouth\.png$/.test(name))) result.issues.push('Mouth crop evidence is missing; inspect a rendered mouth crop before visual signoff.');
    const reviewSizes = new Map<string, { width: number; height: number }>();
    for (const file of metadata.files) reviewSizes.set(file, await png(`review/${file}`, result));
    const reviewDigest = createHash('sha256');
    reviewDigest.update(await readFile((await checkedFile('review/poses.json', 2 * 1024 * 1024)).actual));
    for (const file of [...metadata.files].sort()) reviewDigest.update(file).update(await readFile((await checkedFile(`review/${file}`, 64 * 1024 * 1024)).actual));
    reviewSha256 = reviewDigest.digest('hex');
    if (Number.isInteger(renderWidth) && Number.isInteger(renderHeight)) {
      for (const file of metadata.files as string[]) {
        const size = reviewSizes.get(file);
        if (!size) continue;
        if (/^(?:rest|eyes-half|eyes-closed|mouth-open|turn-left|turn-right|look-up|look-down|tilt-left|tilt-right|body-left|body-right|angry|sad|surprise|hair-sway-[0-9]+)\.png$/.test(file) && (size.width !== renderWidth || size.height !== renderHeight)) result.issues.push(`Motion frame ${file} is ${size.width}x${size.height}, expected ${renderWidth}x${renderHeight}.`);
        for (const name of ['eyes', 'mouth'] as const) if (file.endsWith(`-${name}.png`)) {
          const bounds = cropBounds?.[name];
          if (Array.isArray(bounds) && bounds.length === 4 && Number.isInteger(bounds[2]) && Number.isInteger(bounds[3])) {
            const expectedWidth = 1000, expectedHeight = Math.round(bounds[3] / bounds[2] * 1000);
            if (size.width !== expectedWidth || size.height !== expectedHeight) result.issues.push(`Motion ${name} crop ${file} is ${size.width}x${size.height}, expected ${expectedWidth}x${expectedHeight}.`);
          }
        }
      }
    }
    reviewModified = (await checkedFile('review/poses.json', 2 * 1024 * 1024)).modified;
    if (Math.max(rigModified, layersModified, source?.modified ?? 0) > reviewModified) result.issues.push('Review images are older than current inputs; render them again.');
  });
  try {
    if (!reviewSha256) throw new Error('Review fingerprint unavailable.');
    const revisionFile = `visual-signoff-${reviewSha256}.json`;
    const signoffBytes = await readFile((await checkedFile(`review/${revisionFile}`, 8192)).actual, 'utf8');
    const signoff = JSON.parse(signoffBytes) as { reviewModified?: number; approvedAt?: string };
    if ((signoff as { reviewSha256?: unknown }).reviewSha256 === reviewSha256 && typeof signoff.approvedAt === 'string' && stages.every(stage => stage.state === 'observed')) signoffAt = signoff.approvedAt;
  } catch { /* A missing or stale signoff stays unverified. */ }
  const firstIncomplete = stages.find(stage => stage.state !== 'observed');
  const nextAction = firstIncomplete ? actionFor(firstIncomplete, name) : undefined;
  return { sourceSha256, reviewSha256, project: name, projectExists, checkedAt: new Date().toISOString(), stages,
    previewAvailable: ['source', 'rig', 'layers'].every(id => stages.some(stage => stage.id === id && stage.state === 'observed')),
    visualReview: signoffAt ? 'approved' : 'unverified', ...(signoffAt ? { visualReviewAt: signoffAt } : {}), ...(nextAction ? { nextAction } : {}) };
}
export function productionStatusPlugin(root: string): Plugin {
  return { name: 'studio-production-status', apply: 'serve', configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      const url = new URL(req.url ?? '/', 'http://localhost');
      if (!['/__studio/production-status', '/__studio/review-image', '/__studio/evidence-image', '/__studio/evidence-review', '/__studio/production-signoff'].includes(url.pathname)) return next();
      const reply = (code: number, body: object) => { res.writeHead(code, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(body)); };
      if (!localRequest(req, req.method !== 'GET')) return reply(403, { error: 'Local same-origin requests only.' });
      const name = url.searchParams.get('project') ?? '';
      if (!safeName.test(name)) return reply(400, { error: 'Invalid project name.' });
      if (url.pathname === '/__studio/production-signoff') {
        if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });
        const result = await inspectProduction(root, name).catch(() => null);
        const review = result?.stages.find(stage => stage.id === 'review');
        if (!result?.projectExists || !review || result.stages.some(stage => stage.state !== 'observed')) return reply(409, { error: 'All production stages must be present and valid before visual signoff.' });
        if (result.visualReview === 'approved') return reply(200, { approved: true });
        try {
          const repository = await realpath(root), project = join(repository, 'projects', name);
          // Preserve earlier approvals; a rebuilt review gets a separate record.
          if (!result.reviewSha256) return reply(409, { error: 'Review fingerprint unavailable.' });
          const directory = await realpath(join(project, 'review'));
          if (!directory.startsWith(project + sep)) return reply(403, { error: 'Review directory must stay in the project.' });
          await writeFile(join(directory, `visual-signoff-${result.reviewSha256}.json`), JSON.stringify({ version: 2, approvedAt: new Date().toISOString(), reviewSha256: result.reviewSha256 }, null, 2) + '\n', { flag: 'wx', mode: 0o600 });
          return reply(201, { approved: true });
        } catch { return reply(409, { error: 'Visual signoff already exists or could not be saved.' }); }
      }
      if (url.pathname === '/__studio/evidence-review') {
        if (req.method !== 'POST') return reply(405, { error: 'Use POST.' });
        try {
          let body = ''; for await (const chunk of req) { body += chunk; if (body.length > 4096) return reply(413, { error: 'Review request is too large.' }); }
          const input = JSON.parse(body) as { region?: unknown; kind?: unknown; reviewed?: unknown };
          if (typeof input.region !== 'string' || !/^[A-Za-z][A-Za-z0-9_-]{0,47}$/.test(input.region) || (input.kind !== 'detail' && input.kind !== 'grid') || typeof input.reviewed !== 'boolean') return reply(400, { error: 'Provide a region, detail/grid kind and reviewed boolean.' });
          const result = await inspectProduction(root, name);
          const stage = result.stages.find(item => item.id === 'regions');
          if (!stage?.required?.includes(input.region)) return reply(404, { error: 'Region is not part of the current evidence manifest.' });
          if (!stage.files.some(file => file.endsWith(`/${input.region}-${input.kind}.png`))) return reply(404, { error: 'This evidence type is not listed for the selected region.' });
          const repository = await realpath(root), project = join(repository, 'projects', name), source = await readFile(join(project, 'source.png'));
          const sourceSha256 = createHash('sha256').update(source).digest('hex');
          const manifest = stage.files.find(file => file.startsWith('work/') && file.endsWith('/manifest.json'));
          if (!manifest) return reply(409, { error: 'Current evidence manifest is unavailable.' });
          const reviewPath = join(project, 'regions-review.json');
          const files: Record<string, string[]> = {};
          try {
            const previous = JSON.parse(await readFile(reviewPath, 'utf8')) as { sourceSha256?: unknown; manifest?: unknown; files?: unknown };
            if (previous.sourceSha256 === sourceSha256 && previous.manifest === manifest && previous.files && typeof previous.files === 'object') {
              for (const [region, values] of Object.entries(previous.files as Record<string, unknown>)) if (Array.isArray(values)) files[region] = values.filter((value): value is string => value === 'detail' || value === 'grid');
            }
          } catch { /* Start a new review for a new source or manifest. */ }
          const current = new Set(files[input.region] ?? []);
          if (input.reviewed) current.add(input.kind); else current.delete(input.kind);
          files[input.region] = [...current];
          const reviewed = Object.keys(files).filter(region => files[region]?.includes('detail') && files[region]?.includes('grid'));
          await writeFile(reviewPath, JSON.stringify({ version: 2, sourceSha256, manifest, files, updatedAt: new Date().toISOString() }, null, 2) + '\n', { mode: 0o600 });
          return reply(200, { reviewed, reviewedFiles: files });
        } catch (error) { return reply(422, { error: error instanceof Error ? error.message : 'Could not save region review.' }); }
      }
      if (req.method !== 'GET') return reply(405, { error: 'Use GET.' });
      if (url.pathname === '/__studio/review-image') {
        const file = url.searchParams.get('file') ?? '';
        if (!/^[A-Za-z0-9_-]+\.png$/.test(file)) return reply(400, { error: 'Invalid review filename.' });
        try {
          const repository = await realpath(root), project = join(repository, 'projects', name);
          const metadataPath = await realpath(join(project, 'review', 'poses.json'));
          if (!metadataPath.startsWith(project + sep) || (await stat(metadataPath)).size > 2 * 1024 * 1024) return reply(403, { error: 'Invalid review metadata path.' });
          const metadata = JSON.parse(await readFile(metadataPath, 'utf8'));
          if (!Array.isArray(metadata.files) || !metadata.files.includes(file)) return reply(404, { error: 'Image not listed in the review manifest.' });
          const actual = await realpath(join(project, 'review', file));
          if (!actual.startsWith(project + sep)) return reply(403, { error: 'Image must stay in this project.' });
          const info = await stat(actual);
          if (!info.isFile() || info.size > 32 * 1024 * 1024) return reply(413, { error: 'Invalid review image size.' });
          const bytes = await readFile(actual);
          if (!bytes.subarray(0, 8).equals(signature)) return reply(422, { error: 'Invalid PNG signature.' });
          res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(bytes); return;
        } catch { return reply(404, { error: 'Review image unavailable; refresh the project status.' }); }
      }
      if (url.pathname === '/__studio/evidence-image') {
        if (req.method !== 'GET') return reply(405, { error: 'Use GET.' });
        const requested = (url.searchParams.get('file') ?? '').replaceAll('\\', '/');
        try {
          const result = await inspectProduction(root, name);
          const regions = result.stages.find(stage => stage.id === 'regions');
          const allowed = regions?.files.map(file => file.replaceAll('\\', '/')).filter(file => file.startsWith('work/')) ?? [];
          if (!allowed.includes(requested) || !/^work\/vision-[a-f0-9]{12}\/[A-Za-z][A-Za-z0-9_-]{0,48}-(detail|grid)\.png$/.test(requested) && !/^work\/vision-[a-f0-9]{12}\/overview\.png$/.test(requested)) return reply(404, { error: 'Evidence image is not listed for the current source.' });
          const repository = await realpath(root), project = join(repository, 'projects', name), actual = await realpath(join(project, requested));
      if (!actual.startsWith(project + sep)) return reply(403, { error: 'Evidence image must stay in this project.' });
          const info = await stat(actual);
          if (!info.isFile() || info.size > 32 * 1024 * 1024) return reply(413, { error: 'Invalid evidence image size.' });
          const bytes = await readFile(actual);
          if (!bytes.subarray(0, 8).equals(signature)) return reply(422, { error: 'Invalid PNG signature.' });
          res.writeHead(200, { 'Content-Type': 'image/png', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff' }); res.end(bytes); return;
        } catch { return reply(404, { error: 'Evidence image unavailable; refresh the project status.' }); }
      }
      try { reply(200, await inspectProduction(root, name)); } catch { reply(500, { error: 'Could not inspect project files.' }); }
    });
  } };
}
