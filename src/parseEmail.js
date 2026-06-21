import PostalMime from 'postal-mime';

export async function parseEmail(rawBuffer, { hideSender } = {}) {
  const email = await PostalMime.parse(rawBuffer);

  const title = email.subject || '(no subject)';

  let body = '';
  if (email.text) {
    body = email.text;
  } else if (email.html) {
    body = email.html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim();
  }

  if (!hideSender && email.from?.address) {
    body += `\n\n---\n_From: ${email.from.address}_`;
  }

  return { title, body };
}
