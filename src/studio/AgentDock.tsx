import type { SessionConfigOption } from '@agentclientprotocol/sdk';
import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Collapse, Empty, Select, Space, Tag } from 'antd';
import { ProductionProgress } from './ProductionProgress';
import { Sender } from '@ant-design/x';
import { ReloadOutlined } from '@ant-design/icons';
import { useI18n } from '../editor/i18n';

type Provider = 'claude' | 'codex' | 'pi';
type Session = { id: string; token: string; provider: Provider };
type Entry = { id: string; kind: 'user' | 'assistant' | 'tool' | 'plan'; text: string; status?: string; detail?: string };
type Permission = { id: string; tool: { title?: string; rawInput?: unknown }; options: { optionId: string; name: string; kind: string }[] };
type Block = { type: string; text?: string; path?: string; oldText?: string | null; newText?: string; content?: Block };
type Update = { sessionUpdate: string; configOptions?: SessionConfigOption[]; content?: Block | Block[]; rawInput?: unknown; rawOutput?: unknown; toolCallId?: string; title?: string; status?: string; entries?: { content: string; status: string }[] };
type Event = { type: string; configOptions?: SessionConfigOption[]; session?: { configOptions?: SessionConfigOption[] }; text?: string; message?: string; state?: string; stopReason?: string; code?: number; update?: Update; events?: Event[] } & Partial<Permission>;
const labels = { claude: 'Claude Code', codex: 'Codex', pi: 'Pi' };
export function AgentDock({ project, selection, onRefresh }: { project: string; selection?: string | null; onRefresh(): void }) {
  const { language } = useI18n(), zh = language === 'zh';
  const [provider, setProvider] = useState<Provider>('claude');
  const [providers, setProviders] = useState<{ id: Provider; available: boolean }[]>([]);
  const [session, setSession] = useState<Session>();
  const [status, setStatus] = useState('idle');
  const [pendingCreation, setPendingCreation] = useState<{ prompt: string; projectName: string; source: string }>();
  const pendingRef = useRef<typeof pendingCreation>(undefined);
  const [config, setConfig] = useState<SessionConfigOption[]>([]);
  const [entries, setEntries] = useState<Entry[]>([]), [permissions, setPermissions] = useState<Permission[]>([]);
  const [error, setError] = useState(''), [draft, setDraft] = useState(''), [context, setContext] = useState(true), [attempt, setAttempt] = useState(0);
  const socket = useRef<WebSocket | null>(null), sequence = useRef(0), streamId = useRef<string | null>(null);
  const feed = useRef<HTMLDivElement>(null), pinned = useRef(true);
  useEffect(() => { void fetch('/__studio/agents').then(async response => { if (!response.ok) throw new Error('Agent bridge unavailable'); return response.json(); }).then(data => setProviders(data.providers)).catch(err => setError(String(err))); }, []);
  const start = async () => {
    setError(''); setStatus('starting'); setEntries([]); setPermissions([]); setConfig([]);
    try {
      const response = await fetch('/__studio/agents', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio-Request': '1' }, body: JSON.stringify({ provider }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setSession(data);
    } catch (err) { setStatus('idle'); setError(String(err)); }
  };
  useEffect(() => {
    const receive = (event: globalThis.Event) => { const text = (event as CustomEvent<string>).detail; if (typeof text === 'string') setDraft(text); };
    window.addEventListener('studio:agent-prompt', receive); return () => window.removeEventListener('studio:agent-prompt', receive);
  }, []);
  useEffect(() => {
    const receive = (event: globalThis.Event) => {
      const value = (event as CustomEvent<{ prompt: string; projectName: string; source: string }>).detail;
      if (!value || typeof value.prompt !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9_-]{0,63}$/.test(value.projectName)) return;
      if (pendingRef.current) { setError(zh ? '已有待发送制作任务，请先取消或完成连接。' : 'A creation task is already pending. Connect or cancel it first.'); return; }
      pendingRef.current = value; setPendingCreation(value);
      window.dispatchEvent(new CustomEvent('studio:creation-task', { detail: { projectName: value.projectName, source: value.source } }));
      // A confirmed creation task owns the next connection. Starting ACP here
      // removes an avoidable second click while keeping provider choice explicit.
      if (!session && status === 'idle') void start();
    };
    window.addEventListener('studio:agent-start', receive);
    return () => window.removeEventListener('studio:agent-start', receive);
  }, [session, status, zh, provider]);
  useEffect(() => {
    const pending = pendingRef.current;
    if (!pending || status !== 'ready' || socket.current?.readyState !== WebSocket.OPEN) return;
    // Consume before sending. Reconnection must not silently duplicate a creation request.
    pendingRef.current = undefined; setPendingCreation(undefined); setStatus('working');
    socket.current.send(JSON.stringify({ type: 'prompt', text: pending.prompt }));
    pinned.current = true;
  }, [status, pendingCreation]);
  useEffect(() => { if (pinned.current && feed.current) feed.current.scrollTop = feed.current.scrollHeight; }, [entries, permissions]);
  useEffect(() => {
    if (!session) return;
    const apply = (event: Event) => {
      if (event.type === 'replay') { setEntries([]); setPermissions([]); streamId.current = null; for (const item of event.events ?? []) apply(item); return; }
      if (event.type === 'ready') { setStatus('ready'); setConfig(event.session?.configOptions ?? []); }
      if (event.type === 'configuration' && event.configOptions) setConfig(event.configOptions);
      if (event.type === 'state' && event.state) setStatus(event.state);
      if (event.type === 'exit') setStatus('exited');
      if (event.type === 'error') { setError(event.message ?? 'Agent error'); setStatus(current => current === 'configuring' ? 'ready' : current); }
      if (event.type === 'complete') {
        streamId.current = null; setStatus('ready');
        // ACP completion means the turn ended, not that visual approval exists.
        // Refresh through the existing dirty-state guard so disk changes become
        // visible without replacing unsaved editor work silently.
        window.setTimeout(onRefresh, 400);
      }
      if (event.type === 'permission' && event.id && event.options) setPermissions(items => [...items.filter(p => p.id !== event.id), event as Permission]);
      if (event.type === 'permission_resolved') setPermissions(items => items.filter(p => p.id !== event.id));
      if (event.type === 'user') { streamId.current = null; setEntries(items => [...items, { id: `user-${++sequence.current}`, kind: 'user', text: event.text ?? '' }]); }
      const update = event.update;
      if (event.type !== 'update' || !update) return;
      if (update.sessionUpdate === 'config_option_update' && update.configOptions) setConfig(update.configOptions);
      if (update.sessionUpdate === 'agent_message_chunk' && !Array.isArray(update.content) && update.content?.type === 'text') {
        const chunk = update.content.text ?? '';
        const id = streamId.current ?? `assistant-${++sequence.current}`; streamId.current = id;
        setEntries(items => items.some(item => item.id === id) ? items.map(item => item.id === id ? { ...item, text: item.text + chunk } : item) : [...items, { id, kind: 'assistant', text: chunk }]);
      }
      if (update.sessionUpdate === 'tool_call' || update.sessionUpdate === 'tool_call_update') {
        streamId.current = null;
        const id = update.toolCallId ?? `tool-${++sequence.current}`;
        const blocks = Array.isArray(update.content) ? update.content : [];
        const details = [
          update.rawInput !== undefined ? `Input\n${JSON.stringify(update.rawInput, null, 2)}` : '',
          ...blocks.map(block => block.type === 'diff' ? `File: ${block.path}\n--- Before\n${block.oldText ?? ''}\n+++ After\n${block.newText ?? ''}` : block.type === 'content' && block.content?.type === 'text' ? block.content.text ?? '' : ''),
          update.rawOutput !== undefined ? `Output\n${JSON.stringify(update.rawOutput, null, 2)}` : '',
        ].filter(Boolean).join('\n\n');
        setEntries(items => items.some(item => item.id === id) ? items.map(item => item.id === id ? { ...item, text: update.title ?? item.text, status: update.status ?? item.status, detail: details ? [item.detail, details].filter(Boolean).join('\n\n').slice(-64000) : item.detail } : item) : [...items, { id, kind: 'tool', text: update.title ?? 'Tool', status: update.status, detail: details.slice(-64000) }]);
      }
      if (update.sessionUpdate === 'plan' && update.entries) setEntries(items => [...items.filter(item => item.id !== 'plan'), { id: 'plan', kind: 'plan', text: update.entries!.map(entry => `${entry.status} · ${entry.content}`).join('\n') }]);
    };
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/__studio/agent-session`); socket.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: 'attach', ...session }));
    ws.onmessage = event => { try { apply(JSON.parse(event.data)); } catch { setError('Invalid ACP event'); } };
    ws.onerror = () => setError(zh ? '连接失败，请检查本地服务。' : 'Connection failed. Check the local server.');
    ws.onclose = () => setStatus(current => current === 'exited' ? current : 'disconnected');
    return () => { ws.onclose = null; ws.close(); socket.current = null; };
  }, [session, attempt]);
  const send = (message: object) => { if (socket.current?.readyState === WebSocket.OPEN) { socket.current.send(JSON.stringify(message)); return true; } setError(zh ? '会话连接已断开，请重连。' : 'Session disconnected. Reconnect first.'); return false; };
  const active = status === 'ready' || status === 'working';
  const statusLabel: Record<string, string> = { idle: '未连接', starting: '正在初始化 ACP', ready: '就绪', working: '执行中', configuring: '更新配置中', disconnected: '已断开', exited: '已结束' };
  return <section className="agent-dock" aria-label={zh ? 'Agent 对话' : 'Agent conversation'}>
    <div className="agent-toolbar"><Space><Tag color={active ? 'green' : 'default'}>{zh ? statusLabel[status] ?? status : status}</Tag><span className="muted">ACP</span></Space>
      <Space wrap><Select aria-label="Agent" value={provider} disabled={!!session && status !== 'exited'} onChange={setProvider} style={{ width: 142 }} options={(providers.length ? providers : (Object.keys(labels) as Provider[]).map(id => ({ id, available: true }))).map(p => ({ value: p.id, label: `${labels[p.id]}${p.available ? '' : zh ? ' · 未安装' : ' · missing'}`, disabled: !p.available }))} />
        {(!session || status === 'exited') && <Button type="primary" loading={status === 'starting'} onClick={() => { void start(); }}>{zh ? '连接' : 'Connect'}</Button>}
        {status === 'disconnected' && <Button onClick={() => { setError(''); setAttempt(value => value + 1); }}>{zh ? '重连' : 'Reconnect'}</Button>}
        {session && status !== 'exited' && <Button onClick={() => { if (send({ type: 'stop' })) { setStatus('exited'); setPermissions([]); } }}>{zh ? '结束会话' : 'End session'}</Button>}
        <Button icon={<ReloadOutlined />} onClick={onRefresh} aria-label={zh ? '刷新项目' : 'Refresh project'} />
      </Space></div>
    {pendingCreation && <Alert type="info" title={`${zh ? '待提交制作' : 'Pending creation'} · ${pendingCreation.projectName}`} description={zh ? '将于所选 Agent 连接就绪且空闲时自动提交。请确认 Agent 和模型；也可取消。' : 'Will submit when the selected agent is connected and idle. Check the agent/model or cancel.'} action={<Button onClick={() => { pendingRef.current = undefined; setPendingCreation(undefined); }}>{zh ? '取消提交' : 'Cancel submission'}</Button>} />}
    {error && <Alert type="error" title={error} closable onClose={() => setError('')} />}
    {session && <Collapse ghost className="agent-configuration" items={[{ key: 'configuration', label: zh ? '模型与推理配置' : 'Model and reasoning settings', children: config.length ? <div className="agent-config-fields">{config.map(option => {
      const editable = ['model', 'model_config', 'thought_level'].includes(option.category ?? '');
      const change = (value: string | boolean) => { if (send({ type: 'configure', configId: option.id, value })) setStatus('configuring'); };
      return <label key={option.id}><span>{option.name}</span>{option.type === 'select'
        ? <Select aria-label={option.name} value={option.currentValue} disabled={!editable || status !== 'ready'} virtual={false} options={option.options.flatMap(item => 'options' in item ? item.options.map(value => ({ value: value.value, label: `${item.name} / ${value.name}` })) : [{ value: item.value, label: item.name }])} onChange={change} />
        : <Checkbox checked={option.currentValue} disabled={!editable || status !== 'ready'} onChange={event => change(event.target.checked)} />}
        {option.description && <small className="muted">{option.description}</small>}</label>;
    })}<small className="muted">{zh ? '选项来自当前 Agent；权限模式只读。模型能力仍需通过实际视觉校准确认。' : 'Options come from the agent; permission modes are read-only. Verify vision ability through calibration.'}</small></div> : <small className="muted">{zh ? '此 Agent 尚未返回可用配置。' : 'No configuration advertised by this agent.'}</small> }]} />}
    <ProductionProgress />
    <div className="agent-conversation" ref={feed} role="log" aria-live="polite" onScroll={event => { const el = event.currentTarget; pinned.current = el.scrollHeight - el.scrollTop - el.clientHeight < 64; }}>
      {!entries.length && <Empty image={Empty.PRESENTED_IMAGE_SIMPLE} description={zh ? '连接 Agent 后描述创作任务，工具调用和审批会显示在这里。' : 'Connect an agent to start. Tool activity and permissions appear here.'} />}
      {entries.map(entry => entry.kind === 'tool' ? <Collapse className="agent-tool-detail" ghost key={entry.id} items={[{ key: entry.id, label: <span className="agent-tool"><Tag color={entry.status === 'failed' ? 'error' : entry.status === 'completed' ? 'success' : undefined}>{entry.status ?? 'pending'}</Tag><span>{entry.text}</span></span>, children: entry.detail ? <pre>{entry.detail}</pre> : <small className="muted">{zh ? 'Agent 尚未提供详细结果。' : 'No detailed output reported yet.'}</small> }]} /> : <article key={entry.id} className={`agent-message agent-message-${entry.kind}`}><small>{entry.kind === 'user' ? zh ? '你' : 'You' : entry.kind === 'plan' ? zh ? '执行计划' : 'Plan' : labels[session?.provider ?? provider]}</small><div>{entry.text}</div></article>)}
    </div>
    {permissions.map(permission => <div className="agent-permission" key={permission.id}><strong>{permission.tool?.title ?? (zh ? '请求工具权限' : 'Tool permission')}</strong>
      {permission.tool?.rawInput !== undefined && <Collapse ghost items={[{ key: 'input', label: zh ? '查看请求参数' : 'Request details', children: <pre>{JSON.stringify(permission.tool.rawInput, null, 2)}</pre> }]} />}
      <Space wrap>{permission.options.map(option => <Button key={option.optionId} danger={option.kind.startsWith('reject')} onClick={() => send({ type: 'permission', id: permission.id, optionId: option.optionId })}>{option.name}</Button>)}<Button onClick={() => send({ type: 'permission', id: permission.id, optionId: null })}>{zh ? '取消' : 'Cancel'}</Button></Space>
    </div>)}
    <div className="agent-composer"><Space wrap><Checkbox checked={context} onChange={e => setContext(e.target.checked)}>{zh ? '附带当前上下文' : 'Include context'}</Checkbox><span className="muted">{project}{selection ? ` / ${selection}` : ''}</span></Space>
      <Sender value={draft} onChange={setDraft} disabled={!active} loading={status === 'working'} onCancel={() => send({ type: 'cancel' })} placeholder={zh ? '描述任务…' : 'Describe a task…'} autoSize={{ minRows: 2, maxRows: 6 }} onSubmit={value => {
        if (!value.trim() || status !== 'ready') return;
        const text = (context ? `Project: ${project}\nSelected part: ${selection ?? 'none'}\nUnsaved editor changes may not be on disk. Follow AGENTS.md. Never send images to external services without user consent.\n\n` : '') + value;
        if (send({ type: 'prompt', text })) { setDraft(''); setStatus('working'); pinned.current = true; }
      }} />
      <small className="muted">{zh ? '真实 ACP 会话 · 工具授权在此确认 · 文件更新后刷新项目' : 'Native ACP session · Review permissions here · Refresh after file changes'}</small>
    </div>
  </section>;
}
