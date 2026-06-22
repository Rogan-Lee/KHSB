import type { User } from "@/generated/prisma";

/**
 * 테스트용 전체 User mock 생성기.
 * auth() 는 Prisma User 전체를 반환하므로, 테스트에서 일부 필드만 지정하고
 * 나머지는 합리적 기본값으로 채운다.
 */
export function mockUser(overrides: Partial<User> = {}): User {
  return {
    id: "user-1",
    email: "user-1@example.com",
    name: "원장",
    clerkId: "clerk-user-1",
    role: "DIRECTOR",
    isMentor: false,
    status: "ACTIVE",
    terminatedAt: null,
    terminationNote: null,
    phone: null,
    kakaoAccessToken: null,
    kakaoRefreshToken: null,
    kakaoTokenExpiry: null,
    createdAt: new Date("2026-01-01T00:00:00Z"),
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    ...overrides,
  };
}

/** auth() 반환 형태 { user } mock */
export function mockSession(overrides: Partial<User> = {}): { user: User } {
  return { user: mockUser(overrides) };
}
