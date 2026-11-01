// Read every row of a query in pages, keyed on a unique column, so a long read stays exact
// while people keep working. Used by the full export (readTable below, called per table by
// src/app/api/export/route.ts) and by the schedule import's duplicate-shift check
// (src/lib/scheduleLoad.ts).
//
// Offset pages (rows 0-999, then 1000-1999) shift under concurrent writes: a delete before
// the cursor slides a row past the next page's start and it is never read; an insert before
// the cursor slides a row back and it is read twice. Shifts are hard-deleted, so this is not
// hypothetical. Keyset pages ask for "key greater than the last key seen" instead, which
// writes elsewhere in the table cannot move: every row that existed when the read began and
// still exists comes back exactly once. Rows written mid-read may or may not appear.
//
// Pure and server/script only (no Supabase import), so scripts/importexport-check runs it in
// node against a fake.

export const EXPORT_PAGE_SIZE = 1000; // Supabase answers at most 1000 rows per request

type PageResult<Row> = { data: Row[] | null; error: { message: string; code?: string } | null };

// The few query-builder calls keyset paging needs. A Supabase select satisfies it.
export interface KeysetQuery<Row> extends PromiseLike<PageResult<Row>> {
  gt(column: string, value: unknown): KeysetQuery<Row>;
  order(column: string, options: { ascending: boolean }): KeysetQuery<Row>;
  limit(count: number): KeysetQuery<Row>;
}

// `query` must build a fresh, fully filtered select on every call: the filter is applied to
// every page, not just the first. `key` must be unique and never null (a primary key).
export async function fetchAllByKey<Row extends Record<string, unknown>>(
  query: () => KeysetQuery<Row>,
  key: string,
  pageSize = EXPORT_PAGE_SIZE
): Promise<Row[]> {
  const out: Row[] = [];
  let after: unknown = undefined;
  for (;;) {
    let q = query();
    if (after !== undefined) q = q.gt(key, after);
    const { data, error } = await q.order(key, { ascending: true }).limit(pageSize);
    if (error) throw Object.assign(new Error(error.message), { code: error.code });
    const rows = data || [];
    out.push(...rows);
    if (rows.length < pageSize) return out;
    after = rows[rows.length - 1][key];
    // Without the key the next page would repeat this one forever.
    if (after === undefined || after === null) throw new Error(`rows have no ${key} to page by`);
  }
}

// One export table: every row `filter` allows, paged on id. The export route calls this once
// per table (and once per parent-id chunk). The filter runs on every page, so a store-scoped
// read stays store-scoped on page two. Every exported table has a uuid primary key id.
// db is typed any like the routes' clients: the installed supabase-js generics do not fit a
// table name chosen at run time.
export async function readTable(db: any, table: string, filter: (q: any) => any): Promise<any[]> {
  try {
    return await fetchAllByKey<any>(() => filter(db.from(table).select("*")), "id");
  } catch (err: any) {
    throw Object.assign(new Error(`${table}: ${err?.message || err}`), { code: err?.code });
  }
}
