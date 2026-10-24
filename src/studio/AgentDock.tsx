import { useEffect, useRef, useState } from 'react';
import { Alert, Button, Checkbox, Empty, Select, Space, Tag } from 'antd';
import { Sender } from '@ant-design/x';
import { CodeOutlined, DisconnectOutlined, ReloadOutlined } from '@ant-design/icons';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import '@xterm/xterm/css/xterm.css';
import { useI18n } from '../editor/i18n';
import { useStudioTheme } from './Theme';

type Provider = 'claude' | 'codex' | 'pi';
type Session = { id: string; token: string; provider: Provider };
const labels = { claude: 'Claude Code', codex: 'Codex', pi: 'Pi' };
export function AgentDock({ project, selection, onRefresh }: { project: string; selection?: string | null; onRefresh(): void }) {
  const { language } = useI18n(), zh = language === 'zh';
  const { dark } = useStudioTheme();
  const [provider, setProvider] = useState<Provider>('claude');
  const [providers, setProviders] = useState<{ id: Provider; available: boolean }[]>([]);
  const [session, setSession] = useState<Session>();
  const [status, setStatus] = useState<'idle' | 'starting' | 'connected' | 'disconnected' | 'exited'>('idle');
  const [error, setError] = useState(''), [draft, setDraft] = useState(''), [context, setContext] = useState(true), [attempt, setAttempt] = useState(0);
  const host = useRef<HTMLDivElement>(null), socket = useRef<WebSocket | null>(null), terminal = useRef<Terminal | null>(null);
  const load = () => { void fetch('/__studio/agents').then(async response => { if (!response.ok) throw new Error('Agent bridge unavailable'); return response.json(); }).then(data => setProviders(data.providers)).catch(err => setError(String(err))); };
  useEffect(load, []);
  useEffect(() => {
    const receive = (event: Event) => { const text = (event as CustomEvent<string>).detail; if (typeof text === 'string') setDraft(text); };
    window.addEventListener('studio:agent-prompt', receive); return () => window.removeEventListener('studio:agent-prompt', receive);
  }, []);
  useEffect(() => {
    if (!session || !host.current) return;
    const term = new Terminal({ fontFamily: '"SFMono-Regular", Menlo, monospace', fontSize: 12, cursorBlink: true, scrollback: 5000, allowProposedApi: false });
    const fit = new FitAddon(); term.loadAddon(fit); term.open(host.current); terminal.current = term;
    const ws = new WebSocket(`${location.protocol === 'https:' ? 'wss:' : 'ws:'}//${location.host}/__studio/agent-terminal`); socket.current = ws;
    const send = (message: object) => { if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify(message)); };
    const resize = () => { if (host.current && host.current.clientWidth && host.current.clientHeight) { fit.fit(); send({ type: 'resize', cols: term.cols, rows: term.rows }); } };
    const observer = new ResizeObserver(resize); observer.observe(host.current);
    ws.onopen = () => { send({ type: 'attach', ...session }); resize(); };
    ws.onmessage = event => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'output') term.write(message.data);
        if (message.type === 'attached') { setStatus('connected'); resize(); }
        if (message.type === 'exit') { setStatus('exited'); term.writeln(`\r\n[Process exited: ${message.code}]`); }
      } catch { setError('Invalid agent response'); }
    };
    ws.onerror = () => setError(zh ? '连接失败，请检查本地服务。' : 'Connection failed. Check the local server.');
    ws.onclose = () => setStatus(current => current === 'exited' ? current : 'disconnected');
    const input = term.onData(data => send({ type: 'input', data }));
    return () => { observer.disconnect(); input.dispose(); ws.onclose = null; ws.close(); term.dispose(); terminal.current = null; socket.current = null; };
  }, [session, attempt]);
  useEffect(() => { if (terminal.current) terminal.current.options.theme = dark ? { background: '#1b1e21', foreground: '#eee9dd', cursor: '#d99069' } : { background: '#fbfaf7', foreground: '#2d3337', cursor: '#ac4f30' }; }, [dark, session, status]);
  const start = async () => {
    setError(''); setStatus('starting');
    try {
      const response = await fetch('/__studio/agents', { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Studio-Request': '1' }, body: JSON.stringify({ provider }) });
      const data = await response.json(); if (!response.ok) throw new Error(data.error);
      setSession(data);
    } catch (err) { setStatus('idle'); setError(String(err)); }
  };
  const write = (data: string) => { if (socket.current?.readyState === WebSocket.OPEN) socket.current.send(JSON.stringify({ type: 'input', data })); };
  const active = status === 'connected';
  return <section className="agent-dock" aria-label={zh ? '本地 Agent 工作区' : 'Local agent workspace'}>
    <div className="agent-toolbar"><Space><CodeOutlined /><strong>{zh ? '本地 Agent' : 'Local agent'}</strong><Tag color={active ? 'green' : 'default'}>{({ idle: zh ? '未连接' : 'Not connected', starting: zh ? '启动中' : 'Starting', connected: zh ? '已连接' : 'Connected', disconnected: zh ? '已断开' : 'Disconnected', exited: zh ? '已退出' : 'Exited' })[status]}</Tag></Space>
      <Space wrap><Select aria-label="Agent" value={provider} disabled={active || status === 'starting' || status === 'disconnected'} onChange={setProvider} style={{ width: 142 }} options={(providers.length ? providers : (Object.keys(labels) as Provider[]).map(id => ({ id, available: true }))).map(p => ({ value: p.id, label: `${labels[p.id]}${p.available ? '' : zh ? ' · 未安装' : ' · missing'}`, disabled: !p.available }))} />
        {!active && status !== 'disconnected' && <Button type="primary" loading={status === 'starting'} onClick={() => { void start(); }}>{zh ? '连接' : 'Connect'}</Button>}
        {status === 'disconnected' && <Button onClick={() => { setError(''); setAttempt(value => value + 1); }}>{zh ? '重连会话' : 'Reconnect'}</Button>}
        {active && <><Button onClick={() => write('\u0003')}>{zh ? '中断任务' : 'Interrupt'}</Button><Button icon={<DisconnectOutlined />} onClick={() => { socket.current?.send(JSON.stringify({ type: 'stop' })); setStatus('exited'); }}>{zh ? '结束会话' : 'End session'}</Button></>}
        <Button icon={<ReloadOutlined />} onClick={onRefresh}>{zh ? '刷新项目' : 'Refresh project'}</Button>
      </Space></div>
    {error && <Alert type="error" title={error} closable onClose={() => setError('')} />}
    <div className="agent-terminal" ref={host} data-testid="agent-terminal" style={{ display: session ? 'block' : 'none' }} />
    {!session && <div className="agent-empty"><Empty image={<CodeOutlined style={{ fontSize: 30 }} />} description={zh ? '连接本机 Claude Code、Codex 或 Pi，直接在项目中读写文件、运行工具。' : 'Connect a local Claude Code, Codex or Pi session to work on this project.'} /><p>{zh ? '权限确认、模型切换和工具进度在原生会话中操作。' : 'Approvals, model selection and tool progress remain in the native session.'}</p></div>}
    <div className="agent-composer"><Space wrap><Checkbox checked={context} onChange={e => setContext(e.target.checked)}>{zh ? '附带当前上下文' : 'Include context'}</Checkbox><span className="muted">{project}{selection ? ` / ${selection}` : ''}</span></Space>
      <Sender value={draft} onChange={setDraft} disabled={!active} placeholder={zh ? '描述任务，或在上方原生会话中输入命令…' : 'Describe a task, or type directly in the terminal…'} autoSize={{ minRows: 1, maxRows: 4 }} onSubmit={value => {
        if (!value.trim()) return;
        const text = (context ? `Project: ${project}\nSelected part: ${selection ?? 'none'}\nUnsaved editor changes may not be on disk. Follow AGENTS.md.\n\n` : '') + value;
        write(`\u001b[200~${text.split(String.fromCharCode(27)).join('')}\u001b[201~`);
        const connection = socket.current;
        window.setTimeout(() => { if (connection?.readyState === WebSocket.OPEN) connection.send(JSON.stringify({ type: 'input', data: '\r' })); }, 100);
        setDraft(''); terminal.current?.focus();
      }} />
      <small className="muted">{zh ? '发送即提交给当前 Agent；审批仍在原生会话中确认。文件改动后请刷新项目。' : 'Send submits to the active agent. Approvals remain in the native session. Refresh after file changes.'}</small>
    </div>
  </section>;
}
