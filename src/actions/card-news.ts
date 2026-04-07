"use server";

import Groq from "groq-sdk";
import { getUser } from "@/lib/auth";
import { requireOrg } from "@/lib/org";

async function getSession() {
  const org = await requireOrg();
  const user = await getUser();
  if (!user) throw new Error("인증 필요");
  return { ...user, orgId: org.orgId };
}

export type CardNewsTemplate = "announcement" | "study-tip" | "top-student";

export interface AnnouncementInputs {
  title: string;
  date: string;
  target: string;
  details: string;
}

export interface StudyTipInputs {
  topic: string;
  keyMessage: string;
  mood: "energetic" | "calm" | "serious";
}

export interface TopStudentInputs {
  period: string;
  students: string;
  subject: string;
  message: string;
}

export type SlideType = "cover" | "body" | "closing";

export interface Slide {
  type: SlideType;
  headline: string;
  subheadline: string;
  body: string;
  items?: string[];      // 본문 슬라이드의 bullet points
  callToAction?: string; // 마무리 슬라이드 CTA
  hashtags?: string[];   // 마무리 슬라이드 해시태그
}

export interface GeneratedSlides {
  slides: Slide[];
}

export interface ExtractedStyle {
  background: string;
  headlineColor: string;
  bodyColor: string;
  accentColor: string;
  badgeBg: string;
  badgeBorder: string;
  badgeText: string;
  cardBg: string;
  cardBorder: string;
  brightness: "dark" | "light";
}

type Inputs = AnnouncementInputs | StudyTipInputs | TopStudentInputs;

function getGroq() {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error("GROQ_API_KEY가 설정되지 않았습니다.");
  return new Groq({ apiKey });
}

function parseJSON<T>(text: string): T {
  const cleaned = text.replace(/^```json\s*/i, "").replace(/^```\s*/i, "").replace(/\s*```$/i, "").trim();
  return JSON.parse(cleaned) as T;
}

async function urlToBase64(url: string): Promise<{ data: string; mimeType: string }> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`이미지를 불러올 수 없습니다: ${res.status}`);
  const buffer = await res.arrayBuffer();
  const mimeType = res.headers.get("content-type") ?? "image/jpeg";
  const data = Buffer.from(buffer).toString("base64");
  return { data, mimeType };
}

function buildPrompt(template: CardNewsTemplate, inputs: Inputs): string {
  const format = `반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요.

{
  "slides": [
    {
      "type": "cover",
      "headline": "표지 메인 헤드라인 (20자 이내, 강렬하게)",
      "subheadline": "표지 서브타이틀 (30자 이내)",
      "body": "표지 짧은 소개 또는 티저 (30자 이내)"
    },
    {
      "type": "body",
      "headline": "첫 번째 핵심 포인트 제목 (15자 이내)",
      "subheadline": "이 슬라이드의 요약 한 줄 (20자 이내)",
      "body": "내용 설명 (60자 이내)",
      "items": ["핵심 내용 1 (20자 이내)", "핵심 내용 2 (20자 이내)", "핵심 내용 3 (20자 이내)"]
    },
    {
      "type": "body",
      "headline": "두 번째 핵심 포인트 제목 (15자 이내)",
      "subheadline": "이 슬라이드의 요약 한 줄 (20자 이내)",
      "body": "내용 설명 (60자 이내)",
      "items": ["핵심 내용 1 (20자 이내)", "핵심 내용 2 (20자 이내)"]
    },
    {
      "type": "closing",
      "headline": "마무리 메시지 헤드라인 (20자 이내)",
      "subheadline": "마무리 서브타이틀 (25자 이내)",
      "body": "독자에게 남기는 마지막 메시지 (50자 이내)",
      "callToAction": "행동 유도 문구 (15자 이내)",
      "hashtags": ["태그1", "태그2", "태그3", "태그4", "태그5"]
    }
  ]
}`;

  if (template === "announcement") {
    const i = inputs as AnnouncementInputs;
    return `당신은 학원 인스타그램 카드뉴스 카피라이터입니다. 4장 슬라이드(표지-본문-본문-마무리) 카드뉴스를 작성하세요.

${format}

소재:
- 제목: ${i.title}
- 날짜: ${i.date}
- 대상: ${i.target}
- 내용: ${i.details}

학원 공지/이벤트 홍보 콘텐츠로 학생과 학부모가 눈에 띄게 읽을 수 있도록 명확하고 친근하게 작성하세요.`;
  }

  if (template === "study-tip") {
    const i = inputs as StudyTipInputs;
    const moodMap = { energetic: "활기차고 동기부여되는", calm: "차분하고 집중력 있는", serious: "진지하고 격려하는" };
    return `당신은 학원 인스타그램 카드뉴스 카피라이터입니다. 4장 슬라이드(표지-본문-본문-마무리) 카드뉴스를 작성하세요.

${format}

소재:
- 주제: ${i.topic}
- 핵심 메시지: ${i.keyMessage}
- 분위기: ${moodMap[i.mood]}

학습 팁/동기부여 콘텐츠로 ${moodMap[i.mood]} 톤으로 학생들의 마음을 움직이도록 작성하세요. 본문 슬라이드는 실용적인 팁을 담아주세요.`;
  }

  const i = inputs as TopStudentInputs;
  return `당신은 학원 인스타그램 카드뉴스 카피라이터입니다. 4장 슬라이드(표지-본문-본문-마무리) 카드뉴스를 작성하세요.

${format}

소재:
- 기간: ${i.period}
- 우수 학생: ${i.students}
- 과목/분야: ${i.subject}
- 메시지: ${i.message}

성적 우수자 발표 콘텐츠로 따뜻하게 축하하고, 다른 학생들에게도 동기를 부여하도록 작성하세요. 학생 이름은 본문 슬라이드에 자연스럽게 배치하세요.`;
}

export async function analyzeReferenceImage(
  input: { type: "base64"; data: string; mimeType: string } | { type: "url"; url: string }
): Promise<{ success: true; style: ExtractedStyle } | { success: false; error: string }> {
  const session = await getSession();
  if (session.role !== "DIRECTOR" && session.role !== "ADMIN") {
    return { success: false, error: "권한이 없습니다." };
  }

  try {
    const groq = getGroq();

    let imageData: string;
    let mimeType: string;

    if (input.type === "url") {
      const result = await urlToBase64(input.url);
      imageData = result.data;
      mimeType = result.mimeType;
    } else {
      imageData = input.data;
      mimeType = input.mimeType;
    }

    const prompt = `이 카드뉴스 이미지를 분석해서 디자인 스타일을 추출해주세요. 반드시 아래 JSON 형식으로만 응답하세요. 다른 텍스트는 절대 포함하지 마세요.

{
  "background": "배경 CSS (예: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%) 또는 #1a1a2e)",
  "headlineColor": "메인 제목 색상 hex (예: #ffffff)",
  "bodyColor": "본문 텍스트 색상 (예: rgba(255,255,255,0.75))",
  "accentColor": "포인트/강조 색상 hex (예: #63b3ed)",
  "badgeBg": "뱃지 배경 CSS (예: rgba(99,179,237,0.15))",
  "badgeBorder": "뱃지 테두리 CSS (예: rgba(99,179,237,0.3))",
  "badgeText": "뱃지 텍스트 색상 (예: #63b3ed)",
  "cardBg": "내부 박스 배경 CSS (예: rgba(255,255,255,0.08))",
  "cardBorder": "내부 박스 테두리 CSS (예: rgba(255,255,255,0.12))",
  "brightness": "dark 또는 light"
}

이미지에서 실제로 보이는 색상을 정확하게 추출하세요.`;

    const response = await groq.chat.completions.create({
      model: "meta-llama/llama-4-scout-17b-16e-instruct",
      messages: [
        {
          role: "user",
          content: [
            { type: "image_url", image_url: { url: `data:${mimeType};base64,${imageData}` } },
            { type: "text", text: prompt },
          ],
        },
      ],
    });

    const text = response.choices[0]?.message?.content ?? "";
    const style = parseJSON<ExtractedStyle>(text);
    return { success: true, style };
  } catch (e) {
    console.error("Reference analysis error:", e);
    return { success: false, error: "이미지 분석 중 오류가 발생했습니다. 다시 시도해주세요." };
  }
}

export async function generateCardNewsSlides(
  template: CardNewsTemplate,
  inputs: Inputs
): Promise<{ success: true; data: GeneratedSlides } | { success: false; error: string }> {
  const session = await getSession();
  if (session.role !== "DIRECTOR" && session.role !== "ADMIN") {
    return { success: false, error: "권한이 없습니다." };
  }

  try {
    const groq = getGroq();
    const prompt = buildPrompt(template, inputs);

    const response = await groq.chat.completions.create({
      model: "llama-3.3-70b-versatile",
      messages: [{ role: "user", content: prompt }],
    });

    const text = response.choices[0]?.message?.content ?? "";
    const data = parseJSON<GeneratedSlides>(text);
    return { success: true, data };
  } catch (e) {
    console.error("Groq API error:", e);
    return { success: false, error: "AI 생성 중 오류가 발생했습니다. 다시 시도해주세요." };
  }
}
