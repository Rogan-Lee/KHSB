import type { MetadataRoute } from "next";

// 비공개 운영 도구 + 토큰 기반 학부모/학생 공개 페이지 → 전 경로 색인 차단.
// 단 /api/public/* 은 강한선배 랜딩이 불러 쓰는 공개 데이터라 연다 — 막으면 Googlebot 이 랜딩을 렌더할 때
// 후기 · 글 목록을 못 받아 빈 화면으로 색인한다(하위 요청도 robots.txt 를 따른다).
export default function robots(): MetadataRoute.Robots {
  return {
    rules: [{ userAgent: "*", allow: "/api/public/", disallow: "/" }],
  };
}
