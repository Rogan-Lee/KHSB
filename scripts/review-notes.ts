/**
 * App Review 에 보내는 영문 설명 — 심사 메모(App Review Information > Notes)와 Apple 의 추가 정보 요청
 * 답장에 같은 글을 쓴다. 두 칸 모두 4,000자 제한이라 글을 늘릴 땐 길이를 확인할 것(seed-review-demo.ts 가 알려 준다).
 * 앱 화면 이름·경로가 바뀌면 여기도 고친다.
 */
export const APP_REVIEW_NOTES_LIMIT = 4000;

export function appReviewNotes(s: {
  student: { username: string; password: string };
  parent: { username: string; password: string };
  staff: { username: string; password: string };
  invites: string[];
  /** 개발자 계정 명의가 독서실이 아닐 때만 — 6번 항목에 "누가 독서실을 대신해 올렸는지" 한 줄이 붙는다 (저장소가 공개라 값은 코드에 두지 않는다) */
  developerName?: string;
}) {
  const publishedBy = s.developerName
    ? ` The app is published by ${s.developerName} (individual developer account) on behalf of KHSB, the study hall operator.`
    : "";
  return `Thank you for reviewing 강한선배 (KHSB).

1. SCREEN RECORDING
Attached (physical iPhone, from launch): invitation sign-up, account deletion, login, terms, student flow (incl. report, block and focus mode) and parent flow (incl. tuition).

2. PURPOSE AND AUDIENCE
KHSB is a managed study hall (a paid study space with seats, attendance tracking and study coaching) in Hwaseong, South Korea; its customers are students and parents, and the app is the companion to that offline service.
- Students: schedule, assignments and feedback, study questions, messages to their teacher, vocabulary tests, lunch orders.
- Parents: their child's attendance, mentoring reports, mock exam results, merit points, tuition bills, inquiries to the director.
- Staff: answer questions and messages, give assignment feedback.
It is not an internal or enterprise app: anyone can enroll, and students and parents are the main users.

3. ACCESS
Accounts are created by invitation because each is linked to an enrolled student. The UI is in Korean. Demo accounts (Login screen > "로그인" tab), all tied to a fictional student with sample data:
- Student: ${s.student.username} / ${s.student.password}
- Parent: ${s.parent.username} / ${s.parent.password}
- Staff: ${s.staff.username} / ${s.staff.password} (sees only the demo student)
Sign-up: Login screen > "초대받았어요" tab > paste a one-time invitation code > create a parent account. Codes: ${s.invites.join(" or ")}
Account deletion: "전체" (last tab) > "계정·보안" > "계정 삭제" > confirm > enter password. The account is deleted immediately.

4. EXTERNAL SERVICES
Vercel (API hosting, attachments), Supabase (PostgreSQL, Seoul), Expo push via APNs, Resend (password reset email), Slack (staff alerts), Groq LLM API (drafts mentoring report wording for staff; no AI for students or parents). Own sign-in (ID or email + password). No payment, advertising or analytics SDK.

5. REGIONS
The app works the same in every region.

6. REGULATED INDUSTRY / THIRD-PARTY MATERIAL
Not applicable (no financial, medical, legal or gambling services; no licensed third-party media).${publishedBy}

USER-GENERATED CONTENT
No public feed, profile or comments; messages and questions are private, one-to-one with study hall staff.
- Terms with no tolerance for objectionable content or abusive users are accepted at sign-up or first login: https://www.kanghanseonbae.com/terms.html
- Report / block: long-press a received message (or ⋯ at the top right of a conversation) > "신고하기" / "차단하기". The director reviews reports within 24 h and can remove content and restrict the account. Blocking hides the user's messages at once and stops new ones; unblock in "전체" > "계정·보안" > "차단한 사용자".
Try: student > "메시지" > a conversation > long-press a teacher's message.

FOCUS MODE (Screen Time, individual authorization)
Family Controls (Distribution) is assigned to team QUABYXMW2H and enabled on the app and its 3 extensions.
Optional: a student shields apps/sites they pick on their own device until they end it; after 2 h it asks if they're still studying and ends at 3 h if unanswered. Only the student turns it on or off; nothing leaves the device; staff can't see or control it. A student-set lock PIN (kept on the device) is needed to change apps or end it. A forgotten PIN is reset in-app with the account password, or by turning off Screen Time access in Settings.
Try: student > "홈" > "집중 모드" > "계속" > allow > pick apps > set any PIN > "집중 시작".

PAID CONTENT
No in-app purchases, subscriptions or digital goods. Offline study hall tuition is billed by staff: in "전체" > "수강료" a parent views the bill and pays at the front desk or on the payment provider's web page in the browser (3.1.3(e)); the app never collects card details. Online payment isn't enabled yet (demo bill: front desk only). Lunch boxes (physical meals) are paid by bank transfer; merit points are staff-granted and can't be bought.
`;
}
