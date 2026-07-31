-- Better Auth identity tables. Existing User/Student IDs remain unchanged.
CREATE TYPE "AuthInviteType" AS ENUM ('STAFF', 'STUDENT');

CREATE TABLE "AuthUser" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "username" TEXT,
    "displayUsername" TEXT,
    "appUserId" TEXT,
    "studentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuthUser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthSession" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,
    CONSTRAINT "AuthSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthAccount" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuthAccount_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthVerification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "AuthVerification_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "AuthInvitation" (
    "id" TEXT NOT NULL,
    "type" "AuthInviteType" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "targetUserId" TEXT,
    "targetStudentId" TEXT,
    "invitedById" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "acceptedById" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AuthInvitation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "AuthUser_email_key" ON "AuthUser"("email");
CREATE UNIQUE INDEX "AuthUser_username_key" ON "AuthUser"("username");
CREATE UNIQUE INDEX "AuthUser_appUserId_key" ON "AuthUser"("appUserId");
CREATE UNIQUE INDEX "AuthUser_studentId_key" ON "AuthUser"("studentId");
CREATE INDEX "AuthUser_appUserId_idx" ON "AuthUser"("appUserId");
CREATE INDEX "AuthUser_studentId_idx" ON "AuthUser"("studentId");
CREATE UNIQUE INDEX "AuthSession_token_key" ON "AuthSession"("token");
CREATE INDEX "AuthSession_userId_idx" ON "AuthSession"("userId");
CREATE INDEX "AuthSession_expiresAt_idx" ON "AuthSession"("expiresAt");
CREATE UNIQUE INDEX "AuthAccount_providerId_accountId_key" ON "AuthAccount"("providerId", "accountId");
CREATE INDEX "AuthAccount_userId_idx" ON "AuthAccount"("userId");
CREATE INDEX "AuthVerification_identifier_idx" ON "AuthVerification"("identifier");
CREATE INDEX "AuthVerification_expiresAt_idx" ON "AuthVerification"("expiresAt");
CREATE UNIQUE INDEX "AuthInvitation_tokenHash_key" ON "AuthInvitation"("tokenHash");
CREATE INDEX "AuthInvitation_targetUserId_acceptedAt_idx" ON "AuthInvitation"("targetUserId", "acceptedAt");
CREATE INDEX "AuthInvitation_targetStudentId_acceptedAt_idx" ON "AuthInvitation"("targetStudentId", "acceptedAt");
CREATE INDEX "AuthInvitation_expiresAt_idx" ON "AuthInvitation"("expiresAt");

ALTER TABLE "AuthUser" ADD CONSTRAINT "AuthUser_appUserId_fkey"
FOREIGN KEY ("appUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuthUser" ADD CONSTRAINT "AuthUser_studentId_fkey"
FOREIGN KEY ("studentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuthSession" ADD CONSTRAINT "AuthSession_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "AuthUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuthAccount" ADD CONSTRAINT "AuthAccount_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "AuthUser"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuthInvitation" ADD CONSTRAINT "AuthInvitation_targetUserId_fkey"
FOREIGN KEY ("targetUserId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuthInvitation" ADD CONSTRAINT "AuthInvitation_targetStudentId_fkey"
FOREIGN KEY ("targetStudentId") REFERENCES "Student"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "AuthInvitation" ADD CONSTRAINT "AuthInvitation_invitedById_fkey"
FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
