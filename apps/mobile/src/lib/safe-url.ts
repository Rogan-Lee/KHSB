// 서버에서 받은 링크(콘텐츠 원문·첨부·Meet 등)는 http(s) 만 연다.
// tel:/sms:/intent: 같은 다른 스킴이나 앱 딥링크가 서버 데이터를 통해 실행되지 않게 한다.
export function isWebUrl(url: string | null | undefined): url is string {
  return typeof url === 'string' && /^https?:\/\//i.test(url.trim());
}
