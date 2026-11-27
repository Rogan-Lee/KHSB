// 비공개 첨부(/api/files/<pathname>) 권한 판단 — 순수 함수. DB 조회는 src/app/api/files 라우트가 한다.
//
// 파일이 어느 학생 것인지는 업로드 경로 규칙으로 정한다 (업로드 라우트들이 이미 쓰는 prefix 그대로):
//   family-chat/<studentId>/…                       → 그 학생
//   portal-chat/<chatId>/…, online/chats/<chatId>/… → PortalChat.studentId
//   online/tasks/<taskId>/…                         → PerformanceTask.studentId
//   online/feedback/<submissionId>/…                → TaskSubmission.studentId
//   mentoring/<mentoringId>/…                       → Mentoring.studentId
//   mentoring-sessions/<sessionId>/…                → MentoringSession.studentId
//   assignments/<assignmentId>/…                    → Assignment.studentId
//   student-questions/…                             → 이 파일을 첨부한 QuestionMessage 의 질문 학생 (작성 전 업로드라 경로에 id 가 없다)
//   photos/…                                        → 이 파일을 가진 Photo.studentId (매칭 안 된 사진은 운영진만)
// 그 밖의 경로는 운영진만 본다.

export type FileOwnerRef =
  | {
      kind:
        | "student"
        | "portalChat"
        | "task"
        | "submission"
        | "mentoring"
        | "mentoringSession"
        | "assignment";
      id: string;
    }
  | { kind: "question" | "photo" };

const ID_PREFIXES = [
  ["family-chat/", "student"],
  ["portal-chat/", "portalChat"],
  ["online/chats/", "portalChat"],
  ["online/tasks/", "task"],
  ["online/feedback/", "submission"],
  ["mentoring/", "mentoring"],
  ["mentoring-sessions/", "mentoringSession"],
  ["assignments/", "assignment"],
] as const;

export function parseFileOwner(pathname: string): FileOwnerRef | null {
  for (const [prefix, kind] of ID_PREFIXES) {
    if (!pathname.startsWith(prefix)) continue;
    const [id, ...rest] = pathname.slice(prefix.length).split("/");
    // <id>/<파일> 꼴이어야 한다 — 파일 이름만 있으면 id 로 오인하지 않는다
    return id && rest.length > 0 ? { kind, id } : null;
  }
  if (pathname.startsWith("student-questions/")) return { kind: "question" };
  if (pathname.startsWith("photos/")) return { kind: "photo" };
  return null;
}

/** 보는 사람: 운영진이면 전부, 아니면 연결된 학생(본인·자녀·매직링크 학생) 파일만 */
export type FileViewer = { staff: boolean; studentIds: readonly string[] };

export function canReadFile(viewer: FileViewer, ownerStudentId: string | null) {
  if (viewer.staff) return true;
  return ownerStudentId !== null && viewer.studentIds.includes(ownerStudentId);
}

/** 학생 포털(/s/<token>)이 이미지·파일 요청에 매직링크를 실어 보내는 쿠키. src/proxy.ts 가 심는다 (path=/api/files) */
export const PORTAL_FILE_COOKIE = "srm_portal_files";
