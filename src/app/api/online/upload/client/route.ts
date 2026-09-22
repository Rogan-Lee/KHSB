import { NextRequest, NextResponse } from "next/server";
import { handleUpload, type HandleUploadBody } from "@vercel/blob/client";
import { auth } from "@/lib/auth";
import { isStaff } from "@/lib/roles";
import { validateMagicLink } from "@/lib/student-auth";

export const runtime = "nodejs";

// Vercel Blob client upload 토큰 발급 라우트.
// 파일 바디가 이 함수를 거치지 않고 클라 → Blob 으로 직접 올라가므로
// Vercel 함수 body 한도(4.5MB)에 걸리지 않는다. (/api/online/upload 의 근본 대안)
//
// ponytail: 현재 question 컨텍스트만 지원 — photo-uploader 가 유일한 사용처.
// task/chat/feedback 을 client upload 로 옮길 때 기존 route.ts 인가 로직을 컨텍스트별로 이식할 것.

const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const MAX_IMAGE_BYTES = 20 * 1024 * 1024;
const VIDEO_EXT = /\.(mp4|mov|webm)$/i;

const ALLOWED_CONTENT_TYPES = [
  "image/*", // png/jpeg/webp/gif/heic/heif — 기존 route.ts 이미지 허용 범위 포괄
  "application/pdf",
  "video/mp4",
  "video/quicktime",
  "video/webm",
];

type ClientPayload = {
  context?: string;
  studentToken?: string;
  questionId?: string;
};

export async function POST(request: NextRequest) {
  const body = (await request.json()) as HandleUploadBody;

  try {
    const jsonResponse = await handleUpload({
      body,
      request,
      onBeforeGenerateToken: async (pathname, clientPayload) => {
        let payload: ClientPayload = {};
        try {
          payload = clientPayload ? (JSON.parse(clientPayload) as ClientPayload) : {};
        } catch {
          // 잘못된 payload 는 아래 context 검사에서 거른다
        }

        if (payload.context !== "question") {
          throw new Error("지원하지 않는 업로드 컨텍스트입니다");
        }

        // 인가 — /api/online/upload 의 context=question 로직과 동일:
        // 학생 매직링크 토큰 또는 staff 세션 중 하나면 허용.
        let authorized = false;
        if (payload.studentToken) {
          const session = await validateMagicLink(payload.studentToken);
          if (session) authorized = true;
        }
        if (!authorized) {
          const session = await auth();
          if (session?.user && isStaff(session.user.role)) authorized = true;
        }
        if (!authorized) {
          throw new Error("권한이 없습니다");
        }

        // 경로 규칙 — 기존 route.ts 와 동일한 incoming 버킷만 허용
        if (!pathname.startsWith("student-questions/incoming/")) {
          throw new Error("잘못된 업로드 경로입니다");
        }

        const isVideo = VIDEO_EXT.test(pathname);
        return {
          allowedContentTypes: ALLOWED_CONTENT_TYPES,
          maximumSizeInBytes: isVideo ? MAX_VIDEO_BYTES : MAX_IMAGE_BYTES,
          addRandomSuffix: false, // 클라가 timestamp+random 을 경로에 포함
        };
      },
      onUploadCompleted: async () => {
        // 첨부 메타(url/name/sizeBytes/mimeType)는 클라가 Server Action 파라미터로 전달하므로
        // 서버측 후처리 없음. (로컬 dev 에서는 이 콜백이 호출되지 않음)
      },
    });

    return NextResponse.json(jsonResponse);
  } catch (err) {
    console.error("[online upload client] token issue failed", err);
    return NextResponse.json(
      { error: err instanceof Error ? err.message : "업로드 토큰 발급에 실패했습니다" },
      { status: 400 }
    );
  }
}
