import { NextResponse } from "next/server";
import { validateStaffMagicLink } from "@/lib/staff-auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> },
) {
  const { token } = await params;
  const session = await validateStaffMagicLink(token);

  // 만료/취소된 링크여도 manifest 자체는 응답해 브라우저가 PWA 설치 레코드를 잃지 않게 한다.
  // 실제 페이지 진입 시 TokenNotice 가 안내한다.
  const staffName = session?.user.name ?? "근무자";

  const manifest = {
    name: `${staffName} 근무자 포털`,
    short_name: "근무 포털",
    description: "근무자 전용 출퇴근 포털",
    start_url: `/w/${token}`,
    scope: `/w/${token}`,
    id: `/w/${token}`,
    display: "standalone",
    orientation: "portrait",
    background_color: "#F5F6FA",
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
      "Cache-Control": "private, max-age=300",
    },
  });
}
