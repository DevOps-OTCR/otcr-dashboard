import { ConfigService } from '@nestjs/config';
import { GithubIssuesClient, GithubRequestError } from './github-issues.client';

describe('GitHub issue client', () => {
  const originalFetch = global.fetch;
  const fetchMock = jest.fn();
  const client = new GithubIssuesClient(new ConfigService({
    CMS_GITHUB_REPOSITORY: 'test/cms', CMS_GITHUB_TOKEN: 'issue-token', CMS_COPILOT_TOKEN: 'user-token',
  }));
  const response = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });

  beforeEach(() => { fetchMock.mockReset(); global.fetch = fetchMock; });
  afterAll(() => { global.fetch = originalFetch; });

  it('reconciles closed issues across pages without using indexed search', async () => {
    fetchMock.mockResolvedValueOnce(response(Array.from({ length: 100 }, () => ({ number: 1, body: '' }))))
      .mockResolvedValueOnce(response([{ number: 2, body: '<!-- cms-feedback:id -->' }]));
    expect((await client.findIssue('id', new Date()))?.number).toBe(2);
    expect(fetchMock.mock.calls[0][0]).toContain('state=all');
    expect(fetchMock.mock.calls[1][0]).toContain('page=2');
  });

  it('does not create an issue if reconciliation exceeds its page bound', async () => {
    fetchMock.mockImplementation(async () => response(Array.from({ length: 100 }, () => ({ number: 1 }))));
    await expect(client.findIssue('missing', new Date())).rejects.toThrow('exceeded 1000');
    expect(fetchMock).toHaveBeenCalledTimes(10);
  });

  it('uses the separate user token and verifies the Copilot assignment', async () => {
    fetchMock.mockResolvedValueOnce(response({ number: 3, assignees: [] }))
      .mockResolvedValueOnce(response({ number: 3, assignees: [{ login: 'copilot-swe-agent[bot]' }] }));
    await client.assignCopilot(3);
    const request = fetchMock.mock.calls[1][1];
    expect(request.headers.Authorization).toBe('Bearer user-token');
    expect(JSON.parse(request.body).agent_assignment.target_repo).toBe('test/cms');
    expect(JSON.parse(request.body).agent_assignment.base_branch).toBe('main');
  });

  it('does not start another Copilot session when assignment already exists', async () => {
    fetchMock.mockResolvedValue(response({ assignees: [{ login: 'copilot-swe-agent[bot]' }] }));
    await client.assignCopilot(3);
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it('fails if GitHub silently omits the requested assignee', async () => {
    fetchMock.mockImplementation(async () => response({ assignees: [] }));
    await expect(client.assignCopilot(3)).rejects.toThrow('did not confirm');
  });

  it('does not include GitHub response bodies in errors', async () => {
    fetchMock.mockResolvedValue(response({ message: 'confidential report text' }, 403));
    await expect(client.findIssue('id', new Date())).rejects.toEqual(new GithubRequestError(403));
  });
});
