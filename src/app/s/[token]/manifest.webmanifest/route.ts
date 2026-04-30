import { NextResponse } from "next/server";
import { validateMagicLink } from "@/lib/student-auth";

export async function GET(
  _req: Request,
  { params }: { params: Promise<{ token: string }> }
) {
  const { token } = await params;
  const session = await validateMagicLink(token);

  // Generate the manifest even if the link is expired so the browser can still
  // load a basic install record; the PWA itself will redirect to /s/expired.
  const studentName = session?.student.name ?? "학생";

  const manifest = {
    name: `${studentName} 학생 포털`,
    short_name: "내 포털",
    description: "관리형 독서실 본인 전용 학생 포털",
    start_url: `/s/${token}`,
    scope: `/s/${token}`,
    id: `/s/${token}`,
    display: "standalone",
    orientation: "portrait",
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
      "Cache-Control": "private, max-age=300",
    },
  });
}
