import type { NextRequest } from "next/server";

import {
  mobileApiErrorResponse,
  mobileJson,
  requireMobileAnyStaff,
} from "@/lib/mobile-auth";
import { getMobileStaffDmThread, sendMobileStaffDm } from "@/lib/mobile-staff-dm";

type Context = { params: Promise<{ userId: string }> };

/** 상대 직원과의 스레드 (없으면 생성) — 조회 시 상대 메시지 읽음 처리 */
export async function GET(request: NextRequest, context: Context) {
  try {
    const [user, { userId }] = await Promise.all([
      requireMobileAnyStaff(request),
      context.params,
    ]);
    return mobileJson(await getMobileStaffDmThread(user.id, userId));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

/** 메시지 전송 { content } — 상대에게 푸시 */
export async function POST(request: NextRequest, context: Context) {
  try {
    const [user, { userId }, body] = await Promise.all([
      requireMobileAnyStaff(request),
      context.params,
      request.json(),
    ]);
    return mobileJson(
      await sendMobileStaffDm({ id: user.id, name: user.name }, userId, body),
    );
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
