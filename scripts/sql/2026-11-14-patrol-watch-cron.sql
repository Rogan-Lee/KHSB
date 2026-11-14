-- 미순찰 알림 스케줄 (2026-11-14) — Supabase pg_cron 이 1분마다 /api/cron/patrol-watch 를 부른다.
-- 판단(근무 시간·재실 학생·20분 경과·중복 방지)은 전부 API 쪽에 있고, 여기는 호출만 한다.
-- 적용: 코드가 운영에 배포된 뒤 Supabase SQL 편집기(운영 vrdz)에서 실행. 다시 실행해도 안전(같은 이름 작업은 덮어씀).
-- 끄기: select cron.unschedule('patrol-watch');

create extension if not exists pg_cron;
create extension if not exists pg_net with schema extensions;

-- ① CRON_SECRET 을 Vault 에 한 번만 넣는다 (Vercel 환경변수와 같은 값). 이미 있으면 건너뛴다.
--    저장소에 비밀값을 남기지 않게 아래 자리에 직접 붙여 넣고 실행할 것.
-- select vault.create_secret('<CRON_SECRET 값>', 'cron_secret');

-- ② 1분마다 호출
select cron.schedule(
  'patrol-watch',
  '* * * * *',
  $$
  select net.http_get(
    url := 'https://admin.kanghanseonbae.com/api/cron/patrol-watch',
    headers := jsonb_build_object(
      'Authorization',
      'Bearer ' || (select decrypted_secret from vault.decrypted_secrets where name = 'cron_secret')
    ),
    timeout_milliseconds := 10000
  );
  $$
);

-- 확인: 최근 호출 결과 (200 이어야 함)
-- select status_code, content, created from net._http_response order by created desc limit 5;
