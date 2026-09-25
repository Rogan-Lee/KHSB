import { revalidatePath } from "next/cache";
import { after, type NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileStaff,
} from "@/lib/mobile-auth";
import {
  decideMobileStaffApproval,
  sendApprovalPush,
} from "@/lib/mobile-staff-approvals";

/**
 * 신청 처리 — kind: nap | network | redemption | exam-application
 * body: { decision: "APPROVE" | "REJECT" | "FULFILL"(포인트 교환 지급), note?: 거절 사유 }
 */
export async function POST(
  request: NextRequest,
  context: { params: Promise<{ kind: string; id: string }> },
) {
  try {
    const [user, { kind, id }, body] = await Promise.all([
      requireMobileStaff(request),
      context.params,
      request.json(),
    ]);
    const { result, paths, push } = await decideMobileStaffApproval(
      { id: user.id, name: user.name },
      kind,
      id,
      body,
    );
    for (const path of paths) revalidatePath(path);
    after(() => sendApprovalPush(push));
    return mobileJson(result);
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
