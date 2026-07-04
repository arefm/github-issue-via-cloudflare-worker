import { createExecutionContext, env, waitOnExecutionContext } from 'cloudflare:test';
import { afterEach, describe, expect, it, vi } from 'vitest';
import worker from '../src/index.js';

afterEach(() => {
  vi.unstubAllGlobals();
});

function rawEmail({ subject = 'Ad enquiry', from = 'buyer@example.com', text = 'I would like to advertise' } = {}) {
  return (
    `From: ${from}\r\n` +
    `To: ads@example.com\r\n` +
    `Subject: ${subject}\r\n` +
    `Content-Type: text/plain; charset=utf-8\r\n` +
    `\r\n` +
    `${text}\r\n`
  );
}

function makeMessage(overrides = {}) {
  return {
    raw: rawEmail(overrides.email),
    setReject: vi.fn(),
    ...overrides,
  };
}

describe('email handler', () => {
  it('parses the incoming email and creates a GitHub issue', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ html_url: 'https://github.com/owner/repo/issues/42' }), { status: 201 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const message = makeMessage();
    const ctx = createExecutionContext();

    await worker.email(message, { ...env, GITHUB_TOKEN: 'token' }, ctx);
    await waitOnExecutionContext(ctx);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.title).toBe('Ad enquiry');
    expect(payload.body).toContain('I would like to advertise');
    expect(message.setReject).not.toHaveBeenCalled();
  });

  it('routes to a per-address GitHub config when the recipient matches GITHUB_ROUTES', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ html_url: 'https://github.com/routed-owner/routed-repo/issues/1' }), { status: 201 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const message = makeMessage({ to: 'sales@example.com' });
    const ctx = createExecutionContext();

    const routedEnv = {
      ...env,
      GITHUB_TOKEN: 'token',
      GITHUB_OWNER: 'default-owner',
      GITHUB_REPO: 'default-repo',
      GITHUB_ROUTES: JSON.stringify({
        'sales@example.com': { owner: 'routed-owner', repo: 'routed-repo', labels: ['sales'], assignee: 'sales-bot' },
      }),
    };

    await worker.email(message, routedEnv, ctx);
    await waitOnExecutionContext(ctx);

    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [requestUrl, requestInit] = fetchMock.mock.calls[0];
    expect(requestUrl).toBe('https://api.github.com/repos/routed-owner/routed-repo/issues');
    const payload = JSON.parse(requestInit.body);
    expect(payload.labels).toEqual(['sales']);
    expect(payload.assignees).toEqual(['sales-bot']);
  });

  it('rejects the message when issue creation fails', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('boom', { status: 500 })));

    const message = makeMessage();
    const ctx = createExecutionContext();

    await worker.email(message, { ...env, GITHUB_TOKEN: 'token' }, ctx);
    await waitOnExecutionContext(ctx);

    expect(message.setReject).toHaveBeenCalledWith('Internal error');
  });
});

describe('fetch handler', () => {
  const secret = 'test-secret';

  it('returns 404 for non-matching routes', async () => {
    const ctx = createExecutionContext();
    const response = await worker.fetch(new Request('https://worker.example/other'), { ...env, WORKER_API_SECRET: secret }, ctx);
    await waitOnExecutionContext(ctx);
    expect(response.status).toBe(404);
  });

  it('rejects requests without a valid bearer token', async () => {
    const ctx = createExecutionContext();
    const request = new Request('https://worker.example/issues', {
      method: 'POST',
      headers: { Authorization: 'Bearer wrong', 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'x' }),
    });

    const response = await worker.fetch(request, { ...env, WORKER_API_SECRET: secret }, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(401);
  });

  it('rejects requests when `title` is missing', async () => {
    const ctx = createExecutionContext();
    const request = new Request('https://worker.example/issues', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ body: 'no title here' }),
    });

    const response = await worker.fetch(request, { ...env, WORKER_API_SECRET: secret }, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(400);
    const json = await response.json();
    expect(json.error).toMatch(/title/);
  });

  it('creates an issue and appends submitter info to the body', async () => {
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ html_url: 'https://github.com/owner/repo/issues/7' }), { status: 201 })
    );
    vi.stubGlobal('fetch', fetchMock);

    const ctx = createExecutionContext();
    const request = new Request('https://worker.example/issues', {
      method: 'POST',
      headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: 'New ad', body: 'Details', name: 'Jane', email: 'jane@example.com' }),
    });

    const response = await worker.fetch(request, { ...env, WORKER_API_SECRET: secret, GITHUB_TOKEN: 'token' }, ctx);
    await waitOnExecutionContext(ctx);

    expect(response.status).toBe(201);
    const json = await response.json();
    expect(json.issueUrl).toBe('https://github.com/owner/repo/issues/7');

    const payload = JSON.parse(fetchMock.mock.calls[0][1].body);
    expect(payload.body).toContain('Details');
    expect(payload.body).toContain('Jane — jane@example.com');
  });
});
