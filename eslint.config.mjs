import globals from "globals";

export default [
    {
        // Files/folders to ignore (replaces .eslintignore)
        ignores: [
            "node_modules/**",
            ".venv/**",
            ".vscode-test/**",
            "__pycache__/**",
            ".vscode/**",
            ".git/**",
            "package-lock.json",
            "dist/**",
            "out/**",
        ],
    },
    {
        files: ["**/*.js"],
        languageOptions: {
            globals: {
                ...globals.commonjs,
                ...globals.node,
                ...globals.mocha,
            },

            ecmaVersion: 2022,
            sourceType: "module",
        },

        rules: {
            "no-const-assign": "warn",
            "no-this-before-super": "warn",
            "no-undef": "warn",
            "no-unreachable": "warn",
            "no-unused-vars": "warn",
            "constructor-super": "warn",
            "valid-typeof": "warn",
        },
    },
];