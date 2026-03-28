create extension if not exists pgcrypto;

create or replace function public.generate_public_user_id()
returns text
language plpgsql
as $$
declare
    candidate text;
begin
    loop
        candidate := 'USR-' || upper(substr(md5(gen_random_uuid()::text), 1, 6));
        exit when not exists (
            select 1
            from public.user_accounts
            where public_user_id = candidate
        );
    end loop;

    return candidate;
end;
$$;

create table if not exists public.user_accounts (
    auth_user_uuid uuid primary key references auth.users(id) on delete cascade,
    local_user_id bigint,
    user_email text not null default '',
    full_name text not null default '',
    public_user_id text not null unique default public.generate_public_user_id(),
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_payments (
    auth_user_uuid uuid primary key references public.user_accounts(auth_user_uuid) on delete cascade,
    account_active boolean not null default false,
    last_payment_date date,
    activated_at timestamptz,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.user_access_codes (
    auth_user_uuid uuid primary key references public.user_accounts(auth_user_uuid) on delete cascade,
    access_code text not null default '',
    code_generated_at timestamptz,
    created_at timestamptz not null default timezone('utc', now()),
    updated_at timestamptz not null default timezone('utc', now())
);

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
    new.updated_at = timezone('utc', now());
    return new;
end;
$$;

create or replace function public.ensure_account_support_tables()
returns trigger
language plpgsql
as $$
begin
    insert into public.user_payments (auth_user_uuid)
    values (new.auth_user_uuid)
    on conflict (auth_user_uuid) do nothing;

    insert into public.user_access_codes (auth_user_uuid)
    values (new.auth_user_uuid)
    on conflict (auth_user_uuid) do nothing;

    return new;
end;
$$;

drop trigger if exists trg_user_accounts_updated_at on public.user_accounts;
create trigger trg_user_accounts_updated_at
before update on public.user_accounts
for each row
execute function public.touch_updated_at();

drop trigger if exists trg_user_payments_updated_at on public.user_payments;
create trigger trg_user_payments_updated_at
before update on public.user_payments
for each row
execute function public.touch_updated_at();

drop trigger if exists trg_user_access_codes_updated_at on public.user_access_codes;
create trigger trg_user_access_codes_updated_at
before update on public.user_access_codes
for each row
execute function public.touch_updated_at();

drop trigger if exists trg_user_accounts_support on public.user_accounts;
create trigger trg_user_accounts_support
after insert on public.user_accounts
for each row
execute function public.ensure_account_support_tables();
