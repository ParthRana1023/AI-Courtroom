import js from "@eslint/js";
import tseslint from "typescript-eslint";
import reactPlugin from "eslint-plugin-react";
import reactHooksPlugin from "eslint-plugin-react-hooks";
import nextPlugin from "@next/eslint-plugin-next";

export default tseslint.config(
  // Ignore build artifacts and dependencies
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "android/**",
      "ios/**",
      "public/sw.js",
      "public/swe-worker-*.js",
    ],
  },

  // Base JS recommended rules
  js.configs.recommended,

  // TypeScript recommended rules
  ...tseslint.configs.recommended,

  // React & Next.js rules
  {
    files: ["**/*.{ts,tsx,js,jsx,mjs}"],
    plugins: {
      react: reactPlugin,
      "react-hooks": reactHooksPlugin,
      "@next/next": nextPlugin,
    },
    settings: {
      react: {
        version: "detect",
      },
    },
    rules: {
      // --- React ---
      "react/react-in-jsx-scope": "off", // Not needed in Next.js
      "react/prop-types": "off", // Using TypeScript
      "react/jsx-key": "warn",

      // --- React Hooks ---
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // --- Next.js ---
      ...nextPlugin.configs.recommended.rules,
      ...nextPlugin.configs["core-web-vitals"].rules,

      // --- TypeScript ---
      "@typescript-eslint/no-unused-vars": [
        "warn",
        { argsIgnorePattern: "^_", varsIgnorePattern: "^_" },
      ],
      "@typescript-eslint/no-explicit-any": "warn",
      "@typescript-eslint/no-require-imports": "off",

      // --- General ---
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },

  // Node environment for config files
  {
    files: ["*.config.{js,mjs,ts}", "postcss.config.*"],
    languageOptions: {
      globals: {
        process: "readonly",
        __dirname: "readonly",
        module: "readonly",
        require: "readonly",
      },
    },
  }
);
