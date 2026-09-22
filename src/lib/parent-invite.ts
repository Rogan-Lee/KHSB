// 학부모 초대 수락 시 ParentLink 생성 대상(자녀 목록/관계) 결정. 순수 함수 — auth-server 훅에서 사용.
export function resolveParentInviteTargets(
  invitation: {
    targetStudentId: string | null;
    targetStudentIds: string[];
    parentRelation: string | null;
  },
  legacyPayload: string | null,
): { studentIds: string[]; relation: string | null } {
  // 새 정식 필드 우선
  if (invitation.targetStudentIds.length > 0) {
    return {
      studentIds: invitation.targetStudentIds,
      relation: invitation.parentRelation,
    };
  }

  // 폴백: 필드 도입 전 발급된 대기 초대는 AuthVerification(`parent-invite:<tokenHash>`)에
  // JSON 페이로드({ relation, studentIds })로 동봉되어 있다. 기존 초대 소진 후 제거 가능.
  let studentIds = invitation.targetStudentId ? [invitation.targetStudentId] : [];
  let relation: string | null = null;
  if (legacyPayload) {
    try {
      const parsed = JSON.parse(legacyPayload) as {
        relation?: string | null;
        studentIds?: string[];
      };
      if (Array.isArray(parsed.studentIds) && parsed.studentIds.length > 0) {
        studentIds = parsed.studentIds;
      }
      relation = parsed.relation ?? null;
    } catch {
      // 페이로드 파싱 실패 시 targetStudentId 폴백 유지
    }
  }
  return { studentIds, relation };
}
