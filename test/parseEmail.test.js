import { describe, expect, it } from 'vitest';
import { parseEmail } from '../src/parseEmail.js';

function rawEmail({ subject = 'Test subject', from = 'sender@example.com', text = 'Hello world', contentType = 'text/plain' } = {}) {
  const body =
    contentType === 'text/html'
      ? `<p>${text}</p>`
      : text;

  return new TextEncoder().encode(
    `From: ${from}\r\n` +
      `To: recipient@example.com\r\n` +
      `Subject: ${subject}\r\n` +
      `Content-Type: ${contentType}; charset=utf-8\r\n` +
      `\r\n` +
      `${body}\r\n`
  ).buffer;
}

describe('parseEmail', () => {
  it('extracts subject and plain text body', async () => {
    const { title, body } = await parseEmail(rawEmail({ subject: 'Hello', text: 'Body text' }));
    expect(title).toBe('Hello');
    expect(body).toContain('Body text');
  });

  it('falls back to "(no subject)" when subject missing', async () => {
    const raw = new TextEncoder().encode(
      'From: sender@example.com\r\nTo: recipient@example.com\r\nContent-Type: text/plain\r\n\r\nNo subject here\r\n'
    ).buffer;
    const { title } = await parseEmail(raw);
    expect(title).toBe('(no subject)');
  });

  it('strips HTML tags when only an HTML body is present', async () => {
    const { body } = await parseEmail(rawEmail({ contentType: 'text/html', text: 'Rich content' }));
    expect(body).toContain('Rich content');
    expect(body).not.toContain('<p>');
  });

  it('appends sender address when hideSender is false', async () => {
    const { body } = await parseEmail(rawEmail({ from: 'someone@example.com' }), { hideSender: false });
    expect(body).toContain('_From: someone@example.com_');
  });

  it('omits sender address when hideSender is true', async () => {
    const { body } = await parseEmail(rawEmail({ from: 'someone@example.com' }), { hideSender: true });
    expect(body).not.toContain('someone@example.com');
  });
});
