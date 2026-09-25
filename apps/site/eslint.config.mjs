import coreWebVitals from 'eslint-config-next/core-web-vitals';
import nextTypescript from 'eslint-config-next/typescript';

/** @type {import('eslint').Linter.Config[]} */
const eslintConfig = [
  ...coreWebVitals,
  ...nextTypescript,
  { ignores: ['.next/**', '.open-next/**', '.wrangler/**', 'cloudflare-env.d.ts', 'src/payload-types.ts', 'src/app/(payload)/**', 'src/migrations/**'] },
];

export default eslintConfig;
