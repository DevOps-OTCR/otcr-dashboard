import type { AgentErrorKind, AgentEvent } from './agent.events';

export class AgentError extends Error {
  constructor(
    readonly kind: AgentErrorKind,
    readonly userMessage: string,
    readonly retryable: boolean,
    cause?: unknown,
  ) {
    super(userMessage);
    if (cause) Object.defineProperty(this, 'cause', { value: cause });
  }
}

export const modelUnavailable = (cause?: unknown) =>
  new AgentError('model', "OTCR Bot couldn't respond. Try again.", true, cause);

export const modelRateLimited = (cause?: unknown) =>
  new AgentError(
    'rate_limit',
    'Lots of people are using OTCR Bot right now. Try again in a minute.',
    true,
    cause,
  );

export const userRateLimited = () =>
  new AgentError(
    'rate_limit',
    "You've hit the hourly message limit for OTCR Bot. Try again later.",
    false,
  );

export const featureDisabled = () =>
  new AgentError('disabled', 'OTCR Bot was turned off while answering. Your message was saved.', false);

export function toAgentErrorEvent(err: unknown): AgentEvent {
  if (err instanceof AgentError) {
    return { type: 'error', kind: err.kind, retryable: err.retryable, message: err.userMessage};
  }

  console.error('[otcr-bot] unexpected error:', errMsg(err) );
  return {
    type: 'error',
    kind: 'internal',
    retryable: true,
    message: 'Something went wrong in OTCR Bot. Try again.'
  }
}

export function errMsg(e: unknown): string {
  if (e instanceof Error) return e.message;
  return String(e);
}