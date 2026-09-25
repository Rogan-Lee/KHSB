import { z } from "zod";

import { loadLunchStateForStudent } from "@/lib/lunch-data";
import {
  claimLunchDepositForStudent,
  requestLunchChangeForStudent,
  submitLunchOrderForStudent,
} from "@/lib/lunch-order-core";
import { parseMobileBody, type ParentChildRef } from "@/lib/mobile-parent-services";

// 학부모 앱 — 도시락 신청. 웹 /meal/[token] 폼과 같은 상태·규칙(lunch-data, lunch-order-core 공용).
// 학생 매직링크 토큰은 절대 쓰지 않는다: 인증은 라우트의 requireParentChild(ParentLink).

const VIA_APP = " (학부모 앱)";

const orderSchema = z.object({
  menuIds: z.array(z.string().trim().min(1).max(64)).max(62, "한 번에 신청할 수 있는 날짜를 넘었어요"),
  memo: z.string().max(300, "요청사항은 300자까지 쓸 수 있어요").optional().nullable(),
});

const changeSchema = z.object({
  message: z
    .string()
    .trim()
    .min(1, "변경 요청 내용을 입력해 주세요")
    .max(500, "변경 요청은 500자까지 쓸 수 있어요"),
});

export async function getParentLunch(child: ParentChildRef) {
  const state = await loadLunchStateForStudent(child.id);
  return { studentName: child.name, ...state };
}

export async function saveParentLunchOrder(child: ParentChildRef, input: unknown) {
  const body = parseMobileBody(orderSchema, input);
  return submitLunchOrderForStudent(child.id, {
    menuIds: [...new Set(body.menuIds)],
    memo: body.memo ?? undefined,
  });
}

export async function claimParentLunchDeposit(child: ParentChildRef) {
  return claimLunchDepositForStudent(child, VIA_APP);
}

export async function requestParentLunchChange(child: ParentChildRef, input: unknown) {
  const body = parseMobileBody(changeSchema, input);
  return requestLunchChangeForStudent(child, body.message, VIA_APP);
}
