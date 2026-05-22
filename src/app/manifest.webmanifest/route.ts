import { NextResponse } from "next/server";

export function GET() {
  const manifest = {
    name: "스터디룸 매니저",
    short_name: "KHSB",
    description: "관리형 독서실 올인원 운영 콘솔",
    start_url: "/",
    scope: "/",
    id: "/",
    display: "standalone",
    orientation: "any",
    background_color: "#F4F4F2",
    theme_color: "#FFFFFF",
    lang: "ko-KR",
    dir: "ltr",
    icons: [
      {
        src: "/icons/portal-icon.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "any",
      },
      {
        src: "/icons/portal-icon-maskable.svg",
        sizes: "any",
        type: "image/svg+xml",
        purpose: "maskable",
      },
    ],
  };

  return NextResponse.json(manifest, {
    headers: {
      "Content-Type": "application/manifest+json; charset=utf-8",
      "Cache-Control": "public, max-age=3600",
    },
  });
}
