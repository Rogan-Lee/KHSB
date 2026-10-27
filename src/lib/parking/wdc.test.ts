import { expect, it } from "vitest";

import { parseDiscountPage, samePlate } from "./wdc";

// 2026-10-27 실제 할인 화면에서 필요한 줄만 (번호·포인트는 가짜)
const PAGE = `
<input type="hidden" id="freePoint" name="freePoint" class="form-control" value="1234">
<input type="text" name="dcMin" value="1시간 5분" class="form-control" disabled>
<a role="button" href="discount.do?userID=x&amp;userName=테스트&userSetting=2&userSheets=0&carNo=12가3456&freePoint=1234&userPoint=0&dcCode=03" class="btn" onclick="return confirm('1시간 적용합니까?')">1시간</a>`;

it("할인 화면에서 할인 시간·포인트·버튼을 읽는다", () => {
  const p = parseDiscountPage(PAGE);
  expect(p.dcMin).toBe(65);
  expect(p.freePoint).toBe(1234);
  expect(p.buttons).toHaveLength(1);
  const url = new URL(p.buttons[0], "http://example.com/WDC/");
  expect(url.searchParams.get("dcCode")).toBe("03");
  expect(url.searchParams.get("carNo")).toBe("12가3456");
  expect(parseDiscountPage("<html></html>")).toEqual({ dcMin: 0, freePoint: null, buttons: [] });
});

it("지역 표기만 다른 번호는 같은 차량, 앞자리가 다르면 다른 차량", () => {
  expect(samePlate("12가3456", "12가 3456")).toBe(true);
  expect(samePlate("서울12가3456", "12가3456")).toBe(true);
  expect(samePlate("112가3456", "12가3456")).toBe(false);
  expect(samePlate("12나3456", "12가3456")).toBe(false);
});
