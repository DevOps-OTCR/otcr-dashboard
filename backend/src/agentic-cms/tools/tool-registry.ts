import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import type { SendEvent } from '../agent/agent.events';
import type { ToolCall, ToolSchema } from '../model/model-client';
import { LoadSkillTool } from './load-skill.tool';
import { MockWorkstreamTool } from './mock-workstream.tool';
import { AgentTool, ToolContext, ToolFailure } from './tool.types';
import { WebSearchTool } from './web-search.tool';

const MAX_TOOL_OUTPUT_CHARS = 30_000;

/**
 * The tools OTCR Bot can call. To add one: implement AgentTool in this folder,
 * add it to AgenticCmsModule providers and to the constructor below.
 * Group 2's MCP tools will be adapted into AgentTools here.
 */
@Injectable()
export class ToolRegistry {
  private readonly log = new Logger('OtcrBotTools');
  private readonly tools: AgentTool[];

  constructor(webSearch: WebSearchTool, loadSkill: LoadSkillTool, mockWorkstream: MockWorkstreamTool) {
    this.tools = [webSearch, loadSkill, mockWorkstream] as AgentTool[];
  }

  /** Tools usable right now (configured, with content). Checked at the start of each turn. */
  async available(): Promise<AgentTool[]> {
    const checks = await Promise.all(this.tools.map(async (t) => (t.isAvailable ? t.isAvailable() : true)));
    return this.tools.filter((_, i) => checks[i]);
  }

  schemas(tools: AgentTool[]): ToolSchema[] {
    return tools.map((t) => {
      const parameters = z.toJSONSchema(t.input) as Record<string, unknown>;
      delete parameters.$schema; // not part of the OpenAI tool format
      return { name: t.name, description: t.description, parameters };
    });
  }

  /**
   * Validates and runs one tool call, streaming tool_start/tool_end events.
   * Always returns content for the model (including on failure) so it can
   * explain the problem; only an abort is rethrown.
   */
  async execute(call: ToolCall, tools: AgentTool[], ctx: ToolContext, send: SendEvent): Promise<string> {
    const tool = tools.find((t) => t.name === call.name);
    if (!tool) {
      send({ type: 'tool_start', id: call.id, name: call.name, label: `Running ${call.name}…` });
      send({ type: 'tool_end', id: call.id, ok: false, note: 'Tool not available' });
      return `Unknown tool "${call.name}". Available tools: ${tools.map((t) => t.name).join(', ') || 'none'}.`;
    }

    const parsed = tool.input.safeParse(call.args);
    if (!parsed.success) {
      send({ type: 'tool_start', id: call.id, name: tool.name, label: `Running ${tool.name}…` });
      send({ type: 'tool_end', id: call.id, ok: false, note: 'Invalid request' });
      return `Invalid arguments for ${tool.name}: ${z.prettifyError(parsed.error)}. Fix them and call the tool again.`;
    }

    send({ type: 'tool_start', id: call.id, name: tool.name, label: tool.label(parsed.data) });
    try {
      const out = await tool.run(parsed.data, ctx);
      send({ type: 'tool_end', id: call.id, ok: true, ...(out.note ? { note: out.note } : {}) });
      return out.content.length > MAX_TOOL_OUTPUT_CHARS
        ? `${out.content.slice(0, MAX_TOOL_OUTPUT_CHARS)}\n[truncated]`
        : out.content;
    } catch (err) {
      if (ctx.signal.aborted) throw err;
      if (err instanceof ToolFailure) {
        send({ type: 'tool_end', id: call.id, ok: false, note: err.note });
        return err.modelMessage;
      }
      this.log.warn(`Tool ${tool.name} failed unexpectedly: ${err instanceof Error ? err.name : typeof err}`);
      send({ type: 'tool_end', id: call.id, ok: false, note: `${tool.name} failed` });
      return `The ${tool.name} tool failed unexpectedly. Tell the user this step could not be completed.`;
    }
  }
}
