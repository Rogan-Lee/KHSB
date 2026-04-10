import { clerkMiddleware, createRouteMatcher } from "@clerk/nextjs/server";

const isPublicRoute = createRouteMatcher([
  "/sign-in(.*)",
  "/sign-up(.*)",
  "/r/(.*)",   // 학부모 리포트 공개 페이지
  "/cr/(.*)",  // 상담 리포트 공개 페이지
  "/sp/(.*)",  // 공부계획 리포트 공개 페이지
  "/api/webhooks(.*)",
  "/api/cron(.*)",  // 자동화 에이전트 Cron API (CRON_SECRET으로 자체 인증)
]);

export default clerkMiddleware(async (auth, req) => {
  if (!isPublicRoute(req)) {
    await auth.protect();
  }
});

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"],
};
