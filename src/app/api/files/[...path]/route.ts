import type { NextRequest } from "next/server";

import { getAuthIdentity } from "@/lib/auth";
import {
  fileUrlForPathname,
  getPrivateFile,
  isPrivateBlobEnabled,
  pathnameFromFileUrl,
  verifyFileSignature,
} from "@/lib/blob-store";
import { canReadFile, parseFileOwner, PORTAL_FILE_COOKIE, type FileViewer } from "@/lib/file-access";
import { prisma } from "@/lib/prisma";
import { isAnyStaff } from "@/lib/roles";
import { validateMagicLink } from "@/lib/student-auth";

export const runtime = "nodejs";

// 비공개 저장소 첨부 전달 (src/lib/blob-store.ts). DB 에는 이 경로(/api/files/<pathname>)가 저장된다.
// 통과 조건: 서명(?e=&s=, 앱·토큰 리포트용) 또는 세션 — 운영진은 전부, 학생·학부모·매직링크 학생은
// 자기와 연결된 학생의 파일만 (src/lib/file-access.ts 의 경로 규칙).

// 브라우저가 그 자리에서 열어도 되는 형식만 inline — 나머지(문서·압축·알 수 없는 형식)는 내려받기로
const INLINE_TYPE = /^(image\/(png|jpe?g|gif|webp|avif|heic|heif)|video\/(mp4|quicktime|webm)|application\/pdf)$/i;

function fail(status: number, error: string) {
  return Response.json({ error }, { status, headers: { "Cache-Control": "no-store" } });
}

async function viewerOf(request: NextRequest): Promise<FileViewer | null> {
  const current = await getAuthIdentity(request.headers);
  const appUser = current?.identity.appUser;
  if (appUser?.status === "ACTIVE" && isAnyStaff(appUser.role)) {
    return { staff: true, studentIds: [] };
  }
  const studentIds: string[] = [];
  if (current) {
    const student = current.identity.student;
    if (student?.status === "ACTIVE") studentIds.push(student.id);
    const links = await prisma.parentLink.findMany({
      where: { authUserId: current.identity.id, student: { status: "ACTIVE" } },
      select: { studentId: true },
    });
    studentIds.push(...links.map((l) => l.studentId));
  }
  const portalToken = request.cookies.get(PORTAL_FILE_COOKIE)?.value;
  if (portalToken) {
    const link = await validateMagicLink(portalToken);
    if (link) studentIds.push(link.student.id);
  }
  return current || studentIds.length > 0 ? { staff: false, studentIds } : null;
}

async function ownerStudentId(pathname: string): Promise<string | null> {
  const ref = parseFileOwner(pathname);
  if (!ref) return null;
  const select = { studentId: true } as const;
  switch (ref.kind) {
    case "student":
      return ref.id;
    case "portalChat":
      return (await prisma.portalChat.findUnique({ where: { id: ref.id }, select }))?.studentId ?? null;
    case "task":
      return (await prisma.performanceTask.findUnique({ where: { id: ref.id }, select }))?.studentId ?? null;
    case "submission":
      return (await prisma.taskSubmission.findUnique({ where: { id: ref.id }, select }))?.studentId ?? null;
    case "mentoring":
      return (await prisma.mentoring.findUnique({ where: { id: ref.id }, select }))?.studentId ?? null;
    case "mentoringSession":
      return (await prisma.mentoringSession.findUnique({ where: { id: ref.id }, select }))?.studentId ?? null;
    case "assignment":
      return (await prisma.assignment.findUnique({ where: { id: ref.id }, select }))?.studentId ?? null;
    case "photo": {
      const url = fileUrlForPathname(pathname);
      const photo = await prisma.photo.findFirst({ where: { OR: [{ url }, { thumbnailUrl: url }] }, select });
      return photo?.studentId ?? null;
    }
    case "question": {
      // ponytail: 첨부 JSON 을 훑는 조회(인덱스 없음) — 앱·운영진은 서명/권한으로 먼저 통과해 여기까지 오는 건
      // 학생 포털·학부모 웹 정도라 드물다. 많아지면 학생 업로드 경로에 studentId 를 넣는다
      const message = await prisma.questionMessage.findFirst({
        where: { attachments: { array_contains: [{ url: fileUrlForPathname(pathname) }] } },
        select: { question: { select } },
      });
      return message?.question.studentId ?? null;
    }
  }
}

export async function GET(request: NextRequest) {
  const pathname = isPrivateBlobEnabled() ? pathnameFromFileUrl(request.nextUrl.pathname) : null;
  if (!pathname) return fail(404, "파일을 찾을 수 없습니다");

  const { searchParams } = request.nextUrl;
  if (!verifyFileSignature(pathname, searchParams.get("e"), searchParams.get("s"))) {
    const viewer = await viewerOf(request);
    if (!viewer) return fail(401, "로그인이 필요합니다");
    if (!viewer.staff && !canReadFile(viewer, viewer.studentIds.length > 0 ? await ownerStudentId(pathname) : null)) {
      return fail(403, "이 파일을 볼 수 없습니다");
    }
  }

  const result = await getPrivateFile(pathname, request.headers.get("range")).catch((error) => {
    console.error("[files] blob get failed", error);
    return null;
  });
  if (!result || result.statusCode !== 200) return fail(404, "파일을 찾을 수 없습니다");

  const contentType = result.blob.contentType;
  const fileName = pathname.split("/").pop() ?? "file";
  const headers = new Headers({
    "Content-Type": contentType,
    "Cache-Control": "private, no-store",
    "X-Content-Type-Options": "nosniff",
    "Accept-Ranges": "bytes",
    "Content-Disposition": `${INLINE_TYPE.test(contentType) ? "inline" : "attachment"}; filename*=UTF-8''${encodeURIComponent(fileName)}`,
  });
  // 영상 탐색(iOS Safari 는 Range 필수) — 저장소가 준 부분 응답 헤더를 그대로 넘긴다
  const contentRange = result.headers.get("content-range");
  const contentLength = result.headers.get("content-length");
  if (contentRange) headers.set("Content-Range", contentRange);
  if (contentLength) headers.set("Content-Length", contentLength);
  return new Response(result.stream, { status: contentRange ? 206 : 200, headers });
}
