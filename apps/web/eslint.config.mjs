import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const __dirname = dirname(fileURLToPath(import.meta.url));

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  {
    languageOptions: {
      parserOptions: {
        projectService: {
          allowDefaultProject: [
            "eslint.config.mjs",
            "postcss.config.mjs",
          ],
        },
        tsconfigRootDir: __dirname,
      },
    },
  },

  globalIgnores([
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;