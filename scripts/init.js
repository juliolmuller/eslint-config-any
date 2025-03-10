#!/usr/bin/env node

import figlet from 'figlet';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import prompts from 'prompts';

import packageMeta from '../package.json' with { type: 'json' };

const MIN_COMPATIBLE_VERSION = 22;
const ESLINT_CONFIG_FILE = 'eslint.config';

await printWelcomeMessage();
await checkRuntimeVersion();

const targetDir = await getTargetDir();
const eslintConfigExt = await getEslintConfigExtension();
const setupOptions = await pickConfigOptions();
const templateCode = await getTemplateCode();

await installEslintConfig();
await writeEslintConfigFile();
await notifyUser();

async function printWelcomeMessage() {
  const packageName = packageMeta.name;
  const packageVersion = packageMeta.version;
  const printable = `${packageName} v${packageVersion}`;

  console.info('\n', figlet.textSync(printable), '\n');
}

async function checkRuntimeVersion() {
  const runtimeVersion = process.version;
  const majorVersionString = runtimeVersion.match(/v(\d+)/)[1];
  const majorVersionNumber = majorVersionString;

  if (majorVersionNumber < MIN_COMPATIBLE_VERSION) {
    console.error(
      `Node.js engine must be at least at version ${MIN_COMPATIBLE_VERSION}. Current version is ${runtimeVersion}.`,
    );
    process.exit(1);
  }
}

async function getTargetDir() {
  const targetArg = process.argv[2] || '.';
  const targetDir = path.isAbsolute(targetArg) ? targetArg : path.join(process.cwd(), targetArg);
  const targetDirExists = fs.existsSync(targetDir);

  if (!targetDirExists) {
    console.error(`Directory "${targetDir}" does not exist.`);
    process.exit(1);
  }

  return targetDir;
}

async function getEslintConfigExtension() {
  const targetProjectMetaFile = path.join(targetDir, 'package.json');

  if (!fs.existsSync(targetProjectMetaFile)) {
    console.error(`No "package.json" file found in directory "${targetProjectMetaFile}".`);
    process.exit(1);
  }

  const targetProjectMetaData = fs.readFileSync(targetProjectMetaFile, 'utf8');
  const targetProjectMeta = JSON.parse(targetProjectMetaData);
  const eslintConfigExtension = targetProjectMeta.type === 'module' ? 'js' : 'mjs';

  return eslintConfigExtension;
}

async function pickConfigOptions() {
  return prompts([
    {
      type: 'select',
      name: 'config',
      message: 'Select the environment of your project:',
      choices: [
        { title: 'React', value: 'react' },
        { title: 'Vue 3', value: 'vue' },
        { title: 'Vue 2', value: 'vue2' },
        { title: 'Node project', value: 'node' },
        { title: 'Browser project', value: 'browser' },
        { title: 'Node+Browser project', value: 'sharedNodeAndBrowser' },
      ],
    },
    {
      type: (config) => (/node|browser/i.test(config) ? 'toggle' : null),
      name: 'commonjs',
      message: 'Does your project use CommonJS?',
      active: 'Yes',
      inactive: 'No',
      initial: false,
    },
    {
      type: 'select',
      name: 'testRunner',
      message: 'Select the test runner of your project:',
      choices: [
        { title: '<None>', value: null },
        { title: 'Jest', value: 'jest' },
        { title: 'Vitest', value: 'vitest' },
      ],
    },
  ]);
}

async function getTemplateCode() {
  const thisScriptFile = process.argv[1];
  const thisScriptDir = path.dirname(thisScriptFile);
  const templateFile = path.resolve(thisScriptDir, '../scripts/templates', ESLINT_CONFIG_FILE);
  const rawTemplateCode = fs.readFileSync(templateFile, 'utf8');
  const configsPresets = [setupOptions.config];

  if (setupOptions.commonjs) {
    configsPresets.push('commonjs');
  }

  if (setupOptions.testRunner) {
    configsPresets.push(setupOptions.testRunner);
  }

  const repeatablePattern = /@repeatable(.*)\n/g;
  const repeatableOutput = Array(configsPresets.length).fill('$1\n').join('');
  let templateCode = rawTemplateCode.replace(repeatablePattern, repeatableOutput);

  for (const preset of configsPresets) {
    const configVariablePattern = '{{CONFIGS}}';

    templateCode = templateCode.replace(configVariablePattern, preset);
  }

  return templateCode;
}

async function writeEslintConfigFile() {
  const eslintConfigFile = path.resolve(targetDir, `${ESLINT_CONFIG_FILE}.${eslintConfigExt}`);

  fs.writeFileSync(eslintConfigFile, templateCode, 'utf8');
}

async function installEslintConfig() {
  const packageManagers = [
    {
      name: 'npm',
      command: 'npm install --save-dev',
      lockFiles: ['package-lock.json'],
    },
    {
      name: 'Yarn',
      command: 'yarn add --dev',
      lockFiles: ['yarn.lock'],
    },
    {
      name: 'pnpm',
      command: 'pnpm add --save-dev',
      lockFiles: ['pnpm-lock.yml', 'pnpm-lock.yaml'],
    },
    {
      name: 'bun',
      command: 'bun add --dev',
      lockFiles: ['bun.lock', 'bun.lockb'],
    },
  ];

  const packageManagerByLockFile = getPackageManagerByLockFile(targetDir);
  const packageManagerByUserAgent = getPackageManagerByUserAgent(targetDir);
  const packageManager =
    packageManagerByLockFile ?? packageManagerByUserAgent ?? packageManagers[0];

  const packages = Object.keys(packageMeta.peerDependencies)
    .concat([packageMeta.name])
    .map((pkg) => `${pkg}@latest`)
    .join(' ');

  await new Promise((resolve) => {
    const command = `${packageManager.command} ${packages}`;

    console.info('');

    if (packageManager.name === 'bun') {
      Bun.spawn(command.split(' '), {
        cwd: targetDir,
        onExit: resolve,
        ipc: (data) => console.log(data),
      });
    } else {
      const child = childProcess.spawn(command, { cwd: targetDir });

      child.stdout.setEncoding('utf8');
      child.stdout.on('close', resolve);
      child.stdout.on('data', (data) => console.log(data));
    }
  });

  function getPackageManagerByLockFile(cwd) {
    return packageManagers.find((pm) => {
      return pm.lockFiles.some((lockFile) => fs.existsSync(path.resolve(cwd, lockFile)));
    });
  }

  function getPackageManagerByUserAgent() {
    const userAgent = process.env.npm_config_user_agent;
    const packageManagerName = userAgent?.split('/').at(0);

    return packageManagers.find((pm) => pm.name === packageManagerName);
  }
}

async function notifyUser() {
  const packages = Object.keys(packageMeta.peerDependencies)
    .map((pkg) => `"${pkg}"`)
    .join(', ')
    .concat([` and "${packageMeta.name}"`]);

  console.info('\n');
  console.info('✔️  ESLint config file created successfully.');
  console.info(`✔️  Packages installed: ${packages}.`);
}
