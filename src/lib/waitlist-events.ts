// 대기 신청·문의 진행 기록(WaitlistEvent) — 종류·라벨과 상세 "진행" 목록 만들기.
// 서버 액션과 화면이 같이 쓴다(순수 함수, DB 접근 없음).

export const CONTACT_METHODS = ["CALL", "NO_ANSWER", "KAKAO", "SMS", "VISIT"] as const;
export type ContactMethod = (typeof CONTACT_METHODS)[number];
export const CONTACT_LABEL: Record<ContactMethod, string> = {
  CALL: "통화함",
  NO_ANSWER: "전화 안 받음",
  KAKAO: "카톡 보냄",
  SMS: "문자 보냄",
  VISIT: "방문 상담",
};
export function isContactMethod(v: unknown): v is ContactMethod {
  return CONTACT_METHODS.includes(v as ContactMethod);
}

// 들어온 경로 — WEB 은 공개 신청 폼, 나머지는 직원이 직접 등록
export const STAFF_SOURCES = ["PHONE", "KAKAO", "VISIT", "OTHER"] as const;
export type StaffSource = (typeof STAFF_SOURCES)[number];
export const SOURCE_LABEL: Record<string, string> = { WEB: "웹 신청", PHONE: "전화", KAKAO: "카톡", VISIT: "방문", OTHER: "기타" };
export function isStaffSource(v: unknown): v is StaffSource {
  return STAFF_SOURCES.includes(v as StaffSource);
}

export const EVENT_DETAIL_MAX = 500;

export type WaitlistEventLite = {
  id: string;
  type: string; // "CONTACT" · "MEMO" · "STATUS" · "GUIDE"
  method: string | null;
  status: string | null;
  detail: string | null;
  actorName: string | null;
  createdAt: string;
};

type Kind = "WAITLIST" | "INQUIRY";

// 문의는 줄을 서지 않아서 같은 상태라도 말을 달리한다
const STATUS_EVENT_LABEL: Record<Kind, Record<string, string>> = {
  WAITLIST: { WAITING: "대기로 되돌림", INVITED: "등록 안내함", ENROLLED: "등원 확정", CANCELLED: "대기 취소" },
  INQUIRY: { WAITING: "다시 엶", INVITED: "등록 안내함", ENROLLED: "등원 확정", CANCELLED: "응대 끝" },
};

/** 가장 최근 연락 기록 (없으면 null) */
export function lastContact(events: WaitlistEventLite[]): WaitlistEventLite | null {
  let last: WaitlistEventLite | null = null;
  for (const ev of events) if (ev.type === "CONTACT" && (!last || ev.createdAt > last.createdAt)) last = ev;
  return last;
}

/** 연락 전 — 아직 열려 있는데(대기·응대 중) 연락 기록이 하나도 없는 건 */
export function needsContact(e: { status: string; events: { type: string }[] }): boolean {
  return e.status === "WAITING" && !e.events.some((ev) => ev.type === "CONTACT");
}

export type TimelineItem = { key: string; at: string | null; label: string; detail: string | null; actor: string | null };

/**
 * 상세 "진행" 목록 — 신청 + 진행 기록 + 같은 번호로 잡힌 면담, 시간순.
 * ponytail: 진행 기록이 생기기 전에 처리한 건은 상태 시각(invitedAt 등)으로 채운다. 시각은 마지막 값만 남아
 * 상태 기록이 하나라도 생기면 옛 시각은 쓰지 않는다(중복·뒤섞임 방지) — 그 전 이력이 빠지는 건 감수.
 */
export function buildTimeline(e: {
  kind: Kind;
  source: string;
  status: string;
  createdAt: string;
  invitedAt: string | null;
  enrolledAt: string | null;
  cancelledAt: string | null;
  cancelReason: string | null;
  events: WaitlistEventLite[];
  consultations: { id: string; at: string | null; status: string }[];
}): TimelineItem[] {
  const noun = e.kind === "INQUIRY" ? "문의" : "대기 신청";
  const items: TimelineItem[] = [
    {
      key: "created",
      at: e.createdAt,
      label: e.source === "WEB" ? `${noun} 접수` : `${noun} 등록 (${SOURCE_LABEL[e.source] ?? "기타"})`,
      detail: null,
      actor: null,
    },
  ];

  for (const ev of e.events) {
    const label =
      ev.type === "CONTACT"
        ? (CONTACT_LABEL[ev.method as ContactMethod] ?? "연락")
        : ev.type === "STATUS"
          ? (STATUS_EVENT_LABEL[e.kind][ev.status ?? ""] ?? "상태 변경")
          : ev.type === "GUIDE"
            ? "등록 안내 작성"
            : "메모";
    items.push({ key: ev.id, at: ev.createdAt, label, detail: ev.detail, actor: ev.actorName });
  }

  for (const c of e.consultations) {
    const label = { SCHEDULED: "면담 예정", COMPLETED: "면담 완료", CANCELLED: "면담 취소" }[c.status] ?? "면담";
    items.push({ key: `consult:${c.id}`, at: c.at, label, detail: null, actor: null });
  }

  if (!e.events.some((ev) => ev.type === "STATUS" || ev.type === "GUIDE")) {
    const label = STATUS_EVENT_LABEL[e.kind];
    if (e.invitedAt) items.push({ key: "invited", at: e.invitedAt, label: label.INVITED, detail: null, actor: null });
    if (e.status === "ENROLLED" && e.enrolledAt)
      items.push({ key: "enrolled", at: e.enrolledAt, label: label.ENROLLED, detail: null, actor: null });
    if (e.status === "CANCELLED" && e.cancelledAt)
      items.push({ key: "cancelled", at: e.cancelledAt, label: label.CANCELLED, detail: e.cancelReason, actor: null });
  }

  // 일시 미정(면담 예정)은 맨 뒤
  return items.sort((a, b) => (a.at ?? "￿").localeCompare(b.at ?? "￿"));
}
