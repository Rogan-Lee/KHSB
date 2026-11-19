# 폼

## 입력칸 속성

| 내용 | type | inputMode | autoComplete | 더 |
|---|---|---|---|---|
| 이름 | text | | name | |
| 휴대폰 | tel | tel | tel | |
| 이메일 | email | email | email | `autoCapitalize="off"` `spellCheck={false}` |
| 아이디 | text | | username | `autoCapitalize="off"` `autoCorrect="off"` `spellCheck={false}` |
| 비밀번호 | password | | current-password / new-password | |
| 인증번호 | text | numeric | one-time-code | `maxLength` |
| 금액·수량 | text | numeric | off | `type="number"` 대신(휠·`e` 입력 문제) |
| 점수(소수) | text | decimal | off | |
| 검색 | search | search | off | `enterKeyHint="search"` |
| 날짜 | date | | | 네이티브 피커, 또는 SEED 날짜 컴포넌트가 있는지 먼저 확인 |
| 주소 | text | | street-address | |
| 긴 글 | textarea | | off | |

`enterKeyHint`: 중간 칸은 `next`, 마지막 칸은 `done`·`send`·`go` 중 맞는 것.

SEED `TextFieldInput` 에 위 속성을 그대로 넘긴다. 라벨은 `TextField` 의 `label`.

## 글자 크기

- 16px 미만 입력칸은 iOS 가 포커스 때 화면을 확대한다. SEED TextField 는 `size="large"`(16px). 직접 만든 `<input>` 은 SEED 타이포 `t5-*`(16px).
- 새 화면에서 `maximumScale: 1` 로 확대를 막지 않는다(안드로이드에선 손가락 확대까지 막힌다). 글자 크기로 해결한다.

## 라벨·오류

- 모든 입력칸에 보이는 라벨(SEED `label`) 또는 `aria-label`. placeholder 를 라벨 대신 쓰지 않는다.
- 오류는 칸 아래에: SEED TextField `invalid` + `errorMessage`. 문구는 한국어("휴대폰 번호를 확인해 주세요").
- 제출이 실패하면 첫 번째 오류 칸으로 포커스한다.
- 붙여넣기를 막지 않는다. `autoComplete="off"` 는 위 표의 경우만.

## 제출

- 처리 중엔 버튼을 비활성하고 로딩을 보인다: SEED ActionButton `loading`, `useActionState`·`useTransition` 의 pending, react-hook-form `formState.isSubmitting`.
- Enter 를 직접 처리하면 한글 조합 중 Enter 를 거른다: `if (e.nativeEvent.isComposing) return;`(안 거르면 두 번 실행된다).
- 서버 액션 뒤 `revalidatePath`, 성공·실패 피드백(toast 또는 SEED Snackbar). 실패해도 입력값은 남긴다.
- 결제·청구처럼 두 번 실행되면 안 되는 동작은 버튼 비활성만 믿지 말고 서버에서도 중복을 막는다.
