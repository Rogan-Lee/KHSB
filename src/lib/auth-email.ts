type AuthEmailInput = {
  subject: string;
  text: string;
  to: string;
};

export async function sendAuthEmail({ subject, text, to }: AuthEmailInput) {
  const apiKey = process.env.RESEND_API_KEY;
  const from = process.env.AUTH_EMAIL_FROM;

  if (!apiKey || !from) {
    if (process.env.NODE_ENV !== "production") {
      console.info(`[auth-email] ${to}\n${subject}\n${text}`);
      return;
    }
    throw new Error("인증 이메일 발송 설정이 필요합니다");
  }

  const response = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from,
      to,
      subject,
      text,
    }),
  });

  if (!response.ok) {
    throw new Error("인증 이메일을 발송하지 못했습니다");
  }
}
