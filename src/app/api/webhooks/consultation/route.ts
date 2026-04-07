import { NextRequest, NextResponse } from "next/server";
import { notifySlack, formatConsultationAlert } from "@/lib/slack";
import { prisma } from "@/lib/prisma";

/**
 * 상담 신청 웹훅 엔드포인트
 * Google Apps Script에서 폼 데이터를 시트에 저장한 후 이 엔드포인트를 호출하여
 * Slack 알림 + Lead DB 저장을 처리한다.
 *
 * 인증 불필요 (proxy.ts에서 /api/webhooks(.*)는 public)
 */
export async function POST(request: NextRequest) {
  try {
    const data = await request.json();
    const { name, phone, location, method, timestamp } = data;

    if (!name || !phone) {
      return NextResponse.json(
        { error: "name과 phone은 필수입니다" },
        { status: 400 },
      );
    }

    // 1. Lead 레코드 생성 (Lead 모델이 있을 때)
    try {
      await prisma.lead.create({
        data: {
          name,
          phone,
          location: location || null,
          currentMethod: method || null,
          source: "landing",
        },
      });
    } catch {
      // Lead 모델이 아직 없으면 무시 (Phase 2에서 추가)
      console.log("[Webhook] Lead 모델 미존재 — DB 저장 스킵");
    }

    // 2. Slack 알림 발송
    await notifySlack(
      formatConsultationAlert({ name, phone, location, method, timestamp }),
    );

    return NextResponse.json({ result: "success" });
  } catch (error) {
    console.error("[Webhook] 상담 신청 처리 실패:", error);
    return NextResponse.json(
      { error: "처리 중 오류가 발생했습니다" },
      { status: 500 },
    );
  }
}

export async function GET() {
  return NextResponse.json({ status: "ok", endpoint: "consultation-webhook" });
}
