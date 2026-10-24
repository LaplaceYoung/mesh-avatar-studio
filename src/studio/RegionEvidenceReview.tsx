import { useEffect, useState } from 'react';
import { Alert, Button, Drawer, Empty, Image, Select, Space, Tag } from 'antd';
import type { ProductionStage } from '../shared/production';
import { useI18n } from '../editor/i18n';

export function RegionEvidenceReview({ project, stage, open, onClose }: { project: string; stage?: ProductionStage; open: boolean; onClose(): void }) {
  const { language } = useI18n(), zh = language === 'zh';
  const files = stage?.files.filter(file => /^work[\\/]vision-[a-f0-9]{12}[\\/][A-Za-z][A-Za-z0-9_-]{0,48}-(detail|grid)\.png$/.test(file) || /^work[\\/]vision-[a-f0-9]{12}[\\/]overview\.png$/.test(file)) ?? [];
  const overview = files.find(file => /[\\/]overview\.png$/.test(file));
  const [selectedRegion, setSelectedRegion] = useState('');
  const [selectedFile, setSelectedFile] = useState('');
  const regions = stage?.required ?? [];
  const [reviewed, setReviewed] = useState<string[]>(stage?.reviewed ?? []);
  const [reviewedFiles, setReviewedFiles] = useState<Record<string, string[]>>(stage?.reviewedFiles ?? {});
  const [loadedFiles, setLoadedFiles] = useState<Record<string, boolean>>({});
  const [reviewBusy, setReviewBusy] = useState(false);
  useEffect(() => { setSelectedRegion(regions[0] ?? ''); setSelectedFile(overview ?? files[0] ?? ''); }, [overview, open, regions.join('|')]);
  useEffect(() => { setReviewed(stage?.reviewed ?? []); }, [stage?.reviewed]);
  useEffect(() => { setReviewedFiles(stage?.reviewedFiles ?? {}); }, [stage?.reviewedFiles]);
  useEffect(() => { setLoadedFiles({}); }, [selectedRegion, open]);
  const regionFiles = (name: string) => files.filter(file => file.endsWith(`/${name}-detail.png`) || file.endsWith(`/${name}-grid.png`));
  const selectedRegionFiles = regionFiles(selectedRegion);
  const file = files.includes(selectedFile) && (selectedFile === overview || selectedRegionFiles.includes(selectedFile)) ? selectedFile : overview ?? selectedRegionFiles[0] ?? files[0];
  const src = file ? `/__studio/evidence-image?project=${encodeURIComponent(project)}&file=${encodeURIComponent(file.replaceAll('\\', '/'))}` : '';
  const evidenceFile = (kind: 'detail' | 'grid') => regionFiles(selectedRegion).find(value => value.endsWith(`-${kind}.png`));
  const loaded = (kind: 'detail' | 'grid') => { const value = evidenceFile(kind); return !!value && loadedFiles[value] === true; };
  return <Drawer title={zh ? '区域证据审查' : 'Region evidence review'} placement="right" size="large" open={open} onClose={onClose} destroyOnHidden>
    <div className="pose-review">
      <Space wrap><strong>{project}</strong><Tag>{zh ? '坐标证据，不代表自动识别正确' : 'Coordinate evidence, not automatic recognition'}</Tag></Space>
      <Alert type="info" title={zh ? '人工复核为可选记录，不阻断 Agent 自动绑定。文件校验通过不等于视觉质量通过。' : 'Human review is optional and does not block agent rigging. Artifact validity is not visual approval.'} />
      {stage?.state === 'invalid' && <Alert type="warning" title={zh ? '区域证据缺失或已过期。' : 'Region evidence is missing or stale.'} description={stage.issues.join(' · ')} />}
      {file ? <>
        <Select aria-label={zh ? '当前区域' : 'Current region'} value={selectedRegion} onChange={value => { setSelectedRegion(value); setSelectedFile(regionFiles(value).find(file => file.endsWith('-grid.png')) ?? regionFiles(value)[0] ?? overview ?? ''); }} options={regions.map(name => ({ value: name, label: `${reviewed.includes(name) ? '✓ ' : ''}${name}` }))} />
        <Select aria-label={zh ? '区域证据图片' : 'Evidence image'} value={file} onChange={setSelectedFile} options={[...(overview ? [{ value: overview, label: 'overview.png' }] : []), ...selectedRegionFiles.map(value => ({ value, label: value.split(/[\\/]/).pop() ?? value }))]} />
        <div className="review-image-stage"><Image src={src} alt={`${project} / ${file}`} onLoad={() => { if (file) setLoadedFiles(current => ({ ...current, [file]: true })); }} /></div>
        <small className="muted">{zh ? '先看 overview，再检查眼睛和嘴部的 5 px 网格，以及发际、发束和肩部框。发现偏移后可直接交给 Agent 局部修正。' : 'Start with the overview, then inspect the 5 px eye and mouth grids plus hair and shoulder boxes. Send a targeted correction to the Agent when a box is off.'}</small>
        {regions.length > 0 && <Space wrap>{(['detail', 'grid'] as const).map(kind => <Button key={kind} loading={reviewBusy} disabled={!loaded(kind)} type={reviewedFiles[selectedRegion]?.includes(kind) ? 'primary' : 'default'} onClick={async () => { const region = selectedRegion || regions[0]; setReviewBusy(true); try { const response = await fetch(`/__studio/evidence-review?project=${encodeURIComponent(project)}`, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio-Request': '1', Origin: location.origin }, body: JSON.stringify({ region, kind, reviewed: !reviewedFiles[region]?.includes(kind) }) }); const data = await response.json(); if (!response.ok) throw new Error(data.error); setReviewed(data.reviewed); setReviewedFiles(data.reviewedFiles); window.dispatchEvent(new Event('studio:production-refresh')); } finally { setReviewBusy(false); } }}>{reviewedFiles[selectedRegion]?.includes(kind) ? `✓ ${kind}` : loaded(kind) ? kind : `${kind} · ${zh ? '先打开' : 'Open first'}`}</Button>)}<small className="muted">{zh ? `${reviewed.length}/${regions.length} 个区域已完成 detail + grid 复核` : `${reviewed.length}/${regions.length} regions completed detail + grid review`}</small></Space>}
      </> : <Empty description={zh ? '尚无与当前原图匹配的区域证据。' : 'No evidence matches the current source image.'} />}
      <Button onClick={() => window.dispatchEvent(new CustomEvent('studio:agent-start', { detail: { prompt: `请检查 projects/${project} 的区域证据。当前证据应来自 source.png 的精确 SHA-256；请先打开 work/vision-* 的 overview、眼睛和嘴部 grid，指出实际可见的坐标偏移，再只修正对应 regions.json 和绑定草稿。不要把文件存在当作视觉正确，也不要覆盖无关改动。`, projectName: project, source: `projects/${project}/source.png` } }))} disabled={!file}>{zh ? '交给 Agent 复核区域' : 'Ask Agent to review regions'}</Button>
    </div>
  </Drawer>;
}
