import { randomBytes, timingSafeEqual } from 'node:crypto';
import { access } from 'node:fs/promises';
import { constants } from 'node:fs';
import { delimiter, join } from 'node:path';
import { WebSocketServer, WebSocket } from 'ws';
import type { IncomingMessage } from 'node:http';
import type { Plugin } from 'vite';
import { AcpSession, adapterPath, type AgentEvent } from './acp-session';

export const AGENTS = ['claude', 'codex', 'pi'] as const;
export type AgentProvider = typeof AGENTS[number];
export function validAgent(value: unknown): value is AgentProvider { return AGENTS.includes(value as AgentProvider); }
export function localRequest(req: Pick<IncomingMessage, 'headers' | 'socket'>, mutation = false) {
  const remote = req.socket.remoteAddress;
  if (!['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(remote ?? '')) return false;
  try {
    const host = new URL(`http://${req.headers.host}`);
    if (!['localhost', '127.0.0.1', '[::1]'].includes(host.hostname)) return false;
    if (req.headers.origin && new URL(req.headers.origin).origin !== host.origin) return false;
    if (req.headers['sec-fetch-site'] === 'cross-site') return false;
    return !mutation || (req.headers['x-studio-request'] === '1' && !!req.headers.origin);
  } catch { return false; }
}
export function matchesToken(expected: string, value: unknown) {
  return typeof value === 'string' && Buffer.byteLength(value) === Buffer.byteLength(expected) && timingSafeEqual(Buffer.from(value), Buffer.from(expected));
}
async function executable(provider: AgentProvider) {
  for (const directory of (process.env.PATH ?? '').split(delimiter)) {
    if (!directory) continue;
    const file = join(directory, provider);
    try { await access(file, constants.X_OK); return file; } catch { /* Try next PATH directory. */ }
  }
  return null;
}
type Session = { id: string; provider: AgentProvider; token: string; agent: AcpSession; events: AgentEvent[]; bytes: number; clients: Set<WebSocket>; exit?: number; timer?: ReturnType<typeof setTimeout> };
export function agentBridge(root: string): Plugin {
  const sessions = new Map<string, Session>();
  let starting = 0;
  const wss = new WebSocketServer({ noServer: true, maxPayload: 128 * 1024 });
  const emit = (session: Session, message: AgentEvent) => { session.events.push(message); session.bytes += JSON.stringify(message).length; while (session.bytes > 2 * 1024 * 1024 && session.events.length > 1) session.bytes -= JSON.stringify(session.events.shift()).length; for (const client of session.clients) if (client.readyState === WebSocket.OPEN) client.send(JSON.stringify(message)); };
  const destroy = (session: Session) => { if (!sessions.has(session.id)) return; clearTimeout(session.timer); sessions.delete(session.id); session.agent.close(); for (const client of session.clients) client.close(); };
  return { name: 'studio-native-agents', apply: 'serve', configureServer(server) {
    server.middlewares.use(async (req, res, next) => {
      if (req.url?.split('?')[0] !== '/__studio/agents') return next();
      const json = (status: number, data: object) => { res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }); res.end(JSON.stringify(data)); };
      if (!localRequest(req, req.method !== 'GET')) return json(403, { error: 'Local same-origin requests only.' });
      if (req.method === 'GET') return json(200, { providers: await Promise.all(AGENTS.map(async id => ({ id, available: !!await executable(id) && !!adapterPath(id) }))) });
      if (req.method !== 'POST') return json(405, { error: 'Method not allowed.' });
      let reserved = false;
      try {
        let body = '';
        for await (const chunk of req) { body += chunk; if (body.length > 1024) return json(413, { error: 'Request too large.' }); }
        const { provider } = JSON.parse(body);
        if (!validAgent(provider)) return json(400, { error: 'Unknown agent.' });
        for (const session of sessions.values()) if (session.exit !== undefined) destroy(session);
        if (sessions.size + starting >= 3) return json(409, { error: 'Close an existing agent session first (maximum 3).' });
        starting++; reserved = true;
        const command = await executable(provider);
        if (!command) return json(404, { error: `${provider} is not installed on PATH.` });
        const agent = new AcpSession(provider, root, event => { if (session) { if (event.type === 'exit') session.exit = Number(event.code ?? 1); emit(session, event); } });
        const session: Session = { id: randomBytes(16).toString('hex'), token: randomBytes(32).toString('hex'), provider, agent, events: [], bytes: 0, clients: new Set() };
        sessions.set(session.id, session);
        session.timer = setTimeout(() => destroy(session), 300_000);
        // Initialize after returning the capability, so startup errors remain visible in the UI.
        void agent.initialize().catch(error => { session.exit = 1; emit(session, { type: 'error', message: String(error) }); agent.close(); emit(session, { type: 'exit', code: 1 }); });
        json(201, { id: session.id, token: session.token, provider });
      } catch (error) { json(500, { error: error instanceof Error ? error.message : 'Could not start agent.' }); }
      finally { if (reserved) starting--; }
    });
    server.httpServer?.on('upgrade', (req, socket, head) => {
      if (req.url !== '/__studio/agent-session') return;
      if (!localRequest(req) || !req.headers.origin) { socket.destroy(); return; }
      wss.handleUpgrade(req, socket, head, client => {
        let session: Session | undefined;
        const authTimer = setTimeout(() => client.close(1008, 'Authentication timeout'), 5000);
        client.on('message', raw => {
          try {
            const message = JSON.parse(raw.toString());
            if (!session) {
              const candidate = sessions.get(message.id);
              if (message.type !== 'attach' || !candidate || !matchesToken(candidate.token, message.token)) { client.close(1008, 'Invalid session'); return; }
              session = candidate; clearTimeout(authTimer); clearTimeout(session.timer); session.clients.add(client);
              client.send(JSON.stringify({ type: 'replay', events: session.events }));
              client.send(JSON.stringify({ type: 'attached', provider: session.provider }));
              if (session.exit !== undefined) client.send(JSON.stringify({ type: 'exit', code: session.exit }));
              return;
            }
            if (message.type === 'prompt' && typeof message.text === 'string' && message.text.trim() && message.text.length <= 64 * 1024 && session.exit === undefined) {
              const current = session;
              void current.agent.prompt(message.text).catch(error => emit(current, { type: 'error', message: String(error) }));
            }
            if (message.type === 'configure' && typeof message.configId === 'string' && (typeof message.value === 'string' || typeof message.value === 'boolean')) {
              const current = session;
              void current.agent.configure(message.configId, message.value).catch(error => emit(current, { type: 'error', message: String(error) }));
            }
            if (message.type === 'cancel') void session.agent.cancel().catch(error => emit(session!, { type: 'error', message: String(error) }));
            if (message.type === 'permission' && typeof message.id === 'string' && (message.optionId === null || typeof message.optionId === 'string')) session.agent.answer(message.id, message.optionId);
            if (message.type === 'stop') destroy(session);
          } catch { client.close(1008, 'Invalid message'); }
        });
        client.on('close', () => { clearTimeout(authTimer); if (session) { session.clients.delete(client); if (!session.clients.size && sessions.has(session.id)) session.timer = setTimeout(() => { if (session) destroy(session); }, 300_000); } });
        client.on('error', () => client.close());
      });
    });
    server.httpServer?.once('close', () => { for (const session of sessions.values()) destroy(session); wss.close(); });
  } };
}
