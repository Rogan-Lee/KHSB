import type { NextRequest } from "next/server";

import { getFamilyMembers, getFamilyThread, sendFamilyMessage } from "@/lib/family-chat";
import { mobileApiErrorResponse, mobileJson, requireMobileStudent } from "@/lib/mobile-auth";

/**
 * 가족 톡방 — GET ?before=&after= (after 가 있으면 그 뒤 메시지만, members 없음)
 * ?summary=1 은 채팅 탭 미리보기 — 마지막 글 1개만, 읽음 처리 없이
 */
export async function GET(request: NextRequest) {
  try {
    const student = await requireMobileStudent(request);
    const q = request.nextUrl.searchParams;
    const after = q.get("after") ?? undefined;
    const summary = q.get("summary") === "1";
    const viewer = { kind: "STUDENT" as const, id: student.id };
    const [thread, members] = await Promise.all([
      getFamilyThread(
        student.id,
        viewer,
        summary ? { limit: 1, peek: true } : { before: q.get("before") ?? undefined, after },
      ),
      after || summary ? null : getFamilyMembers(student.id),
    ]);
    return mobileJson({ ...thread, members });
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

/** 보내기 — POST { content, attachments? } */
export async function POST(request: NextRequest) {
  try {
    const [student, body] = await Promise.all([requireMobileStudent(request), request.json()]);
    return mobileJson(
      await sendFamilyMessage(student.id, { kind: "STUDENT", id: student.id }, body ?? {}),
    );
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
