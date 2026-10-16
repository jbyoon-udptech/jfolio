/* eslint-env node */
module.exports = {
  root: true,
  parser: "@typescript-eslint/parser",
  parserOptions: {
    ecmaVersion: 2022,
    sourceType: "module",
    ecmaFeatures: { jsx: true },
  },
  plugins: ["@typescript-eslint"],
  extends: ["eslint:recommended", "plugin:@typescript-eslint/recommended"],
  env: { node: true, es2022: true },
  ignorePatterns: [
    "node_modules",
    "dist",
    ".next",
    "coverage",
    "*.config.js",
    "*.config.cjs",
    "*.config.mjs",
    "next-env.d.ts",
  ],
  rules: {
    "@typescript-eslint/no-unused-vars": [
      "error",
      { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
    ],
    "@typescript-eslint/no-explicit-any": "warn",
    "no-console": "warn",
  },
  overrides: [
    {
      files: ["**/*.test.ts", "**/*.test.tsx", "**/test/**/*.ts"],
      env: { node: true },
      rules: {
        "no-console": "off",
      },
    },
  ],
};
