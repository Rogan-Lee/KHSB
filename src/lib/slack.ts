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

export async function notifySlack(
  message: string | { blocks: SlackBlock[]; text?: string },
) {
  if (!WEBHOOK_URL) return;

  const body =
    typeof message === "string" ? { text: message } : message;

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
    text: `🔔 새 상담 신청: ${data.name} (${data.phone})`,
    blocks: [
      {
        type: "header",
        text: { type: "plain_text", text: "🔔 새 상담 신청", emoji: true },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*성함:*\n${data.name}` },
          { type: "mrkdwn", text: `*연락처:*\n${data.phone}` },
          {
            type: "mrkdwn",
            text: `*위치/규모:*\n${data.location || "-"}`,
          },
          {
            type: "mrkdwn",
            text: `*현재 관리 방법:*\n${data.method || "-"}`,
          },
        ],
      },
      {
        type: "context",
        elements: [
          {
            type: "mrkdwn",
            text: `접수일시: ${data.timestamp || new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}`,
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
}) {
  const categoryEmoji: Record<string, string> = {
    BUG: "🐛",
    FEATURE: "💡",
    IMPROVEMENT: "🔧",
  };
  const emoji = categoryEmoji[data.category] || "📝";

  return {
    text: `${emoji} ${data.category}: ${data.title}`,
    blocks: [
      {
        type: "header",
        text: {
          type: "plain_text",
          text: `${emoji} 새 ${data.category === "BUG" ? "버그 리포트" : "기능 요청"}`,
          emoji: true,
        },
      },
      {
        type: "section",
        fields: [
          { type: "mrkdwn", text: `*제목:*\n${data.title}` },
          { type: "mrkdwn", text: `*우선순위:*\n${data.priority}` },
          {
            type: "mrkdwn",
            text: `*요청자:*\n${data.requester || "익명"}`,
          },
        ],
      },
    ],
  } as { text: string; blocks: SlackBlock[] };
}
