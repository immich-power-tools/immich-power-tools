import { defineConfig } from "eslint/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import js from "@eslint/js";
import { FlatCompat } from "@eslint/eslintrc";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const compat = new FlatCompat({
    baseDirectory: __dirname,
    recommendedConfig: js.configs.recommended,
    allConfig: js.configs.all
});

export default defineConfig([{
    ignores: [".next/", "out/", "public/"],
}, {
    extends: [...compat.extends("next/core-web-vitals")],

    rules: {
        "react-hooks/exhaustive-deps": "off",
        "@next/next/no-img-element": "off",
    },
}, {
    files: ["remotion/*.{ts,tsx}"],
    extends: [...compat.extends("plugin:@remotion/recommended")],
}]);
