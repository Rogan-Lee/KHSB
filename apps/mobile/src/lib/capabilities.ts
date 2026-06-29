// 역할 기반 내비게이션/기능 노출의 단일 출처.
// 서버 src/lib/mobile-capabilities.ts 가 /auth/me 로 내려주는 shape 과 동일하게 유지.

export type MobileNavRole =
  | 'student'
  | 'staff'
  | 'mentor'
  | 'director'
  | 'consultant';

export type StaffCapabilities = {
  navRole: Exclude<MobileNavRole, 'student'>;
  fullAccess: boolean;
  offlineOps: boolean;
  onlineModule: boolean;
  writeFeedback: boolean;
  payroll: boolean;
  issueCodes: boolean;
  kakaoRaw: boolean;
};

export type StudentCapabilities = {
  navRole: 'student';
  isOnlineManaged: boolean;
};

export type Capabilities = StaffCapabilities | StudentCapabilities;

export function isStaffCapabilities(c: Capabilities | undefined): c is StaffCapabilities {
  return !!c && c.navRole !== 'student';
}
