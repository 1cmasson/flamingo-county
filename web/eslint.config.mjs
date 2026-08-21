import nextCoreWebVitals from 'eslint-config-next/core-web-vitals'
import nextTypeScript from 'eslint-config-next/typescript'

/*
 * `eslint-config-next` 16 ships flat configs directly — `./core-web-vitals` and
 * `./typescript` each export a ready array. This file used to reach them
 * through `FlatCompat` from `@eslint/eslintrc`, the shape the older Next
 * scaffold generated, and that never ran here: `@eslint/eslintrc` was not a
 * dependency, and pnpm's strict node_modules does not hoist it in from
 * eslint's own tree, so `pnpm lint` failed at import with ERR_MODULE_NOT_FOUND
 * rather than reporting anything. Spreading the native exports needs no
 * compatibility layer and no extra dependency.
 */
const eslintConfig = [
  ...nextCoreWebVitals,
  ...nextTypeScript,
  {
    rules: {
      '@typescript-eslint/ban-ts-comment': 'warn',
      '@typescript-eslint/no-empty-object-type': 'warn',
      '@typescript-eslint/no-explicit-any': 'warn',
      '@typescript-eslint/no-unused-vars': [
        'warn',
        {
          vars: 'all',
          args: 'after-used',
          ignoreRestSiblings: false,
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          destructuredArrayIgnorePattern: '^_',
          caughtErrorsIgnorePattern: '^(_|ignore)',
        },
      ],
    },
  },
  {
    ignores: [
      '.next/',
      'src/payload-types.ts',
      'src/payload-generated-schema.ts',
      // Local verification output — screenshots and one-off Playwright scripts.
      'shots/',
    ],
  },
]

export default eslintConfig
