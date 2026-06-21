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
};
