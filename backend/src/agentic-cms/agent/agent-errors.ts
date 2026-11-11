import { NotFoundException } from '@nestjs/common';
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

// Server-side configuration problems: retrying will not help until an admin fixes the backend settings.
export const modelNotConfigured = () =>
  new AgentError('config', "OTCR Bot isn't set up on this server yet (no model key). Ask the admin.", false);

export const modelConfigProblem = (problem: 'auth' | 'consent' | 'access' | 'model', cause?: unknown) =>
  new AgentError('config', {
    auth: "OTCR Bot's model key was rejected. Ask the admin to check the Lumen key.",
    consent: "The server's Lumen account must accept this model's notice in Lumen before OTCR Bot can use it. Ask the admin.",
    access: "The server's Lumen account isn't allowed to use the configured model. Ask the admin.",
    model: "OTCR Bot's configured model wasn't found. Ask the admin to check LUMEN_MODEL.",
  }[problem], false, cause);

export const modelQuotaExhausted = (cause?: unknown) =>
  new AgentError('rate_limit', "OTCR Bot's model budget is used up. Try again after it resets.", false, cause);

export const modelTimedOut = (cause?: unknown) =>
  new AgentError('model', 'OTCR Bot took too long to respond. Try again.', true, cause);

export const userRateLimited = () =>
  new AgentError(
    'rate_limit',
    "You've hit the hourly message limit for OTCR Bot. Try again later.",
    false,
  );

export const featureDisabled = () =>
  new AgentError('disabled', 'OTCR Bot is turned off right now.', false);

export function toAgentErrorEvent(err: unknown): AgentEvent {
  if (err instanceof AgentError) {
    return { type: 'error', kind: err.kind, retryable: err.retryable, message: err.userMessage};
  }
  // Not this user's conversation, or history was lost when the server restarted.
  if (err instanceof NotFoundException) {
    return { type: 'error', kind: 'auth', retryable: false, message: "This conversation isn't available. Start a new chat." };
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