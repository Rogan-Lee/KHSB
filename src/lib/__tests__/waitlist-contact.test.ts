import { describe, expect, it } from "vitest";

import { contactPhonesForDisplay, normalizePhone, splitContactPhones } from "@/lib/waitlist-contact";

describe("normalizePhone", () => {
  it("keeps Korean mobile numbers as digits", () => {
    expect(normalizePhone("010-1234-5678")).toBe("01012345678");
    expect(normalizePhone("02-123-4567")).toBeNull();
    expect(normalizePhone(undefined)).toBeNull();
  });
});

describe("splitContactPhones", () => {
  it("puts the verified number on the applicant's side", () => {
    expect(splitContactPhones({ kind: "WAITLIST", applicant: "PARENT", phone: "01011112222", otherPhone: "010-3333-4444" })).toEqual({
      ok: true,
      parentPhone: "01011112222",
      studentPhone: "01033334444",
    });
    expect(splitContactPhones({ kind: "WAITLIST", applicant: "STUDENT", phone: "01033334444", otherPhone: "01011112222" })).toEqual({
      ok: true,
      parentPhone: "01011112222",
      studentPhone: "01033334444",
    });
  });

  it("lets a parent skip the student number", () => {
    expect(splitContactPhones({ kind: "WAITLIST", applicant: "PARENT", phone: "01011112222", otherPhone: "  " })).toEqual({
      ok: true,
      parentPhone: "01011112222",
      studentPhone: null,
    });
  });

  it("requires the parent number when a student applies for the waitlist", () => {
    expect(splitContactPhones({ kind: "WAITLIST", applicant: "STUDENT", phone: "01033334444", otherPhone: "" })).toEqual({
      ok: false,
      error: "학부모 휴대폰 번호를 입력해주세요",
    });
  });

  it("does not require the other number for inquiries", () => {
    expect(splitContactPhones({ kind: "INQUIRY", applicant: "STUDENT", phone: "01033334444", otherPhone: null })).toEqual({
      ok: true,
      parentPhone: null,
      studentPhone: "01033334444",
    });
  });

  it("rejects a malformed other number", () => {
    expect(splitContactPhones({ kind: "INQUIRY", applicant: "PARENT", phone: "01011112222", otherPhone: "1234" })).toEqual({
      ok: false,
      error: "학생 휴대폰 번호를 확인해주세요",
    });
  });
});

describe("contactPhonesForDisplay", () => {
  it("shows legacy entries as a single contact", () => {
    expect(contactPhonesForDisplay({ phone: "01011112222", parentPhone: null, studentPhone: null })).toEqual([
      { label: "연락처", phone: "01011112222", isApplicant: true },
    ]);
  });

  it("marks which number the applicant verified", () => {
    expect(contactPhonesForDisplay({ phone: "01033334444", parentPhone: "01011112222", studentPhone: "01033334444" })).toEqual([
      { label: "학부모", phone: "01011112222", isApplicant: false },
      { label: "학생", phone: "01033334444", isApplicant: true },
    ]);
  });

  it("marks only the parent row when both numbers are the same", () => {
    const rows = contactPhonesForDisplay({ phone: "01011112222", parentPhone: "01011112222", studentPhone: "01011112222" });
    expect(rows.map((r) => r.isApplicant)).toEqual([true, false]);
  });
});
