import { useEffect, useState } from 'react';
import { Alert, Button, Drawer, Empty, Image, Input, Select, Space, Tag } from 'antd';
import type { ProductionStage } from '../shared/production';
import { useI18n } from '../editor/i18n';
import { readPreference, savePreference } from '../editor/preferences';
import { reviewNavigation } from './review-navigation';

export function PoseReview({ project, stage, open, onClose }: { project: string; stage?: ProductionStage; open: boolean; onClose(): void }) {
  const { language } = useI18n(), zh = language === 'zh';
  const [error, setError] = useState('');
  useEffect(() => { setError(''); }, [project, open]);
  const files = stage?.files.filter(file => /^review\/[A-Za-z0-9_-]+\.png$/.test(file)) ?? [];
  const [selected, setSelected] = useState('');
  const [issue, setIssue] = useState(''), [area, setArea] = useState('eyes');
  const [revision, setRevision] = useState(0);
  const key = `studio-review-note:${project}`;
  useEffect(() => { setSelected(''); setIssue(readPreference(key) ?? ''); }, [key]);
  const file = files.includes(selected) ? selected : files.find(file => file.endsWith('contact-sheet.png')) ?? files[0];
  const areas = zh ? { eyes: '眼睛 / 闭眼残留', mouth: '嘴部 / 下巴拉伸', hair: '头发 / 面部遮挡', head: '转头 / 耳朵破损', body: '身体 / 饰品摆动', other: '其他问题' } : { eyes: 'Eyes / blinking', mouth: 'Mouth / chin', hair: 'Hair / face overlap', head: 'Head turn / ears', body: 'Body / accessories', other: 'Other' };
  const contactSheet = files.find(value => value.endsWith('contact-sheet.png'));
  const navigation = reviewNavigation(files, file);
  const quickFiles = [
    { key: 'contact', label: zh ? '总览' : 'Contact sheet', file: contactSheet },
    { key: 'full', label: zh ? '当前动作全图' : 'Full pose', file: navigation.full },
    { key: 'eyes', label: zh ? '当前动作眼部' : 'Pose eyes', file: navigation.eyes },
    { key: 'mouth', label: zh ? '当前动作嘴部' : 'Pose mouth', file: navigation.mouth },
  ].filter(item => item.file);
  const motionFiles = [
    { key: 'eyes-closed', label: zh ? '闭眼' : 'Eyes closed', file: files.find(value => value === 'review/eyes-closed.png') },
    { key: 'mouth-open', label: zh ? '张嘴' : 'Mouth open', file: files.find(value => value === 'review/mouth-open.png') },
    { key: 'turn-left', label: zh ? '左转' : 'Turn left', file: files.find(value => value === 'review/turn-left.png') },
    { key: 'turn-right', label: zh ? '右转' : 'Turn right', file: files.find(value => value === 'review/turn-right.png') },
    { key: 'hair-sway', label: zh ? '头发摆动' : 'Hair sway', file: files.find(value => value === 'review/hair-sway-0.png') },
  ];
  const availableMotion = motionFiles.filter(item => item.file);
  const missingMotion = motionFiles.filter(item => !item.file);
  const motionGroups = [
    { label: zh ? '眼睛' : 'Eyes', files: ['review/eyes-half.png', 'review/eyes-closed.png'] },
    { label: zh ? '嘴部' : 'Mouth', files: ['review/mouth-open.png'] },
    { label: zh ? '头部' : 'Head', files: ['review/turn-left.png', 'review/turn-right.png', 'review/look-up.png', 'review/look-down.png'] },
    { label: zh ? '倾斜' : 'Tilt', files: ['review/tilt-left.png', 'review/tilt-right.png'] },
    { label: zh ? '身体' : 'Body', files: ['review/body-left.png', 'review/body-right.png'] },
    { label: zh ? '表情' : 'Expressions', files: ['review/angry.png', 'review/sad.png', 'review/surprise.png'] },
    { label: zh ? '头发' : 'Hair', files: Array.from({ length: 6 }, (_, index) => `review/hair-sway-${index}.png`) },
  ].map(group => ({ ...group, present: group.files.filter(value => files.includes(value)).length }));
  return <Drawer title={zh ? '姿态审查' : 'Pose review'} placement="right" size="large" open={open} onClose={onClose} destroyOnHidden>
    <div className="pose-review">
      {error && <Alert type="error" title={error} closable onClose={() => setError('')} />}
      <Space wrap><strong>{project}</strong><Tag>{zh ? '视觉质量尚未验收' : 'Visual quality not approved'}</Tag><Button onClick={() => setRevision(value => value + 1)}>{zh ? '重载图片' : 'Reload images'}</Button></Space>
      {stage?.state === 'invalid' && <Alert type="warning" title={zh ? '审查产物可能不完整或已过时。' : 'Review artifacts may be incomplete or stale.'} description={stage.issues.join(' · ')} />}
      <div className="review-coverage" aria-label={zh ? '动作证据覆盖' : 'Motion evidence coverage'}><strong>{zh ? '动作证据' : 'Motion evidence'}</strong><span>{zh ? `关键动作 ${availableMotion.length}/${motionFiles.length}` : `Key motions ${availableMotion.length}/${motionFiles.length}`}</span>{missingMotion.length > 0 && <small>{zh ? `缺少：${missingMotion.map(item => item.label).join('、')}` : `Missing: ${missingMotion.map(item => item.label).join(', ')}`}</small>}</div>
      <div className="review-coverage review-coverage-groups" aria-label={zh ? '动作类别覆盖' : 'Motion category coverage'}>{motionGroups.map(group => <span key={group.label} className={group.present === group.files.length ? 'review-coverage-complete' : 'review-coverage-missing'}>{group.label} {group.present}/{group.files.length}</span>)}</div>
      {files.length && file ? <>
        {quickFiles.length > 0 && <div className="review-quick-filters" role="toolbar" aria-label={zh ? '关键审查证据' : 'Key review evidence'}>{quickFiles.map(item => <Button key={item.key} size="small" type={file === item.file ? 'primary' : 'default'} aria-pressed={file === item.file} onClick={() => setSelected(item.file!)}>{item.label}</Button>)}</div>}
        {availableMotion.length > 0 && <div className="review-quick-filters" role="toolbar" aria-label={zh ? '动作审查快捷入口' : 'Motion review shortcuts'}>{availableMotion.map(item => <Button key={item.key} size="small" type={file === item.file ? 'primary' : 'default'} aria-pressed={file === item.file} onClick={() => setSelected(item.file!)}>{item.label}</Button>)}</div>}
        <Select aria-label={zh ? '审查图片' : 'Review image'} value={file} onChange={setSelected} options={files.map(value => ({ value, label: value.slice('review/'.length) }))} />
        {file !== contactSheet && <Space wrap>
          <Button disabled={!navigation.previous} onClick={() => setSelected(navigation.previous!)}>{zh ? '上一帧' : 'Previous frame'}</Button>
          <span role="status">{navigation.index + 1}/{navigation.count} · {navigation.frame?.slice('review/'.length)}</span>
          <Button disabled={!navigation.next} onClick={() => setSelected(navigation.next!)}>{zh ? '下一帧' : 'Next frame'}</Button>
        </Space>}
        <div className="review-image-stage"><Image src={`/__studio/review-image?project=${encodeURIComponent(project)}&file=${encodeURIComponent(file.slice('review/'.length))}&revision=${revision}`} alt={`${project} / ${file}`} /></div>
        <small className="muted">{zh ? '点击图片放大。必须同时检查 contact sheet、眼部裁剪和嘴部裁剪，再检查闭眼残留、转头裂缝、嘴部拉伸、头发遮挡；生成图片不等于通过审查。' : 'Inspect the contact sheet, eye crop and mouth crop as well as blink residue, tears, mouth stretching and hair overlap. Rendering is not approval.'}</small>
      </> : <Empty description={zh ? '尚无审查图片，请让 Agent 先运行 render-poses。' : 'Ask the agent to run render-poses first.'} />}
      <label>{zh ? '问题区域' : 'Affected region'}<Select value={area} onChange={setArea} options={Object.entries(areas).map(([value, label]) => ({ value, label }))} /></label>
      <Input.TextArea aria-label={zh ? '具体缺陷' : 'Observed defect'} value={issue} rows={4} placeholder={zh ? '例如：turn-left.png 中左眼角露出白色裂缝，闭眼图仍能看到虹膜。请描述你实际看见的问题。' : 'Describe the defect you can actually see, including the frame and location.'} onChange={event => { setIssue(event.target.value); savePreference(key, event.target.value); }} />
      <Button type="primary" disabled={!issue.trim() || !file} onClick={() => {
        const prompt = `请修正 projects/${project} 的姿态缺陷。\n用户查看的文件：projects/${project}/${file}\n问题区域：${areas[area as keyof typeof areas]}\n实际反馈：${issue.trim()}\n\n先读取当前原图、绑定及指定审查图，针对问题部位生成局部坐标网格和叠加图，说明根因再局部修改。不要覆盖用户无关改动。重新构建图层并渲染姿态，查看修改前后是否消除了缺陷，以及是否引入新裂缝。最多三轮，失败如实报告。不要因为工具执行成功就宣称视觉质量通过。未经另行授权，不调用外部生图服务。`;
        const accepted = window.dispatchEvent(new CustomEvent('studio:agent-start', { cancelable: true, detail: { prompt, projectName: project, source: `projects/${project}/source.png` } }));
        if (accepted) onClose();
        else setError(zh ? 'Agent 暂未接受任务。反馈已保留，请检查当前会话后重试。' : 'The Agent did not accept the task. Your feedback is retained; check the session and retry.');
      }}>{zh ? '交给 Agent 修正' : 'Prepare correction task'}</Button>
    </div>
  </Drawer>;
}
