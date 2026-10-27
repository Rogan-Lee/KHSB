import { expect, it } from "vitest";

import { withRo } from "./facility";

it("받침에 맞춰 (으)로를 붙인다", () => {
  expect(withRo("강한선배")).toBe("강한선배로");
  expect(withRo("스터디룸")).toBe("스터디룸으로"); // ㅁ 받침
  expect(withRo("독서실")).toBe("독서실로"); // ㄹ 받침은 "로"
  expect(withRo("KHSB")).toBe("KHSB(으)로");
});
