import type { MetadataRoute } from "next";

// 비공개 운영 도구 + 토큰 기반 학부모/학생 공개 페이지 → 전 경로 색인 차단.
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", disallow: "/" }],
  };
}
