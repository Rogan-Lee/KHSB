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
import { resolveParentInviteTargets } from "@/lib/parent-invite";
import {
  LOGIN_LOCKED_MESSAGE,
  clientIpFrom,
  completeLoginAttempt,
  isGuardedSignInPath,
  loginIdentifier,
  reserveLoginAttempt,
} from "@/lib/login-guard";

const INVITE_HEADER = "x-studyroom-invite";

function getSecret() {
  const secret = process.env.BETTER_AUTH_SECRET ?? process.env.AUTH_SECRET;
  if (secret) return secret;
  if (process.env.NODE_ENV !== "production") {
    return "studyroom-development-secret-change-before-production";
  }
  throw new Error("BETTER_AUTH_SECRET 또는 AUTH_SECRET 환경변수가 필요합니다");
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
  appName: "강한선배 | KHSB",
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
          subject: "[강한선배 | KHSB] 비밀번호 재설정",
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
          subject: "[강한선배 | KHSB] 이메일 인증",
          text: `아래 링크에서 이메일 주소를 인증하세요.\n\n${url}`,
        });
      });
    },
  },
  trustedOrigins: [
    baseURL,
    "studyroom://",
    "studyroom://*",
    // Vercel preview 배포는 baseURL(프로덕션)과 도메인이 달라 origin이 막힘 → preview origin 신뢰
    ...(process.env.VERCEL_URL ? [`https://${process.env.VERCEL_URL}`] : []),
    // 브랜치 별칭(khsb-git-<branch>-<team>.vercel.app)은 정확한 호스트만 신뢰한다.
    // 예전 와일드카드 "https://khsb-git-*.vercel.app" 는 누구나 자기 Vercel 계정에 "khsb" 프로젝트를 만들면
    // (khsb-git-main-<공격자팀>.vercel.app) 매칭돼 CSRF·callbackURL 검증을 우회할 수 있었다.
    ...(process.env.VERCEL_ENV === "preview" && process.env.VERCEL_BRANCH_URL
      ? [`https://${process.env.VERCEL_BRANCH_URL}`]
      : []),
    ...(process.env.NODE_ENV === "development"
      ? ["http://localhost:*", "exp://", "exp://**"]
      : []),
  ],
  disabledPaths: ["/is-username-available"],
  // IP 단위 요청 제한. 운영은 DB 에 저장해 서버리스 인스턴스끼리 공유한다(메모리는 인스턴스마다 따로 셈).
  // 독서실은 학생 수십 명이 한 공인 IP 를 쓰므로 로그인 제한은 짧은 창으로 느슨하게 두고,
  // 무차별 대입은 계정 단위 잠금(src/lib/login-guard.ts)이 막는다.
  // 주의: DB 저장소는 전역 window(60초)보다 오래된 행을 지우므로 규칙의 window 는 60초 이하로 둔다.
  rateLimit: {
    enabled: true,
    storage: process.env.NODE_ENV === "production" ? "database" : "memory",
    modelName: "AuthRateLimit",
    window: 60,
    max: 100,
    customRules: {
      "/get-session": false, // 앱이 자주 부르는 본인 세션 조회
      "/sign-in/*": { window: 10, max: 10 },
      "/sign-up/*": { window: 10, max: 10 },
      "/request-password-reset": { window: 60, max: 5 },
      "/forget-password": { window: 60, max: 5 },
      "/change-password": { window: 60, max: 10 },
      "/delete-user": { window: 60, max: 5 },
    },
  },
  advanced: {
    cookiePrefix: "studyroom",
    useSecureCookies: process.env.NODE_ENV === "production",
  },
  hooks: {
    before: createAuthMiddleware(async (ctx) => {
      if (isGuardedSignInPath(ctx.path)) {
        // 계정 단위 실패 제한 — 잠긴 계정은 비밀번호를 비교하기 전에 거절
        const identifier = loginIdentifier(ctx.path, ctx.body);
        if (!identifier) return;
        const attempt = await reserveLoginAttempt(
          identifier,
          clientIpFrom(ctx.request?.headers ?? ctx.headers),
        );
        if (attempt.locked) {
          throw new APIError("TOO_MANY_REQUESTS", { message: LOGIN_LOCKED_MESSAGE });
        }
        return;
      }

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
          message: "사용할 수 없는 초대입니다",
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
            name:
              invitation.type === "PARENT"
                ? `${invitation.targetStudent.name} 학부모`
                : invitation.targetStudent.name,
          },
        },
      };
    }),
    after: createAuthMiddleware(async (ctx) => {
      if (!isGuardedSignInPath(ctx.path)) return;
      const identifier = loginIdentifier(ctx.path, ctx.body);
      if (!identifier) return;
      // 성공하면 그 계정의 실패 기록을 비우고, 실패면 before 에서 선점한 행이 실패 기록으로 남는다
      await completeLoginAttempt(identifier, !!ctx.context.newSession);
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
          const tokenHash = hashAuthToken(token);

          const invitation = await prisma.authInvitation.findUnique({
            where: { tokenHash },
            select: {
              targetStudentId: true,
              targetStudentIds: true,
              parentRelation: true,
              type: true,
            },
          });

          // 조건부 update 로 초대를 "선점" — 같은 초대로 동시에 가입해도 한 요청만 count=1 을 받는다.
          const claimed = await prisma.authInvitation.updateMany({
            where: {
              tokenHash,
              acceptedAt: null,
              revokedAt: null,
            },
            data: {
              acceptedAt: new Date(),
              acceptedById: user.id,
            },
          });

          // 학부모 초대: 초대의 자녀 목록(targetStudentIds)으로 ParentLink 생성.
          // 선점에 성공한 요청만 자녀를 연결한다 (1회용 초대로 여러 계정이 자녀에 연결되는 경쟁 조건 차단).
          if (invitation?.type === "PARENT" && claimed.count === 1) {
            // 폴백: 새 필드 도입 전 발급된 대기 초대는 AuthVerification 행에
            // 페이로드가 동봉되어 있다. 새 필드가 비어 있을 때만 조회한다.
            const legacyRow =
              invitation.targetStudentIds.length === 0
                ? await prisma.authVerification.findFirst({
                    where: { identifier: `parent-invite:${tokenHash}` },
                  })
                : null;
            const { studentIds, relation } = resolveParentInviteTargets(
              invitation,
              legacyRow?.value ?? null,
            );

            if (studentIds.length > 0) {
              await prisma.parentLink.createMany({
                data: studentIds.map((studentId) => ({
                  authUserId: user.id,
                  studentId,
                  relation,
                })),
                skipDuplicates: true,
              });
            }
          }
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
