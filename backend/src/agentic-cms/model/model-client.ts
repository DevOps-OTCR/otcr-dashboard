export type ToolCall = { id: string; name: string; args: unknown };

/** Content parts for multimodal user messages (image injection after vision tool calls). */
export type TextPart = { type: 'text'; text: string };
export type ImagePart = { type: 'image_url'; image_url: { url: string } };
export type ContentPart = TextPart | ImagePart;

export type ChatMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string | ContentPart[] }
  | {
      role: 'assistant';
      content: string | null;
      tool_calls?: { id: string; type: 'function'; function: { name: string; arguments: string } }[];
    }
  | { role: 'tool'; tool_call_id: string; content: string };

export type ToolSchema = {
  name: string;
  description: string;
  parameters: Record<string, unknown>; // JSON Schema
};

export type ModelRequest = {
  system: string;
  messages: ChatMessage[];
  tools: ToolSchema[];
  signal: AbortSignal;
  /** Force the model to call this specific tool (tool_choice). */
  toolChoice?: string;
};

export type ModelTurn = {
  text: string;
  toolCalls: ToolCall[];
  message: ChatMessage; // assistant message to append to history
};

export interface ModelClient {
  readonly name: string;
  stream(req: ModelRequest, onText: (delta: string) => void): Promise<ModelTurn>;
}

export const MODEL_CLIENT = Symbol('MODEL_CLIENT');

export function assistantMessage(text: string, toolCalls: ToolCall[]): ChatMessage {
  return {
    role: 'assistant',
    content: text || null, ...(toolCalls.length ? {
            tool_calls: toolCalls.map((c) => ({
                id: c.id,
                type: 'function' as const,
                function: { name: c.name, arguments: JSON.stringify(c.args ?? {})},
            })),
        }
        : {}),
  };
}