-- Durable per-submission notifications. Provider secrets belong in Edge Function Secrets.
create extension if not exists pg_net with schema extensions;
create table public.lead_notifications (
 id uuid primary key default gen_random_uuid(),
 lead_id uuid not null references public.leads(id) on delete cascade,
 channel text not null check(channel in ('email','sms')),
 status text not null default 'pending' check(status in ('pending','processing','accepted','failed','unknown')),
 provider_id text,
 last_error text,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(lead_id,channel)
);
alter table public.lead_notifications enable row level security;
revoke all on public.lead_notifications from anon,authenticated;
grant select on public.lead_notifications to authenticated;
grant all on public.lead_notifications to service_role;
create policy "Staff can read alert status" on public.lead_notifications for select to authenticated using ((select private.is_staff()));
create index lead_notifications_pending on public.lead_notifications(created_at) where status='pending';

-- Do not return or log this token. It stays in Vault and server-to-server request headers.
do $$ begin
 if not exists(select 1 from vault.secrets where name='coles_alert_webhook_token') then
  perform vault.create_secret(encode(extensions.gen_random_bytes(32),'hex'),'coles_alert_webhook_token','Database-to-Edge notification authentication');
 end if;
end $$;

create function public.verify_alert_webhook(p_token text) returns boolean
language sql stable security definer set search_path='' as $$
 select coalesce(length(p_token)=64 and p_token=(select decrypted_secret from vault.decrypted_secrets where name='coles_alert_webhook_token'),false);
$$;
revoke all on function public.verify_alert_webhook(text) from public,anon,authenticated;
grant execute on function public.verify_alert_webhook(text) to service_role;

-- Service-only queue claim uses row locks to prevent duplicate sends from overlapping calls.
create function public.claim_lead_alerts(p_channels text[]) returns setof public.lead_notifications
language sql security invoker set search_path='' as $$
 update public.lead_notifications set status='unknown',last_error='Worker interrupted; check provider before retrying',updated_at=now() where status='processing' and updated_at < now()-interval '5 minutes';
 update public.lead_notifications set status='processing',updated_at=now()
 where id in (select id from public.lead_notifications where status='pending' and channel=any(p_channels) order by created_at limit 2 for update skip locked)
 returning *;
$$;
revoke all on function public.claim_lead_alerts(text[]) from public,anon,authenticated;
grant execute on function public.claim_lead_alerts(text[]) to service_role;

create function private.dispatch_lead_alerts() returns void
language plpgsql security definer set search_path='' as $$
declare hook_token text;
begin
 select decrypted_secret into hook_token from vault.decrypted_secrets where name='coles_alert_webhook_token';
 if hook_token is not null then
  perform net.http_post(
   url:='https://tubskesvgngmmgcicowq.supabase.co/functions/v1/lead-alerts',
   headers:=jsonb_build_object('Content-Type','application/json','x-alert-token',hook_token),
   body:='{}'::jsonb,timeout_milliseconds:=60000);
 end if;
end $$;
revoke all on function private.dispatch_lead_alerts() from public,anon,authenticated;

create function private.queue_lead_alerts() returns trigger
language plpgsql security definer set search_path='' as $$
begin
 insert into public.lead_notifications(lead_id,channel) values(new.id,'email'),(new.id,'sms');
 begin
  perform private.dispatch_lead_alerts();
 exception when others then
  -- The queue remains durable even when dispatch infrastructure is unavailable.
  null;
 end;
 return new;
end $$;
revoke all on function private.queue_lead_alerts() from public,anon,authenticated;
create trigger queue_submission_alerts after insert on public.leads for each row execute function private.queue_lead_alerts();

-- Preserve the previously submitted inquiry for notification once providers are connected.
insert into public.lead_notifications(lead_id,channel)
select id,channel from public.leads cross join (values('email'),('sms')) channels(channel) on conflict do nothing;

-- Retry pending work every minute, including when providers become connected later.
create extension if not exists pg_cron;
select cron.schedule('coles-lead-alerts','* * * * *','select private.dispatch_lead_alerts() where exists(select 1 from public.lead_notifications where status in (''pending'',''processing''));');
