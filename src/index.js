import { parseEmail } from './parseEmail.js';
import { createIssue } from './createIssue.js';
import { config } from './config.js';

export default {
  async email(message, env, ctx) {
    try {
      const rawBuffer = await new Response(message.raw).arrayBuffer();
      const { title, body } = await parseEmail(rawBuffer, { hideSender: config.hideSender });
      const issueUrl = await createIssue(title, body, env);
      console.log(`Created issue: ${issueUrl}`);
    } catch (err) {
      console.error('Failed to create issue:', err);
      message.setReject('Internal error');
    }
  },

  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (request.method !== 'POST' || url.pathname !== '/issues') {
      return new Response('Not Found', { status: 404 });
    }

    const authHeader = request.headers.get('Authorization') ?? '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!env.WORKER_API_SECRET || token !== env.WORKER_API_SECRET) {
      return new Response(JSON.stringify({ error: 'Unauthorized' }), {
        status: 401,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let payload;
    try {
      payload = await request.json();
    } catch {
      return new Response(JSON.stringify({ error: 'Invalid JSON' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    const { title, body, name, email } = payload;
    if (!title || typeof title !== 'string') {
      return new Response(JSON.stringify({ error: '`title` is required' }), {
        status: 400,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    let issueBody = (body && typeof body === 'string') ? body : '';
    if (name || email) {
      const parts = [name, email].filter(Boolean).join(' — ');
      issueBody += `\n\n---\n_Submitted by: ${parts}_`;
    }

    try {
      const issueUrl = await createIssue(title, issueBody, env);
      console.log(`Created issue via HTTP: ${issueUrl}`);
      return new Response(JSON.stringify({ issueUrl }), {
        status: 201,
        headers: { 'Content-Type': 'application/json' },
      });
    } catch (err) {
      console.error('Failed to create issue via HTTP:', err);
      return new Response(JSON.stringify({ error: 'Failed to create issue' }), {
        status: 500,
        headers: { 'Content-Type': 'application/json' },
      });
    }
  },
};
