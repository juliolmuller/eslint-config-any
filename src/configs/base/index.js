import jsEslint from '@eslint/js';
import { defineConfig } from 'eslint/config';

import { JS, TS, VUE } from '../../utils/index.js';
import eslintCommentsConfigs from './plugins/@eslint-community___eslint-comments/index.js';
import arrayFuncConfigs from './plugins/array-func/index.js';
import importHelpersConfigs from './plugins/import-helpers/index.js';
import importConfigs from './plugins/import/index.js';
import jsonConfigs from './plugins/json/index.js';
import markdownConfigs from './plugins/markdown/index.js';
import perfectionistConfigs from './plugins/perfectionist/index.js';
import regexpConfigs from './plugins/regexp/index.js';
import rules from './rules/index.js';

const matchingFilesPattern = [JS, TS, VUE];
const baseJavaScriptConfig = jsEslint.configs.recommended;

export default defineConfig([
  {
    ignores: ['**/coverage/**', '**/build/**', '**/dist/**', '**/*.min.js', '**/node_modules/**'],
  },
  {
    ...baseJavaScriptConfig,
    files: matchingFilesPattern,
  },
  ...jsonConfigs,
  ...markdownConfigs,
  ...eslintCommentsConfigs,
  ...arrayFuncConfigs,
  ...importConfigs,
  ...importHelpersConfigs,
  ...perfectionistConfigs,
  ...regexpConfigs,
  {
    files: matchingFilesPattern,
    rules,
  },
]);
