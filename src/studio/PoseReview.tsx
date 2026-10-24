import { useEffect, useState } from 'react';
import { Alert, Button, Drawer, Empty, Image, Input, Select, Space, Tag } from 'antd';
import type { ProductionStage } from '../shared/production';
import { useI18n } from '../editor/i18n';
import { readPreference, savePreference } from '../editor/preferences';

export function PoseReview({ project, stage, open, onClose }: { project: string; stage?: ProductionStage; open: boolean; onClose(): void }) {
  const { language } = useI18n(), zh = language === 'zh';
  const files = stage?.files.filter(file => /^review\/[A-Za-z0-9_-]+\.png$/.test(file)) ?? [];
  const [selected, setSelected] = useState('');
  const [issue, setIssue] = useState(''), [area, setArea] = useState('eyes');
  const [revision, setRevision] = useState(0);
  const key = `studio-review-note:${project}`;
  useEffect(() => { setSelected(''); setIssue(readPreference(key) ?? ''); }, [key]);
  const file = files.includes(selected) ? selected : files.find(file => file.endsWith('contact-sheet.png')) ?? files[0];
  const areas = zh ? { eyes: '眼睛 / 闭眼残留', mouth: '嘴部 / 下巴拉伸', hair: '头发 / 面部遮挡', head: '转头 / 耳朵破损', body: '身体 / 饰品摆动', other: '其他问题' } : { eyes: 'Eyes / blinking', mouth: 'Mouth / chin', hair: 'Hair / face overlap', head: 'Head turn / ears', body: 'Body / accessories', other: 'Other' };
  return <Drawer title={zh ? '姿态审查' : 'Pose review'} placement="right" size="large" open={open} onClose={onClose} destroyOnHidden>
    <div className="pose-review">
      <Space wrap><strong>{project}</strong><Tag>{zh ? '视觉质量尚未验收' : 'Visual quality not approved'}</Tag><Button onClick={() => setRevision(value => value + 1)}>{zh ? '重载图片' : 'Reload images'}</Button></Space>
      {stage?.state === 'invalid' && <Alert type="warning" title={zh ? '审查产物可能不完整或已过时。' : 'Review artifacts may be incomplete or stale.'} description={stage.issues.join(' · ')} />}
      {files.length && file ? <>
        <Select aria-label={zh ? '审查图片' : 'Review image'} value={file} onChange={setSelected} options={files.map(value => ({ value, label: value.slice('review/'.length) }))} />
        <div className="review-image-stage"><Image src={`/__studio/review-image?project=${encodeURIComponent(project)}&file=${encodeURIComponent(file.slice('review/'.length))}&revision=${revision}`} alt={`${project} / ${file}`} /></div>
        <small className="muted">{zh ? '点击图片放大。检查闭眼残留、转头裂缝、嘴部拉伸、头发遮挡；生成图片不等于通过审查。' : 'Click to enlarge. Inspect blink residue, tears, mouth stretching and hair overlap. Rendering is not approval.'}</small>
      </> : <Empty description={zh ? '尚无审查图片，请让 Agent 先运行 render-poses。' : 'Ask the agent to run render-poses first.'} />}
      <label>{zh ? '问题区域' : 'Affected region'}<Select value={area} onChange={setArea} options={Object.entries(areas).map(([value, label]) => ({ value, label }))} /></label>
      <Input.TextArea aria-label={zh ? '具体缺陷' : 'Observed defect'} value={issue} rows={4} placeholder={zh ? '例如：turn-left.png 中左眼角露出白色裂缝，闭眼图仍能看到虹膜。请描述你实际看见的问题。' : 'Describe the defect you can actually see, including the frame and location.'} onChange={event => { setIssue(event.target.value); savePreference(key, event.target.value); }} />
      <Button type="primary" disabled={!issue.trim() || !file} onClick={() => {
        const prompt = `请修正 projects/${project} 的姿态缺陷。\n用户查看的文件：projects/${project}/${file}\n问题区域：${areas[area as keyof typeof areas]}\n实际反馈：${issue.trim()}\n\n先读取当前原图、绑定及指定审查图，针对问题部位生成局部坐标网格和叠加图，说明根因再局部修改。不要覆盖用户无关改动。重新构建图层并渲染姿态，查看修改前后是否消除了缺陷，以及是否引入新裂缝。最多三轮，失败如实报告。不要因为工具执行成功就宣称视觉质量通过。未经另行授权，不调用外部生图服务。`;
        window.dispatchEvent(new CustomEvent('studio:agent-prompt', { detail: prompt })); onClose();
      }}>{zh ? '交给 Agent 修正' : 'Prepare correction task'}</Button>
    </div>
  </Drawer>;
}
