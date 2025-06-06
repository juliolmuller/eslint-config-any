import jsxA11yPlugin from 'eslint-plugin-jsx-a11y';
import reactPlugin from 'eslint-plugin-react';
import reactHooksPlugin from 'eslint-plugin-react-hooks';
import { defineConfig } from 'eslint/config';
import globals from 'globals';

import { JS, TS } from '../../utils/index.js';
import rules from './rules/index.js';

const matchingFilesPattern = [JS, TS];
const baseReactConfig = reactPlugin.configs.flat.recommended;
const baseReactHooksConfig = reactHooksPlugin.configs['recommended-latest'];
const baseJsxA11yConfig = jsxA11yPlugin.flatConfigs.recommended;

export default defineConfig([
  {
    ...baseReactConfig,
    files: matchingFilesPattern,
    settings: {
      react: {
        version: 'detect',
      },
    },
  },
  {
    ...baseReactHooksConfig,
    files: matchingFilesPattern,
  },
  {
    ...baseJsxA11yConfig,
    files: matchingFilesPattern,
  },
  {
    files: matchingFilesPattern,
    languageOptions: {
      globals: globals.browser,
    },
    rules,
  },
]);
