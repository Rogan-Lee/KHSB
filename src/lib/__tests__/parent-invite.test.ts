import { describe, expect, it } from "vitest";

import { resolveParentInviteTargets } from "@/lib/parent-invite";

describe("resolveParentInviteTargets", () => {
  it("새 필드(targetStudentIds)가 있으면 그대로 사용하고 레거시 페이로드는 무시한다", () => {
    expect(
      resolveParentInviteTargets(
        {
          targetStudentId: "a",
          targetStudentIds: ["a", "b"],
          parentRelation: "모",
        },
        JSON.stringify({ relation: "부", studentIds: ["z"] }),
      ),
    ).toEqual({ studentIds: ["a", "b"], relation: "모" });
  });

  it("새 필드가 비어 있으면 레거시 AuthVerification 페이로드로 폴백한다", () => {
    expect(
      resolveParentInviteTargets(
        { targetStudentId: "a", targetStudentIds: [], parentRelation: null },
        JSON.stringify({ relation: "부", studentIds: ["a", "b"] }),
      ),
    ).toEqual({ studentIds: ["a", "b"], relation: "부" });
  });

  it("레거시 페이로드가 깨져 있으면 targetStudentId 단건으로 폴백한다", () => {
    expect(
      resolveParentInviteTargets(
        { targetStudentId: "a", targetStudentIds: [], parentRelation: null },
        "not-json",
      ),
    ).toEqual({ studentIds: ["a"], relation: null });
  });
});
