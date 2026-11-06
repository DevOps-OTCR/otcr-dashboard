import { Injectable } from '@nestjs/common';
import { z } from 'zod';
import { AgentTool, ToolContext } from './tool.types';

const input = z.object({}).describe('No arguments: the current project and workstream come from the chat.');

/**
 * MOCK CMS tool for the Week 1 prototype. Returns fixed sample data so the agent
 * loop can be demonstrated before Group 2's read-only MCP tools exist. It reads
 * the project/workstream from the request context (never from model input),
 * which is the pattern the real tools must follow. Replace on integration.
 */
@Injectable()
export class MockWorkstreamTool implements AgentTool<typeof input> {
  readonly name = 'get_workstream_summary';
  readonly description =
    'Get the current workstream for this chat: goals, client question, deliverables, owners and due dates. ' +
    'Currently returns MOCK sample data; tell the user it is placeholder data.';
  readonly input = input;

  label() {
    return 'Reading the workstream (mock data)';
  }

  async run(_input: z.infer<typeof input>, ctx: ToolContext) {
    const summary = {
      mock: true,
      notice: 'Sample data for testing OTCR Bot. Not a real CMS record.',
      projectId: ctx.projectId,
      workstreamId: ctx.sprintId ?? 'sample-week-3',
      workstream: 'Week 3: Market sizing and competitor scan',
      clientQuestion: 'Should the client enter the Midwest market for refurbished campus e-bikes?',
      goals: [
        'Estimate the serviceable market for refurbished e-bikes at Big Ten campuses',
        'Profile three to five direct competitors and their pricing',
        'Recommend whether to run a pilot at one campus',
      ],
      deliverables: [
        { title: 'Market sizing whitepaper section', type: 'whitepaper', owner: 'Consultant A', due: 'Friday 5 PM', status: 'in progress' },
        { title: 'Competitor landscape slides (3 slides)', type: 'slides', owner: 'Consultant B', due: 'Friday 5 PM', status: 'not started' },
      ],
      lastClientFeedback: 'Client wants bottom-up numbers, not only top-down industry reports.',
    };
    return { content: JSON.stringify(summary, null, 2), note: 'Mock data' };
  }
}
