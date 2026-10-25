export const MAX_AGENT_PROMPT_LENGTH = 64 * 1024;

export function agentPromptError(text: unknown): string | undefined {
  if (typeof text !== 'string' || !text.trim()) return 'Agent prompt must contain non-whitespace text.';
  if (text.length > MAX_AGENT_PROMPT_LENGTH) return `Agent prompt exceeds ${MAX_AGENT_PROMPT_LENGTH} UTF-16 code units. Shorten the request before retrying.`;
  return undefined;
}
