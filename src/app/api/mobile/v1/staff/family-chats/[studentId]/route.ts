import type { NextRequest } from "next/server";

import { getFamilyMembers, getFamilyThread, sendFamilyMessage } from "@/lib/family-chat";
import { mobileApiErrorResponse, mobileJson, requireMobileAnyStaff } from "@/lib/mobile-auth";

type Ctx = { params: Promise<{ studentId: string }> };

/** 가족 톡방 대화 — GET ?before=&after= (after 가 있으면 그 뒤 메시지만, members 없음) */
export async function GET(request: NextRequest, context: Ctx) {
  try {
    const [appUser, { studentId }] = await Promise.all([requireMobileAnyStaff(request), context.params]);
    const q = request.nextUrl.searchParams;
    const after = q.get("after") ?? undefined;
    const viewer = { kind: "STAFF" as const, id: appUser.id };
    const [thread, members] = await Promise.all([
      getFamilyThread(studentId, viewer, { before: q.get("before") ?? undefined, after }),
      after ? null : getFamilyMembers(studentId),
    ]);
    return mobileJson({ ...thread, members });
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

/** 보내기 — POST { content, attachments? } */
export async function POST(request: NextRequest, context: Ctx) {
  try {
    const [appUser, { studentId }, body] = await Promise.all([
      requireMobileAnyStaff(request),
      context.params,
      request.json(),
    ]);
    return mobileJson(await sendFamilyMessage(studentId, { kind: "STAFF", id: appUser.id }, body ?? {}));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
