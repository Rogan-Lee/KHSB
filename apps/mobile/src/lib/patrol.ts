export const PATROL_QR_PREFIX = 'KHSB-STU:';

export function decodeStudentQr(payload: string | null | undefined) {
  if (!payload) return null;
  const trimmed = payload.trim();
  if (!trimmed.startsWith(PATROL_QR_PREFIX)) return null;
  const studentId = trimmed.slice(PATROL_QR_PREFIX.length).trim();
  return studentId || null;
}
