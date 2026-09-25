import fs from "node:fs";
import path from "node:path";
import type { NextConfig } from "next";

// SEED 컴포넌트 CSS 를 @layer seed-components 버전으로 연결한다.
// (SEED 공식 설정은 번들러 resolve condition "seed-layered" — Turbopack 에는 해당 옵션이 없어 레시피별 alias 로 대신)
// 레이어 순서는 globals.css 첫 줄의 @layer 선언이 정한다.
const seedRecipesDir = path.join(process.cwd(), "node_modules/@seed-design/css/recipes");
const seedLayeredAlias: Record<string, string> = fs.existsSync(seedRecipesDir)
  ? Object.fromEntries(
      fs
        .readdirSync(seedRecipesDir)
        .filter((f) => f.endsWith(".layered.mjs"))
        .map((f) => {
          const name = f.slice(0, -".layered.mjs".length);
          return [`@seed-design/css/recipes/${name}`, `./node_modules/@seed-design/css/recipes/${f}`];
        }),
    )
  : {};

const nextConfig: NextConfig = {
  // ponytail: 데모용 2번째 dev 서버를 별도 .next 로 띄우기 위한 임시 override (평소엔 무시됨)
  ...(process.env.NEXT_DIST_DIR ? { distDir: process.env.NEXT_DIST_DIR } : {}),
  turbopack: {
    resolveAlias: seedLayeredAlias,
  },
  webpack(config) {
    config.resolve.conditionNames = ["seed-layered", ...(config.resolve.conditionNames ?? ["..."])];
    return config;
  },
  async headers() {
    return [
      {
        source: "/(.*)",
        headers: [
          { key: "X-Frame-Options", value: "DENY" },
          { key: "X-Content-Type-Options", value: "nosniff" },
          { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
          { key: "X-DNS-Prefetch-Control", value: "on" },
          {
            key: "Strict-Transport-Security",
            value: "max-age=31536000; includeSubDomains",
          },
          {
            key: "Permissions-Policy",
            value: "camera=(), microphone=(), geolocation=()",
          },
        ],
      },
    ];
  },
};

export default nextConfig;
