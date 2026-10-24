import { expect, test } from 'vitest';
import type { IncomingMessage } from 'node:http';
import { AGENTS, validAgent, localRequest, matchesToken } from '../src/server/agent-bridge';
const request = (headers: Record<string, string> = {}, remoteAddress = '127.0.0.1') => ({ headers: { host: '127.0.0.1:5173', ...headers }, socket: { remoteAddress } } as IncomingMessage);
test('agent bridge permits only the three installed agent names, never executable or argument input', () => {
  expect(AGENTS.every(validAgent)).toBe(true);
  for (const value of ['bash', '/bin/sh', 'claude --dangerously-skip-permissions', 'constructor', null, {}, '']) expect(validAgent(value)).toBe(false);
});
test('local process routes reject remote hosts, foreign origins and missing mutation marker', () => {
  expect(localRequest(request())).toBe(true);
  expect(localRequest(request({ origin: 'http://127.0.0.1:5173', 'x-studio-request': '1' }), true)).toBe(true);
  expect(localRequest(request({ origin: 'http://evil.test', 'x-studio-request': '1' }), true)).toBe(false);
  expect(localRequest(request({ host: 'evil.test' }))).toBe(false);
  expect(localRequest(request({}, '192.168.1.2'))).toBe(false);
  expect(localRequest(request({ 'sec-fetch-site': 'cross-site' }))).toBe(false);
  expect(localRequest(request({ 'x-studio-request': '1' }), true)).toBe(false);
  expect(localRequest(request({ origin: 'http://127.0.0.1:5173' }), true)).toBe(false);
});
test('session capabilities require an exact nonempty token', () => {
  const token = 'a'.repeat(64);
  expect(matchesToken(token, token)).toBe(true);
  for (const bad of [null, {}, '', 'a', 'b'.repeat(64), `${token}a`]) expect(matchesToken(token, bad)).toBe(false);
});
