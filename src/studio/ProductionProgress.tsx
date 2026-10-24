import { PoseReview } from './PoseReview';
import { RegionEvidenceReview } from './RegionEvidenceReview';
import { readPreference, savePreference } from '../editor/preferences';
import { useEffect, useState } from 'react';
import { Alert, Button, Collapse, Space, Steps, Tag } from 'antd';
import type { CreationTask, ProductionActivity, ProductionStatus } from '../shared/production';
import { useI18n } from '../editor/i18n';

export function ProductionProgress({ productionBusy = false }: { productionBusy?: boolean }) {
  const { language } = useI18n(), zh = language === 'zh';
  const [task, setTask] = useState<CreationTask | undefined>(() => {
    try {
      const saved = JSON.parse(readPreference('studio-creation-task') ?? 'null');
      if (saved && typeof saved.projectName === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(saved.projectName) && typeof saved.source === 'string') return saved;
      const turn = JSON.parse(readPreference('studio-acp-production-turn') ?? 'null');
      return turn && typeof turn.projectName === 'string' && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(turn.projectName) && typeof turn.source === 'string' ? { projectName: turn.projectName, source: turn.source } : undefined;
    } catch { return undefined; }
  });
  const [reviewOpen, setReviewOpen] = useState(false);
  const [evidenceOpen, setEvidenceOpen] = useState(false);
  const [signoffBusy, setSignoffBusy] = useState(false);
  useEffect(() => savePreference('studio-creation-task', JSON.stringify(task ?? null)), [task]);
  const [status, setStatus] = useState<ProductionStatus>();
  const [refreshTick, setRefreshTick] = useState(0);
  const [activity, setActivity] = useState<ProductionActivity>();
  const [error, setError] = useState('');
  useEffect(() => {
    setActivity(undefined);
    if (!task) return;
    try {
      const value = JSON.parse(readPreference(`studio-production-activity:${task.projectName}`) ?? 'null') as Partial<ProductionActivity> | null;
      if (value && value.projectName === task.projectName && ['starting', 'working', 'completed', 'failed'].includes(String(value.state)) && typeof value.at === 'string') setActivity(value as ProductionActivity);
    } catch { setActivity(undefined); }
  }, [task?.projectName]);
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
  }, [task, refreshTick]);
  useEffect(() => {
    const refresh = () => { setRefreshTick(value => value + 1); };
    window.addEventListener('studio:production-refresh', refresh);
    return () => window.removeEventListener('studio:production-refresh', refresh);
  }, []);
  useEffect(() => {
    const receive = (event: Event) => {
      const detail = (event as CustomEvent<ProductionActivity>).detail;
      if (detail?.projectName === task?.projectName) {
        setActivity(detail);
        savePreference(`studio-production-activity:${detail.projectName}`, JSON.stringify(detail));
      }
    };
    window.addEventListener('studio:production-activity', receive);
    return () => window.removeEventListener('studio:production-activity', receive);
  }, [task?.projectName]);
  if (!task) return null;
  const titles = zh ? { source: '原图', regions: '区域观察', draft: '绑定草稿', rig: '正式绑定', layers: '图层文件', review: '姿态审查图' } : { source: 'Source', regions: 'Regions', draft: 'Draft rig', rig: 'Final rig', layers: 'Layer files', review: 'Pose images' };
  const nextStage = status?.stages.find(stage => stage.state !== 'observed');
  const orderedStages = status?.stages ?? [];
  const activeIndex = orderedStages.findIndex(stage => stage.state !== 'observed');
  const needsSignoff = !!status && !nextStage && status.visualReview !== 'approved';
  const resume = () => {
    if (!status || !nextStage) return;
    const taskText = nextStage.id === 'source'
      ? `先创建项目骨架：确认 ${task.source} 是当前上传的本地 PNG，运行 uv run tools/new-project.py ${task.source} ${task.projectName}；如果目标目录已存在，停止并报告，不要覆盖。创建后检查 source.png 与输入尺寸和 SHA-256 一致，再进入区域证据阶段。`
      : status.nextAction?.instruction ?? `请处理 ${titles[nextStage.id]} 阶段：检查当前项目文件和视觉证据，完成后运行对应校验。`;
    window.dispatchEvent(new CustomEvent('studio:agent-start', { detail: { prompt: `请恢复项目 projects/${task.projectName} 的制作，不要从头猜测，也不要覆盖已有有效文件。\n${taskText}\n最后报告实际执行的命令、文件和仍未通过的视觉问题。`, projectName: task.projectName, source: task.source } }));
  };
  return <div className="production-progress"><Collapse ghost defaultActiveKey={['production']} items={[{ key: 'production', label: <Space><strong>{zh ? '制作产物' : 'Production artifacts'}</strong><small>{task.projectName}</small></Space>, children: <>
    {error && <Alert type="warning" title={error} />}
    {activity && <Alert className="production-activity" type={productionBusy ? 'info' : activity.state === 'failed' ? 'error' : activity.state === 'completed' ? 'success' : 'warning'} showIcon title={productionBusy ? activity.message ?? (zh ? 'ACP 正在执行' : 'ACP is running') : activity.message ?? (zh ? '上次 ACP 活动' : 'Last ACP activity')} description={productionBusy ? (zh ? '当前会话正在执行；断线时请重连，不要重复提交任务。' : 'The current session is running; reconnect after a disconnect instead of submitting another task.') : (zh ? `历史活动 · ${new Date(activity.at).toLocaleString()}` : `Historical activity · ${new Date(activity.at).toLocaleString()}`)} />}
    {status && <Steps className="production-steps" size="small" responsive={false} current={activeIndex < 0 ? orderedStages.length : activeIndex} items={orderedStages.map(stage => ({ title: titles[stage.id], status: stage.state === 'invalid' ? 'error' : stage.state === 'observed' ? 'finish' : 'process' }))} />}
    <div className="production-stages">{status?.stages.map(stage => <div key={stage.id}>
      <span>{titles[stage.id]}</span><Tag color={stage.state === 'invalid' ? 'warning' : stage.state === 'observed' ? 'green' : undefined}>{stage.state === 'observed' ? zh ? '已生成' : 'Present' : stage.state === 'invalid' ? zh ? '需检查' : 'Check' : zh ? '未生成' : 'Missing'}</Tag>
      {stage.issues.length > 0 && <small>{stage.issues.join(' · ')}</small>}
    </div>)}</div>
    {status?.nextAction && <Alert className="production-next-action" type="warning" showIcon message={zh ? `下一步：${titles[status.nextAction.stage]}` : `Next: ${titles[status.nextAction.stage]}`} description={<><span>{status.nextAction.reason}</span><br /><small>{status.nextAction.instruction}</small></>} />}
    <small className="muted">{status?.visualReview === 'approved' ? `${zh ? '用户已确认视觉审查：' : 'Visual review approved by user: '}${status.visualReviewAt ?? ''}` : zh ? '尚未确认视觉审查。' : 'Visual review not approved.'}</small>
    <small className="muted">{zh ? '检查磁盘文件和基础格式，不代表视觉审查通过。原图/绑定更新后需重新构建和审查。' : 'Checks files and basic formats, not visual quality. Rebuild/review after input changes.'}</small>
    <Space wrap><Button type="primary" disabled={!nextStage || productionBusy} onClick={resume}>{productionBusy ? zh ? '制作执行中…' : 'Production running…' : nextStage ? zh ? `继续：${titles[nextStage.id]}` : `Resume: ${titles[nextStage.id]}` : needsSignoff ? zh ? '等待人工视觉确认' : 'Awaiting visual sign-off' : zh ? '制作阶段已完成' : 'All stages complete'}</Button><Button disabled={!status?.stages.some(stage => stage.id === 'regions' && stage.files.some(file => file.includes('overview.png')))} onClick={() => setEvidenceOpen(true)}>{zh ? '查看区域证据' : 'View region evidence'}</Button><Button onClick={() => setReviewOpen(true)}>{zh ? '查看姿态 / 反馈缺陷' : 'Review poses / report defects'}</Button><Button loading={signoffBusy} disabled={!status || status.visualReview === 'approved' || status.stages.find(stage => stage.id === 'review')?.state !== 'observed'} onClick={async () => { setSignoffBusy(true); try { const response = await fetch(`/__studio/production-signoff?project=${encodeURIComponent(task.projectName)}`, { method: 'POST', headers: { 'X-Studio-Request': '1', Origin: location.origin } }); if (!response.ok) throw new Error((await response.json()).error); const refreshed = await fetch(`/__studio/production-status?project=${encodeURIComponent(task.projectName)}`).then(response => response.json()); setStatus(refreshed); } catch (reason) { setError(String(reason)); } finally { setSignoffBusy(false); } }}>{status?.visualReview === 'approved' ? zh ? '已确认' : 'Approved' : zh ? '确认视觉审查通过' : 'Approve visual review'}</Button><Button disabled={!status?.previewAvailable} onClick={() => window.dispatchEvent(new CustomEvent('studio:open-generated-project', { detail: task.projectName }))}>{zh ? '打开生成的角色' : 'Open generated avatar'}</Button><Button type="text" onClick={() => setTask(undefined)}>{zh ? '隐藏进度' : 'Hide progress'}</Button></Space>
  </> }]} /><RegionEvidenceReview project={task.projectName} stage={status?.stages.find(stage => stage.id === 'regions')} open={evidenceOpen} onClose={() => setEvidenceOpen(false)} /><PoseReview project={task.projectName} stage={status?.stages.find(stage => stage.id === 'review')} open={reviewOpen} onClose={() => setReviewOpen(false)} /></div>;
}
