import { z } from "zod";

import { loadLunchStateForStudent } from "@/lib/lunch-data";
import {
  claimLunchDepositForStudent,
  requestLunchChangeForStudent,
  submitLunchOrderForStudent,
} from "@/lib/lunch-order-core";
import { parseMobileBody } from "@/lib/mobile-parent-services";

// 학생 앱 — 도시락 신청. 웹 학생 포털 /s/[token]/lunch 와 같은 상태·규칙(lunch-data, lunch-order-core 공용).
// 인증은 라우트의 requireMobileStudent(앱 로그인 학생). 응답 모양은 학부모 /parent/lunch 와 같다.

type LunchStudent = { id: string; name: string };

const VIA_APP = " (학생 앱)";

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

export async function getStudentLunch(student: LunchStudent) {
  const state = await loadLunchStateForStudent(student.id);
  return { studentName: student.name, ...state };
}

export async function saveStudentLunchOrder(student: LunchStudent, input: unknown) {
  const body = parseMobileBody(orderSchema, input);
  return submitLunchOrderForStudent(student.id, {
    menuIds: [...new Set(body.menuIds)],
    memo: body.memo ?? undefined,
  });
}

export async function claimStudentLunchDeposit(student: LunchStudent) {
  return claimLunchDepositForStudent(student, VIA_APP);
}

export async function requestStudentLunchChange(student: LunchStudent, input: unknown) {
  const body = parseMobileBody(changeSchema, input);
  return requestLunchChangeForStudent(student, body.message, VIA_APP);
}
