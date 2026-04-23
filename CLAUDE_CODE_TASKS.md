# KHSB 스터디룸 매니저 - Claude Code 작업 지시서

> **버전**: 2026-04-21 v1
> **대상 레포**: `Rogan-Lee/KHSB` (tmp-main 브랜치)
> **절차**: 각 작업은 tmp-main에서 feature 브랜치 → PR → main 머지 → Vercel 자동 배포
> **DB**: Neon `studyroom` (프로덕션). 스키마 변경 시 `npx prisma migrate dev` → `prisma migrate deploy`

---

## 0. Claude Code 공통 원칙

### 0.1 작업 시작 전 반드시 할 것
1. `git checkout tmp-main && git pull`
2. `feat/<kebab-case-task-name>` 브랜치 생성
3. 해당 작업이 건드릴 것으로 예상되는 파일을 **먼저 전부 읽기** (읽지 않고 추측 금지)
4. Prisma 스키마 변경이 필요하면 마이그레이션 파일명에 날짜+작업명 명시 (예: `20260421_add_attendance_pay_tags`)

### 0.2 코드 컨벤션 (기존 유지)
- UI 텍스트는 **전부 한국어**
- Server Action 파일은 kebab-case, 함수는 camelCase
- shadcn/ui 컴포넌트 우선 사용 (Dialog, Sheet, Card, Badge, Button, Tabs, Table)
- TailwindCSS v4, 커스텀 CSS 최소화
- 날짜/시간은 `date-fns` 사용 (dayjs 신규 도입 금지)
- `orgId` 필터는 **saas 브랜치에만** 해당 → 이 작업 지시서는 전부 **tmp-main (프로덕션)** 기준

### 0.3 금지 사항
- 기존 Neon `studyroom` DB의 파괴적 마이그레이션 금지 (column rename/drop 시 반드시 2단계: add new → backfill → deprecate)
- 프로덕션 고객(KHSB) 사용 중인 기능의 URL/경로 변경 금지 → 구 경로는 리다이렉트로 처리
- `npm run build` 통과 없이 PR 생성 금지

### 0.4 PR 메시지 템플릿
```
feat/fix: <작업명>

## 변경사항
- ...

## 영향 범위
- 페이지: /xxx
- DB: <스키마 변경 여부>
- Breaking: <있음/없음>

## 테스트
- [ ] 로컬에서 해당 페이지 정상 확인
- [ ] 기존 플로우 회귀 테스트
- [ ] 모바일 뷰 확인 (해당 시)
```

---

## 스프린트 우선순위 (잠정)

**Sprint 1 (버그 + 소규모 개선, 1~2일)**: §2.1 §2.2 §2.3 §2.6 §2.7 §2.8 §2.9 §2.10 §2.14 §2.15
**Sprint 2 (중간 규모, 2~3일)**: §2.4 §2.5 §2.11 §2.16 §2.17
**Sprint 3 (대시보드 + 리포트 개선, 3~4일)**: §2.12 §2.18
**Sprint 4 (반응형 전면)**: §2.19
**Sprint 5 (신규 모듈: 사진 관리)**: §2.20
**Sprint 6 (신규 모듈: 급여 정산)**: §2.21
**Sprint 7 (자동화 파이프라인: 리포트 → 사진 자동 첨부)**: §2.22

---

# 2. 작업 상세

---

## 2.1 퇴실 데이터 없으면 자동 12시 퇴실 처리

### 배경
원생이 퇴실 태깅을 안 하고 귀가하는 경우가 증가. 다음날 새벽 기준으로 당일 퇴실 기록이 비어있으면 23:59(또는 24:00) 퇴실로 간주.

### 영향 파일
- `src/lib/attendance/*` 또는 `src/server/actions/attendance*`
- Cron용: `src/app/api/cron/close-attendance/route.ts` (신규)
- `vercel.json` → cron 스케줄 등록

### 구현
1. 기존 Attendance 모델의 `exitAt` 필드 확인 (nullable 여부)
2. **신규 API Route**: `/api/cron/close-attendance`
   - 매일 00:30 KST (= UTC 15:30) 실행
   - 이전 날짜 기준 입실 기록 있음 + 퇴실 기록 없음인 Attendance row 조회
   - `exitAt = <이전 23:59:59>`, `isAutoClosed = true` (신규 컬럼 → 선택)
3. Vercel cron 등록:
   ```json
   {
     "crons": [{ "path": "/api/cron/close-attendance", "schedule": "30 15 * * *" }]
   }
   ```
4. Prisma 스키마 (선택):
   ```prisma
   model Attendance {
     ...
     isAutoClosed Boolean @default(false)
   }
   ```
5. 입퇴실 관리 테이블에서 `isAutoClosed = true`인 row는 툴팁 또는 아이콘으로 "자동 퇴실" 표시

### 테스트
- Cron 엔드포인트 수동 호출(`curl`)해서 한 번 돌려보기
- 더미 데이터로 퇴실 없는 row 만들고 23:59 채워지는지 확인

---

## 2.2 입퇴실 관리 탭 - 컬럼 정리

### 요청
- "정상/지각 태그" 컬럼 삭제
- "상벌점 점수" 컬럼 내용 삭제 (컬럼 자체는 유지 여부 확인 필요 → 사용자 요청이 "내용 삭제 → 삭제"로 모호. **컬럼째 삭제로 해석하되 PR 코멘트로 확인 요청**)
- "특이사항"을 **좌측**으로 이동
- "플래너(주간공부계획)"를 **우측**으로 이동

### 영향 파일
- `src/components/attendance/attendance-table.tsx` (또는 유사 경로)

### 구현
1. 테이블 헤더 정의 배열에서 해당 컬럼 제거
2. 컬럼 순서 재배치: 좌측 그룹에 특이사항, 우측 그룹에 플래너
3. CSV 내보내기(`exportToCSV` 등)에서도 컬럼 제거

### 테스트
- 정상 뷰 확인, CSV 다운로드 시 컬럼 일치 여부 확인

---

## 2.3 입퇴실 관리 - 상단 결석자 필터 카드

### 요청
상단에 "결석자 보기" 카드 버튼 추가. 클릭 시 **현재 시간 기준** 입실 기록이 없는 원생만 필터링해서 테이블 표시. 버튼 토글로 왕복.

### 영향 파일
- `src/app/attendance/page.tsx` (또는 `/dashboard/attendance/`)
- `src/components/attendance/attendance-table.tsx`

### 구현
1. 기존 KPI/요약 카드 영역에 새 카드 `AbsentTodayCard` 추가 (정상 등원, 지각 등 기존 카드와 동일 스타일)
2. 카드 클릭 시 페이지 상태 `filterMode: "all" | "absent"` 토글
3. `filterMode === "absent"` 일 때: 오늘 날짜 기준 Attendance 없는 Student만 표시
4. 현재 시간은 `new Date()` → "현재 시간 기준으로 안 온 원생"이므로 실시간 상태 반영
5. 카드 활성 상태는 파란색/빨간색 outline으로 시각화

### 테스트
- 결석자 수와 카드 숫자 일치
- 토글 시 기존 데이터 정상 복원

---

## 2.4 입퇴실 관리 - 반응형

§2.19 반응형 섹션과 함께 작업.

---

## 2.5 시험 좌석 간편

### 요청 정리
1. H룸 내 **원래 지정 좌석이 아닌 학생**도 시험 좌석 UI에 같이 노출되어야 함 (= 시험에 참여하는 학생이어도 H룸 좌석이면 표시)
2. 시험 보는 학생을 **체크박스로 여러 명 선택해서 한 번에 등록** 가능
3. 등록된 시험 인원을 H룸 좌석에 **랜덤 배치**
4. 화면: 각 H룸 좌석 위에 (a) 시험자 이름 + (b) 원래 좌석 주인 이름을 **위아래 같이** 표시

### 영향 파일
- `src/app/exam-seats/*` 또는 `src/app/seat-map/exam/*`
- Prisma: `ExamSeatAssignment` 모델 (이미 있다면 조정, 없으면 신설)

### Prisma 신규/조정 (예시)
```prisma
model ExamSession {
  id          String   @id @default(cuid())
  title       String
  date        DateTime
  room        String   // "H룸"
  createdAt   DateTime @default(now())
  assignments ExamSeatAssignment[]
}

model ExamSeatAssignment {
  id           String      @id @default(cuid())
  sessionId    String
  session      ExamSession @relation(fields: [sessionId], references: [id])
  seatNumber   Int
  studentId    String
  student      Student     @relation(fields: [studentId], references: [id])
  @@unique([sessionId, seatNumber])
}
```

### 구현 (클릭 단위)
1. **시험 세션 생성 모달**
   - "시험명", "날짜", "대상 룸(H룸 고정 or 선택)" 입력
2. **학생 일괄 선택 UI**
   - 전체 원생 목록 (체크박스 + 이름 + 학년 + 기본 좌석) 테이블
   - 상단 검색/학년 필터
   - "선택한 N명 시험 등록" 버튼
3. **랜덤 배치 로직** (Server Action `assignExamSeatsRandomly`)
   - H룸의 모든 좌석 번호 조회
   - 선택된 학생 배열을 Fisher-Yates shuffle
   - 가용 좌석에 순차 할당 → `ExamSeatAssignment` bulk insert
4. **표시 UI (좌석 맵)**
   - H룸 좌석 배치도 렌더링
   - 각 셀에 두 줄 표시:
     - 1줄: 시험 응시자 이름 (굵게)
     - 2줄: 원 좌석 주인 이름 (회색, 작게) → `Student.seatNumber`로 조회
   - 시험 응시자와 원 주인이 같으면 한 줄만
5. **재배치 버튼**: 클릭 시 같은 세션 내 다시 shuffle
6. **단일 좌석 수동 변경**: 드래그 or 드롭다운

### 테스트
- 20명 선택 → 랜덤 배치 → H룸 좌석 수보다 많으면 에러 메시지
- 원 좌석 주인이 시험에 참여하는 경우에도 표시되는지
- 같은 사람이 2번 등록되지 않는지 (unique constraint)

---

## 2.6 멘토링 기록 - 시간표 탭 정리

### 요청
멘토링 기록 페이지의 "일간 시간표" 탭 **삭제**, "주간 시간표" 탭은 **유지**.

### 영향 파일
- `src/app/mentoring/page.tsx` 또는 `src/components/mentoring/*`
- 탭 구성 코드 (Tabs 컴포넌트 children)

### 구현
1. Tabs에서 `<TabsTrigger value="daily">일간</TabsTrigger>` 및 대응 `<TabsContent>` 제거
2. 기본 선택 탭을 "주간"으로 변경
3. 일간 뷰 전용 컴포넌트(`daily-timetable.tsx` 등)가 다른 곳에서 import 되지 않는다면 파일 자체 삭제

### 테스트
- 일간 탭 사라짐
- 주간 탭 클릭 시 기존과 동일 동작

---

## 2.7 멘토링 사진 업로드 시 작성 내용 사라지는 버그

### 현상
멘토링 기록 작성 중 사진을 업로드하면 입력 폼의 다른 필드(내용, 메모 등)가 리셋됨.

### 원인 추정
- 업로드 핸들러가 `setState`로 form 전체를 덮어쓰거나
- 업로드 후 `router.refresh()` 또는 `revalidatePath` 호출로 클라이언트 상태 초기화

### 영향 파일
- `src/components/mentoring/mentoring-form.tsx` (또는 `-dialog.tsx`)
- 사진 업로드 핸들러 (`uploadPhoto`, `handlePhotoUpload` 등)

### 구현
1. form 상태가 어떻게 관리되는지 확인 (useState vs react-hook-form)
2. 업로드 핸들러가 form state를 건드리지 않도록 분리:
   ```ts
   const handleUpload = async (file: File) => {
     const url = await uploadToStorage(file);
     setPhotos(prev => [...prev, { url, id: nanoid() }]);  // → 다른 필드 건드리지 않음
   };
   ```
3. `revalidatePath` 또는 `router.refresh()` 호출 시점 확인 → 폼 제출 전에는 절대 호출 금지
4. Server Action이 `redirect`를 반환하는 경우 form 리셋 유발 → 제출 완료 시에만 사용

### 테스트
- 내용 타이핑 → 사진 업로드 → 내용 유지되는지 확인
- 사진 3장 연속 업로드 → 폼 유지

---

## 2.8 멘토링 사진 - 클립보드 붙여넣기(Ctrl+V) 지원

### 요청
사진 파일을 클립보드에서 `Ctrl+V`로 바로 첨부 가능하게.

### 영향 파일
- `src/components/mentoring/mentoring-form.tsx` (또는 photo uploader 컴포넌트)

### 구현
1. form 루트 div에 `onPaste` 핸들러 등록:
   ```ts
   const handlePaste = async (e: React.ClipboardEvent) => {
     const items = e.clipboardData.items;
     for (const item of items) {
       if (item.type.startsWith("image/")) {
         const file = item.getAsFile();
         if (file) await handleUpload(file);
       }
     }
   };
   ```
2. 다이얼로그/시트 내에서만 동작하도록 범위 제한 (글로벌 paste hijack 금지)
3. 사용자 안내 placeholder 추가: "이미지 드래그 또는 Ctrl+V로 붙여넣기"

### 테스트
- 스크린샷 찍은 직후 Ctrl+V → 첨부되는지
- 이미지가 아닌 텍스트 복사본 Ctrl+V는 정상 텍스트 붙여넣기

---

## 2.9 멘토 주간 스케줄 - 전소율 멘토 추가

### 요청
주간 멘토링 계획에서 "전소율" 멘토 계정/선택지 추가.

### 구현 (데이터 작업)
1. Mentor 모델 구조 확인 → User의 role="MENTOR" 또는 별도 Mentor 테이블?
2. 신규 row 삽입:
   - **Clerk 계정으로 관리되는 경우**: 관리자 UI에서 어떻게 반영
   - **DB 직접 삽입인 경우**: seed 스크립트 작성 `scripts/add-mentor-jung-soyul.ts`
3. 멘토 필터/드롭다운에 자동 반영되는지 확인

### 질문이 필요한 부분
- 전소율 멘토의 담당 학생 배정 로직은 별도 요청인지 확인

---

## 2.10 성적 분석 / 전체 테이블 - 오름차순/내림차순 정렬

### 요청
성적 분석 헤더뿐 아니라 **다른 모든 테이블**의 컬럼 헤더 클릭으로 오름/내림차순 토글.

### 영향 파일
- 모든 `*-table.tsx` 파일
- 공통 테이블 컴포넌트가 있다면 한 곳만 수정

### 구현
1. **공통 훅** `src/hooks/use-sortable-table.ts` 신설:
   ```ts
   export function useSortableTable<T>(rows: T[]) {
     const [sort, setSort] = useState<{ key: keyof T; dir: "asc" | "desc" } | null>(null);
     const sorted = useMemo(() => {
       if (!sort) return rows;
       return [...rows].sort((a, b) => {
         const av = a[sort.key], bv = b[sort.key];
         if (av == null) return 1;
         if (bv == null) return -1;
         const cmp = av > bv ? 1 : av < bv ? -1 : 0;
         return sort.dir === "asc" ? cmp : -cmp;
       });
     }, [rows, sort]);
     const toggle = (key: keyof T) =>
       setSort(s => s?.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" });
     return { rows: sorted, sort, toggle };
   }
   ```
2. **공통 헤더 컴포넌트** `SortableHeader`:
   ```tsx
   <th onClick={() => toggle("name")} className="cursor-pointer">
     이름 <SortIcon dir={sort?.key === "name" ? sort.dir : null} />
   </th>
   ```
3. 모든 테이블 리팩토링 대상:
   - 성적 분석 테이블
   - 학생 목록
   - 출결 로그
   - 멘토링 기록
   - 상벌점
   - 과제
   - 영단어
   - 면담 기록
4. 정렬 상태를 URL query string(`?sort=name&dir=asc`)로 저장하면 새로고침/공유 가능 → **선택**

### 테스트
- 각 테이블 헤더 클릭 → 오름 → 다시 클릭 → 내림 → 다시 클릭 → 기본 (왕복 또는 내림 고정 중 택 → PR에서 정책 명시)

---

## 2.11 영단어 - 좌석번호 기준 오름차순

### 요청
영단어 시험 결과 페이지의 기본 정렬을 "좌석번호 오름차순"으로.

### 영향 파일
- `src/app/vocabulary/page.tsx` 또는 `src/app/english-words/*`

### 구현
1. 쿼리에 `orderBy: { student: { seatNumber: "asc" } }`
2. §2.10의 SortableHeader 적용되어 있으면 초기 sort state를 `seatNumber, asc`로

### 테스트
- 페이지 진입 시 좌석번호 1, 2, 3... 순

---

## 2.12 대시보드 강화

### 요청 3건
**(a) 전 원생 과제 현황 카드/섹션**
- 기한, 완료 상태가 보이는 테이블
- 기한 지난 것 강조

**(b) 원생 증감 카드**
- 신규, 이탈, 이전 (월 기준)
- 전월 대비 증감 표시

**(c) 학교별 원생 통계 (관리자 탭)**
- 학교별 재원생
- 월별 증감

### 영향 파일
- `src/app/dashboard/page.tsx` 또는 `/` (루트)
- Server Action: `src/server/actions/dashboard.ts`

### 구현

#### (a) 과제 현황 위젯
1. Server Action `getAllAssignmentStatus()`:
   - 재원 중인 모든 학생의 assignment 조인
   - status, dueDate, studentName, title 반환
2. 컴포넌트 `<AllAssignmentsWidget>`:
   - 탭: [전체 | 기한 임박(3일) | 기한 초과 | 완료]
   - 정렬: 기한 오름차순
   - 행 클릭 → 해당 학생 상세로 이동

#### (b) 원생 증감
1. Server Action `getEnrollmentDelta(month)`:
   ```ts
   {
     total: number,        // 이번 달 말 기준 재원
     newThisMonth: number, // 이번 달 enrolledAt 인 원생 수
     leftThisMonth: number,// 이번 달 leftAt 인 원생 수
     deltaVsLastMonth: { total: +3, new: +2, left: -1 }
   }
   ```
2. 카드 UI: 현재 값 + 증감 아이콘(▲/▼)
3. **전제**: `Student` 모델에 `enrolledAt`, `leftAt`, `status` 필드가 있어야 함
   - 없다면 Prisma 마이그레이션: `status ENUM(ACTIVE, LEFT)`, `leftAt DateTime?`
   - backfill: 기존 학생 전부 `status=ACTIVE, enrolledAt=createdAt`

#### (c) 학교별 통계 - 관리자 탭
1. 관리자 전용 경로 `src/app/admin/school-stats/page.tsx` 또는 `src/app/dashboard/admin/`
2. `getSchoolStats()`:
   - `groupBy({ by: ["school"], _count: true })`
   - 월별 증감: 학교별 newThisMonth, leftThisMonth
3. 테이블:
   | 학교명 | 현재 원생 수 | 이번 달 신규 | 이번 달 이탈 | 증감 |
4. 관리자 권한 체크 (`role === "ADMIN"` 가드)

### 테스트
- 대시보드 진입 → 3개 위젯 모두 로드
- 데이터 없는 경우 "자료 없음" 상태 처리
- 관리자 아닌 유저가 /admin/school-stats 접근 시 403

---

## 2.13 월간 리포트 - 순위 삭제

### 요청
월간 리포트에서 "순위" 표기 삭제.

### 영향 파일
- `src/app/monthly-report/*` 또는 `src/components/report/monthly-*.tsx`
- `src/lib/report/generate-monthly-report.ts`

### 구현
1. 리포트 템플릿에서 순위 컴포넌트/필드 삭제
2. 순위 계산 로직이 있다면 호출 제거 (성능 이점)
3. PDF/카드뷰스 내보내기 템플릿에서도 제거

### 테스트
- 기존 리포트 재생성 → 순위 누락 확인
- 학부모 공유 페이지(`/r/[token]`)에도 반영

---

## 2.14 SNB(사이드바) 접기 기능

### 요청
- 로고 클릭 → 사이드바 접힘
- 접힌 상태에서 로고 영역 호버 → "펼치기" 버튼 노출
- 펼치기 버튼 클릭 → 다시 펼침

### 영향 파일
- `src/components/layout/sidebar.tsx` (또는 `nav-sidebar.tsx`)
- 레이아웃: `src/app/layout.tsx` 또는 `(dashboard)/layout.tsx`

### 구현
1. 상태 저장: `useState` + localStorage 지속 (`sidebarCollapsed: boolean`)
2. 접힌 상태:
   - 사이드바 width: `w-64` → `w-16`
   - 메뉴 텍스트 숨김, 아이콘만
3. 로고 영역:
   ```tsx
   <div className="group relative">
     <Logo onClick={() => setCollapsed(!collapsed)} />
     {collapsed && (
       <button className="hidden group-hover:block absolute ...">
         <ChevronRight />
       </button>
     )}
   </div>
   ```
4. 본문 레이아웃 width 보정: `ml-64` → `ml-16`
5. transition 300ms 적용
6. 모바일에서는 Sheet/Drawer 패턴 → 이 토글과 별개

### 테스트
- 로고 클릭 → 접힘
- 새로고침 후 상태 유지 (localStorage)
- 호버 시 펼치기 버튼 노출
- 모바일 (< 768px)에서는 기존 햄버거 메뉴 유지

---

## 2.15 시간표 비공개 → 입퇴실 일정 탭 필터링 + 오름차순

### 요청 해석
시간표에서 "빈 공간(자습 시간대)"이 있는 학생을 필터링해서 출결 테이블로 보여주는 기능 추가. 학년 기본 오름차순(좌석번호 or 이름).

### 영향 파일
- `src/app/timetable/page.tsx`
- `src/components/attendance/attendance-table.tsx` (재사용)

### 구현
1. 시간표에 "현재 자습 중인 학생 보기" 토글/버튼 추가
2. 현재 시간 기준, 시간표에 "자습" 또는 "빈 슬롯"인 학생 목록 추출:
   ```ts
   const now = new Date();
   const currentSlot = getSlotFromTime(now); // 예: "14:00"
   const studyingStudents = students.filter(s => {
     const slot = s.timetable.find(t => t.slot === currentSlot);
     return !slot || slot.type === "SELF_STUDY";
   });
   ```
3. 이들 학생 ID로 입퇴실 테이블 필터링
4. 기본 정렬: 좌석번호 오름차순

### 테스트
- 시간 어드 시뮬레이션 (`?now=14:00`)으로 다양한 시간대 테스트
- 자습 중이어야 하는데 출결 기록 없음 → 결석 하이라이트

---

## 2.16 인수인계 UI 개선

### 요청
구체적 명세 없음 → **PR 전에 사용자에게 확인 필요**.

### 추천 개선점 (사용자 확인받고 진행)
1. 당일 인수인계를 상단 고정 카드로 (접힘/펼침)
2. 체크리스트 항목별 완료 시 취소선 + 담당자 기록
3. 월간 노트와 일일 인수인계 탭 분리
4. 이전 날짜 이동에 캘린더 피커버로
5. Markdown 지원 (간단히 bold, 리스트)

### 영향 파일
- `src/app/handover/*`

---

## 2.17 멘토링 목록 메모 - 상벌점 표시

### 요청
- 멘토링 목록에 학생별 상벌점 누적 점수 표시
- 벌점 합계 **15점 이상** → 🤬(angry) 이모지
- 상점 합계 **10점 이상** → 👍(thumbs-up) 이모지

### 영향 파일
- `src/components/mentoring/mentoring-list.tsx` 또는 동등
- Server Action: `getMentoringListWithScores()`

### 구현
1. 쿼리 수정 → 각 학생별 PointLog 집계 포함 (또는 병렬 조회 후 join)
2. 표시 컴포넌트:
   ```tsx
   function PointBadge({ positive, negative }: { positive: number; negative: number }) {
     return (
       <span className="inline-flex gap-1">
         {positive >= 10 && <span title={`상점 ${positive}점`}>👍</span>}
         {negative >= 15 && <span title={`벌점 ${negative}점`}>🤬</span>}
       </span>
     );
   }
   ```
3. 멘토링 목록 테이블에 학생 이름 옆에 배지
4. 점수 기간: 이번 달 기준 (feature_spec의 "이달 집계"와 통일)

### 테스트
- 벌점 15점인 학생 → 화난 이모지
- 상점 10점인 학생 → 좋아요 이모지
- 둘 다인 경우 → 둘 다 표시

---

## 2.18 리포트 일괄 생성 개선

### 요청
1. 현재: 학생 1명씩 들어가서 리포트 생성 → 불편
2. 개선: 멘토링 리포트 목록에서 **체크박스로 여러 명 선택 → 일괄 생성**
3. 생성된 내용을 목록에서 바로 확인 가능해야 함

### 영향 파일
- `src/app/reports/mentoring/page.tsx` 또는 `src/app/mentoring/reports/`
- Server Action: `generateMentoringReportBulk(studentIds: string[], period: {from, to})`
- Groq 호출 쪽: `src/lib/ai/generate-report.ts`

### 구현 (클릭 단위)
1. **리포트 목록 페이지 재구성**
   - 좌측: 체크박스 + 학생 이름 + 학년 + 최근 멘토링 날짜 + 리포트 생성 상태(Badge)
   - 우측: 선택한 학생의 기존 리포트 프리뷰 (탭 or 아코디언)
2. **상단 툴바**
   - [기간 선택] 드롭다운 (이번 주/이번 달/커스텀)
   - [선택한 N명 리포트 생성] 버튼
   - [전체 선택] 체크박스
3. **일괄 생성 플로우**
   - 버튼 클릭 → Server Action 호출
   - Server Action은 `Promise.allSettled`로 병렬 처리 (Groq rate limit 고려하여 concurrency 3~5로 제한)
     ```ts
     import pLimit from "p-limit";
     const limit = pLimit(3);
     const results = await Promise.allSettled(
       studentIds.map(id => limit(() => generateOneReport(id, period)))
     );
     ```
   - 진행 상황 UI: progress bar + 실패한 학생 표시
4. **생성 결과 저장**
   - Prisma `MentoringReport` 모델 (없으면 신설):
     ```prisma
     model MentoringReport {
       id         String   @id @default(cuid())
       studentId  String
       student    Student  @relation(fields: [studentId], references: [id])
       periodFrom DateTime
       periodTo   DateTime
       content    String   @db.Text
       photosUrls String[] @default([])  // §2.22에서 사용
       createdAt  DateTime @default(now())
       createdBy  String?  // mentorId
     }
     ```
5. **리포트 확인 UI**
   - 학생 이름 클릭 → 우측 패널에 마크다운 렌더링
   - 리포트 삭제/재생성 버튼
   - PDF 다운로드, 학부모 공유 링크 복사
6. **실패 복구**
   - 실패한 건만 재시도하는 "실패한 N건 재생성" 버튼

### 테스트
- 10명 선택 → 생성 → 대기 UI → 완료 후 내역 표시
- 1명 실패 시 나머지는 진행되는지
- 동일 학생/기간으로 재생성 시 덮어쓰기 or 새 row 결정 (정책 확정 필요)

---

## 2.19 반응형 대응 (대규모)

### 대상 페이지
- 멘토링 (일간/주간/목록/상세)
- 인수인계
- 입퇴실 관리
- 포트폴리스트
- 캘린더
- 요청사항

### 공통 브레이크포인트
- `sm: 640px` / `md: 768px` / `lg: 1024px`
- 현재 설계는 주로 데스크탑 설계 → 모바일(< 768px)이 중심

### 공통 패턴
1. **테이블** → 모바일에서는 카드 리스트로 변환:
   ```tsx
   <div className="md:hidden">{rows.map(r => <MobileRowCard row={r} />)}</div>
   <table className="hidden md:table">...</table>
   ```
2. **사이드 패널/2단 레이아웃** → 모바일에서 Sheet 또는 전체화면 오버레이
3. **긴 폼** → Sheet로 하단에서 슬라이드업
4. **필터 바** → Popover로 접기
5. **버튼** → 모바일에서 하단 고정 bottom bar (position: fixed)

### 페이지별 특이사항
- **입퇴실 관리**: 2x2 액션 그리드는 유지하되 테이블은 카드로. "지급/삭제/미입실" 하단 액션바는 bottom-sheet로
- **캘린더**: 월간 뷰는 주간 뷰로 자동 전환 또는 스와이프
- **포트폴리스트**: 긴 리스트는 accordion으로 그룹화
- **요청사항**: 검색 + 필터 → Popover
- **멘토링 주간 계획 보드**: 가로 스크롤 허용 + sticky 헤더
- **인수인계**: §2.16 개선안과 함께 적용

### 구현 순서
1. 공통 유틸: `useMediaQuery("(max-width: 768px)")` 훅
2. `<ResponsiveTable>` 래퍼 → children에 card-fn과 table-fn 모두 전달 패턴
3. 페이지 1개씩 점진 마이그레이션, 각 페이지당 PR 분리 권장

### 테스트
- Chrome DevTools 모바일 뷰 (iPhone 13, Galaxy S21)
- 실기기 1회 검증

---

## 2.20 사진 관리 모듈 (신규)

### 요청
- 메뉴 탭으로 "사진 관리" 추가
- 구글 드라이브 같은 느낌: 폴더 구조, 그리드 뷰, 검색
- **파일명 룰 베이스**: KDA 포맷 (예: `날짜_좌석번호_이름.jpg` 또는 사용자 지정) → 룰에 맞지 않으면 **업로드 거부**

### Prisma 모델 (신규)
```prisma
model PhotoFolder {
  id        String   @id @default(cuid())
  name      String
  parentId  String?
  parent    PhotoFolder? @relation("FolderTree", fields: [parentId], references: [id])
  children  PhotoFolder[] @relation("FolderTree")
  photos    Photo[]
  createdAt DateTime @default(now())
}

model Photo {
  id           String   @id @default(cuid())
  folderId     String?
  folder       PhotoFolder? @relation(fields: [folderId], references: [id])
  fileName     String
  url          String   // blob/S3 URL
  thumbnailUrl String?
  // 룰 기반 파싱 결과
  parsedDate   DateTime?
  seatNumber   Int?
  studentId    String?
  student      Student? @relation(fields: [studentId], references: [id])
  uploadedBy   String
  uploadedAt   DateTime @default(now())
  @@index([parsedDate])
  @@index([seatNumber])
  @@index([studentId])
}
```

### 파일명 룰 파서 (예시)
```ts
// 포맷: YYYYMMDD_좌석번호_이름.확장자 (예: 20260421_15_김철수.jpg)
export function parsePhotoFileName(fileName: string) {
  const m = fileName.match(/^(\d{8})_(\d{1,3})_(.+)\.(jpg|jpeg|png|heic)$/i);
  if (!m) return { valid: false };
  const [, date, seat, name] = m;
  return {
    valid: true,
    date: parseYYYYMMDD(date),
    seatNumber: Number(seat),
    name,
  };
}
```

### UI 구성
1. **좌측 트리**: 폴더 네비게이션 (기본 폴더: "2026/04", "2026/05"... 자동 생성)
2. **중앙 그리드**: 썸네일 뷰, 선택/다중 선택, 검색바(이름/좌석/날짜)
3. **상단**: 업로드 버튼 (드래그앤드롭 zone), 정렬, 폴더 생성
4. **우측 상세 패널**: 선택한 사진의 메타정보, 매핑된 학생, 연결된 리포트

### 업로드 플로우
1. 파일 드롭 → 각 파일에 대해 `parsePhotoFileName` 실행
2. 실패한 파일: **빨간색으로 표시 + 에러 메시지**, 업로드 차단
3. 성공한 파일:
   - 좌석번호 기반으로 **해당 날짜 기준** 해당 좌석의 학생 lookup (Attendance 또는 Student.seatNumber)
   - 일치 학생의 `studentId`에 자동 연결
   - Blob 스토리지 업로드 (Vercel Blob 또는 AWS S3)
   - Photo row 생성
4. 일괄 결과 요약 Toast: "12개 중 10개 업로드, 2개 실패"

### 스토리지
- **추천**: Vercel Blob (월 무료 1GB, 추가 시 과금) → 이미 Vercel 쓰고 있음
- 또는 Cloudflare R2 (S3 호환, 무료 egress)
- `env`에 `BLOB_READ_WRITE_TOKEN` 추가

### 테스트
- 정상 파일명 업로드 → 학생 자동 매핑
- 잘못된 파일명 → 거부 메시지
- 같은 파일명 중복 → conflict 처리 (덮어쓰기 or skip 정책 결정)
- 100개 일괄 업로드 → 진행률 표시

---

## 2.21 급여 정산 모듈 (신규)

### 요청
1. 출퇴근 태깅 기능
2. 태그 기반 정산 (시급 × 근무시간)
3. **주휴수당** 자동 계산 (한국 근로기준법 준수)

### 한국 주휴수당 법령 (2026 기준)
- 1주 소정 근로시간이 **15시간 이상**인 근로자에게 **주 1회 유급휴일(일비) 지급**
- 주휴수당 = (1주 소정 근로시간 ÷ 40) × 8시간 × 시급
- 단, 실제 소정 근로일을 **개근**해야 지급 (결근 시 미지급)
- 1주 15시간 미만 근로자는 주휴수당 대상 아님
- 2026년 최저 시급: **10,030원/시간** (2025년 기준, 2026은 확인 필요)

> ⚠️ 이 수치는 2025 기준 발표치. 구현 시 Claude Code가 `web_search`로 2026년 확정 최저 시급 확인 후 수치 업데이트. 별 감안 시 고용노동부 고시확인.

### Prisma 모델
```prisma
model WorkTag {
  id         String   @id @default(cuid())
  userId     String   // 멘토 ID
  user       User     @relation(fields: [userId], references: [id])
  type       WorkTagType  // CLOCK_IN, CLOCK_OUT
  taggedAt   DateTime @default(now())
  note       String?
  @@index([userId, taggedAt])
}

enum WorkTagType {
  CLOCK_IN
  CLOCK_OUT
}

model PayrollSetting {
  id              String  @id @default(cuid())
  userId          String  @unique
  user            User    @relation(fields: [userId], references: [id])
  hourlyRate      Int     // 원
  weeklyHolidayPay Boolean @default(true) // 주휴수당 지급 여부
}

model PayrollRecord {
  id               String   @id @default(cuid())
  userId           String
  periodFrom       DateTime
  periodTo         DateTime
  workMinutes      Int
  baseWage         Int      // 기본급 (시급×시간)
  weeklyHolidayWage Int     // 주휴수당
  totalWage        Int
  createdAt        DateTime @default(now())
}
```

### 구현

#### (a) 출퇴근 태깅 UI
1. 멘토 본인 계정에서 **대시보드 상단 고정 위젯**:
   - 현재 상태: "출근 전" / "근무 중 (00:00부터 N시간)"
   - 버튼: [출근 태깅] / [퇴근 태깅]
2. 관리자 UI (`/admin/worktags`):
   - 멘토별 월별 태그 목록
   - 누락된 태그 수동 추가/수정
3. 태그 위치 검증 선택적 → GPS/IP는 보류 (가능성이지만 사용자 요청에 명시 없음)

#### (b) 정산 계산 Server Action
```ts
export async function calculatePayroll(userId: string, weekStart: Date) {
  const setting = await prisma.payrollSetting.findUnique({ where: { userId } });
  const tags = await prisma.workTag.findMany({
    where: { userId, taggedAt: { gte: weekStart, lt: addDays(weekStart, 7) } },
    orderBy: { taggedAt: "asc" },
  });

  // IN/OUT 짝 매칭 → 분 단위 근무시간 산출
  const shifts = pairWorkTags(tags);
  const totalMinutes = shifts.reduce((sum, s) => sum + s.minutes, 0);
  const totalHours = totalMinutes / 60;

  const baseWage = Math.round(totalMinutes / 60 * setting.hourlyRate);

  // 주휴수당: 15시간 이상 근무 && 개근
  let weeklyHolidayWage = 0;
  if (setting.weeklyHolidayPay && totalHours >= 15 && isPerfectAttendance(shifts)) {
    const weeklyPaidHours = Math.min(totalHours, 40) / 40 * 8;
    weeklyHolidayWage = Math.round(weeklyPaidHours * setting.hourlyRate);
  }

  return {
    totalMinutes,
    baseWage,
    weeklyHolidayWage,
    totalWage: baseWage + weeklyHolidayWage,
  };
}
```

#### (c) 관리자 정산 대시보드
- 멘토 × 주 단위 테이블
- 각 셀: 근무시간 / 기본급 / 주휴수당 / 총액
- 월별 집계, PDF 내보내기

### 테스트
- 시급 10,030원 × 주 20시간 근무 → 기본급 200,600 + 주휴수당 40,120 계산
- 주 14시간 근무 → 주휴수당 0
- IN 2회 연속 (OUT 누락) → 경고 표시 + 수동 보정 UI

---

## 2.22 리포트 → 사진 자동 첨부 (파이프라인)

### 요청 (다음 스텝)
- §2.18의 일괄 생성된 리포트
- §2.20의 사진 관리 모듈
- 이 둘을 연결: **좌석-이름 매핑으로 최신 사진 자동 첨부 후 발송**

### 플로우
1. 리포트 생성 완료 시점 → 해당 학생 ID로 `Photo` 조회
   - `studentId` 일치 AND `parsedDate >= periodFrom AND <= periodTo`
   - 가장 최신 N장 (기본 3장)
2. `MentoringReport.photosUrls` 필드에 저장
3. 학부모 발송 시 (카카오톡/이메일/공유 페이지):
   - 리포트 본문 + 첨부 사진 갤러리

### 구현
1. `attachPhotosToReport(reportId: string)` Server Action
2. `generateMentoringReportBulk`에서 리포트 저장 직후 자동 호출
3. 수동 보정 UI: 리포트 상세에서 "사진 변경" → 사진 관리 모듈에서 pick
4. 학부모 공유 페이지(`/r/[token]`) 템플릿에 photo gallery 컴포넌트 추가

### 엣지케이스
- 매핑된 사진이 0장 → 경고 상태로 표시, 매니저가 수동으로 첨부
- 파일명 룰에 맞는 사진은 전제이므로 §2.20에서 업로드 차단되므로 matching은 안정

### 테스트
- 리포트 1건 생성 → 자동으로 해당 기간 최신 사진 매핑
- 사진 없는 학생 → "사진 없음" 표시
- 수동 사진 변경 → 저장 반영

---

# 3. 체크리스트 (Claude Code 자체 점검)

각 PR 머지 전 확인:

- [ ] `npm run build` 통과
- [ ] `npm run lint` 통과
- [ ] 영향받는 페이지 로컬에서 1분 이상 사용해봄
- [ ] 기존 프로덕션 URL 변경 없음
- [ ] Prisma 스키마 변경 시 `prisma migrate dev`로 로컬 DB 업데이트
- [ ] 한국어 UI 텍스트 확인
- [ ] 모바일 뷰 확인 (해당 시)
- [ ] 에러 바운더리/빈 상태 처리
- [ ] Slack 알림 (`#studyroom-ops`) 관련 기능 회귀 확인

---

# 4. Claude Code에게 전달할 메타 프롬프트

> 당신은 KHSB 스터디룸 매니저 레포의 tmp-main 브랜치에서 작업합니다.
> `CLAUDE_CODE_TASKS.md`에 명시된 작업을 순서대로 처리하세요.
> 각 작업마다 다음 순서를 지키세요:
> 1. 해당 섹션을 읽고 불명확한 지점이 있으면 **코드를 먼저 확인**해서 해결 시도
> 2. 해결 안 되는 경우 PR에 질문으로 남기고 해당 작업 스킵
> 3. feature 브랜치 생성 → 구현 → 로컬 빌드 → 커밋 → PR
> 4. PR 본문에 "CLAUDE_CODE_TASKS.md §X.X" 참조 명시
> 5. 한 PR당 한 작업 원칙 (단, §2.14 같은 소규모 작업은 여러 개 묶기 OK → PR 제목에 명시)
>
> 모호한 정책 결정 지점 (예: §2.2의 "컬럼 삭제" 여부, §2.18의 "재생성 시 덮어쓰기" 여부)은 **임의 결정 금지**. 반드시 PR 코멘트로 질문.

---

## 부록 A: 우선순위 재정렬 참고

1. **사업 임팩트 큰 작업**: §2.18 리포트 일괄 생성, §2.12 대시보드 (원장님 직접 요청)
2. **이슈 고통 해결**: §2.1 자동 퇴실, §2.7 사진 업로드 버그, §2.5 시험 좌석
3. **UX 개선**: §2.10 정렬, §2.14 SNB, §2.19 반응형
4. **신규 모듈**: §2.20 사진 관리, §2.21 급여 정산, §2.22 자동 첨부

사용자(파운더)는 Sprint 1을 먼저 머지해서 고객 만족도 즉시 개선, Sprint 5~7은 SaaS 출시 시점에 맞춰 기능 확장으로 포지셔닝 권장.
