import { Injectable, Logger } from '@nestjs/common';
import { z } from 'zod';
import type { SendEvent } from '../agent/agent.events';
import type { ToolCall, ToolSchema } from '../model/model-client';
import { CmsReadTools } from './cms-read.tools';
import { LoadSkillTool } from './load-skill.tool';
import { AgentTool, ToolContext, ToolFailure } from './tool.types';
import { WebSearchTool } from './web-search.tool';

const MAX_TOOL_OUTPUT_CHARS = 30_000;
const TRUNCATION_NOTE =
  'This tool output was shortened to fit within the model input limit; some string values were clipped. Treat missing detail as unavailable rather than absent from the source.';

/**
 * Exact suffix CmsReadTools.runSafe appends when truncatedFields is non-empty.
 * JSON must be shortened as JSON with this suffix preserved byte-for-byte.
 */
const CMS_TRUNCATION_SUFFIX = '\n\nSome fields are shortened; see truncatedFields.';

/**
 * The tools OTCR Bot can call. To add one: implement AgentTool in this folder,
 * add it to AgenticCmsModule providers and to the constructor below.
 * CMS reads are thin adapters over CmsReadService. The selected project comes from the request.
 */
@Injectable()
export class ToolRegistry {
  private readonly log = new Logger('OtcrBotTools');
  private readonly tools: AgentTool[];

  constructor(webSearch: WebSearchTool, loadSkill: LoadSkillTool, cmsReads: CmsReadTools) {
    this.tools = [webSearch, loadSkill, ...cmsReads.tools] as AgentTool[];
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
      if (out.content.length <= MAX_TOOL_OUTPUT_CHARS) return out.content;
      return this.shorten(out.content);
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

  /**
   * Shortens an over-long tool result. JSON objects are shortened structurally so the
   * result stays parseable, keeps every nextCursor, and records the shortening in
   * truncatedFields. If the JSON is followed by the CMS truncation suffix, the suffix
   * is preserved verbatim after the shortened JSON. Everything else falls back to a
   * plain character clip.
   */
  private shorten(content: string): string {
    const json = this.tryParseJsonObject(content);
    if (!json) {
      return `${content.slice(0, MAX_TOOL_OUTPUT_CHARS)}\n[truncated]`;
    }
    const shortened = this.shortenJson(json.value, json.suffix.length);
    return `${shortened}${json.suffix}`;
  }

  /**
   * Parses a JSON object that may be followed by the exact CMS truncation suffix.
   * JSON.parse is never called on the suffix: the object is parsed in isolation and
   * the suffix is returned separately for reattachment.
   */
  private tryParseJsonObject(content: string): { value: Record<string, unknown>; suffix: string } | null {
    const trimmedStart = content.trimStart();
    const leading = content.slice(0, content.length - trimmedStart.length);
    const body = trimmedStart.trimEnd();
    const trailing = trimmedStart.slice(body.length);

    let jsonText = body;
    let suffix = '';
    if (body.endsWith(CMS_TRUNCATION_SUFFIX)) {
      jsonText = body.slice(0, body.length - CMS_TRUNCATION_SUFFIX.length).trimEnd();
      suffix = CMS_TRUNCATION_SUFFIX;
    }

    if (!jsonText.startsWith('{')) return null;
    try {
      const parsed: unknown = JSON.parse(jsonText);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) return null;
      return { value: parsed as Record<string, unknown>, suffix: leading + suffix + trailing };
    } catch {
      return null;
    }
  }

  private shortenJson(root: Record<string, unknown>, reservedChars: number): string {
    const budget = MAX_TOOL_OUTPUT_CHARS - reservedChars;
    const doc = root;
    this.noteTruncation(doc);

    // Collect every nextCursor path before we start mutating; these must survive.
    const cursors: { path: (string | number)[]; value: unknown }[] = [];
    this.collectNextCursors(doc, [], cursors, new Set());

    let serialized = JSON.stringify(doc);
    if (serialized.length <= budget) return serialized;

    // Shorten long strings, longest first. Skip cursor paths.
    const cursorPaths = new Set(cursors.map((c) => c.path.join('\u0000')));
    const strings = this.collectStrings(doc, [], [], new Set());
    strings.sort((a, b) => b.value.length - a.value.length);
    for (const entry of strings) {
      if (serialized.length <= budget) break;
      if (cursorPaths.has(entry.path.join('\u0000'))) continue;
      const over = serialized.length - budget;
      const target = Math.max(0, entry.value.length - over - 32); // margin for JSON escaping
      if (target >= entry.value.length) continue;
      const shortened = entry.value.slice(0, target);
      this.setAt(doc, entry.path, shortened);
      if (target === 0 && entry.parent && entry.key !== undefined) this.truncateMarker(entry.parent, entry.key);
      serialized = JSON.stringify(doc);
    }

    // If still over budget, drop the largest non-cursor string fields entirely.
    if (serialized.length > budget) {
      const remaining = this.collectStrings(doc, [], [], new Set())
        .filter((s) => !cursorPaths.has(s.path.join('\u0000')))
        .sort((a, b) => b.value.length - a.value.length);
      for (const entry of remaining) {
        if (serialized.length <= budget) break;
        if (entry.parent && entry.key !== undefined) this.truncateMarker(entry.parent, entry.key);
        serialized = JSON.stringify(doc);
      }
    }

    // If somehow still too large, clip remaining arrays (but never cursor-bearing ones).
    if (serialized.length > budget) {
      serialized = this.clipArrays(doc, serialized, cursorPaths, budget);
    }

    // Final safety net: if we still exceed budget, drop non-essential top-level keys
    // (never cursors), then, if absolutely required, drop leaf strings last.
    if (serialized.length > budget) {
      for (const key of Object.keys(doc)) {
        if (serialized.length <= budget) break;
        if (key === 'nextCursor' || key === 'truncatedFields') continue;
        if (this.isCursorValue(doc[key])) continue;
        delete doc[key];
        serialized = this.addTruncatedField(doc, key);
      }
    }

    if (serialized.length > budget) {
      // Last resort: guarantee parseable output under budget by keeping only the
      // truncation note and cursors.
      const minimal: Record<string, unknown> = {};
      for (const c of cursors) this.setAt(minimal, c.path, c.value);
      minimal.truncatedFields = this.mergeTruncatedFields(minimal.truncatedFields, ['content']);
      this.noteTruncation(minimal);
      serialized = JSON.stringify(minimal);
    }

    return serialized;
  }

  private isCursorValue(value: unknown): boolean {
    if (!value || typeof value !== 'object' || Array.isArray(value)) return false;
    const obj = value as Record<string, unknown>;
    return typeof obj.nextCursor === 'string';
  }

  private addTruncatedField(doc: Record<string, unknown>, key: string): string {
    doc.truncatedFields = this.mergeTruncatedFields(doc.truncatedFields, [key]);
    return JSON.stringify(doc);
  }

  private truncateMarker(parent: Record<string, unknown>, key: string): void {
    const opts = parent as Record<string, unknown> & { truncatedFields?: string[] };
    opts.truncatedFields = this.mergeTruncatedFields(opts.truncatedFields, [key]);
  }

  private mergeTruncatedFields(existing: unknown, add: string[]): string[] {
    const base = Array.isArray(existing) ? (existing as unknown[]).filter((x): x is string => typeof x === 'string') : [];
    const set = new Set(base);
    for (const entry of add) set.add(entry);
    return [...set];
  }

  private noteTruncation(doc: Record<string, unknown>): void {
    const existing = doc.truncatedFields;
    const fields = this.mergeTruncatedFields(existing, []);
    if (!fields.includes(TRUNCATION_NOTE)) fields.push(TRUNCATION_NOTE);
    doc.truncatedFields = fields;
  }

  private collectNextCursors(
    node: unknown,
    path: (string | number)[],
    out: { path: (string | number)[]; value: unknown }[],
    seen: Set<unknown>,
  ): void {
    if (!node || typeof node !== 'object') return;
    if (seen.has(node)) return;
    seen.add(node);

    if (Array.isArray(node)) {
      node.forEach((child, i) => this.collectNextCursors(child, [...path, i], out, seen));
      return;
    }
    const obj = node as Record<string, unknown>;
    if (typeof obj.nextCursor === 'string') {
      out.push({ path: [...path, 'nextCursor'], value: obj.nextCursor });
    }
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'nextCursor') continue;
      this.collectNextCursors(v, [...path, k], out, seen);
    }
  }

  private collectStrings(
    node: unknown,
    path: (string | number)[],
    out: {
      path: (string | number)[];
      value: string;
      parent?: Record<string, unknown>;
      key?: string;
    }[],
    seen: Set<unknown>,
  ): typeof out {
    if (!node || typeof node !== 'object') return out;
    if (seen.has(node)) return out;
    seen.add(node);

    if (Array.isArray(node)) {
      node.forEach((child, i) => this.collectStrings(child, [...path, i], out, seen));
      return out;
    }
    const obj = node as Record<string, unknown>;
    for (const [k, v] of Object.entries(obj)) {
      if (k === 'truncatedFields') continue;
      if (typeof v === 'string') {
        out.push({ path: [...path, k], value: v, parent: obj, key: k });
      } else {
        this.collectStrings(v, [...path, k], out, seen);
      }
    }
    return out;
  }

  private setAt(root: unknown, path: (string | number)[], value: unknown): void {
    if (path.length === 0) return;
    let node = root as Record<string | number, unknown>;
    for (let i = 0; i < path.length - 1; i++) {
      const next = node[path[i]];
      if (!next || typeof next !== 'object') return;
      node = next as Record<string | number, unknown>;
    }
    node[path[path.length - 1]] = value;
  }

  private clipArrays(
    doc: Record<string, unknown>,
    serialized: string,
    cursorPaths: Set<string>,
    budget: number,
  ): string {
    const arrays: { path: (string | number)[]; arr: unknown[] }[] = [];
    const walk = (node: unknown, path: (string | number)[]) => {
      if (!node || typeof node !== 'object') return;
      if (Array.isArray(node)) {
        if (!node.some((_, i) => cursorPaths.has([...path, i, 'nextCursor'].join('\u0000')))) {
          arrays.push({ path, arr: node });
        }
        node.forEach((child, i) => walk(child, [...path, i]));
        return;
      }
      for (const [k, v] of Object.entries(node as Record<string, unknown>)) walk(v, [...path, k]);
    };
    walk(doc, []);

    let out = serialized;
    for (const { path, arr } of arrays) {
      if (out.length <= budget) break;
      while (arr.length > 0 && out.length > budget) {
        arr.pop();
        out = JSON.stringify(doc);
      }
    }
    return out;
  }
}
