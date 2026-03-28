select
    table_name
from information_schema.tables
where table_schema = 'public'
  and table_name in ('user_accounts', 'user_payments', 'user_access_codes')
order by table_name;

select
    column_name,
    data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'user_accounts'
order by ordinal_position;

select
    column_name,
    data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'user_payments'
order by ordinal_position;

select
    column_name,
    data_type
from information_schema.columns
where table_schema = 'public'
  and table_name = 'user_access_codes'
order by ordinal_position;
