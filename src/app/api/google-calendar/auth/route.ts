import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { getGoogleAuthUrl, isOAuthAppConfigured } from "@/lib/google-calendar";

export async function GET() {
  const session = await auth();
  if (!session?.user) {
    return new NextResponse("Unauthorized", { status: 401 });
  }
  if (session.user.role !== "DIRECTOR" && session.user.role !== "SUPER_ADMIN") {
    return new NextResponse("Forbidden", { status: 403 });
  }
  if (!isOAuthAppConfigured()) {
    return new NextResponse("GOOGLE_CLIENT_ID / GOOGLE_CLIENT_SECRET / GOOGLE_REDIRECT_URI 환경변수를 설정해주세요", { status: 500 });
  }

  const url = getGoogleAuthUrl();
  return NextResponse.redirect(url);
}
