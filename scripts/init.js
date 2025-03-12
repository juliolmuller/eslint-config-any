#!/usr/bin/env node

import glob from 'fast-glob';
import figlet from 'figlet';
import childProcess from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import prompts from 'prompts';

import packageMeta from '../package.json' with { type: 'json' };

/**
 * @typedef {Object} Workspace
 * @property {string} name
 * @property {string} dir
 *
 * @typedef {Object} EslintConfigOptions
 * @property {string} config
 * @property {boolean} commonjs
 * @property {string} testRunner
 *
 * @typedef {Object} EslintConfig
 * @property {string} dir
 * @property {string} code
 */

const MIN_NODE_COMPATIBLE_VERSION = 22;
const ROOT_TARGET_PROJECT_NAME = '__PROJECT_ROOT__';
const ESLINT_CONFIG_FILE = 'eslint.config';

printWelcomeMessage();
checkRuntimeVersion();

const targetDir = getTargetDir();
const targetDirWorkspaces = await getTargetDirWorkspaces();
const [targetDirWorkspacesToConfig, targetDirWorkspacesToInstall] =
  await getTargetDirWorkspacesActions();
const targetDirWorkspacesConfigsOptions = await getTargetDirWorkspacesConfigsOptions();
const targetDirWorkspacesConfigs = getTargetDirWorkspacesConfigs();

await writeEslintConfigFile();
await installEslintConfig();
await notifyUser();

/**
 * @returns {void}
 */
function printWelcomeMessage() {
  const packageName = packageMeta.name;
  const packageVersion = packageMeta.version;
  const printable = `${packageName} v${packageVersion}`;

  console.info('\n', figlet.textSync(printable), 'zn');
}

/**
 * @returns {void}
 */
function checkRuntimeVersion() {
  const runtimeVersion = process.version;
  const majorVersionString = runtimeVersion.match(/v(\d+)/)[1];
  const majorVersionNumber = majorVersionString;

  if (majorVersionNumber < MIN_NODE_COMPATIBLE_VERSION) {
    console.error(
      `Node.js engine must be at least at version ${MIN_NODE_COMPATIBLE_VERSION}. Current version is ${runtimeVersion}.`,
    );
    process.exit(1);
  }
}

/**
 * @returns {string}
 */
function getTargetDir() {
  const targetArg = process.argv[2] || '.';
  const targetDir = path.isAbsolute(targetArg) ? targetArg : path.join(process.cwd(), targetArg);
  const targetDirExists = fs.existsSync(targetDir);

  if (!targetDirExists) {
    console.error(`Directory "${targetDir}" does not exist.`);
    process.exit(1);
  }

  return targetDir;
}

/**
 * @param {string} [dir]
 * @param {Object} [options]
 * @param {'exit' | 'throw'} [options.onError]
 * @returns {any}
 *
 * @throws {Error}
 */
function getProjectMeta(dir, { onError = 'throw' } = {}) {
  const projectMetaFile = path.resolve(dir, 'package.json');

  if (!fs.existsSync(projectMetaFile)) {
    const errorMessage = `No "package.json" file found in directory "${dir}".`;

    if (onError === 'throw') {
      throw new Error(errorMessage);
    }

    console.error(errorMessage);
    process.exit(1);
  }

  const projectMetaData = fs.readFileSync(projectMetaFile, 'utf8');
  const projectMeta = JSON.parse(projectMetaData);

  return projectMeta;
}

/**
 * @returns {Promise<Workspace[]>}
 */
async function getTargetDirWorkspaces() {
  const targetProjectMeta = getProjectMeta(targetDir, { onError: 'exit' });
  const projectMetaWorkspaces = targetProjectMeta.workspaces;
  /** @type {Workspace[]} */
  const targetDirWorkspaces = [{ name: ROOT_TARGET_PROJECT_NAME, dir: targetDir }];

  if (!Array.isArray(projectMetaWorkspaces) || !projectMetaWorkspaces.length) {
    return targetDirWorkspaces;
  }

  for (const workspacesPattern of projectMetaWorkspaces) {
    const workspaces = await glob(workspacesPattern, {
      onlyDirectories: true,
      cwd: targetDir,
    });

    for (const workspace of workspaces) {
      const workspaceDor = path.resolve(targetDir, workspace);

      try {
        getProjectMeta(workspaceDor);
      } catch {
        // if no "package.json" found, continue to next iteration
        continue;
      }

      targetDirWorkspaces.push({
        name: workspace,
        dir: workspaceDor,
      });
    }
  }

  return targetDirWorkspaces;
}

/**
 * @returns {[string[], string[]]}
 */
async function getTargetDirWorkspacesActions() {
  const targetProjectMeta = getProjectMeta(targetDir);
  const projectMetaWorkspaces = targetProjectMeta.workspaces;
  const hasWorkspaces = Array.isArray(projectMetaWorkspaces) && projectMetaWorkspaces.length > 0;
  let workspacesToConfig = [ROOT_TARGET_PROJECT_NAME];
  let workspacesToInstall = [ROOT_TARGET_PROJECT_NAME];

  if (hasWorkspaces) {
    const responses = await prompts([
      {
        type: 'toggle',
        name: 'multipleConfigs',
        message:
          'Workspaces detected. Would you like to create different ESlint configurations for each one?',
        active: 'Yes',
        inactive: 'No',
        initial: true,
      },
      {
        type: 'multiselect',
        name: 'workspacesToInstall',
        message: (individualized) =>
          `Select the workspaces you'd like to ${
            individualized ? 'configure' : 'install ESlint and its configurations'
          }:`,
        hint: '- press SPACE to toggle options',
        instructions: false,
        min: 1,
        choices: targetDirWorkspaces.map((workspace) => ({
          title: `/${workspace.name === ROOT_TARGET_PROJECT_NAME ? ' (root)' : workspace.name}`,
          selected: workspace.name !== ROOT_TARGET_PROJECT_NAME,
          value: workspace.dir,
        })),
      },
    ]);

    workspacesToInstall = responses.workspacesToInstall;

    if (responses.multipleConfigs) {
      workspacesToConfig = responses.workspacesToInstall;
    }
  }

  return [workspacesToConfig, workspacesToInstall];
}

/**
 * @returns {Promise<EslintConfigOptions[]>}
 */
async function getTargetDirWorkspacesConfigsOptions() {
  /** @type {EslintConfigOptions[]} */
  const targetDirWorkspacesConfigsOptions = [];

  for (const workspaceDir of targetDirWorkspacesToConfig) {
    console.info(`\nConfiguring ESlint for directory "${workspaceDir}":`);

    const configOptions = await prompts([
      {
        type: 'select',
        name: 'config',
        message: 'Select the environment of the workspace:',
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
        message: 'Does this workspace use CommonJS?',
        active: 'Yes',
        inactive: 'No',
        initial: false,
      },
      {
        type: 'select',
        name: 'testRunner',
        message: 'Select the test runner of the workspace:',
        choices: [
          { title: '<None>', value: null },
          { title: 'Jest', value: 'jest' },
          { title: 'Vitest', value: 'vitest' },
        ],
      },
    ]);

    targetDirWorkspacesConfigsOptions.push(configOptions);
  }

  return targetDirWorkspacesConfigsOptions;
}

/**
 * @returns {EslintConfig[]}
 */
function getTargetDirWorkspacesConfigs() {
  const thisScriptFile = process.argv[1];
  const thisScriptDir = path.dirname(thisScriptFile);
  const templateFile = path.resolve(thisScriptDir, '../scripts/templates', ESLINT_CONFIG_FILE);
  const rawTemplateCode = fs.readFileSync(templateFile, 'utf8');
  /** @type {EslintConfig[]} */
  const targetDirWorkspacesConfigs = [];
  const repeatablePattern = /@repeatable(.*)\n/g;
  const configVariablePattern = '{{CONFIGS}}';

  for (const index in targetDirWorkspacesConfigsOptions) {
    const configOptions = targetDirWorkspacesConfigsOptions[index];
    const configsPresets = [configOptions.config];

    if (configOptions.commonjs) {
      configsPresets.push('commonjs');
    }

    if (configOptions.testRunner) {
      configsPresets.push(targetDirWorkspacesConfigsOptions.testRunner);
    }

    const repeatableOutput = Array(configsPresets.length).fill('$1\n').join('');
    let templateCode = rawTemplateCode.replace(repeatablePattern, repeatableOutput);

    for (const preset of configsPresets) {
      templateCode = templateCode.replace(configVariablePattern, preset);
    }

    targetDirWorkspacesConfigs.push({
      dir: targetDirWorkspacesToConfig[index],
      code: templateCode,
    });
  }

  return targetDirWorkspacesConfigs;
}

/**
 * @returns {Promise<void>}
 */
async function writeEslintConfigFile() {
  for (const config of targetDirWorkspacesConfigs) {
    const projectMeta = getProjectMeta(config.dir);
    const eslintConfigExt = projectMeta.type === 'module' ? 'js' : 'mjs';
    const eslintConfigFile = path.resolve(config.dir, `${ESLINT_CONFIG_FILE}.${eslintConfigExt}`);

    fs.writeFileSync(eslintConfigFile, config.code, 'utf8');
  }
}

/**
 * @returns {Promise<void>}
 */
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

  for (const workspaceDir of targetDirWorkspacesToInstall) {
    await new Promise((resolve) => {
      const command = `cd ${workspaceDir} && ${packageManager.command} ${packages}`;

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
  }

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

/**
 * @returns {Promise<void>}
 */
async function notifyUser() {
  const packages = Object.keys(packageMeta.peerDependencies)
    .map((pkg) => `"${pkg}"`)
    .join(', ')
    .concat([` and "${packageMeta.name}"`]);

  console.info('\n');
  console.info('✔️  ESLint config file(s) created successfully.');
  console.info('✔️  Workspaces configured successfully:');

  for (const dir of targetDirWorkspaces) {
    console.info(`   ✔️  ${dir}`);
  }

  console.info(`✔️  Packages installed: ${packages}.`);
}
