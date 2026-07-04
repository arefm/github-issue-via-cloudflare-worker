import { env } from 'cloudflare:test';
import { describe, expect, it } from 'vitest';
import { createIssue } from '../src/createIssue.js';

const hasRealToken = Boolean(env.GITHUB_TOKEN);

describe.skipIf(!hasRealToken)('createIssue (real GitHub API)', () => {
  it('creates a real issue on the configured repo, then closes it', async () => {
    const url = await createIssue(
      '[integration test] safe to ignore/close',
      `Created by the createIssue integration test on ${new Date().toISOString()}.`,
      env
    );

    expect(url).toMatch(
      new RegExp(`^https://github\\.com/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues/\\d+$`)
    );

    const issueNumber = url.split('/').pop();
    const closeResponse = await fetch(
      `https://api.github.com/repos/${env.GITHUB_OWNER}/${env.GITHUB_REPO}/issues/${issueNumber}`,
      {
        method: 'PATCH',
        headers: {
          Authorization: `Bearer ${env.GITHUB_TOKEN}`,
          Accept: 'application/vnd.github+json',
          'X-GitHub-Api-Version': '2022-11-28',
          'User-Agent': 'github-issue-via-cloudflare-worker',
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ state: 'closed' }),
      }
    );
    expect(closeResponse.ok).toBe(true);
  });
});
