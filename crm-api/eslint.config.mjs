import { defineConfig } from 'eslint/config';
import js from '@eslint/js';
import globals from 'globals';

export default defineConfig(
  { ignores: ['node_modules/**'] },
  js.configs.recommended,
  {
    files: ['src/**/*.js', 'test/**/*.js'],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: {
        ...globals.node,
      },
    },
    rules: {
      'no-console': 'off', // CLI scripts legitimately print; app code uses pino
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' }],
      eqeqeq: ['error', 'smart'],
      'prefer-const': 'error',
    },
  },
);
