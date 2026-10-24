import { PoseReview } from './PoseReview';
import { readPreference, savePreference } from '../editor/preferences';
import { useEffect, useState } from 'react';
import { Alert, Button, Collapse, Space, Steps, Tag } from 'antd';
import type { CreationTask, ProductionStatus } from '../shared/production';
import { useI18n } from '../editor/i18n';

export function ProductionProgress() {
  const { language } = useI18n(), zh = language === 'zh';
  const [task, setTask] = useState<CreationTask | undefined>(() => {
    try { const saved = JSON.parse(readPreference('studio-creation-task') ?? 'null'); return saved && typeof saved.projectName === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(saved.projectName) && typeof saved.source === 'string' ? saved : undefined; } catch { return undefined; }
  });
  const [reviewOpen, setReviewOpen] = useState(false);
  const [signoffBusy, setSignoffBusy] = useState(false);
  useEffect(() => savePreference('studio-creation-task', JSON.stringify(task ?? null)), [task]);
  const [status, setStatus] = useState<ProductionStatus>();
  const [error, setError] = useState('');
  useEffect(() => {
    const receive = (event: Event) => { const detail = (event as CustomEvent<CreationTask>).detail; if (detail && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(detail.projectName)) { setTask(detail); setStatus(undefined); } };
    window.addEventListener('studio:creation-task', receive);
    return () => window.removeEventListener('studio:creation-task', receive);
  }, []);
  useEffect(() => {
    if (!task) return;
    let disposed = false, timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const inspect = async () => {
      try {
        const response = await fetch(`/__studio/production-status?project=${encodeURIComponent(task.projectName)}`, { signal: controller.signal });
        const data = await response.json(); if (!response.ok) throw new Error(data.error);
        if (!disposed) { setStatus(data); setError(''); }
      } catch (reason) { if (!disposed) setError(String(reason)); }
      finally { if (!disposed) timer = setTimeout(inspect, 5000); }
    };
    void inspect(); return () => { disposed = true; controller.abort(); clearTimeout(timer); };
  }, [task]);
  if (!task) return null;
  const titles = zh ? { source: '原图', regions: '区域观察', draft: '绑定草稿', rig: '正式绑定', layers: '图层文件', review: '姿态审查图' } : { source: 'Source', regions: 'Regions', draft: 'Draft rig', rig: 'Final rig', layers: 'Layer files', review: 'Pose images' };
  const nextStage = status?.stages.find(stage => stage.id !== 'source' && stage.state !== 'observed');
  const orderedStages = status?.stages ?? [];
  const activeIndex = orderedStages.findIndex(stage => stage.state !== 'observed');
  const resume = () => {
    if (!status || !nextStage) return;
    const tasks: Record<Exclude<typeof nextStage.id, 'source'>, string> = {
      regions: `先修复区域证据阶段：检查 projects/${task.projectName}/source.png 的当前 SHA-256 与现有 regions.json 是否一致；如果证据缺失、过期或区域数量不匹配，重新逐区查看原图并运行 uv run tools/vision-regions.py projects/${task.projectName} --regions projects/${task.projectName}/regions.json，确认每个 detail/grid/overview 和 manifest.json 都来自当前 source。完成后再继续，不要套用示例坐标。`,
      draft: `继续绑定草稿阶段：读取当前 source.png、regions.json 及匹配的 work/vision-* 证据包，逐个用 source-coordinate grid 确认眼睛、嘴、发际、发束、肩部和饰品坐标，再完善 rig.draft.json 并运行 validate-rig 和 overlay。`,
      rig: `继续正式绑定阶段：检查 rig.draft.json 的 overlay 和眼部放大图，修正所有越界或错误区域，运行 validate-rig 和 uv run --with numpy --with pillow --with opencv-python-headless tools/build-layers.py projects/${task.projectName} --rig rig.draft.json。`,
      layers: `继续图层阶段：检查 source.png、rig.json 和 built/layers.json 的尺寸及眼球/头发蒙版，必要时重新运行 build-layers；不要把文件存在当作视觉通过。`,
      review: `继续姿态审查阶段：运行 npm run render-poses -- projects/${task.projectName}，逐帧查看闭眼、半闭眼、张嘴、转头、抬头低头、倾斜和头发摆动；发现问题就回到对应绑定或图层阶段修复并重建。`,
    };
    const taskText = tasks[nextStage.id as Exclude<typeof nextStage.id, 'source'>];
    window.dispatchEvent(new CustomEvent('studio:agent-start', { detail: { prompt: `请恢复项目 projects/${task.projectName} 的制作，不要从头猜测，也不要覆盖已有有效文件。\n${taskText}\n最后报告实际执行的命令、文件和仍未通过的视觉问题。`, projectName: task.projectName, source: task.source } }));
  };
  return <div className="production-progress"><Collapse ghost defaultActiveKey={['production']} items={[{ key: 'production', label: <Space><strong>{zh ? '制作产物' : 'Production artifacts'}</strong><small>{task.projectName}</small></Space>, children: <>
    {error && <Alert type="warning" title={error} />}
    {status && <Steps className="production-steps" size="small" responsive={false} current={activeIndex < 0 ? orderedStages.length : activeIndex} items={orderedStages.map(stage => ({ title: titles[stage.id], status: stage.state === 'invalid' ? 'error' : stage.state === 'observed' ? 'finish' : 'process' }))} />}
    <div className="production-stages">{status?.stages.map(stage => <div key={stage.id}>
      <span>{titles[stage.id]}</span><Tag color={stage.state === 'invalid' ? 'warning' : stage.state === 'observed' ? 'green' : undefined}>{stage.state === 'observed' ? zh ? '已生成' : 'Present' : stage.state === 'invalid' ? zh ? '需检查' : 'Check' : zh ? '未生成' : 'Missing'}</Tag>
      {stage.issues.length > 0 && <small>{stage.issues.join(' · ')}</small>}
    </div>)}</div>
    <small className="muted">{status?.visualReview === 'approved' ? `${zh ? '用户已确认视觉审查：' : 'Visual review approved by user: '}${status.visualReviewAt ?? ''}` : zh ? '尚未确认视觉审查。' : 'Visual review not approved.'}</small>
    <small className="muted">{zh ? '检查磁盘文件和基础格式，不代表视觉审查通过。原图/绑定更新后需重新构建和审查。' : 'Checks files and basic formats, not visual quality. Rebuild/review after input changes.'}</small>
    <Space wrap><Button type="primary" disabled={!nextStage} onClick={resume}>{nextStage ? zh ? `继续：${titles[nextStage.id]}` : `Resume: ${titles[nextStage.id]}` : zh ? '制作阶段已完成' : 'All stages complete'}</Button><Button onClick={() => setReviewOpen(true)}>{zh ? '查看姿态 / 反馈缺陷' : 'Review poses / report defects'}</Button><Button loading={signoffBusy} disabled={!status || status.visualReview === 'approved' || status.stages.find(stage => stage.id === 'review')?.state !== 'observed'} onClick={async () => { setSignoffBusy(true); try { const response = await fetch(`/__studio/production-signoff?project=${encodeURIComponent(task.projectName)}`, { method: 'POST', headers: { 'X-Studio-Request': '1', Origin: location.origin } }); if (!response.ok) throw new Error((await response.json()).error); const refreshed = await fetch(`/__studio/production-status?project=${encodeURIComponent(task.projectName)}`).then(response => response.json()); setStatus(refreshed); } catch (reason) { setError(String(reason)); } finally { setSignoffBusy(false); } }}>{status?.visualReview === 'approved' ? zh ? '已确认' : 'Approved' : zh ? '确认视觉审查通过' : 'Approve visual review'}</Button><Button disabled={!status?.previewAvailable} onClick={() => window.dispatchEvent(new CustomEvent('studio:open-generated-project', { detail: task.projectName }))}>{zh ? '打开生成的角色' : 'Open generated avatar'}</Button><Button type="text" onClick={() => setTask(undefined)}>{zh ? '隐藏进度' : 'Hide progress'}</Button></Space>
  </> }]} /><PoseReview project={task.projectName} stage={status?.stages.find(stage => stage.id === 'review')} open={reviewOpen} onClose={() => setReviewOpen(false)} /></div>;
}
