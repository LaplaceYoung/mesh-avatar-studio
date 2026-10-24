import { useEffect, useState } from 'react';
import { Alert, Button, Drawer, Empty, Image, Select, Space, Tag } from 'antd';
import type { ProductionStage } from '../shared/production';
import { useI18n } from '../editor/i18n';

export function RegionEvidenceReview({ project, stage, open, onClose }: { project: string; stage?: ProductionStage; open: boolean; onClose(): void }) {
  const { language } = useI18n(), zh = language === 'zh';
  const files = stage?.files.filter(file => /^work[\\/]vision-[a-f0-9]{12}[\\/][A-Za-z][A-Za-z0-9_-]{0,48}-(detail|grid)\.png$/.test(file) || /^work[\\/]vision-[a-f0-9]{12}[\\/]overview\.png$/.test(file)) ?? [];
  const overview = files.find(file => /[\\/]overview\.png$/.test(file));
  const [selected, setSelected] = useState('');
  useEffect(() => { setSelected(overview ?? files[0] ?? ''); }, [overview, open]);
  const file = files.includes(selected) ? selected : overview ?? files[0];
  const src = file ? `/__studio/evidence-image?project=${encodeURIComponent(project)}&file=${encodeURIComponent(file.replaceAll('\\', '/'))}` : '';
  return <Drawer title={zh ? '区域证据审查' : 'Region evidence review'} placement="right" size="large" open={open} onClose={onClose} destroyOnHidden>
    <div className="pose-review">
      <Space wrap><strong>{project}</strong><Tag>{zh ? '坐标证据，不代表自动识别正确' : 'Coordinate evidence, not automatic recognition'}</Tag></Space>
      {stage?.state === 'invalid' && <Alert type="warning" title={zh ? '区域证据缺失或已过期。' : 'Region evidence is missing or stale.'} description={stage.issues.join(' · ')} />}
      {file ? <>
        <Select aria-label={zh ? '区域证据图片' : 'Evidence image'} value={file} onChange={setSelected} options={files.map(value => ({ value, label: value.split(/[\\/]/).pop() ?? value }))} />
        <div className="review-image-stage"><Image src={src} alt={`${project} / ${file}`} /></div>
        <small className="muted">{zh ? '先看 overview，再检查眼睛和嘴部的 5 px 网格，以及发际、发束和肩部框。发现偏移后可直接交给 Agent 局部修正。' : 'Start with the overview, then inspect the 5 px eye and mouth grids plus hair and shoulder boxes. Send a targeted correction to the Agent when a box is off.'}</small>
      </> : <Empty description={zh ? '尚无与当前原图匹配的区域证据。' : 'No evidence matches the current source image.'} />}
      <Button onClick={() => window.dispatchEvent(new CustomEvent('studio:agent-prompt', { detail: `请检查 projects/${project} 的区域证据。当前证据应来自 source.png 的精确 SHA-256；请先打开 work/vision-* 的 overview、眼睛和嘴部 grid，指出实际可见的坐标偏移，再只修正对应 regions.json 和绑定草稿。不要把文件存在当作视觉正确，也不要覆盖无关改动。` }))} disabled={!file}>{zh ? '交给 Agent 复核区域' : 'Ask Agent to review regions'}</Button>
    </div>
  </Drawer>;
}
