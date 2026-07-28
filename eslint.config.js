import js from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';
import eslintConfigPrettier from 'eslint-config-prettier';

export default tseslint.config(
  { ignores: ['artifacts/', 'dist/', 'node_modules/', '.vite/'] },
  js.configs.recommended,
  {
    files: ['scripts/run-ai-acceptance.mjs', 'scripts/check-pr-regression-guard.mjs', 'scripts/check-regression-guard.mjs'],
    languageOptions: {
      globals: {
        console: 'readonly',
        fetch: 'readonly',
        process: 'readonly',
        setTimeout: 'readonly',
      },
    },
  },
  ...tseslint.configs.recommended,
  {
    plugins: {
      'react-hooks': reactHooks,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'off',
      // eslint-plugin-react-hooks v7 ships compiler-powered rules that fire on
      // hundreds of pre-existing call sites. They are deferred as a group so
      // the eslint 10 upgrade stays behavior-parity with v5; enable them
      // incrementally in dedicated cleanups.
      'react-hooks/refs': 'off',
      'react-hooks/set-state-in-effect': 'off',
      'react-hooks/preserve-manual-memoization': 'off',
      'react-hooks/immutability': 'off',
      'react-hooks/error-boundaries': 'off',
      'react-hooks/use-memo': 'off',
    },
  },
  eslintConfigPrettier,
);
