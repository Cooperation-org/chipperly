import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  ...coreWebVitals,
  ...nextTypescript,
  { ignores: ['.next/**', 'out/**', 'public/sw.js', 'android/**', 'ios/**'] },
];

export default eslintConfig;
