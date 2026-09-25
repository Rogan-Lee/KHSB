import { NextRequest } from "next/server";

import { getMobileInvitation } from "@/lib/mobile-invitation";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim() ?? "";
  const invitation = await getMobileInvitation(token);

  if (!invitation) {
    return Response.json(
      { error: "유효하지 않거나 만료된 초대입니다" },
      { status: 404 },
    );
  }

  return Response.json(invitation);
}
