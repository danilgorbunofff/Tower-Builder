import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // lib/engine.ts is a verbatim port of the original inline <script> body.
    // baseline/verify-port.mjs matches it line-for-line against index.html, so
    // its `var`s and dead locals are load-bearing text, not style choices:
    // restyling one is indistinguishable from a porting error.
    files: ["lib/engine.ts"],
    rules: {
      "no-var": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-unused-expressions": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
