import tsparser from "@typescript-eslint/parser";
import { defineConfig } from "eslint/config";
import obsidianmd from "eslint-plugin-obsidianmd";
import globals from "globals";

export default defineConfig([
  {
    ignores: ["node_modules/**", "main.js", "*.js", "*.mjs", "tests/**", "vitest.config.ts"],
  },
  ...obsidianmd.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      parser: tsparser,
      parserOptions: { project: "./tsconfig.json" },
      globals: {
        ...globals.browser,
      },
    },
    rules: {
      "obsidianmd/sample-names": "off",
    },
  },
]);
