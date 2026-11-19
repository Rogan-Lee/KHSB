# 상태

데이터를 보여 주는 화면과 동작마다 아래 상태가 있는지 본다. 새로 만들기 전에 이 프로젝트에 있는 걸 먼저 쓴다.

| 상태 | 언제 | 쓸 것 |
|---|---|---|
| 로딩(화면) | 라우트 이동, Suspense | 세그먼트 `loading.tsx`, SEED `ContentPlaceholder`(`src/seed-design/ui/content-placeholder.tsx`), 포털 `Skeleton`(`src/components/portal/ui.tsx`) |
| 로딩(동작) | 저장·전송 중 | SEED ActionButton `loading`, `LoadingIndicator` |
| 빈 상태 | 0건, 검색·필터 결과 없음 | 어드민 `EmptyState`(`src/components/backoffice/ui.tsx`), 포털 `EmptyState`(`src/components/portal/ui.tsx`), SEED `ResultSection` |
| 에러(화면) | 불러오기 실패 | 세그먼트 `error.tsx`, SEED `ResultSection` + 다시 시도 |
| 에러(동작) | 서버 액션 실패 | toast(sonner, `src/components/app-toaster.tsx`) 또는 SEED Snackbar, 한국어 문구 |
| 성공 | 저장·전송 뒤 | toast, `revalidatePath` 로 목록 갱신 |

- 빈 상태엔 "왜 비었는지 + 다음 행동"을 둔다(예: "등록된 학생이 없어요" + 등록 버튼). 원래 비어 있는 것과 필터 때문에 빈 것을 구분한다.
- 에러 문구는 프로젝트 패턴("학생을 찾을 수 없습니다")을 따르고 내부 오류 내용을 그대로 보이지 않는다.

## 중복 제출·경쟁

- pending 동안 버튼 비활성. 두 번 빠르게 탭해도 한 번만 실행되는지 본다.
- 낙관적 업데이트는 실패하면 되돌린다.
- 빠르게 바뀌는 검색·필터는 마지막 요청 결과만 반영한다.

## 극단값

- 아주 긴 이름, 띄어쓰기 없는 긴 문자열(한국어 문장은 `break-keep`, URL 은 `break-all`).
- 0건·1건·수백 건, 느린 네트워크, 권한 없는 사용자.
