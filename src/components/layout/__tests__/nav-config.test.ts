import { describe, expect, it } from "vitest";
import { locateNav, matchNavHref, navTabs, navTarget, sidebarNav, visibleGroups } from "../nav-config";

const hrefs = (role: string) => {
  const { primary, groups } = sidebarNav(role);
  return [...primary, ...groups.flatMap((g) => g.items)].map(navTarget);
};

describe("nav-config", () => {
  it("탭 화면도 그 메뉴로 잡는다", () => {
    expect(matchNavHref("/questions")).toBe("/online/inbox");
    expect(matchNavHref("/mentoring/time")).toBe("/mentoring");
    expect(locateNav("/mentoring/time").tab?.label).toBe("시간 관리");
    expect(matchNavHref("/online/students/abc/plans")).toBe("/students");
    expect(matchNavHref("/reports/ai-queue")).toBe("/reports/monthly");
    expect(matchNavHref("/online")).toBe("/");
    expect(locateNav("/payroll/me").group?.label).toBe("내 계정");
  });

  it("탭 줄은 역할에 보이는 탭이 둘 이상일 때만", () => {
    expect(navTabs(locateNav("/questions"), "DIRECTOR")?.map((t) => t.href)).toEqual([
      "/online/inbox", "/questions", "/suggestions", "/approvals", "/staff-messages",
    ]);
    expect(navTabs(locateNav("/online/inbox"), "CONSULTANT")?.length).toBe(2);
    expect(navTabs(locateNav("/"), "DIRECTOR")).toBeNull();
    expect(navTabs(locateNav("/online/daily-log"), "MANAGER_MENTOR")).toBeNull();
  });

  it("온라인 전용 역할엔 자습실 화면을 숨기고 홈은 /online", () => {
    const online = hrefs("CONSULTANT");
    expect(online[0]).toBe("/online");
    expect(online).toContain("/students");
    expect(online).toContain("/family-chat");
    expect(online).toContain("/mentoring/schedule"); // 멘토링 메뉴는 보이는 첫 탭으로
    for (const h of ["/attendance", "/phone-check", "/seat-map", "/waitlist", "/merit-demerit", "/patrol", "/reports/monthly"]) {
      expect(online).not.toContain(h);
    }
    expect(hrefs("MANAGER_MENTOR")).toContain("/online/daily-log");
  });

  it("자습실 직원은 온라인·관리자 화면을 못 본다", () => {
    const staff = hrefs("MENTOR");
    expect(staff[0]).toBe("/");
    expect(staff).toContain("/attendance");
    for (const h of ["/online/sessions", "/mentors", "/payroll"]) expect(staff).not.toContain(h);
  });

  it("팔레트는 탭 화면까지 펼친다", () => {
    const all = visibleGroups("DIRECTOR").flatMap((g) => g.items.map((i) => i.href));
    expect(all).toEqual(expect.arrayContaining(["/questions", "/vocab-test", "/admin/auth", "/payroll/me", "/requests"]));
  });
});
