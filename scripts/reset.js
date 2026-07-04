import fs from 'fs';
import path from 'path';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { execSync } from 'child_process';

function isYes(answer) {
  return answer.trim().toLowerCase() === 'yes' || answer.trim().toLowerCase() === 'y';
}

async function main() {
  const rl = readline.createInterface({ input, output });

  try {
    const wranglerPath = path.resolve('wrangler.toml');

    const wranglerExists = fs.existsSync(wranglerPath);

    if (!wranglerExists) {
      console.log('Nothing to reset: wrangler.toml does not exist.');
      return;
    }

    console.log('This will delete your local configuration:');
    console.log('  - wrangler.toml');

    const confirm = await rl.question('\nAre you sure you want to delete this file? (yes/no) [no]: ');
    if (!isYes(confirm)) {
      console.log('Aborting reset.');
      return;
    }

    fs.unlinkSync(wranglerPath);
    console.log('Deleted wrangler.toml.');

    console.log('\n--- LIVE CLOUDFLARE SECRETS (optional) ---');
    const deleteRemote = await rl.question(
      'Also delete GITHUB_TOKEN and WORKER_API_SECRET from the live Cloudflare Worker via `wrangler secret delete`? (yes/no) [no]: '
    );
    if (isYes(deleteRemote)) {
      console.log('You must be logged in to wrangler (npx wrangler login) for this to succeed.');
      for (const secretName of ['GITHUB_TOKEN', 'WORKER_API_SECRET']) {
        try {
          execSync(`npx wrangler secret delete ${secretName}`, { stdio: 'inherit' });
        } catch (error) {
          console.error(`Failed to delete ${secretName} from Cloudflare:`, error.message);
        }
      }
    }

    console.log('\nSUCCESS: reset complete. .dev.vars was left untouched.');
    console.log('Run `node scripts/initialize.js` (or `npm install`) to reconfigure wrangler.toml.');
  } catch (error) {
    console.error('An error occurred during reset:', error);
  } finally {
    rl.close();
  }
}

main();
