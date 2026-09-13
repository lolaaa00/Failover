import nextCoreWebVitals from "eslint-config-next/core-web-vitals";

const eslintConfig = [
  ...nextCoreWebVitals,
  {
    ignores: ["tests/contract/**", ".next/**", "node_modules/**"],
  },
];

export default eslintConfig;
