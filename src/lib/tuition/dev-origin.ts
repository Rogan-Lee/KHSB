// 개발 환경에서 지금 접속한 서버 주소 — 모의 결제 페이지·콜백 주소를 그 서버로 맞출 때만 쓴다.
// 운영은 설정된 앱 주소(getAppUrl)와 결제사 주소를 그대로 쓰므로 이 값이 쓰이지 않는다
// (Host 헤더를 믿는 것은 개발 환경뿐이다).

import { headers } from "next/headers";

export async function devRequestOrigin(): Promise<string | undefined> {
  if (process.env.NODE_ENV === "production") return undefined;
  const headerList = await headers();
  const host = headerList.get("x-forwarded-host") ?? headerList.get("host");
  if (!host || !/^[A-Za-z0-9.-]+(:\d{1,5})?$/.test(host)) return undefined;
  const https = headerList.get("x-forwarded-proto")?.includes("https") ?? false;
  return `${https ? "https" : "http"}://${host}`;
}
