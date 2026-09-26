/**
 * Slack Incoming Webhook 알림 유틸리티
 *
 * 사용법:
 *   import { notifySlack } from "@/lib/slack";
 *   await notifySlack("새 상담 신청이 접수되었습니다!");
 *   await notifySlack({ blocks: [...] }); // Block Kit 형식
 */

const WEBHOOK_URL = process.env.SLACK_WEBHOOK_URL;

interface SlackBlock {
  type: string;
  text?: { type: string; text: string; emoji?: boolean };
  fields?: { type: string; text: string }[];
  elements?: { type: string; text: string }[];
  [key: string]: unknown;
}

/**
 * Slack mrkdwn 제어문자 이스케이프 (&, <, >).
 * 학생·학부모 입력이 `<!channel>` 전체 호출이나 `<https://악성|공지>` 위장 링크로 해석되지 않게 한다.
 * *굵게* / _기울임_ 서식은 영향 없음.
 */
export function escapeSlack(text: unknown): string {
  return String(text ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

/**
 * 문자열 메시지는 통째로 escapeSlack 처리한다 — 호출부들이 사용자 입력을 그대로 끼워 넣으므로.
 * (문자열 메시지에서 Slack `<url|라벨>` 링크 문법을 쓰는 호출부는 없음. 링크가 필요하면 blocks 형식을 쓰고
 *  사용자 값만 escapeSlack 으로 감쌀 것)
 */
export async function notifySlack(
  message: string | { blocks: SlackBlock[]; text?: string },
) {
  if (!WEBHOOK_URL) return;

  const body =
    typeof message === "string" ? { text: escapeSlack(message) } : message;

  try {
    await fetch(WEBHOOK_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
  } catch {
    // Slack 알림 실패가 비즈니스 로직을 막으면 안 됨
    console.error("[Slack] 알림 전송 실패");
  }
}

/** 상담 신청 알림 전용 포맷 */
export function formatConsultationAlert(data: {
  name: string;
  phone: string;
  location?: string;
  method?: string;
  timestamp?: string;
}) {
  return {
    text: `🔔 새 상담 신청: ${escapeSlack(data.name)} (${escapeSlack(data.phone)})`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "🔔 새 상담 신청", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*성함:*\n${escapeSlack(data.name)}` },
          { type: "mrkdwn", text: `*연락처:*\n${escapeSlack(data.phone)}` },
          {
            type: "mrkdwn",
            text: `*위치/규모:*\n${escapeSlack(data.location || "-")}`,
          },
          {
            type: "mrkdwn",
            text: `*현재 관리 방법:*\n${escapeSlack(data.method || "-")}`,
          },
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `접수일시: ${escapeSlack(data.timestamp) || new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
          },
        ],
      },
    ],
  } as { text: string; blocks: SlackBlock[] };
}

/** 기능 요청/버그 알림 전용 포맷 */
export function formatFeatureRequestAlert(data: {
  title: string;
  category: string;
  priority: string;
  requester?: string | null;
  /** 작성자(직원) 이름 — Slack 본문에 노출 */
  authorName?: string;
  /** 건의사항 보기 URL (NEXT_PUBLIC_APP_URL 기반) */
  url?: string;
}) {
  const categoryEmoji: Record<string, string> = {
    BUG: "🐛",
    FEATURE: "💡",
    IMPROVEMENT: "🔧",
  };
  const emoji = categoryEmoji[data.category] || "📝";
  const linkLine = data.url ? `\n[보기](${data.url})` : "";
  const text =
    `📮 *새 건의사항* — ${escapeSlack(data.title)}\n` +
    `• 작성자: ${escapeSlack(data.authorName ?? "알 수 없음")}\n` +
    `• 카테고리: ${data.category}` +
    linkLine;

  return {
    text,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${emoji} 새 ${data.category === "BUG" ? "버그 리포트" : "건의사항"}`,
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*제목:*\n${escapeSlack(data.title)}` },
          { type: "mrkdwn", text: `*우선순위:*\n${data.priority}` },
          {
            type: "mrkdwn",
            text: `*작성자:*\n${escapeSlack(data.authorName ?? "알 수 없음")}`,
          },
          {
            type: "mrkdwn",
            text: `*요청자:*\n${escapeSlack(data.requester || "익명")}`,
          },
        ],
      },
      ...(data.url
        ? [
            {
              type: "section",
              text: { type: "mrkdwn", text: `<${data.url}|보기 →>` },
            },
          ]
        : []),
    ],
  } as { text: string; blocks: SlackBlock[] };
}
