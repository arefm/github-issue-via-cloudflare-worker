import { afterEach, describe, expect, it, vi } from 'vitest';
import { createIssue } from '../src/createIssue.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('createIssue', () => {
  it('POSTs to the configured GitHub repo with title, body, labels and assignee', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ html_url: 'https://github.com/owner/repo/issues/1' }), { status: 201 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const mockEnv = {
      GITHUB_TOKEN: 'secret-token',
      GITHUB_OWNER: 'owner',
      GITHUB_REPO: 'repo',
      GITHUB_LABELS: ['bug', 'help wanted'],
      GITHUB_ASSIGNEE: 'assignee',
    };

    const url = await createIssue('My title', 'My body', mockEnv);

    expect(url).toBe('https://github.com/owner/repo/issues/1');
    expect(fetchMock).toHaveBeenCalledTimes(1);

    const [requestUrl, requestInit] = fetchMock.mock.calls[0];
    expect(requestUrl).toBe('https://api.github.com/repos/owner/repo/issues');
    expect(requestInit.method).toBe('POST');
    expect(requestInit.headers.Authorization).toBe('Bearer secret-token');

    const payload = JSON.parse(requestInit.body);
    expect(payload.title).toBe('My title');
    expect(payload.body).toBe('My body');
    expect(payload.labels).toEqual(['bug', 'help wanted']);
    expect(payload.assignees).toEqual(['assignee']);
  });

  it('throws with the response body when the GitHub API returns an error', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response('rate limited', { status: 403 })
    );
    vi.stubGlobal('fetch', fetchMock);

    await expect(createIssue('title', 'body', { GITHUB_TOKEN: 'x' })).rejects.toThrow(
      /GitHub API error 403: rate limited/
    );
  });
});
