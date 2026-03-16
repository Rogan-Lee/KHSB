// Vercel 빌드 및 npm install 후 자동 실행
// prisma generate 후 삭제되는 index.ts를 자동 재생성
import { spawnSync } from "child_process";
import { writeFileSync } from "fs";

console.log("🔧 prisma generate 실행 중...");
const result = spawnSync("npx", ["prisma", "generate"], { stdio: "inherit" });
if (result.status !== 0) process.exit(result.status ?? 1);

writeFileSync(
  "src/generated/prisma/index.ts",
  "export * from './client'\nexport type * from './models'\n"
);
console.log("✅ src/generated/prisma/index.ts 재생성 완료");
