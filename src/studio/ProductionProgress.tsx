import { PoseReview } from './PoseReview';
import { RegionEvidenceReview } from './RegionEvidenceReview';
import { readPreference, savePreference } from '../editor/preferences';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Collapse, Space, Steps, Tag } from 'antd';
import type { CreationTask, ProductionActivity, ProductionStatus } from '../shared/production';
import { useI18n } from '../editor/i18n';

const MAX_AUTO_CONTINUE_TURNS = 6;

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
  const [focusRegion, setFocusRegion] = useState<string>();
  const [signoffBusy, setSignoffBusy] = useState(false);
  useEffect(() => savePreference('studio-creation-task', JSON.stringify(task ?? null)), [task]);
  const [status, setStatus] = useState<ProductionStatus>();
  const [refreshTick, setRefreshTick] = useState(0);
  const [activity, setActivity] = useState<ProductionActivity>();
  const [error, setError] = useState('');
  const autoContinueTurns = useRef(0);
  const autoContinuePending = useRef(false);
  const inspectionVersion = useRef(0);
  const [continuationNotice, setContinuationNotice] = useState('');
  const continuationDispatch = useRef(false);
  const autoContinueSignature = useRef('');
  useEffect(() => {
    setActivity(undefined);
    if (!task) return;
    try {
      const value = JSON.parse(readPreference(`studio-production-activity:${task.projectName}`) ?? 'null') as Partial<ProductionActivity> | null;
      if (value && value.projectName === task.projectName && ['starting', 'working', 'completed', 'failed'].includes(String(value.state)) && typeof value.at === 'string') setActivity(value as ProductionActivity);
    } catch { setActivity(undefined); }
  }, [task?.projectName]);
  useEffect(() => {
    const receive = (event: Event) => { const detail = (event as CustomEvent<CreationTask>).detail; if (detail && /^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(detail.projectName)) { inspectionVersion.current += 1; setTask(detail); setStatus(undefined); setContinuationNotice(''); if (!continuationDispatch.current) { autoContinueTurns.current = 0; autoContinueSignature.current = ''; } autoContinuePending.current = false; } };
    window.addEventListener('studio:creation-task', receive);
    return () => window.removeEventListener('studio:creation-task', receive);
  }, []);
  useEffect(() => {
    if (!task) return;
    let disposed = false, timer: ReturnType<typeof setTimeout>;
    const controller = new AbortController();
    const inspect = async () => {
      const version = inspectionVersion.current;
      try {
        const response = await fetch(`/__studio/production-status?project=${encodeURIComponent(task.projectName)}`, { signal: controller.signal });
        const data = await response.json(); if (!response.ok) throw new Error(data.error);
        if (!disposed && version === inspectionVersion.current) { setStatus(data); setError(''); }
      } catch (reason) { if (!disposed && version === inspectionVersion.current) setError(String(reason)); }
      finally { if (!disposed) timer = setTimeout(inspect, productionBusy ? 1200 : 5000); }
    };
    void inspect(); return () => { disposed = true; controller.abort(); clearTimeout(timer); };
  }, [task, refreshTick, productionBusy]);
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
        if (detail.state === 'completed' && task.autoContinue) { autoContinuePending.current = true; inspectionVersion.current += 1; setStatus(undefined); setRefreshTick(value => value + 1); }
        if (detail.state === 'failed') autoContinuePending.current = false;
      }
    };
    window.addEventListener('studio:production-activity', receive);
    return () => window.removeEventListener('studio:production-activity', receive);
  }, [task?.projectName, task?.autoContinue]);
  const titles = zh ? { source: '原图', regions: '区域观察', draft: '绑定草稿', rig: '正式绑定', layers: '图层文件', review: '姿态审查图' } : { source: 'Source', regions: 'Regions', draft: 'Draft rig', rig: 'Final rig', layers: 'Layer files', review: 'Pose images' };
  const nextStage = status?.stages.find(stage => stage.state !== 'observed');
  const orderedStages = status?.stages ?? [];
  const activeIndex = orderedStages.findIndex(stage => stage.state !== 'observed');
  const needsSignoff = !!status && !nextStage && status.visualReview !== 'approved';
  const autoContinuationQueued = autoContinuePending.current && !!task?.autoContinue;
  const resume = () => {
    if (!task || !status || !nextStage) return;
    setContinuationNotice('');
    autoContinuePending.current = false;
    const taskText = nextStage.id === 'source'
      ? `先创建项目骨架：确认 ${task.source} 是当前上传的本地 PNG，运行 uv run tools/new-project.py ${task.source} ${task.projectName}；如果目标目录已存在，停止并报告，不要覆盖。创建后检查 source.png 与输入尺寸和 SHA-256 一致，再进入区域证据阶段。`
      : status.nextAction?.instruction ?? `请处理 ${titles[nextStage.id]} 阶段：检查当前项目文件和视觉证据，完成后运行对应校验。`;
    const accepted = window.dispatchEvent(new CustomEvent('studio:agent-start', { cancelable: true, detail: { prompt: `请继续完成项目 projects/${task.projectName} 的完整 Live 2D-style 网格角色制作，不要从头猜测，也不要覆盖已有有效文件。

当前最早未完成阶段是「${titles[nextStage.id]}」：
${taskText}

完成当前阶段后，继续自动处理所有后续未完成阶段：区域证据、绑定草稿、正式绑定、图层构建和完整姿态审查。每个阶段都必须读取实际文件、运行对应校验并查看生成的证据；不要因为某一步工具成功就宣称视觉质量通过。只有遇到真实阻断（缺少依赖、源图不匹配、权限或视觉证据无法确认）才停止，并明确报告阻断原因、已完成阶段和下一条可执行命令。不要提交或修改 samples/、reference/，不要调用未经授权的外部生图服务。

最后报告实际执行的命令、文件、完整链路停在哪个阶段，以及仍未通过的视觉问题。`, projectName: task.projectName, source: task.source, autoContinue: task.autoContinue === true } }));
    if (!accepted) setContinuationNotice(zh ? 'Agent 未接受续跑任务，请检查会话状态后手动继续。' : 'The Agent did not accept this continuation. Check the session before retrying.');
  };
  useEffect(() => {
    if (!autoContinuePending.current || !task?.autoContinue || productionBusy || !status) return;
    if (!status.stages.some(stage => stage.state !== 'observed')) {
      autoContinuePending.current = false;
      return;
    }
    if (autoContinueTurns.current >= MAX_AUTO_CONTINUE_TURNS) {
      autoContinuePending.current = false;
      setContinuationNotice(zh ? `自动续跑已达到 ${MAX_AUTO_CONTINUE_TURNS} 个 ACP 回合上限，请检查当前阶段后手动继续。` : `Automatic continuation reached the ${MAX_AUTO_CONTINUE_TURNS}-turn limit; inspect the current stage before continuing manually.`);
      return;
    }
    const signature = JSON.stringify(status.stages.map(stage => ({ id: stage.id, state: stage.state, issues: stage.issues })));
    if (autoContinueSignature.current === signature) {
      autoContinuePending.current = false;
      setContinuationNotice(zh ? '自动续跑未观察到阶段或问题列表变化，已暂停以避免重复执行；请检查 Agent 输出后手动继续。' : 'Automatic continuation observed no stage or issue-list change and paused to avoid repetition; inspect the Agent output before continuing manually.');
      return;
    }
    autoContinueSignature.current = signature;
    autoContinueTurns.current += 1;
    continuationDispatch.current = true;
    try { resume(); } finally { continuationDispatch.current = false; }
  }, [status, productionBusy, task, zh]);
  if (!task) return null;
  return <div className="production-progress"><Collapse ghost defaultActiveKey={['production']} items={[{ key: 'production', label: <Space><strong>{zh ? '制作产物' : 'Production artifacts'}</strong><small>{task.projectName}</small></Space>, children: <>
    {error && <Alert type="warning" title={error} />}
    {continuationNotice && <Alert type="warning" showIcon title={continuationNotice} />}
    {autoContinuationQueued && <Alert className="production-activity" type="info" showIcon title={zh ? '自动续跑已排队' : 'Automatic continuation queued'} description={zh ? '正在等待最新生产状态，确认阶段确实发生变化后再提交下一轮 ACP 任务。' : 'Waiting for the latest production status; the next ACP turn will start only after a real stage change is observed.'} />}
    {activity && <Alert className="production-activity" type={productionBusy ? 'info' : activity.state === 'failed' ? 'error' : activity.state === 'completed' ? 'success' : 'warning'} showIcon title={productionBusy ? activity.message ?? (zh ? 'ACP 正在执行' : 'ACP is running') : activity.message ?? (zh ? '上次 ACP 活动' : 'Last ACP activity')} description={productionBusy ? (zh ? '当前会话正在执行；断线时请重连，不要重复提交任务。' : 'The current session is running; reconnect after a disconnect instead of submitting another task.') : (zh ? `历史活动 · ${new Date(activity.at).toLocaleString()}` : `Historical activity · ${new Date(activity.at).toLocaleString()}`)} />}
    {status && <Steps className="production-steps" size="small" responsive={false} current={activeIndex < 0 ? orderedStages.length : activeIndex} items={orderedStages.map(stage => ({ title: titles[stage.id], status: stage.state === 'invalid' ? 'error' : stage.state === 'observed' ? 'finish' : 'process' }))} />}
    <div className="production-stages">{status?.stages.map(stage => <div key={stage.id}>
      <span>{titles[stage.id]}</span><Tag color={stage.state === 'invalid' ? 'warning' : stage.state === 'observed' ? 'green' : undefined}>{stage.state === 'observed' ? zh ? '已生成' : 'Present' : stage.state === 'invalid' ? zh ? '需检查' : 'Check' : zh ? '未生成' : 'Missing'}</Tag>
      {stage.issues.length > 0 && <small>{stage.issues.join(' · ')}</small>}
    </div>)}</div>
    {status?.stages.find(stage => stage.id === 'regions')?.regionSummary && <div className="production-region-summary" aria-label={zh ? '区域质量摘要' : 'Region quality summary'}><strong>{zh ? '区域质量' : 'Region quality'}</strong><div>{status.stages.find(stage => stage.id === 'regions')!.regionSummary!.map(region => {
      const openRegion = () => { setFocusRegion(region.name); setEvidenceOpen(true); };
      return <Tag key={region.name} color={region.confidence === 'low' || !region.detailReviewed || !region.gridReviewed ? 'warning' : region.confidence === 'high' ? 'success' : 'processing'} className="production-region-tag" role="button" tabIndex={0} aria-label={zh ? `查看 ${region.name} 区域证据` : `View evidence for ${region.name}`} onClick={openRegion} onKeyDown={event => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); openRegion(); } }}>{region.name}{region.core ? ' · ' : ' · '}{region.confidence} · {region.step}px{region.detailReviewed && region.gridReviewed ? ' ✓' : ' · !'}</Tag>;
    })}</div></div>}
    {status?.nextAction && <Alert className="production-next-action" type="warning" showIcon message={zh ? `下一步：${titles[status.nextAction.stage]}` : `Next: ${titles[status.nextAction.stage]}`} description={<><span>{status.nextAction.reason}</span><br /><small>{status.nextAction.instruction}</small></>} />}
    <small className="muted">{status?.visualReview === 'approved' ? `${zh ? '用户已确认视觉审查：' : 'Visual review approved by user: '}${status.visualReviewAt ?? ''}` : zh ? '尚未确认视觉审查。' : 'Visual review not approved.'}</small>
    <small className="muted">{zh ? '检查磁盘文件和基础格式，不代表视觉审查通过。原图/绑定更新后需重新构建和审查。' : 'Checks files and basic formats, not visual quality. Rebuild/review after input changes.'}</small>
    <Space wrap><Button type="primary" disabled={!nextStage || productionBusy} onClick={resume}>{productionBusy ? zh ? '制作执行中…' : 'Production running…' : nextStage ? zh ? `继续全链路：${titles[nextStage.id]}` : `Continue full pipeline: ${titles[nextStage.id]}` : needsSignoff ? zh ? '等待人工视觉确认' : 'Awaiting visual sign-off' : zh ? '制作阶段已完成' : 'All stages complete'}</Button>{task.autoContinue && nextStage && <Button onClick={() => { autoContinuePending.current = false; setContinuationNotice(zh ? '已关闭自动续跑，当前 ACP 回合不受影响。' : 'Automatic continuation is off; the current ACP turn is unaffected.'); setTask(current => current ? { ...current, autoContinue: false } : current); }}>{zh ? `停止自动续跑（${autoContinueTurns.current}/${MAX_AUTO_CONTINUE_TURNS}）` : `Stop auto-continue (${autoContinueTurns.current}/${MAX_AUTO_CONTINUE_TURNS})`}</Button>}<Button disabled={!status?.stages.some(stage => stage.id === 'regions' && stage.files.some(file => file.includes('overview.png')))} onClick={() => { setFocusRegion(undefined); setEvidenceOpen(true); }}>{zh ? '查看区域证据' : 'View region evidence'}</Button><Button onClick={() => setReviewOpen(true)}>{zh ? '查看姿态 / 反馈缺陷' : 'Review poses / report defects'}</Button><Button loading={signoffBusy} disabled={productionBusy || !status || status.visualReview === 'approved' || status.stages.some(stage => stage.state !== 'observed')} onClick={async () => { setSignoffBusy(true); try { const response = await fetch(`/__studio/production-signoff?project=${encodeURIComponent(task.projectName)}`, { method: 'POST', headers: { 'X-Studio-Request': '1', Origin: location.origin } }); if (!response.ok) throw new Error((await response.json()).error); const refreshed = await fetch(`/__studio/production-status?project=${encodeURIComponent(task.projectName)}`).then(response => response.json()); setStatus(refreshed); } catch (reason) { setError(String(reason)); } finally { setSignoffBusy(false); } }}>{status?.visualReview === 'approved' ? zh ? '已确认' : 'Approved' : zh ? '确认视觉审查通过' : 'Approve visual review'}</Button><Button disabled={!status?.previewAvailable} onClick={() => window.dispatchEvent(new CustomEvent('studio:open-generated-project', { detail: task.projectName }))}>{zh ? '打开生成的角色' : 'Open avatar'}</Button><Button type="text" onClick={() => setTask(undefined)}>{zh ? '隐藏进度' : 'Hide progress'}</Button></Space>
  </> }]} /><RegionEvidenceReview project={task.projectName} stage={status?.stages.find(stage => stage.id === 'regions')} open={evidenceOpen} focusRegion={focusRegion} onClose={() => setEvidenceOpen(false)} /><PoseReview project={task.projectName} stage={status?.stages.find(stage => stage.id === 'review')} open={reviewOpen} onClose={() => setReviewOpen(false)} /></div>;
}
