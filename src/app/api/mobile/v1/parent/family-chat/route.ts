import type { NextRequest } from "next/server";

import { getFamilyMembers, getFamilyThread, sendFamilyMessage } from "@/lib/family-chat";
import { mobileApiErrorResponse, mobileJson } from "@/lib/mobile-auth";
import { requireParentChildFromBody, requireParentChildFromQuery } from "@/lib/mobile-parent-services";

/** 가족 톡방 — GET ?studentId=&before=&after= (after 가 있으면 그 뒤 메시지만, members 없음) */
export async function GET(request: NextRequest) {
  try {
    const { parent, child } = await requireParentChildFromQuery(request);
    const q = request.nextUrl.searchParams;
    const after = q.get("after") ?? undefined;
    const viewer = { kind: "PARENT" as const, id: parent.authUserId };
    const [thread, members] = await Promise.all([
      getFamilyThread(child.id, viewer, { before: q.get("before") ?? undefined, after }),
      after ? null : getFamilyMembers(child.id),
    ]);
    return mobileJson({ ...thread, members });
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

/** 보내기 — POST { studentId, content, attachments? } */
export async function POST(request: NextRequest) {
  try {
    const { parent, child, body } = await requireParentChildFromBody(request);
    const b = body as { content?: unknown; attachments?: unknown };
    return mobileJson(
      await sendFamilyMessage(child.id, { kind: "PARENT", id: parent.authUserId }, b),
    );
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
