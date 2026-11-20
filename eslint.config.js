import js from '@eslint/js';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  {
    ignores: ['dist/**', 'dist-tests/**', 'node_modules/**', 'packages/github-action/dist/**'],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      'no-eval': 'error',
      'no-implied-eval': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
);