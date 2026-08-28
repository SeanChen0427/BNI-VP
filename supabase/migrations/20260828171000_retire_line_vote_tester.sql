-- LINE 投票端對端驗收已完成，測試器正式退場。
-- 僅清除獨立測試呼喚與測試票；正式案件、投票快照與 votes 不受影響。

delete from public.case_vote_calls
where is_test;

drop function if exists public.edge_cast_test_case_vote(
  uuid,
  uuid,
  public.vote_choice
);

revoke all on table public.case_vote_test_votes
  from public, anon, authenticated, service_role;

alter table public.case_vote_calls
  drop constraint if exists case_vote_calls_formal_only_after_tester_retirement;

alter table public.case_vote_calls
  add constraint case_vote_calls_formal_only_after_tester_retirement
  check (not is_test);

comment on table public.case_vote_test_votes is
  '已退場的 LINE 投票測試器舊表；僅為遷移相容保留，不再開放讀寫。';

comment on constraint case_vote_calls_formal_only_after_tester_retirement
  on public.case_vote_calls is
  '測試器退場後，case_vote_calls 只允許正式案件呼喚。';
