import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { COPILOT_INSTRUCTIONS, IssueReport, issueMarker, issuePayload } from './github-issue-policy';

export class GithubRequestError extends Error {
  constructor(readonly status: number) {
    super(`GitHub request failed (${status})`);
  }
}

type GithubIssue = { number: number; html_url: string; body?: string; assignees?: { login: string }[]; pull_request?: unknown };

@Injectable()
export class GithubIssuesClient {
  constructor(private readonly config: ConfigService) {}

  get enabled(): boolean {
    return this.config.get<string>('CMS_GITHUB_ENABLED') === 'true';
  }

  get copilotEnabled(): boolean {
    return this.config.get<string>('CMS_COPILOT_ENABLED') === 'true';
  }

  get repository(): string {
    const repository = this.config.get<string>('CMS_GITHUB_REPOSITORY') || '';
    if (!/^[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+$/.test(repository)) {
      throw new Error('CMS_GITHUB_REPOSITORY must be owner/repository');
    }
    return repository;
  }

  validateConfiguration(): void {
    void this.repository;
    if (!this.config.get<string>('CMS_GITHUB_TOKEN')) throw new Error('CMS_GITHUB_TOKEN is missing');
  }

  private async request<T>(path: string, method = 'GET', body?: unknown, copilot = false): Promise<T> {
    const token = this.config.get<string>(copilot ? 'CMS_COPILOT_TOKEN' : 'CMS_GITHUB_TOKEN');
    if (!token) throw new Error(copilot ? 'CMS_COPILOT_TOKEN is missing' : 'CMS_GITHUB_TOKEN is missing');
    const response = await fetch(`https://api.github.com/repos/${this.repository}/${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'Content-Type': 'application/json',
      },
      body: body === undefined ? undefined : JSON.stringify(body),
      signal: AbortSignal.timeout(15000),
      redirect: 'error',
    });
    // Response bodies can include submitted content. Never log or persist them as errors.
    if (!response.ok) throw new GithubRequestError(response.status);
    return response.json() as Promise<T>;
  }

  async findIssue(id: string, createdAt: Date): Promise<GithubIssue | undefined> {
    // Use the issue listing rather than the asynchronously indexed search API.
    const since = encodeURIComponent(new Date(createdAt.getTime() - 60000).toISOString());
    for (let page = 1; page <= 10; page++) {
      const issues = await this.request<GithubIssue[]>(`issues?state=all&since=${since}&per_page=100&page=${page}`);
      const match = issues.find(issue => !issue.pull_request && issue.body?.includes(issueMarker(id)));
      if (match) return match;
      if (issues.length < 100) return undefined;
    }
    // Do not create when reconciliation cannot examine every matching issue.
    throw new Error('GitHub reconciliation exceeded 1000 issues; maintainer review required');
  }

  async createIssue(report: IssueReport): Promise<GithubIssue> {
    const issue = await this.request<GithubIssue>('issues', 'POST', issuePayload(report));
    if (!Number.isSafeInteger(issue.number) || issue.number <= 0) throw new Error('Invalid GitHub issue response');
    return issue;
  }

  async assignCopilot(number: number): Promise<void> {
    const issue = await this.request<GithubIssue>(`issues/${number}`);
    if (issue.assignees?.some(actor => actor.login === 'copilot-swe-agent[bot]')) return;
    const assigned = await this.request<GithubIssue>(`issues/${number}/assignees`, 'POST', {
      assignees: ['copilot-swe-agent[bot]'],
      agent_assignment: {
        target_repo: this.repository,
        base_branch: this.config.get<string>('CMS_COPILOT_BASE_BRANCH') || 'main',
        custom_instructions: COPILOT_INSTRUCTIONS,
      },
    }, true);
    if (!assigned.assignees?.some(actor => actor.login === 'copilot-swe-agent[bot]')) {
      throw new Error('GitHub did not confirm Copilot assignment');
    }
  }
}
