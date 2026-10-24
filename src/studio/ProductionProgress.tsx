import { PoseReview } from './PoseReview';
import { readPreference, savePreference } from '../editor/preferences';
import { useEffect, useState } from 'react';
import { Alert, Button, Collapse, Space, Tag } from 'antd';
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
  return <div className="production-progress"><Collapse ghost defaultActiveKey={['production']} items={[{ key: 'production', label: <Space><strong>{zh ? '制作产物' : 'Production artifacts'}</strong><small>{task.projectName}</small></Space>, children: <>
    {error && <Alert type="warning" title={error} />}
    <div className="production-stages">{status?.stages.map(stage => <div key={stage.id}>
      <span>{titles[stage.id]}</span><Tag color={stage.state === 'invalid' ? 'warning' : stage.state === 'observed' ? 'green' : undefined}>{stage.state === 'observed' ? zh ? '已生成' : 'Present' : stage.state === 'invalid' ? zh ? '需检查' : 'Check' : zh ? '未生成' : 'Missing'}</Tag>
      {stage.issues.length > 0 && <small>{stage.issues.join(' · ')}</small>}
    </div>)}</div>
    <small className="muted">{status?.visualReview === 'approved' ? `${zh ? '用户已确认视觉审查：' : 'Visual review approved by user: '}${status.visualReviewAt ?? ''}` : zh ? '尚未确认视觉审查。' : 'Visual review not approved.'}</small>
    <small className="muted">{zh ? '检查磁盘文件和基础格式，不代表视觉审查通过。原图/绑定更新后需重新构建和审查。' : 'Checks files and basic formats, not visual quality. Rebuild/review after input changes.'}</small>
    <Space wrap><Button onClick={() => setReviewOpen(true)}>{zh ? '查看姿态 / 反馈缺陷' : 'Review poses / report defects'}</Button><Button loading={signoffBusy} disabled={!status || status.visualReview === 'approved' || status.stages.find(stage => stage.id === 'review')?.state !== 'observed'} onClick={async () => { setSignoffBusy(true); try { const response = await fetch(`/__studio/production-signoff?project=${encodeURIComponent(task.projectName)}`, { method: 'POST', headers: { 'X-Studio-Request': '1', Origin: location.origin } }); if (!response.ok) throw new Error((await response.json()).error); const refreshed = await fetch(`/__studio/production-status?project=${encodeURIComponent(task.projectName)}`).then(response => response.json()); setStatus(refreshed); } catch (reason) { setError(String(reason)); } finally { setSignoffBusy(false); } }}>{status?.visualReview === 'approved' ? zh ? '已确认' : 'Approved' : zh ? '确认视觉审查通过' : 'Approve visual review'}</Button><Button disabled={!status?.previewAvailable} onClick={() => window.dispatchEvent(new CustomEvent('studio:open-generated-project', { detail: task.projectName }))}>{zh ? '打开生成的角色' : 'Open generated avatar'}</Button><Button type="text" onClick={() => setTask(undefined)}>{zh ? '隐藏进度' : 'Hide progress'}</Button></Space>
  </> }]} /><PoseReview project={task.projectName} stage={status?.stages.find(stage => stage.id === 'review')} open={reviewOpen} onClose={() => setReviewOpen(false)} /></div>;
}
