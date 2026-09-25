import { mutateMobileApi } from '@/lib/mobile-api';
import type { ParentLunchResponse } from '@/lib/api/parent-services';

// 학생 도시락 — 웹 학생 포털 /s/[token]/lunch 의 네이티브판. 서버: src/lib/mobile-student-lunch.ts
// 응답 모양은 학부모 /parent/lunch 와 같다 (lunch-data.ts loadLunchStateForStudent 공용).

const BASE = '/api/mobile/v1/student/lunch';

export const STUDENT_LUNCH_PATH = BASE;

export type StudentLunchResponse = ParentLunchResponse;

export function saveStudentLunchOrder(menuIds: string[], memo: string) {
  return mutateMobileApi<{ count: number }>(`${BASE}/order`, 'PUT', { menuIds, memo });
}

export function claimStudentLunchDeposit() {
  return mutateMobileApi<{ ok: true }>(`${BASE}/deposit-claim`, 'POST', {});
}

export function requestStudentLunchChange(message: string) {
  return mutateMobileApi<{ ok: true }>(`${BASE}/change-requests`, 'POST', { message });
}
