import { spawn, type ChildProcessWithoutNullStreams } from 'node:child_process';
import { Readable, Writable } from 'node:stream';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { ClientApp, ndJsonStream, type ClientConnection, type RequestPermissionResponse, type SessionConfigOption } from '@agentclientprotocol/sdk';
import { randomUUID } from 'node:crypto';

export type Provider = 'claude' | 'codex' | 'pi';
const packages: Record<Provider, string> = { claude: '@agentclientprotocol/claude-agent-acp', codex: '@agentclientprotocol/codex-acp', pi: 'pi-acp' };
export type AgentEvent = { type: string; [key: string]: unknown };
export function adapterPath(provider: Provider) {
  return join(dirname(createRequire(import.meta.url).resolve(`${packages[provider]}/package.json`)), 'dist/index.js');
}
export class AcpSession {
  private process: ChildProcessWithoutNullStreams;
  private connection: ClientConnection;
  private sessionId = '';
  private disposed = false;
  private busy = false;
  private config: SessionConfigOption[] = [];
  private permissions = new Map<string, { options: Set<string>; resolve(value: RequestPermissionResponse): void }>();
  constructor(provider: Provider, private root: string, private emit: (event: AgentEvent) => void) {
    this.process = spawn(process.execPath, [adapterPath(provider)], { cwd: root, stdio: 'pipe', env: process.env });
    // stderr is diagnostic output, not chat. Drain it without exposing local credentials.
    this.process.stderr.on('data', () => {});
    const app = new ClientApp()
      .onNotification('session/update', ({ params }) => {
        if (params.update.sessionUpdate === 'config_option_update') this.config = params.update.configOptions;
        this.emit({ type: 'update', update: params.update });
      })
      .onRequest('session/request_permission', ({ params }) => new Promise<RequestPermissionResponse>(resolve => {
        const id = randomUUID();
        this.permissions.set(id, { options: new Set(params.options.map(option => option.optionId)), resolve });
        this.emit({ type: 'permission', id, tool: params.toolCall, options: params.options });
      }));
    this.connection = app.connect(ndJsonStream(Writable.toWeb(this.process.stdin), Readable.toWeb(this.process.stdout) as unknown as ReadableStream<Uint8Array>));
    this.process.on('error', error => { this.emit({ type: 'error', message: error.message }); this.close(); });
    this.process.on('exit', code => { if (!this.disposed) { this.emit({ type: 'exit', code }); this.close(); } });
  }
  async initialize() {
    const timeout = setTimeout(() => this.close(), 60_000);
    try {
      const initialized = await this.connection.agent.request('initialize', { protocolVersion: 1, clientInfo: { name: 'mesh-studio', version: '0.1.0' }, clientCapabilities: {} });
      const session = await this.connection.agent.request('session/new', { cwd: this.root, mcpServers: [] });
      this.sessionId = session.sessionId;
      this.config = session.configOptions ?? [];
      this.emit({ type: 'ready', agent: initialized.agentInfo, session });
    } finally { clearTimeout(timeout); }
  }
  getState(): 'starting' | 'working' | 'ready' | 'exited' {
    if (this.disposed) return 'exited';
    if (!this.sessionId) return 'starting';
    return this.busy ? 'working' : 'ready';
  }
  async prompt(text: string) {
    if (!this.sessionId || this.disposed) throw new Error('Agent is not connected.');
    if (this.busy) throw new Error('Wait for this turn or cancel it before sending another task.');
    this.busy = true;
    this.emit({ type: 'user', text }); this.emit({ type: 'state', state: 'working' });
    try {
      const result = await this.connection.agent.request('session/prompt', { sessionId: this.sessionId, prompt: [{ type: 'text', text }] });
      this.emit({ type: 'complete', stopReason: result.stopReason });
    } finally { this.busy = false; this.cancelPermissions(); this.emit({ type: 'state', state: this.disposed ? 'exited' : 'ready' }); }
  }
  async configure(configId: string, value: string | boolean) {
    if (!this.sessionId || this.disposed || this.busy) throw new Error('Configuration is only available while the agent is idle.');
    const option = this.config.find(item => item.id === configId);
    // Permission modes are deliberately not editable through this model-settings endpoint.
    if (!option || !['model', 'model_config', 'thought_level'].includes(option.category ?? '')) throw new Error('This configuration is not editable here.');
    if (option.type === 'select') {
      const values = option.options.flatMap(item => 'options' in item ? item.options.map(value => value.value) : [item.value]);
      if (typeof value !== 'string' || !values.includes(value)) throw new Error('Select a value advertised by the agent.');
    } else if (typeof value !== 'boolean') throw new Error('Expected a boolean setting.');
    this.busy = true; this.emit({ type: 'state', state: 'configuring' });
    try {
      const result = await this.connection.agent.request('session/set_config_option', typeof value === 'boolean'
        ? { sessionId: this.sessionId, configId, type: 'boolean', value }
        : { sessionId: this.sessionId, configId, value });
      this.config = result.configOptions;
      this.emit({ type: 'configuration', configOptions: this.config });
    } finally { this.busy = false; this.emit({ type: 'state', state: this.disposed ? 'exited' : 'ready' }); }
  }
  answer(id: string, optionId: string | null) {
    const pending = this.permissions.get(id);
    if (!pending || (optionId !== null && !pending.options.has(optionId))) throw new Error('Invalid or expired permission choice.');
    this.permissions.delete(id);
    pending.resolve({ outcome: optionId === null ? { outcome: 'cancelled' } : { outcome: 'selected', optionId } });
    this.emit({ type: 'permission_resolved', id });
  }
  private cancelPermissions() { for (const id of this.permissions.keys()) this.answer(id, null); }
  async cancel() {
    this.cancelPermissions();
    if (this.sessionId && !this.disposed) await this.connection.agent.notify('session/cancel', { sessionId: this.sessionId });
  }
  close() {
    if (this.disposed) return;
    this.disposed = true; this.cancelPermissions(); this.connection.close(); this.process.kill('SIGTERM');
    const child = this.process;
    const timer = setTimeout(() => { if (child.exitCode === null && child.signalCode === null) child.kill('SIGKILL'); }, 3000); timer.unref();
  }
}
