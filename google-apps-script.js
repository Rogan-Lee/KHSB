/**
 * Google Apps Script — 상담 신청 폼 데이터 수집
 *
 * 설정 방법:
 * 1. Google Sheets에서 새 스프레드시트를 만드세요
 *    - 시트 이름: "상담신청"
 *    - 1행(헤더): 접수일시 | 성함 | 연락처 | 위치/규모 | 현재관리방법
 *
 * 2. 확장 프로그램 > Apps Script 클릭
 *
 * 3. 아래 코드를 전체 복사하여 붙여넣기
 *
 * 4. 배포 > 새 배포 > 유형: 웹 앱
 *    - 실행 주체: 나
 *    - 액세스 권한: 모든 사용자
 *    - 배포 클릭
 *
 * 5. 생성된 URL을 landing.html의 FORM_ENDPOINT에 붙여넣기
 *
 * 6. (선택) 이메일 알림을 받으려면 아래 EMAIL 변수에 이메일 주소를 입력하세요
 */

const SHEET_NAME = '상담신청';
const EMAIL = ''; // 알림 받을 이메일 주소 (빈 문자열이면 알림 없음)
const WEBHOOK_URL = ''; // Next.js 웹훅 URL (예: https://your-app.vercel.app/api/webhooks/consultation)

function doPost(e) {
  try {
    const data = JSON.parse(e.postData.contents);
    const sheet = SpreadsheetApp.getActiveSpreadsheet().getSheetByName(SHEET_NAME);

    // 시트가 없으면 자동 생성
    if (!sheet) {
      const ss = SpreadsheetApp.getActiveSpreadsheet();
      const newSheet = ss.insertSheet(SHEET_NAME);
      newSheet.appendRow(['접수일시', '성함', '연락처', '위치/규모', '현재관리방법']);
      newSheet.appendRow([data.timestamp, data.name, data.phone, data.location, data.method]);
    } else {
      sheet.appendRow([data.timestamp, data.name, data.phone, data.location, data.method]);
    }

    // Next.js 웹훅 호출 (Slack 알림 + Lead DB 저장)
    if (WEBHOOK_URL) {
      try {
        UrlFetchApp.fetch(WEBHOOK_URL, {
          method: 'post',
          contentType: 'application/json',
          payload: JSON.stringify(data),
          muteHttpExceptions: true,
        });
      } catch (err) {
        // 웹훅 실패가 폼 접수를 막지 않도록
        console.error('웹훅 호출 실패:', err);
      }
    }

    // 이메일 알림
    if (EMAIL) {
      MailApp.sendEmail({
        to: EMAIL,
        subject: `[스터디룸 매니저] 새 상담 신청 - ${data.name}`,
        htmlBody: `
          <h3>새로운 상담 신청이 접수되었습니다</h3>
          <table style="border-collapse:collapse;font-family:sans-serif;">
            <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">성함</td><td style="padding:8px;border-bottom:1px solid #eee;">${data.name}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">연락처</td><td style="padding:8px;border-bottom:1px solid #eee;">${data.phone}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;border-bottom:1px solid #eee;">위치/규모</td><td style="padding:8px;border-bottom:1px solid #eee;">${data.location || '-'}</td></tr>
            <tr><td style="padding:8px;font-weight:bold;">현재 관리 방법</td><td style="padding:8px;">${data.method || '-'}</td></tr>
          </table>
          <p style="margin-top:16px;color:#888;font-size:13px;">접수일시: ${data.timestamp}</p>
        `
      });
    }

    return ContentService
      .createTextOutput(JSON.stringify({ result: 'success' }))
      .setMimeType(ContentService.MimeType.JSON);

  } catch (error) {
    return ContentService
      .createTextOutput(JSON.stringify({ result: 'error', message: error.toString() }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function doGet() {
  return ContentService
    .createTextOutput('상담 신청 API가 정상 작동 중입니다.')
    .setMimeType(ContentService.MimeType.TEXT);
}
