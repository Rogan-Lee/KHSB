// 학부모 주차 등록 — 하루 한도(차단)와 부정 사용 의심 감지(표시·알림). 순수 함수, 기준값은 여기서만 바꾼다.
// 한도만 등록을 막고, 나머지 의심 사유는 등록은 해 주되 어드민 표시 + 슬랙 알림으로 넘긴다 (2026-10-27 결정).

export const PARKING_RULES = {
  /** 학생(가족)당 하루 등록 횟수 — 넘으면 차단 */
  dailyLimit: 2,
  /** 같은 차량이 최근 30일 중 이 일수 이상 등록되면 의심 (정기 방문) */
  frequentCarDays: 15,
  /** 한 가족이 최근 7일 동안 이 횟수 이상 등록하면 의심 */
  weeklyFamily: 8,
  /** 한 학부모 계정이 최근 30일 동안 이 대수 이상의 차량을 등록하면 의심 */
  carsPerParent: 3,
  /** 운영 시간(KST, 시) — 이 밖의 등록은 의심 */
  openHour: 8,
  closeHour: 24,
  /** 감지에 쓰는 기록 기간(일) */
  windowDays: 30,
};

export type ParkingFlag =
  | "FREQUENT_CAR"
  | "MANY_IN_WEEK"
  | "MANY_CARS"
  | "SHARED_CAR"
  | "OFF_HOURS"
  | "NOT_ATTENDING";

export const PARKING_FLAG_LABEL: Record<ParkingFlag, string> = {
  FREQUENT_CAR: `같은 차량 30일 중 ${PARKING_RULES.frequentCarDays}일 이상`,
  MANY_IN_WEEK: `7일 동안 ${PARKING_RULES.weeklyFamily}회 이상`,
  MANY_CARS: `한 학부모가 차량 ${PARKING_RULES.carsPerParent}대 이상`,
  SHARED_CAR: "다른 학생 가족도 쓴 차량",
  OFF_HOURS: "운영 시간 밖 등록",
  // 등록 시점이 아니라 어드민에서 볼 때 그날 출결로 판단한다 (자녀가 입실하기 전에 등록하는 경우가 흔해서)
  NOT_ATTENDING: "그날 자녀 입실 기록 없음",
};

/** PENDING(처리 중)도 포인트를 쓸 수 있으니 한도에 넣는다 */
export const COUNTED_STATUSES = ["OK", "PENDING"];

export type ParkingHistoryRow = {
  studentId: string;
  authUserId: string;
  carNo: string;
  /** YYYY-MM-DD (KST) */
  date: string;
  status: string;
  flags: string[];
};

export type ParkingAttempt = {
  studentId: string;
  authUserId: string;
  carNo: string;
  /** YYYY-MM-DD (KST) */
  today: string;
  /** 0~23 (KST) */
  hour: number;
};

/** 공백·하이픈을 지운 번호. 형식이 아니면 null — 12가3456, 123가4567, 서울12가3456 */
export function normalizeCarNo(input: string): string | null {
  const v = input.replace(/[\s-]/g, "");
  return /^(?:[가-힣]{2})?\d{2,3}[가-힣]\d{4}$/.test(v) ? v : null;
}

export function addDays(ymd: string, days: number): string {
  const d = new Date(`${ymd}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

/**
 * history 는 최근 windowDays 일 기록(모든 학생). 반환:
 * - blocked: 차단 사유(학부모에게 보여 줄 문장) 또는 null
 * - flags: 이번 등록에 붙는 의심 사유
 * - newFlags: 이 가족의 최근 기록에 없던 사유 — 슬랙 알림은 이것만 보낸다 (매일 같은 알림 방지)
 */
export function checkParkingAttempt(attempt: ParkingAttempt, history: ParkingHistoryRow[]) {
  const R = PARKING_RULES;
  const counted = history.filter((r) => COUNTED_STATUSES.includes(r.status));

  const todayCount = counted.filter((r) => r.studentId === attempt.studentId && r.date === attempt.today).length;
  if (todayCount >= R.dailyLimit) {
    return {
      blocked: `주차 등록은 하루 ${R.dailyLimit}번까지 할 수 있어요.`,
      flags: [] as ParkingFlag[],
      newFlags: [] as ParkingFlag[],
    };
  }

  // 이번 등록까지 넣고 센다
  const all = [...counted, { ...attempt, date: attempt.today, status: "PENDING", flags: [] }];
  const flags: ParkingFlag[] = [];

  const carDays = new Set(all.filter((r) => r.carNo === attempt.carNo).map((r) => r.date));
  if (carDays.size >= R.frequentCarDays) flags.push("FREQUENT_CAR");

  const weekStart = addDays(attempt.today, -6);
  const week = all.filter((r) => r.studentId === attempt.studentId && r.date >= weekStart);
  if (week.length >= R.weeklyFamily) flags.push("MANY_IN_WEEK");

  const cars = new Set(all.filter((r) => r.authUserId === attempt.authUserId).map((r) => r.carNo));
  if (cars.size >= R.carsPerParent) flags.push("MANY_CARS");

  // 형제(같은 학부모 계정이 두 자녀에 연결)는 정상이라 다른 학부모 계정일 때만 본다
  const shared = all.some(
    (r) => r.carNo === attempt.carNo && r.studentId !== attempt.studentId && r.authUserId !== attempt.authUserId,
  );
  if (shared) flags.push("SHARED_CAR");

  if (attempt.hour < R.openHour || attempt.hour >= R.closeHour) flags.push("OFF_HOURS");

  const seen = new Set(history.filter((r) => r.studentId === attempt.studentId).flatMap((r) => r.flags));
  return { blocked: null, flags, newFlags: flags.filter((f) => !seen.has(f)) };
}
