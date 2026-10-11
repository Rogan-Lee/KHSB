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
  return `Thank you for reviewing 강한선배 (KHSB). The requested information is below.

1. SCREEN RECORDING
Attached. Recorded on a physical iPhone running the latest iOS, from app launch: invitation sign-up, account deletion, login, terms agreement, the student flow (assignments, a photo question, messages, reporting and blocking) and the parent flow.

2. PURPOSE AND AUDIENCE
KHSB is a managed study hall (a paid study space with seats, attendance tracking and study coaching) in Dongtan, Hwaseong, South Korea. Its customers are students and their parents; the app is the companion to that offline service.
- Students: schedule, assignments and feedback, study questions, messages to their teacher, vocabulary tests, lunch orders.
- Parents: their child's attendance, mentoring reports, mock exam results, merit points, inquiries to the director.
- Staff: answer questions and messages, give feedback on assignments.
It lets parents see how their child is studying and gives students one place to reach staff. It is not an internal or enterprise app: anyone can enroll at the study hall, and students and parents are the main users.

3. ACCESS
Accounts are created by invitation because each is linked to an enrolled student. The UI is in Korean. Demo accounts (Login screen > "로그인" tab), all tied to a fictional student with sample data:
- Student: ${s.student.username} / ${s.student.password}
- Parent: ${s.parent.username} / ${s.parent.password}
- Staff: ${s.staff.username} / ${s.staff.password} (consultant role; sees only the demo student, so no real student data is shown)
Sign-up: Login screen > "초대받았어요" tab > paste a one-time invitation code > create a parent account. Codes: ${s.invites.join(" or ")}
Account deletion: "전체" (last tab) > "계정·보안" > "계정 삭제" > confirm > enter password. The account is deleted immediately.

4. EXTERNAL SERVICES
- Vercel: backend API hosting, storage of photo and file attachments
- Supabase: managed PostgreSQL database (Seoul region)
- Expo push service (via APNs): push notifications
- Resend: password reset emails
- Slack: internal alerts to staff
- Groq (LLM API): helps staff tidy the wording of mentoring reports on the staff web dashboard; staff review it before sending. No AI feature for students or parents.
Sign-in runs on our own server (ID or email + password), with no third-party sign-in. The app has no payment processor, advertising or analytics SDK.

5. REGIONS
The app works the same in every region.

6. REGULATED INDUSTRY / THIRD-PARTY MATERIAL
Not applicable. The app offers no financial, medical, legal or gambling services and does not distribute licensed third-party media.${publishedBy}

USER-GENERATED CONTENT
There is no public feed, profile or comment area. Messages and questions are private, one-to-one between an enrolled student or parent and study hall staff.
- Terms: every account agrees to terms with no tolerance for objectionable content or abusive users, at sign-up or at first login: https://www.kanghanseonbae.com/terms.html
- Report: long-press a received message, or tap ⋯ at the top right of a conversation, then "신고하기". The director reviews reports within 24 hours and can delete the content and restrict the account.
- Block: same menu, "차단하기". The blocked user's messages are hidden at once and neither side can send new ones. Unblock in "전체" > "계정·보안" > "차단한 사용자".
To try it: log in as the student > "메시지" tab > open a conversation > long-press a teacher's message.

PAID CONTENT
None. The app is free with no in-app purchases, subscriptions or digital goods. Lunch boxes are physical meals served at the study hall and paid by bank transfer outside the app. Merit points are granted by staff and cannot be bought.

Support: https://www.kanghanseonbae.com/support.html
`;
}
