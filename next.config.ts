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

const ENFORCED_CSP = ["frame-ancestors 'none'", "base-uri 'self'", "object-src 'none'"].join("; ");

const REPORT_ONLY_CSP = [
  "default-src 'self'",
  // Kakao JS SDK · Vercel Analytics(/_vercel, same-origin) · heic-to(wasm)
  "script-src 'self' 'unsafe-inline' 'wasm-unsafe-eval' https://t1.kakaocdn.net",
  // Pretendard 웹폰트 CSS (globals.css @import)
  "style-src 'self' 'unsafe-inline' https://cdn.jsdelivr.net",
  "font-src 'self' data: https://cdn.jsdelivr.net",
  // Vercel Blob 업로드 이미지·마크다운 외부 이미지·미리보기(blob:)·카드뉴스(data:)
  "img-src 'self' data: blob: https:",
  "media-src 'self' blob: https:",
  "connect-src 'self' https://*.kakao.com https://*.public.blob.vercel-storage.com https://vercel.com",
  "worker-src 'self' blob:",
  "frame-src 'self' https://*.kakao.com",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "object-src 'none'",
  "form-action 'self'",
].join("; ");

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
          // 기능에 영향 없는 최소 CSP (강제): 클릭재킹·<base> 주입·플러그인 차단.
          { key: "Content-Security-Policy", value: ENFORCED_CSP },
          // 전체 CSP 는 Report-Only 로 먼저 관찰 (브라우저 콘솔 위반 로그 확인 후 강제 전환 검토).
          // Next 인라인 부트스트랩 스크립트 때문에 nonce 도입 전까지 'unsafe-inline' 필요.
          { key: "Content-Security-Policy-Report-Only", value: REPORT_ONLY_CSP },
        ],
      },
    ];
  },
};

export default nextConfig;
