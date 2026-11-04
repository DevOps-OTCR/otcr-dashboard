import { AgentError, errMsg, modelRateLimited, modelUnavailable, toAgentErrorEvent, userRateLimited } from './agent-errors';

describe('toAgentErrorEvent', () => {
  it('copies kind, retryable and the friendly message from an AgentError', () => {
    expect(toAgentErrorEvent(modelUnavailable())).toEqual({
      type: 'error',
      kind: 'model',
      retryable: true,
      message: "OTCR Bot couldn't respond. Try again.",
    });
    expect(toAgentErrorEvent(userRateLimited())).toMatchObject({ kind: 'rate_limit', retryable: false });
    expect(toAgentErrorEvent(modelRateLimited())).toMatchObject({ kind: 'rate_limit', retryable: true });
  });

  it('turns any other error into a generic internal error without leaking its details', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    const event = toAgentErrorEvent(new Error('DATABASE_URL=postgres://secret@host'));
    expect(event).toEqual({
      type: 'error',
      kind: 'internal',
      retryable: true,
      message: 'Something went wrong in OTCR Bot. Try again.',
    });
    expect(JSON.stringify(event)).not.toContain('secret');
  });

  it('handles non-Error values', () => {
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
    expect(toAgentErrorEvent('boom')).toMatchObject({ kind: 'internal' });
    expect(toAgentErrorEvent(undefined)).toMatchObject({ kind: 'internal' });
  });
});

describe('errMsg', () => {
  it('returns the message of an Error, or the value as a string', () => {
    expect(errMsg(new Error('bad'))).toBe('bad');
    expect(errMsg('plain')).toBe('plain');
    expect(errMsg(42)).toBe('42');
  });
});

describe('AgentError', () => {
  it('keeps the user message and the underlying cause', () => {
    const cause = new Error('HTTP 500');
    const err = new AgentError('model', 'Try again.', true, cause);
    expect(err).toBeInstanceOf(Error);
    expect(err.message).toBe('Try again.');
    expect((err as { cause?: unknown }).cause).toBe(cause);
  });
});