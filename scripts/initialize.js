import fs from 'fs';
import path from 'path';
import readline from 'readline/promises';
import { stdin as input, stdout as output } from 'process';
import { execSync } from 'child_process';
import crypto from 'crypto';

function isYes(answer) {
  return answer.trim().toLowerCase() === 'yes' || answer.trim().toLowerCase() === 'y';
}

function parseLabelsInput(labelsInput, fallback) {
  const trimmed = labelsInput.trim();
  if (!trimmed) return fallback;
  if (trimmed.startsWith('[')) {
    try {
      return JSON.parse(trimmed);
    } catch {
      return fallback;
    }
  }
  return trimmed.split(',').map(l => l.trim()).filter(Boolean);
}

async function main() {
  if (process.env.CI) {
    console.log('CI environment detected — skipping interactive setup (scripts/initialize.js).');
    return;
  }

  if (!input.isTTY) {
    console.error(
      'Error: this script needs an interactive terminal to prompt for answers.\n' +
      'When run automatically via `npm install` (the postinstall hook), npm does not\n' +
      'connect your terminal\'s stdin to the script, so every prompt would silently\n' +
      'receive a blank answer and wrangler.toml would end up with empty/default values.\n\n' +
      'Run it directly instead:\n' +
      '  node scripts/initialize.js\n'
    );
    process.exit(1);
  }

  const rl = readline.createInterface({ input, output });

  try {
    const wranglerPath = path.resolve('wrangler.toml');
    const examplePath = path.resolve('wrangler.toml.example');
    const packagePath = path.resolve('package.json');
    const devVarsPath = path.resolve('.dev.vars');

    // Check whether the user is logged in to wrangler before asking anything else,
    // since pushing secrets to Cloudflare later in this script depends on it.
    console.log('\nChecking wrangler login status...');
    let isLoggedIn = false;
    try {
      execSync('npx wrangler whoami --json', { stdio: ['ignore', 'pipe', 'pipe'] });
      isLoggedIn = true;
      console.log('You are logged in to wrangler.');
    } catch {
      console.log(
        'You are not logged in to wrangler. Run `npx wrangler login` if you want this script\n' +
        'to be able to push secrets to Cloudflare at the end (optional — everything else works without it).'
      );
    }

    // Check if wrangler.toml already exists
    if (fs.existsSync(wranglerPath)) {
      const overwrite = await rl.question('wrangler.toml already exists. Do you want to overwrite it? (yes/no) [no]: ');
      if (!isYes(overwrite)) {
        console.log('Aborting initialization to prevent overwriting your existing wrangler.toml.');
        process.exit(0);
      }
    }

    // 1. Read package.json name
    if (!fs.existsSync(packagePath)) {
      console.error('Error: package.json not found!');
      process.exit(1);
    }
    const packageJson = JSON.parse(fs.readFileSync(packagePath, 'utf8'));
    const projectName = packageJson.name || 'cf-worker-gh-issue';

    // 2. Load wrangler.toml.example content
    if (!fs.existsSync(examplePath)) {
      console.error('Error: wrangler.toml.example not found!');
      process.exit(1);
    }
    let tomlContent = fs.readFileSync(examplePath, 'utf8');

    // 3. Prompt for required secrets: GITHUB_TOKEN
    console.log('\n--- REQUIRED SECRETS ---');
    console.log('--- GITHUB_TOKEN ---');
    console.log('Please generate a fine-grained GitHub personal access token:');
    console.log('Link: https://github.com/settings/personal-access-tokens');
    console.log('Required permissions: Repository permissions -> Issues: Read and write\n');
    const githubToken = await rl.question('Enter GITHUB_TOKEN: ');

    // 4. Prompt for WORKER_API_SECRET
    console.log('\n--- WORKER_API_SECRET ---');
    const genAuto = await rl.question('Do you want to generate WORKER_API_SECRET automatically? (yes/no) [yes]: ');
    let apiSecret = '';
    if (genAuto.trim() && !isYes(genAuto)) {
      apiSecret = await rl.question('Enter your WORKER_API_SECRET: ');
    } else {
      console.log('Generating secret using npm run gen_secretkey...');
      try {
        const stdout = execSync('npm run -s gen_secretkey', { encoding: 'utf8' });
        apiSecret = stdout.split('\n')[0].trim();
        console.log(`Generated secret: ${apiSecret}`);
      } catch {
        console.error('Failed to run npm run gen_secretkey. Falling back to internal generator...');
        apiSecret = crypto.randomBytes(32).toString('hex');
        console.log(`Generated secret: ${apiSecret}`);
      }
    }

    // 5. Prompt for Github Repo Settings (default / fallback config)
    console.log('\n--- GITHUB REPOSITORY CONFIGURATION (default) ---');
    console.log('This is the default GitHub target, used by the POST /issues endpoint and by any\n' +
      'inbound email address that has no more specific override (see email routing below).\n');
    const githubOwner = await rl.question('Enter GITHUB_OWNER (GitHub username or org): ');
    const githubRepo = await rl.question('Enter GITHUB_REPO: ');

    const labelsInput = await rl.question('Enter GITHUB_LABELS (comma-separated or JSON array) [[]]: ');
    const githubLabels = parseLabelsInput(labelsInput, []);

    const githubAssignee = await rl.question('Enter GITHUB_ASSIGNEE (optional): ');

    const hideSenderInput = await rl.question('Do you want to hide the sender email address in issues? (yes/no) [no]: ');
    const hideSender = isYes(hideSenderInput) ? 'true' : 'false';

    // 6. Configure send_email bindings / per-address GitHub routing
    console.log('\n--- EMAIL ROUTING (send_email bindings) ---');
    console.log('Each send_email binding can either just carry a name, or be restricted to specific\n' +
      'destination address(es). If you restrict it to address(es), you can point that address\n' +
      '(or group of addresses) at a different GitHub repo/labels/assignee than the default above.\n');

    const bindings = [];
    const githubRoutes = {};
    let bindingIndex = 1;
    let addMoreBindings = true;

    while (addMoreBindings) {
      console.log(`\n-- send_email binding #${bindingIndex} --`);
      const defaultBindingName = bindingIndex === 1 ? 'SEND_EMAIL' : `SEND_EMAIL${bindingIndex}`;
      const bindingNameInput = await rl.question(`Binding name [${defaultBindingName}]: `);
      const bindingName = bindingNameInput.trim() || defaultBindingName;

      const restrictInput = await rl.question(
        'Restrict this binding to specific destination address(es)? (yes/no) [no]: '
      );

      let destinationAddress = '';
      let allowedAddresses = [];

      if (isYes(restrictInput)) {
        const addressesInput = await rl.question(
          'Enter destination address(es) for this binding (comma-separated for multiple): '
        );
        const addresses = addressesInput.split(',').map(a => a.trim()).filter(Boolean);

        if (addresses.length === 1) {
          destinationAddress = addresses[0];
        } else if (addresses.length > 1) {
          allowedAddresses = addresses;
        }

        if (addresses.length > 0) {
          console.log(`\nGitHub config for binding "${bindingName}" (${addresses.join(', ')})`);
          console.log('Press enter on any field to reuse the default GitHub configuration above.');

          const ownerInput = await rl.question(`  GITHUB_OWNER [${githubOwner}]: `);
          const owner = ownerInput.trim() || githubOwner;

          const repoInput = await rl.question(`  GITHUB_REPO [${githubRepo}]: `);
          const repo = repoInput.trim() || githubRepo;

          const bindingLabelsInput = await rl.question(
            `  GITHUB_LABELS (comma-separated or JSON array) [${JSON.stringify(githubLabels)}]: `
          );
          const labels = parseLabelsInput(bindingLabelsInput, githubLabels);

          const assigneeInput = await rl.question(`  GITHUB_ASSIGNEE [${githubAssignee}]: `);
          const assignee = assigneeInput.trim() || githubAssignee;

          const routeConfig = { owner, repo, labels, assignee };
          for (const address of addresses) {
            githubRoutes[address.toLowerCase()] = routeConfig;
          }
        }
      }

      bindings.push({ name: bindingName, destinationAddress, allowedAddresses });

      const moreInput = await rl.question('\nAdd another send_email binding? (yes/no) [no]: ');
      addMoreBindings = isYes(moreInput);
      bindingIndex++;
    }

    // 7. Optional custom domain route
    console.log('\n--- CUSTOM DOMAIN (optional) ---');
    console.log('Custom Domains take a bare hostname — no wildcards (*) or paths (Cloudflare rejects those).');
    const customDomainInput = await rl.question(
      'Enter a custom domain for this worker (e.g. mail.example.com), leave blank to skip: '
    );
    const customDomainPattern = customDomainInput.trim();

    // 8. Observability (Workers Logs / Traces)
    console.log('\n--- OBSERVABILITY (optional) ---');
    console.log('Workers Logs record each invocation (viewable via `wrangler tail` and the dashboard).\n' +
      'Traces add distributed request-tracing detail on top of that.\n');
    const observabilityInput = await rl.question('Enable Workers Logs and Traces? (yes/no) [yes]: ');
    let observabilityToml = '';
    if (!observabilityInput.trim() || isYes(observabilityInput)) {
      const samplingInput = await rl.question('Sampling rate, 0.0-1.0 (1 = 100% of requests) [1]: ');
      const parsedRate = parseFloat(samplingInput.trim());
      const samplingRate = Number.isFinite(parsedRate) && parsedRate >= 0 && parsedRate <= 1 ? parsedRate : 1;

      observabilityToml =
        `\n[observability]\nenabled = true\nhead_sampling_rate = ${samplingRate}\n\n` +
        `[observability.logs]\nenabled = true\nhead_sampling_rate = ${samplingRate}\n\n` +
        `[observability.traces]\nenabled = true\nhead_sampling_rate = ${samplingRate}\n`;
    }

    // 9. Build wrangler.toml content
    const secretsSectionMatch = tomlContent.match(/\[secrets\]\nrequired = \[[^\]]*\]\n/);
    if (!secretsSectionMatch) {
      console.error('Error: could not locate [secrets] section in wrangler.toml.example!');
      process.exit(1);
    }
    let header = tomlContent.slice(0, secretsSectionMatch.index + secretsSectionMatch[0].length);

    header = header.replace(/name\s*=\s*['"][^'"]*['"]/, `name = "${projectName}"`);
    header = header.replace(/GITHUB_OWNER\s*=\s*['"][^'"]*['"]/, `GITHUB_OWNER = "${githubOwner}"`);
    header = header.replace(/GITHUB_REPO\s*=\s*['"][^'"]*['"]/, `GITHUB_REPO = "${githubRepo}"`);
    header = header.replace(/GITHUB_LABELS\s*=\s*\[[^\]]*\]/, `GITHUB_LABELS = ${JSON.stringify(githubLabels)}`);
    header = header.replace(/GITHUB_ASSIGNEE\s*=\s*['"][^'"]*['"]/, `GITHUB_ASSIGNEE = "${githubAssignee}"`);
    header = header.replace(/GITHUB_ROUTES\s*=\s*'[^']*'/, `GITHUB_ROUTES = '${JSON.stringify(githubRoutes)}'`);
    header = header.replace(/workers_dev\s*=\s*(true|false)/, `workers_dev = ${customDomainPattern ? 'false' : 'true'}`);

    let sendEmailToml = '';
    for (const binding of bindings) {
      sendEmailToml += `\n[[send_email]]\nname = "${binding.name}"\n`;
      if (binding.destinationAddress) {
        sendEmailToml += `destination_address = "${binding.destinationAddress}"\n`;
      } else if (binding.allowedAddresses.length > 0) {
        sendEmailToml += `allowed_destination_addresses = [ ${binding.allowedAddresses
          .map(a => `"${a}"`)
          .join(', ')} ]\n`;
      }
    }

    let routesToml = '';
    if (customDomainPattern) {
      routesToml = `\n[[routes]]\npattern = "${customDomainPattern}"\ncustom_domain = true\n`;
    }

    tomlContent = header + observabilityToml + sendEmailToml + routesToml;

    // 10. Write wrangler.toml
    fs.writeFileSync(wranglerPath, tomlContent, 'utf8');
    console.log('\nSUCCESS: wrangler.toml has been created and configured successfully!');

    // 11. Create .dev.vars if not exists
    if (!fs.existsSync(devVarsPath)) {
      const devVarsContent = [
        `GITHUB_TOKEN=${githubToken}`,
        `WORKER_API_SECRET=${apiSecret}`,
        `GITHUB_OWNER=${githubOwner}`,
        `GITHUB_REPO=${githubRepo}`,
        `GITHUB_LABELS=${JSON.stringify(githubLabels)}`,
        `GITHUB_ASSIGNEE=${githubAssignee}`,
        `GITHUB_ROUTES=${JSON.stringify(githubRoutes)}`,
        `HIDE_SENDER=${hideSender}`
      ].join('\n') + '\n';
      fs.writeFileSync(devVarsPath, devVarsContent, 'utf8');
      console.log('SUCCESS: .dev.vars has been created and configured successfully!');
    } else {
      console.log('.dev.vars already exists. Skipping creation.');
    }

    // 12. Optionally push secrets to Cloudflare now
    console.log('\n--- PUSH SECRETS TO CLOUDFLARE (optional) ---');
    if (!isLoggedIn) {
      console.log(
        'Skipping: you are not logged in to wrangler. Run `npx wrangler login`, then\n' +
        '`npx wrangler secret put GITHUB_TOKEN` and `npx wrangler secret put WORKER_API_SECRET`\n' +
        'manually whenever you are ready to deploy.'
      );
    } else {
      const pushSecretsInput = await rl.question(
        'Also set GITHUB_TOKEN and WORKER_API_SECRET as live Cloudflare secrets now via `wrangler secret put`? (yes/no) [no]: '
      );
      if (isYes(pushSecretsInput)) {
        try {
          execSync('npx wrangler secret put GITHUB_TOKEN', { input: githubToken, stdio: ['pipe', 'inherit', 'inherit'] });
          execSync('npx wrangler secret put WORKER_API_SECRET', { input: apiSecret, stdio: ['pipe', 'inherit', 'inherit'] });
          console.log('SUCCESS: secrets pushed to Cloudflare.');
        } catch (error) {
          console.error('Failed to push secrets to Cloudflare:', error.message);
        }
      }
    }

  } catch (error) {
    console.error('An error occurred during initialization:', error);
  } finally {
    rl.close();
  }
}

main();
