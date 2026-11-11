import { modelUnavailable } from '../agent/agent-errors';
import { assistantMessage, ModelClient, ModelRequest, ModelTurn } from './model-client';

export class FakeModelClient implements ModelClient {
  readonly name = 'fake';

  async stream(req: ModelRequest, onText: (delta: string) => void): Promise<ModelTurn> {
    const userMessages = req.messages.filter((m) => m.role === 'user');
    const last = userMessages[userMessages.length - 1];
    const prompt = last && last.role === 'user' ? last.content: '';

    if (/fail model/i.test(prompt)) throw modelUnavailable(new Error('FakeModel: simulated provider failure'));

    const text = `_(Fake model)_ You said: "${prompt}". This is turn ${userMessages.length} of the conversation.`;
    for (const chunk of text.match(/.{1,16}/gs) ?? []) {
        onText(chunk);
        await new Promise((r) => setTimeout(r, 10));
    }
    return { text, toolCalls: [], message: assistantMessage(text, [])};
  }
}