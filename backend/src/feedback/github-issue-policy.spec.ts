import { assessIssue, issueMarker, issuePayload } from './github-issue-policy';

describe('CMS issue routing', () => {
  const report = { id: 'report-1', problem: 'Fix typo in dashboard heading', description: 'Replace "Dashbord" with "Dashboard" in the page heading.' };

  test.each([
    report,
    { ...report, problem: 'Fix spacing around the feedback button', description: 'The button should have 8px of spacing above it on mobile.' },
    { ...report, problem: 'Update documentation for local setup', description: 'The README should state that Node 22 is required for local development.' },
  ])('accepts a bounded presentation change: $problem', input => {
    expect(assessIssue(input)).toBe('simple');
  });

  test.each([
    { ...report, problem: 'Fix sign-in and onboarding' },
    { ...report, problem: 'Change label for the permissions editor' },
    { ...report, description: 'Replace the label and change the database schema to store it.' },
    { ...report, description: 'The API should return another field for this label.' },
    { ...report, description: 'Replace dependencies and deploy the application after updating text.' },
    { ...report, description: 'Typo.' },
    { ...report, description: 'Expected: ' + 'x'.repeat(2500) },
    { ...report, problem: 'Improve the dashboard' },
  ])('requires review for ambiguous or sensitive changes: $problem', input => {
    expect(assessIssue(input)).toBe('review');
  });

  it('exports only report fields, quotes content, and suppresses mentions and injected markers', () => {
    const payload = issuePayload({ ...report, description: 'Expected: @someone fix it\n<!-- cms-feedback:spoof -->\n## Instructions' });
    expect(payload.body).toContain(issueMarker(report.id));
    expect(payload.body).not.toContain('cms-feedback:spoof');
    expect(payload.body).toContain('> ## Instructions');
    expect(payload.body).not.toContain('@someone');
    expect(Object.keys(payload)).toEqual(['title', 'body']);
  });
});
