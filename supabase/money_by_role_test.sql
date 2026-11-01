-- Proves ARCH-03 at the database: staff cannot read a dollar figure, lead, manager and owner
-- still can, the payment functions work for those three and refuse staff, and the store fence
-- still holds. docs/adr/ADR-003-money-by-role-at-the-database.md says why it is built this way.
--
-- Run it on a DISPOSABLE database, never the store's:
--   psql "<disposable database>" -v ON_ERROR_STOP=1 -f supabase/money_by_role_test.sql
-- It makes its own two stores, members and records, including rows in auth.users, inside one
-- transaction and rolls every one of them back. It is not in run-order.txt, so the migration
-- workflow never runs it.
--
-- Two kinds of database:
--   enforced login (auth_setup.sql has run): the full role and store matrix below.
--   demo (dev_all still open): only that the three views exist, carry no dollar column, and read.
-- Prints one row per check, then fails with the names of any check that did not pass.

begin;

create temp table check_result (n serial, name text, expected text, actual text);
create temp table mode as
  select not exists (
    select 1 from pg_policies
    where schemaname = 'public' and tablename = 'invoice' and policyname = 'dev_all') as enforced;

-- Who to act as. Store A has an owner, a manager, a lead and a staff member; store B has an
-- owner. "unlinked" is a signed-in account with no member row; "anon" is nobody signed in.
create temp table actor (name text primary key, auth_id uuid, store_id uuid);
insert into actor values
  ('owner',    'a0300000-0000-4000-8000-0000000000a1', 'a0300000-0000-4000-8000-00000000000a'),
  ('manager',  'a0300000-0000-4000-8000-0000000000a2', 'a0300000-0000-4000-8000-00000000000a'),
  ('lead',     'a0300000-0000-4000-8000-0000000000a3', 'a0300000-0000-4000-8000-00000000000a'),
  ('staff',    'a0300000-0000-4000-8000-0000000000a4', 'a0300000-0000-4000-8000-00000000000a'),
  ('owner_b',  'a0300000-0000-4000-8000-0000000000b1', 'a0300000-0000-4000-8000-00000000000b'),
  ('unlinked', 'a0300000-0000-4000-8000-0000000000c1', null),
  ('anon',     null, null);

-- Fixtures, written as the table owner so row-level security does not apply. Per store: one
-- vendor with a minimum order, two invoices (one owing, one paid by a payment and its
-- allocation), an order, a credit note, an insurance policy, an employee with a pay rate, and a
-- capture with one priced line.
insert into store (id, name) values
  ('a0300000-0000-4000-8000-00000000000a', 'ARCH-03 test store A'),
  ('a0300000-0000-4000-8000-00000000000b', 'ARCH-03 test store B');

do $$
declare
  s record;
  x text;
begin
  for s in select * from (values ('a', 'a0300000-0000-4000-8000-00000000000a'::uuid),
                                 ('b', 'a0300000-0000-4000-8000-00000000000b'::uuid)) v(x, id)
  loop
    x := s.x;
    insert into department (id, store_id, name)
      values (('a0300000-0000-4000-8001-00000000000' || x)::uuid, s.id, 'ARCH-03 Hardware');
    insert into vendor (id, store_id, department_id, name, minimum_order_amount)
      values (('a0300000-0000-4000-8002-00000000000' || x)::uuid, s.id,
              ('a0300000-0000-4000-8001-00000000000' || x)::uuid, 'ARCH-03 vendor ' || x, 500);
    insert into invoice (id, store_id, vendor_id, invoice_number, amount, hst_amount, freight_charges, tax_mode, due_date, status)
      values (('a0300000-0000-4000-8003-00000000000' || x)::uuid, s.id,
              ('a0300000-0000-4000-8002-00000000000' || x)::uuid, 'A03-' || x || '-1',
              1000, 130, 0, 'separate', current_date - 10, 'unpaid'),
             (('a0300000-0000-4000-8003-0000000000' || x || x)::uuid, s.id,
              ('a0300000-0000-4000-8002-00000000000' || x)::uuid, 'A03-' || x || '-2',
              200, 0, 0, 'none', current_date - 40, 'paid');
    insert into payment (id, vendor_id, amount, method, paid_date)
      values (('a0300000-0000-4000-8004-00000000000' || x)::uuid,
              ('a0300000-0000-4000-8002-00000000000' || x)::uuid, 200, 'cheque', current_date - 30);
    insert into payment_allocation (payment_id, invoice_id, amount)
      values (('a0300000-0000-4000-8004-00000000000' || x)::uuid,
              ('a0300000-0000-4000-8003-0000000000' || x || x)::uuid, 200);
    insert into purchase_order (id, store_id, vendor_id, order_amount, status)
      values (('a0300000-0000-4000-8005-00000000000' || x)::uuid, s.id,
              ('a0300000-0000-4000-8002-00000000000' || x)::uuid, 900, 'ordered');
    insert into credit_note (id, store_id, vendor_id, invoice_id, credit_amount, reason, status)
      values (('a0300000-0000-4000-8006-00000000000' || x)::uuid, s.id,
              ('a0300000-0000-4000-8002-00000000000' || x)::uuid,
              ('a0300000-0000-4000-8003-00000000000' || x)::uuid, 50, 'Damaged in transit', 'pending');
    insert into insurance_policy (id, store_id, name, premium, renewal_date)
      values (('a0300000-0000-4000-8007-00000000000' || x)::uuid, s.id, 'ARCH-03 liability', 2400, current_date + 20);
    insert into employee (id, store_id, full_name)
      values (('a0300000-0000-4000-8008-00000000000' || x)::uuid, s.id, 'ARCH-03 employee ' || x);
    insert into pay_rate (id, employee_id, rate, unit, effective_date)
      values (('a0300000-0000-4000-8009-00000000000' || x)::uuid,
              ('a0300000-0000-4000-8008-00000000000' || x)::uuid, 18.50, 'hour', current_date - 30);
    insert into receiving_event (id, store_id, department_id, vendor_id, vendor_name, status)
      values (('a0300000-0000-4000-800a-00000000000' || x)::uuid, s.id,
              ('a0300000-0000-4000-8001-00000000000' || x)::uuid,
              ('a0300000-0000-4000-8002-00000000000' || x)::uuid, 'ARCH-03 vendor ' || x, 'confirmed');
    insert into receiving_line (receiving_event_id, description, qty, unit_cost, confidence)
      values (('a0300000-0000-4000-800a-00000000000' || x)::uuid, 'Nails', 2, 10, 0.95);
  end loop;

  -- Members exist only once login is enforced; a demo database has no auth_id column.
  if (select enforced from mode) then
    insert into auth.users (id, email, aud, role)
      select a.auth_id, 'arch03-' || a.name || '@test.invalid', 'authenticated', 'authenticated'
      from actor a where a.auth_id is not null;
    insert into app_user (store_id, full_name, role, email, auth_id)
      select a.store_id, 'ARCH-03 ' || a.name, case when a.name = 'owner_b' then 'owner' else a.name end,
             'arch03-' || a.name || '@test.invalid', a.auth_id
      from actor a where a.store_id is not null;
  end if;
end $$;

-- Act as an actor until reset role. Sets the JWT claims the way the API does for each request.
create function pg_temp.become(p_actor text) returns void language plpgsql as $$
declare a record;
begin
  select * into a from actor where name = p_actor;
  if not found then
    raise exception 'money_by_role_test: no actor %', p_actor;
  end if;
  if a.auth_id is null then
    perform set_config('request.jwt.claims', '{"role":"anon"}', true);
    perform set_config('request.jwt.claim.sub', '', true);
    execute 'set local role anon';
  else
    perform set_config('request.jwt.claims', json_build_object('sub', a.auth_id, 'role', 'authenticated')::text, true);
    perform set_config('request.jwt.claim.sub', a.auth_id::text, true);
    execute 'set local role authenticated';
  end if;
end $$;

-- How many rows the actor sees from a query, 'denied' when the role may not read it at all, or
-- 'error <sqlstate>' when the query cannot run (a database from before ARCH-03 has no views).
create function pg_temp.rows_as(p_actor text, p_sql text) returns text language plpgsql as $$
declare result text;
begin
  perform pg_temp.become(p_actor);
  begin
    execute format('select count(*)::text from (%s) q', p_sql) into result;
  exception
    when insufficient_privilege then result := 'denied';
    when others then result := 'error ' || sqlstate;
  end;
  execute 'reset role';
  return result;
end $$;

-- Runs a statement as the actor: 'ok <rows>' or 'refused <sqlstate>'. A refused statement rolls
-- back; an ok one stays until the final rollback.
create function pg_temp.run_as(p_actor text, p_sql text) returns text language plpgsql as $$
declare n bigint; result text;
begin
  perform pg_temp.become(p_actor);
  begin
    execute p_sql;
    get diagnostics n = row_count;
    result := 'ok ' || n;
  exception when others then
    result := 'refused ' || sqlstate;
  end;
  execute 'reset role';
  return result;
end $$;

create function pg_temp.expect(p_name text, p_expected text, p_actual text) returns void language sql as $$
  insert into check_result (name, expected, actual) values (p_name, p_expected, p_actual);
$$;

create function pg_temp.view_columns(p_view text) returns text language sql as $$
  select string_agg(column_name, ',' order by ordinal_position)
  from information_schema.columns where table_schema = 'public' and table_name = p_view;
$$;

-- The views, on both kinds of database: present, and not one dollar column among them.
do $$
begin
  perform pg_temp.expect('vendor_directory columns',
    'id,store_id,department_id,name,rep_name,phone,email,products_we_carry,default_terms,status,notes,summer_order_timeline,order_location,order_location_other,reorder_status,reorder_comments,specializes_in,created_at,voided_at',
    pg_temp.view_columns('vendor_directory'));
  perform pg_temp.expect('invoice_due columns', 'id,store_id,vendor_id,invoice_number,terms,due_date,status,voided_at',
    pg_temp.view_columns('invoice_due'));
  perform pg_temp.expect('insurance_renewal columns', 'id,store_id,name,renewal_date,voided_at',
    pg_temp.view_columns('insurance_renewal'));
end $$;

-- Demo: the open policies stay, nothing is fenced by role, and the views read.
do $$
begin
  if (select enforced from mode) then return; end if;
  perform pg_temp.expect('demo: no money_store_rw policy', '0',
    (select count(*)::text from pg_policies where schemaname = 'public' and policyname = 'money_store_rw'));
  perform pg_temp.expect('demo: anon reads invoice', '2',
    pg_temp.rows_as('anon', $q$select 1 from public.invoice where store_id = 'a0300000-0000-4000-8000-00000000000a'$q$));
  perform pg_temp.expect('demo: anon reads vendor_directory', '1',
    pg_temp.rows_as('anon', $q$select 1 from public.vendor_directory where store_id = 'a0300000-0000-4000-8000-00000000000a'$q$));
  perform pg_temp.expect('demo: anon reads invoice_due', '2',
    pg_temp.rows_as('anon', $q$select 1 from public.invoice_due where store_id = 'a0300000-0000-4000-8000-00000000000a'$q$));
  perform pg_temp.expect('demo: anon reads insurance_renewal', '1',
    pg_temp.rows_as('anon', $q$select 1 from public.insurance_renewal where store_id = 'a0300000-0000-4000-8000-00000000000a'$q$));
end $$;

-- Enforced login: the full matrix.
do $$
declare
  t text;
  who text;
  expected_rows text;
  pay uuid;
begin
  if not (select enforced from mode) then return; end if;

  -- The rule itself, per actor. Mirrors canSeeMoney in src/lib/auth.ts.
  foreach who in array array['owner','manager','lead','owner_b'] loop
    perform pg_temp.expect(who || ' can_see_money', '1', pg_temp.rows_as(who, 'select 1 where app_auth.can_see_money()'));
  end loop;
  foreach who in array array['staff','unlinked','anon'] loop
    perform pg_temp.expect(who || ' can_see_money', '0', pg_temp.rows_as(who, 'select 1 where app_auth.can_see_money()'));
  end loop;

  -- 1. Every table with a dollar figure: money roles see their own store's rows, nobody else
  -- sees any. invoice has two rows per store; the rest have one.
  foreach t in array array['invoice','purchase_order','credit_note','insurance_policy','vendor',
                           'payment','payment_allocation','pay_rate','receiving_line'] loop
    expected_rows := case when t = 'invoice' then '2' else '1' end;
    foreach who in array array['owner','manager','lead','owner_b'] loop
      perform pg_temp.expect(format('%s reads %s', who, t), expected_rows,
        pg_temp.rows_as(who, format('select 1 from public.%I', t)));
    end loop;
    foreach who in array array['staff','unlinked','anon'] loop
      perform pg_temp.expect(format('%s reads %s', who, t), '0|denied',
        pg_temp.rows_as(who, format('select 1 from public.%I', t)));
    end loop;
  end loop;

  -- The store fence still holds for a money role: store B's owner sees none of store A.
  foreach t in array array['invoice','purchase_order','credit_note','insurance_policy','vendor'] loop
    perform pg_temp.expect(format('owner_b reads store A %s', t), '0',
      pg_temp.rows_as('owner_b', format($q$select 1 from public.%I where store_id = 'a0300000-0000-4000-8000-00000000000a'$q$, t)));
  end loop;
  perform pg_temp.expect('owner_b reads store A payment', '0',
    pg_temp.rows_as('owner_b', $q$select 1 from public.payment where id = 'a0300000-0000-4000-8004-00000000000a'$q$));

  -- A money table reached through an embed or a join is fenced the same way.
  perform pg_temp.expect('staff joins receiving_event to its lines', '0',
    pg_temp.rows_as('staff', 'select 1 from public.receiving_event e join public.receiving_line l on l.receiving_event_id = e.id'));

  -- 2. The money-free views: every member reads their own store, nobody reads another's.
  foreach who in array array['owner','manager','lead','staff'] loop
    perform pg_temp.expect(who || ' reads vendor_directory', '1', pg_temp.rows_as(who, 'select 1 from public.vendor_directory'));
    perform pg_temp.expect(who || ' reads invoice_due', '2', pg_temp.rows_as(who, 'select 1 from public.invoice_due'));
    perform pg_temp.expect(who || ' reads insurance_renewal', '1', pg_temp.rows_as(who, 'select 1 from public.insurance_renewal'));
  end loop;
  perform pg_temp.expect('owner_b reads store A through invoice_due', '0',
    pg_temp.rows_as('owner_b', $q$select 1 from public.invoice_due where store_id = 'a0300000-0000-4000-8000-00000000000a'$q$));
  foreach who in array array['unlinked','anon'] loop
    perform pg_temp.expect(who || ' reads vendor_directory', '0|denied', pg_temp.rows_as(who, 'select 1 from public.vendor_directory'));
    perform pg_temp.expect(who || ' reads invoice_due', '0|denied', pg_temp.rows_as(who, 'select 1 from public.invoice_due'));
    perform pg_temp.expect(who || ' reads insurance_renewal', '0|denied', pg_temp.rows_as(who, 'select 1 from public.insurance_renewal'));
  end loop;
  perform pg_temp.expect('staff writes through vendor_directory', 'refused 42501|refused 55000',
    pg_temp.run_as('staff', $q$update public.vendor_directory set name = 'x'$q$));
  perform pg_temp.expect('anon calls the view function directly', 'refused 42501',
    pg_temp.run_as('anon', 'select * from app_auth.vendor_directory_rows()'));

  -- Tables with no dollar figure stay open to staff.
  foreach t in array array['receiving_event','employee','department'] loop
    perform pg_temp.expect('staff reads ' || t, '1', pg_temp.rows_as('staff', format('select 1 from public.%I', t)));
  end loop;

  -- 3. Staff writes. Capture still saves a priced line; every other money write is refused or
  -- touches nothing.
  perform pg_temp.expect('staff saves a captured line', 'ok 1',
    pg_temp.run_as('staff', $q$insert into public.receiving_line (receiving_event_id, description, qty, unit_cost, confidence)
      values ('a0300000-0000-4000-800a-00000000000a', 'Screws', 5, 3.25, 0.95)$q$));
  perform pg_temp.expect('staff cannot read the line back', '0',
    pg_temp.rows_as('staff', $q$select 1 from public.receiving_line where description = 'Screws'$q$));
  perform pg_temp.expect('the line was saved', '1',
    (select count(*)::text from receiving_line where description = 'Screws'));
  perform pg_temp.expect('staff saves a line into store B', 'refused 42501',
    pg_temp.run_as('staff', $q$insert into public.receiving_line (receiving_event_id, description, qty, unit_cost, confidence)
      values ('a0300000-0000-4000-800a-00000000000b', 'Screws', 5, 3.25, 0.95)$q$));
  perform pg_temp.expect('staff adds an invoice', 'refused 42501',
    pg_temp.run_as('staff', $q$insert into public.invoice (store_id, vendor_id, amount, status)
      values ('a0300000-0000-4000-8000-00000000000a', 'a0300000-0000-4000-8002-00000000000a', 1, 'unpaid')$q$));
  perform pg_temp.expect('staff changes an invoice amount', 'ok 0',
    pg_temp.run_as('staff', 'update public.invoice set amount = 1'));
  perform pg_temp.expect('staff changes a minimum order', 'ok 0',
    pg_temp.run_as('staff', 'update public.vendor set minimum_order_amount = 1'));
  perform pg_temp.expect('staff changes a pay rate', 'ok 0',
    pg_temp.run_as('staff', 'update public.pay_rate set rate = 99'));
  perform pg_temp.expect('staff deletes a payment', 'ok 0',
    pg_temp.run_as('staff', 'delete from public.payment'));
  perform pg_temp.expect('staff records a payment', 'refused 42501',
    pg_temp.run_as('staff', $q$select public.record_payment('a0300000-0000-4000-8002-00000000000a', 'cheque', current_date,
      null, 'N/A', null, '[{"invoice_id": "a0300000-0000-4000-8003-00000000000a", "amount": 100}]'::jsonb)$q$));
  perform pg_temp.run_as('staff', $q$select public.void_payment('a0300000-0000-4000-8004-00000000000a')$q$);
  perform pg_temp.expect('staff void_payment leaves the payment standing', 'standing',
    (select case when voided_at is null then 'standing' else 'voided' end from payment where id = 'a0300000-0000-4000-8004-00000000000a'));
  perform pg_temp.run_as('staff', $q$select public.edit_payment('a0300000-0000-4000-8004-00000000000a', 'cash', current_date, null, 'N/A', null, null)$q$);
  perform pg_temp.expect('staff edit_payment leaves the method', 'cheque',
    (select method from payment where id = 'a0300000-0000-4000-8004-00000000000a'));
  perform pg_temp.expect('unlinked records a payment', 'refused 42501',
    pg_temp.run_as('unlinked', $q$select public.record_payment('a0300000-0000-4000-8002-00000000000a', 'cheque', current_date,
      null, 'N/A', null, '[{"invoice_id": "a0300000-0000-4000-8003-00000000000a", "amount": 100}]'::jsonb)$q$));
  perform pg_temp.expect('owner_b records a payment in store A', 'refused 42501',
    pg_temp.run_as('owner_b', $q$select public.record_payment('a0300000-0000-4000-8002-00000000000a', 'cheque', current_date,
      null, 'N/A', null, '[{"invoice_id": "a0300000-0000-4000-8003-00000000000a", "amount": 100}]'::jsonb)$q$));
  perform pg_temp.expect('owner_b allocates a store B payment to a store A invoice', 'refused 42501',
    pg_temp.run_as('owner_b', $q$select public.record_payment('a0300000-0000-4000-8002-00000000000b', 'cheque', current_date,
      null, 'N/A', null, '[{"invoice_id": "a0300000-0000-4000-8003-00000000000a", "amount": 100}]'::jsonb)$q$));
  perform pg_temp.expect('no payment came from the refused calls', '1',
    (select count(*)::text from payment where vendor_id = 'a0300000-0000-4000-8002-00000000000a'));

  -- 4. Money roles keep the payment engine: record, void, record again.
  perform pg_temp.expect('manager records a payment', 'ok 1',
    pg_temp.run_as('manager', $q$select public.record_payment('a0300000-0000-4000-8002-00000000000a', 'cheque', current_date,
      null, 'N/A', null, '[{"invoice_id": "a0300000-0000-4000-8003-00000000000a", "amount": 100}]'::jsonb)$q$));
  perform pg_temp.expect('invoice goes to partially_paid', 'partially_paid',
    (select status from invoice where id = 'a0300000-0000-4000-8003-00000000000a'));
  select id into pay from payment
    where vendor_id = 'a0300000-0000-4000-8002-00000000000a' and amount = 100 and voided_at is null;
  perform pg_temp.expect('manager voids it', 'ok 1',
    pg_temp.run_as('manager', format('select public.void_payment(%L)', pay)));
  perform pg_temp.expect('invoice goes back to unpaid', 'unpaid',
    (select status from invoice where id = 'a0300000-0000-4000-8003-00000000000a'));
  perform pg_temp.expect('lead records a payment', 'ok 1',
    pg_temp.run_as('lead', $q$select public.record_payment('a0300000-0000-4000-8002-00000000000a', 'etransfer', current_date,
      null, 'N/A', null, '[{"invoice_id": "a0300000-0000-4000-8003-00000000000a", "amount": 100}]'::jsonb)$q$));
  perform pg_temp.expect('invoice is partially_paid again', 'partially_paid',
    (select status from invoice where id = 'a0300000-0000-4000-8003-00000000000a'));
  perform pg_temp.expect('owner edits a payment', 'ok 1',
    pg_temp.run_as('owner', $q$select public.edit_payment('a0300000-0000-4000-8004-00000000000a', 'cash', current_date - 30, null, 'N/A', null, null)$q$));
  perform pg_temp.expect('the edit landed', 'cash',
    (select method from payment where id = 'a0300000-0000-4000-8004-00000000000a'));
  perform pg_temp.expect('owner changes an invoice amount', 'ok 1',
    pg_temp.run_as('owner', $q$update public.invoice set freight_charges = 15 where id = 'a0300000-0000-4000-8003-00000000000a'$q$));
  perform pg_temp.expect('owner reads the minimum order', '1',
    pg_temp.rows_as('owner', 'select 1 from public.vendor where minimum_order_amount = 500'));
end $$;

select n, case when actual = any(string_to_array(expected, '|')) then 'PASS' else 'FAIL' end as result,
       name, left(actual, 40) as actual
from check_result order by n;

do $$
declare
  total int;
  failed text;
begin
  select count(*) into total from check_result;
  select string_agg(name || ' (expected ' || expected || ', got ' || coalesce(actual, 'null') || ')', '; ' order by n)
    into failed
    from check_result where not (coalesce(actual, '') = any(string_to_array(expected, '|')));
  if failed is not null then
    raise exception 'money_by_role_test: FAILED: %', failed;
  end if;
  raise notice 'money_by_role_test: all % checks passed (enforced login: %)', total, (select enforced from mode);
end $$;

rollback;
