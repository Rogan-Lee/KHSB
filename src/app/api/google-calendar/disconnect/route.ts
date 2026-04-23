import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export async function POST() {
  const session = await auth();
  if (!session?.user) return new NextResponse("Unauthorized", { status: 401 });
  if (session.user.role !== "DIRECTOR" && session.user.role !== "SUPER_ADMIN") {
    return new NextResponse("Forbidden", { status: 403 });
  }

  try {
    await prisma.googleCalendarToken.delete({ where: { id: "singleton" } });
  } catch {
    // 이미 없는 경우 무시
  }

  return NextResponse.json({ ok: true });
}
