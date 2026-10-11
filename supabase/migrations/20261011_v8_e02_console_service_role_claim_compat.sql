-- Use Supabase JWT-role accessor (supports both request.jwt.claim.role and
-- request.jwt.claims JSON); PostgreSQL SECURITY DEFINER changes current_user.
do $migration$
declare f record; original text;
begin
 for f in select oid from pg_proc
 where oid in (
  'public.v8_e02_panel_auth(text,text,text,text)'::regprocedure,
  'public.v8_e02_panel_store_runway_secret(text)'::regprocedure,
  'public.v8_e02_get_runway_secret()'::regprocedure,
  'public.v8_e02_panel_control(text,integer)'::regprocedure
 ) loop
  original:=pg_get_functiondef(f.oid);
  original:=replace(original,
    'current_setting(''request.jwt.claim.role'',true) is distinct from ''service_role''',
    'auth.role() is distinct from ''service_role''');
  original:=replace(original,
    'current_setting(''request.jwt.claim.role'',true) is distinct from ''service_role''',
    'auth.role() is distinct from ''service_role''');
  execute original;
 end loop;
end;
$migration$;