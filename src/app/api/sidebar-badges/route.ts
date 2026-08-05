import { NextResponse } from "next/server";
import { getUser } from "@/lib/auth";
import { isAnyStaff } from "@/lib/roles";
import { getSidebarBadges } from "@/lib/sidebar-badges";

export const dynamic = "force-dynamic";

/** 사이드바 배지 폴링 — DashboardShell이 포커스/이동/주기마다 호출. */
export async function GET() {
  const user = await getUser();
  if (!user || !isAnyStaff(user.role)) {
    return NextResponse.json({}, { status: 401 });
  }
  return NextResponse.json(await getSidebarBadges(user.id, user.role));
}
