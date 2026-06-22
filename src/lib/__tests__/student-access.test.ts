import { describe, it, expect, vi } from "vitest";

// student-access 는 @/lib/prisma 를 import 하므로(assertCanManageStudent),
// 순수 함수 테스트를 위해 prisma 를 가볍게 모킹.
vi.mock("@/lib/prisma", () => ({ prisma: { student: { findUnique: vi.fn() } } }));

import { isResponsibleFor } from "@/lib/student-access";
import { isAnyStaff, isStaff, isOnlineStaff } from "@/lib/roles";
import { assignedToMeWhere } from "@/lib/student-filters";

const baseStudent = {
  mentorId: null,
  assignedMentorId: null,
  assignedConsultantId: null,
  assignedStaffId: null,
};

describe("isResponsibleFor", () => {
  it("true for offline 담당 멘토 (mentorId)", () => {
    expect(isResponsibleFor({ ...baseStudent, mentorId: "u1" }, "u1")).toBe(true);
  });
  it("true for each 온라인 배정 필드", () => {
    expect(isResponsibleFor({ ...baseStudent, assignedMentorId: "u2" }, "u2")).toBe(true);
    expect(isResponsibleFor({ ...baseStudent, assignedConsultantId: "u3" }, "u3")).toBe(true);
    expect(isResponsibleFor({ ...baseStudent, assignedStaffId: "u4" }, "u4")).toBe(true);
  });
  it("false when 담당 아님", () => {
    expect(isResponsibleFor({ ...baseStudent, mentorId: "u1" }, "other")).toBe(false);
  });
  it("false for empty userId even if a field is null-matching", () => {
    expect(isResponsibleFor(baseStudent, undefined)).toBe(false);
    expect(isResponsibleFor(baseStudent, null)).toBe(false);
  });
});

describe("isAnyStaff", () => {
  it("true for 오프라인 자습실 역할", () => {
    expect(isAnyStaff("MENTOR")).toBe(true);
    expect(isAnyStaff("STAFF")).toBe(true);
    expect(isAnyStaff("HEAD_MENTOR")).toBe(true);
  });
  it("true for 온라인 전용 역할 (오프라인 STAFF_ROLES엔 없음)", () => {
    expect(isOnlineStaff("CONSULTANT")).toBe(true);
    expect(isStaff("CONSULTANT")).toBe(false);
    expect(isAnyStaff("CONSULTANT")).toBe(true);
    expect(isAnyStaff("MANAGER_MENTOR")).toBe(true);
  });
  it("true for 원장/SA, false for 학생/미인증", () => {
    expect(isAnyStaff("DIRECTOR")).toBe(true);
    expect(isAnyStaff("SUPER_ADMIN")).toBe(true);
    expect(isAnyStaff("STUDENT")).toBe(false);
    expect(isAnyStaff(null)).toBe(false);
    expect(isAnyStaff(undefined)).toBe(false);
  });
});

describe("assignedToMeWhere", () => {
  it("온라인 배정 + 오프라인 멘토를 OR로 결합", () => {
    expect(assignedToMeWhere("u1")).toEqual({
      OR: [
        { mentorId: "u1" },
        { assignedMentorId: "u1" },
        { assignedConsultantId: "u1" },
        { assignedStaffId: "u1" },
      ],
    });
  });
});
