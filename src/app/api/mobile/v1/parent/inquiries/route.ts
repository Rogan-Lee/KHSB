import type { NextRequest } from "next/server";

import { mobileApiErrorResponse, mobileJson } from "@/lib/mobile-auth";
import { createParentInquiry, listParentInquiries } from "@/lib/mobile-parent-inquiries";
import {
  requireParentChildFromBody,
  requireParentChildFromQuery,
} from "@/lib/mobile-parent-services";

/** 원장님께 문의 — 내가 보낸 문의 목록(확인 여부) — GET ?studentId= */
export async function GET(request: NextRequest) {
  try {
    const { parent, child } = await requireParentChildFromQuery(request);
    return mobileJson(await listParentInquiries(parent.authUserId, child));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}

/** 문의 보내기 — POST { studentId, kind: CONSULT|ATTENDANCE|STUDY|ETC, content } */
export async function POST(request: NextRequest) {
  try {
    const { parent, child, body } = await requireParentChildFromBody(request);
    return mobileJson(await createParentInquiry(parent.authUserId, child, body));
  } catch (error) {
    return mobileApiErrorResponse(error);
  }
}
