import { mutateMobileApi } from '@/lib/mobile-api';

// 학부모 주차 등록 — 서버: src/lib/mobile-parent-parking.ts
// 차량번호를 보내면 서버가 주차장 웹할인 사이트에 독서실 계정으로 할인을 적용한다.

export type ParkingStatus = 'PENDING' | 'OK' | 'FAILED' | 'BLOCKED';

export type ParentParkingResponse = {
  enabled: boolean;
  dailyLimit: number;
  todayCount: number;
  /** 이 학부모가 마지막으로 등록한 차량 — 입력칸에 미리 채운다 */
  lastCarNo: string | null;
  guide: string;
  today: { id: string; carNo: string; status: ParkingStatus; message: string | null; createdAt: string }[];
};

export const parentParkingPath = (studentId: string) =>
  `/api/mobile/v1/parent/parking?studentId=${encodeURIComponent(studentId)}`;

export function registerParking(studentId: string, carNo: string) {
  return mutateMobileApi<{ ok: true; message: string }>('/api/mobile/v1/parent/parking', 'POST', { studentId, carNo });
}
