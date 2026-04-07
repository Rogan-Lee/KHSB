// Vercel 빌드 및 npm install 후 자동 실행
// prisma generate 후 삭제되는 index.ts를 자동 재생성
import { spawnSync } from "child_process";
import { writeFileSync } from "fs";

console.log("🔧 prisma generate 실행 중...");
const result = spawnSync("npx", ["prisma", "generate"], { stdio: "inherit" });
if (result.status !== 0) {
  console.warn("⚠️  prisma generate 실패 (DATABASE_URL 미설정 가능). index.ts 재생성은 계속 진행합니다.");
}

// prisma generate 후 index.ts가 삭제되므로 항상 재생성
// client.ts에 이미 모델 타입 별칭(User, Student 등)이 포함되어 있음
writeFileSync(
  "src/generated/prisma/index.ts",
  "export * from './client'\nexport type * from './models'\n"
);
console.log("✅ src/generated/prisma/index.ts 재생성 완료");
