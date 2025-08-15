// @ts-check

import eslint from '@eslint/js';
import tseslint from 'typescript-eslint';
import reactHooks from 'eslint-plugin-react-hooks';

export default tseslint.config(
    // base configs
    eslint.configs.recommended,
    ...tseslint.configs.recommended,

    // global rules
    {
        plugins: {
            'react-hooks': reactHooks,
        },
        rules: {
            quotes: ['error', 'single', { avoidEscape: true, allowTemplateLiterals: true }],
            '@typescript-eslint/no-explicit-any': ['error', { ignoreRestArgs: true }],
            '@typescript-eslint/ban-types': 'off',
            '@typescript-eslint/no-empty-object-type': 'off',
        },
    },

    // folder-specific rules (disable single-quote rule here)
    // {
    //     files: ['./src/db/**/*.{ts,tsx,js,jsx}'],
    //     rules: {
    //         quotes: 'off',
    //         // or to force double quotes instead of disabling:
    //         // quotes: ['error', 'double', { avoidEscape: true }],
    //     },
    // }
);
