import { describe, expect, it } from "vitest";

// 시설 장비에서 도는 스크립트의 순수 함수들 (실행 진입점은 import 시 돌지 않는다)
import { normalizeMac, parseArp, parseIpNeigh, parseWindowsArp, splitManaged } from "../../../public/access-agent/agent.mjs";

describe("이웃 기기 표 읽기", () => {
  it("리눅스 ip neigh: 연결 실패·주소 없는 줄을 버리고 MAC 을 정리한다", () => {
    const text = [
      "192.168.0.23 dev eth0 lladdr A8:BB:CC:DD:EE:01 REACHABLE",
      "192.168.0.24 dev eth0 lladdr a8:bb:cc:dd:ee:02 STALE",
      "192.168.0.25 dev eth0  FAILED",
      "192.168.0.26 dev eth0 INCOMPLETE",
      "fe80::1 dev eth0 lladdr 00:31:92:00:00:01 router REACHABLE",
      "224.0.0.251 dev eth0 lladdr 01:00:5e:00:00:fb NOARP",
      "",
    ].join("\n");
    expect(parseIpNeigh(text)).toEqual([
      { mac: "a8:bb:cc:dd:ee:01", ip: "192.168.0.23" },
      { mac: "a8:bb:cc:dd:ee:02", ip: "192.168.0.24" },
      { mac: "00:31:92:00:00:01", ip: "fe80::1" },
    ]);
  });

  it("macOS arp -an: 앞자리 0 이 빠진 MAC 을 채우고 미완성·브로드캐스트를 버린다", () => {
    const text = [
      "? (192.168.0.1) at 0:31:92:83:f1:72 on en0 ifscope [ethernet]",
      "? (169.254.169.254) at (incomplete) on en0 [ethernet]",
      "? (192.168.0.255) at ff:ff:ff:ff:ff:ff on en0 ifscope [ethernet]",
    ].join("\n");
    expect(parseArp(text)).toEqual([{ mac: "00:31:92:83:f1:72", ip: "192.168.0.1" }]);
  });

  it("윈도우 arp -a: 영어·한국어 윈도우 모두 읽고 브로드캐스트·멀티캐스트를 버린다", () => {
    const english = [
      "",
      "Interface: 192.168.0.10 --- 0x5",
      "  Internet Address      Physical Address      Type",
      "  192.168.0.1           00-31-92-83-f1-72     dynamic",
      "  192.168.0.23          A8-BB-CC-DD-EE-01     dynamic",
      "  192.168.0.255         ff-ff-ff-ff-ff-ff     static",
      "  224.0.0.22            01-00-5e-00-00-16     static",
    ].join("\r\n");
    expect(parseWindowsArp(english)).toEqual([
      { mac: "00:31:92:83:f1:72", ip: "192.168.0.1" },
      { mac: "a8:bb:cc:dd:ee:01", ip: "192.168.0.23" },
    ]);
    const korean = [
      "인터페이스: 192.168.0.10 --- 0x5",
      "  인터넷 주소           물리적 주소           유형",
      "  192.168.0.24          a8-bb-cc-dd-ee-02     동적",
      "  239.255.255.250       01-00-5e-7f-ff-fa     정적",
    ].join("\r\n");
    expect(parseWindowsArp(korean)).toEqual([{ mac: "a8:bb:cc:dd:ee:02", ip: "192.168.0.24" }]);
  });

  it("서버와 같은 MAC 정리 규칙을 쓴다", () => {
    expect(normalizeMac("AA-BB-CC-DD-EE-01")).toBe("aa:bb:cc:dd:ee:01");
    expect(normalizeMac("01:00:5e:00:00:fb")).toBeNull();
    expect(normalizeMac("zz:bb:cc:dd:ee:01")).toBeNull();
  });
});

describe("splitManaged", () => {
  const managed = { begin: "! srm:begin", end: "! srm:end" };
  it("관리 구간과 직접 적은 규칙을 나눈다", () => {
    expect(splitManaged(["||mine^", "! srm:begin", "||a^", "||b^", "! srm:end", "||after^"], managed)).toEqual({
      before: ["||mine^"],
      managed: ["||a^", "||b^"],
      after: ["||after^"],
    });
  });
  it("구간이 없으면 전부 직접 적은 규칙", () => {
    expect(splitManaged(["||mine^"], managed)).toEqual({ before: ["||mine^"], managed: [], after: [] });
  });
  it("표시가 한쪽만 남았으면 표시만 걷어 낸다", () => {
    expect(splitManaged(["||mine^", "! srm:begin", "||orphan^"], managed)).toEqual({
      before: ["||mine^", "||orphan^"],
      managed: [],
      after: [],
    });
  });
});
