import { expo } from "@better-auth/expo";
import { prismaAdapter } from "@better-auth/prisma-adapter";
import { betterAuth } from "better-auth";
import { APIError, createAuthMiddleware } from "better-auth/api";
import { nextCookies } from "better-auth/next-js";
import { username } from "better-auth/plugins";
import { after } from "next/server";

import { prisma } from "@/lib/prisma";
import { hashAuthToken } from "@/lib/auth-tokens";
import { sendAuthEmail } from "@/lib/auth-email";
import { getAppUrl } from "@/lib/app-url";

const INVITE_HEADER = "x-studyroom-invite";

function getSecret() {
  const secret = process.env.BETTER_AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") {
    return "studyroom-development-secret-change-before-production";
  }
  throw new Error("BETTER_AUTH_SECRET 환경변수가 필요합니다");
}

function readInviteToken(
  ctx?: {
    headers?: Headers | null;
    request?: Request | null;
  } | null,
) {
  return (
    ctx?.headers?.get(INVITE_HEADER) ??
    ctx?.request?.headers.get(INVITE_HEADER) ??
    ""
  ).trim();
}

async function getValidInvitation(token: string) {
  if (!token) return null;

  return prisma.authInvitation.findFirst({
    where: {
      tokenHash: hashAuthToken(token),
      acceptedAt: null,
      revokedAt: null,
      expiresAt: { gt: new Date() },
    },
    include: {
      targetStudent: {
        select: {
          id: true,
          name: true,
          status: true,
        },
      },
      targetUser: {
        select: {
          email: true,
          id: true,
          name: true,
          status: true,
        },
      },
    },
  });
}

function validateUsername(value: unknown) {
  return typeof value === "string" && /^[a-zA-Z0-9._-]{4,30}$/.test(value);
}

function validateEmail(value: unknown) {
  return typeof value === "string" && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

const baseURL = getAppUrl();

export const authServer = betterAuth({
  appName: "스터디룸 매니저",
  baseURL,
  basePath: "/api/auth",
  secret: getSecret(),
  database: prismaAdapter(prisma, {
    provider: "postgresql",
  }),
  user: {
    modelName: "AuthUser",
    deleteUser: {
      enabled: true,
    },
    additionalFields: {
      appUserId: {
        type: "string",
        required: false,
        input: false,
      },
      studentId: {
        type: "string",
        required: false,
        input: false,
      },
    },
  },
  session: {
    modelName: "AuthSession",
    expiresIn: 60 * 60 * 24 * 30,
    updateAge: 60 * 60 * 24,
    freshAge: 60 * 60 * 24,
  },
  account: {
    modelName: "AuthAccount",
  },
  verification: {
    modelName: "AuthVerification",
  },
  emailAndPassword: {
    enabled: true,
    minPasswordLength: 10,
    maxPasswordLength: 128,
    revokeSessionsOnPasswordReset: true,
    sendResetPassword: async ({ user, url }) => {
      after(async () => {
        await sendAuthEmail({
          to: user.email,
          subject: "[스터디룸 매니저] 비밀번호 재설정",
          text: `아래 링크에서 비밀번호를 재설정하세요.\n\n${url}\n\n본인이 요청하지 않았다면 이 메일을 무시하세요.`,
        });
      });
    },
  },
  emailVerification: {
    sendVerificationEmail: async ({ user, url }) => {
      after(async () => {
        await sendAuthEmail({
          to: user.email,
          subject: "[스터디룸 매니저] 이메일 인증",
          text: `아래 링크에서 이메일 주소를 인증하세요.\n\n${url}`,
        });
      });
    },
  },
  trustedOrigins: [
    baseURL,
    "studyroom://",
    "studyroom://*",
    ...(process.env.NODE_ENV === "development"
      ? ["http://localhost:*", "exp://", "exp://**"]
      : []),
  ],
  disabledPaths: ["/is-username-available"],
  rateLimit: {
    enabled: true,
    window: 60,
    max: 20,
  },
  advanced: {
    cookiePrefix: "studyroom",
    useSecureCookies: process.env.NODE_ENV === "production",
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (ctx.path !== "/sign-up/email") return;

      const invitation = await getValidInvitation(readInviteToken(ctx));
      if (!invitation) {
        throw new APIError("FORBIDDEN", {
          message: "유효한 가입 초대가 필요합니다",
        });
      }

      if (!validateUsername(ctx.body?.username)) {
        throw new APIError("BAD_REQUEST", {
          message: "아이디는 영문, 숫자, 점, 밑줄, 하이픈으로 4~30자여야 합니다",
        });
      }

      if (invitation.type === "STAFF") {
        if (!invitation.targetUser || invitation.targetUser.status !== "ACTIVE") {
          throw new APIError("FORBIDDEN", {
            message: "사용할 수 없는 직원 초대입니다",
          });
        }

        return {
          context: {
            ...ctx,
            body: {
              ...ctx.body,
              email: invitation.targetUser.email.toLowerCase(),
              name: invitation.targetUser.name,
            },
          },
        };
      }

      if (!invitation.targetStudent || invitation.targetStudent.status !== "ACTIVE") {
        throw new APIError("FORBIDDEN", {
          message: "사용할 수 없는 학생 초대입니다",
        });
      }
      if (!validateEmail(ctx.body?.email)) {
        throw new APIError("BAD_REQUEST", {
          message: "비밀번호 복구에 사용할 이메일을 입력하세요",
        });
      }

      return {
        context: {
          ...ctx,
          body: {
            ...ctx.body,
            email: String(ctx.body.email).trim().toLowerCase(),
            name: invitation.targetStudent.name,
          },
        },
      };
    }),
  },
  databaseHooks: {
    user: {
      create: {
        before: async (user, ctx) => {
          const invitation = await getValidInvitation(readInviteToken(ctx));
          if (!invitation) {
            throw new APIError("FORBIDDEN", {
              message: "유효한 가입 초대가 필요합니다",
            });
          }

          return {
            data: {
              ...user,
              appUserId:
                invitation.type === "STAFF" ? invitation.targetUserId : null,
              studentId:
                invitation.type === "STUDENT"
                  ? invitation.targetStudentId
                  : null,
            },
          };
        },
        after: async (user, ctx) => {
          const token = readInviteToken(ctx);
          if (!token) return;

          await prisma.authInvitation.updateMany({
            where: {
              tokenHash: hashAuthToken(token),
              acceptedAt: null,
              revokedAt: null,
            },
            data: {
              acceptedAt: new Date(),
              acceptedById: user.id,
            },
          });
        },
      },
    },
  },
  plugins: [
    username({
      minUsernameLength: 4,
      maxUsernameLength: 30,
      usernameValidator: (value) => /^[a-zA-Z0-9._-]+$/.test(value),
    }),
    expo(),
    nextCookies(),
  ],
});

export type BetterAuthSession = typeof authServer.$Infer.Session;
