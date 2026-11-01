const { parseSchedule, mapScheduleNames } = require("./importSchedule.js");
const { fetchAllByKey, readTable, EXPORT_PAGE_SIZE } = require("./exportPaging.js");
const { planScheduleLoad, scheduleLoadMessage } = require("./scheduleLoad.js");
let pass = 0, fail = 0;
const t = (n, c, d = "") => { c ? pass++ : fail++; console.log(`${c ? "PASS" : "FAIL"}  ${n}${d ? "  [" + d + "]" : ""}`); };

// A small in-memory stand-in for the Supabase client: from(table) with select, eq, is, in, gt,
// order, limit and insert. Like Supabase it answers at most 1000 rows per request, so an
// unpaged read comes back short. .range() throws, so offset paging cannot come back unnoticed.
// beforeRequest[n] runs just before select request n (0-based) is answered: somebody else's
// insert or delete landing mid-read.
function fakeDb(tables, opts = {}) {
  let requests = 0, made = 0;
  const log = [];
  const from = (table) => {
    if (!tables[table]) tables[table] = [];
    const q = { table, filters: [], order: null, limit: null };
    const b = {
      select() { return b; },
      eq(c, v) { q.filters.push((r) => r[c] === v); return b; },
      is(c, v) { q.filters.push((r) => (r[c] === undefined ? null : r[c]) === v); return b; },
      in(c, vs) { const s = new Set(vs); q.filters.push((r) => s.has(r[c])); return b; },
      gt(c, v) { q.filters.push((r) => r[c] > v); return b; },
      order(c, o) { q.order = { c, dir: o && o.ascending === false ? -1 : 1 }; return b; },
      limit(n) { q.limit = n; return b; },
      range() { throw new Error("offset paging (.range) is not allowed"); },
      insert(rows) {
        const list = Array.isArray(rows) ? rows : [rows];
        for (const r of list) tables[table].push({ id: `new-${++made}`, ...r });
        log.push({ table, op: "insert", rows: list });
        return Promise.resolve({ data: null, error: null });
      },
      then(ok, bad) {
        const n = requests++;
        if (opts.beforeRequest && opts.beforeRequest[n]) opts.beforeRequest[n](tables);
        log.push({ table, op: "select", q });
        if (opts.fail === table) return Promise.resolve({ data: null, error: opts.error || { message: "boom" } }).then(ok, bad);
        let out = tables[table].filter((r) => q.filters.every((f) => f(r)));
        if (q.order) out.sort((x, y) => (x[q.order.c] < y[q.order.c] ? -1 : x[q.order.c] > y[q.order.c] ? 1 : 0) * q.order.dir);
        out = out.slice(0, Math.min(q.limit == null ? 1000 : q.limit, 1000));
        return Promise.resolve({ data: out.map((r) => ({ ...r })), error: null }).then(ok, bad);
      }
    };
    return b;
  };
  return { from, log, tables };
}
const inserts = (db, table) => db.log.filter((l) => l.op === "insert" && l.table === table);
const selects = (db, table) => db.log.filter((l) => l.op === "select" && l.table === table);
// A read that throws comes back as no rows plus the reason, so it shows as a FAIL line.
const caught = async (fn) => { try { return { rows: await fn(), why: "" }; } catch (e) { return { rows: [], why: e.message }; } };

async function main() {
  // ---- Schedule upload, through planScheduleLoad: the code the import route runs ----

  // One week on one sheet: the date row (Excel serials from 2026-06-01), the day-name row,
  // then a department row whose Monday and Tuesday cells hold the same shift.
  const week = (cell) => parseSchedule([{
    name: "Week 1",
    rows: [
      ["", 46174, 46175, 46176, 46177, 46178, 46179, 46180],
      ["", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
      ["Hardware", cell, cell, null, null, null, null, null]
    ]
  }], {});
  const emp = (id, full_name, extra = {}) => ({ id, store_id: "s1", full_name, voided_at: null, ...extra });
  const AMBIGUOUS = "Amy matches 2 employees. Rename one in Staff, or write the full name in the schedule.";
  const MAYBE = "Amy may be Amy Robinson. Rename one in Staff to match, or write the full name in the schedule.";

  // Two employees named Amy and a cell "8-6 Amy": neither Amy gets the shifts.
  const amyWeek = week("8-6 Amy");
  t("the cell parses to two shifts", amyWeek.shifts.length === 2, String(amyWeek.shifts.length));
  const twoDb = fakeDb({ employee: [emp("e1", "Amy"), emp("e2", "Amy")], shift: [] });
  const two = await planScheduleLoad(twoDb, amyWeek, "s1", "u1");
  t("two Amys: no shift is loaded", two.shiftRows.length === 0 && two.heldShifts === 2, `${two.shiftRows.length} rows, ${two.heldShifts} held`);
  t("two Amys: no third Amy is created", inserts(twoDb, "employee").length === 0 && two.newEmployees === 0);
  t("two Amys: the result says Amy matches 2 employees", scheduleLoadMessage(two, 0, 1).includes(AMBIGUOUS), scheduleLoadMessage(two, 0, 1));

  // The same set as before: a deleted Amy and another store's Amy are not candidates.
  const setDb = fakeDb({ employee: [emp("e1", "Amy"), emp("e2", "Amy", { voided_at: "2026-10-01" }), emp("e9", "Amy", { store_id: "s2" })], shift: [] });
  const set = await planScheduleLoad(setDb, week("8-6 Amy"), "s1", "u1");
  t("only this store's live employees count", set.shiftRows.length === 2 && set.shiftRows.every((r) => r.employee_id === "e1") && set.held.length === 0);

  // "Amy" beside only "Amy Robinson": reported, nobody created, nothing attached.
  const robDb = fakeDb({ employee: [emp("e3", "Amy Robinson")], shift: [] });
  const rob = await planScheduleLoad(robDb, week("8-6 Amy"), "s1", "u1");
  t("Amy beside Amy Robinson creates no employee", inserts(robDb, "employee").length === 0 && rob.newEmployees === 0);
  t("Amy beside Amy Robinson attaches no shift", rob.shiftRows.length === 0 && rob.heldShifts === 2);
  t("Amy beside Amy Robinson is reported", scheduleLoadMessage(rob, 0, 1).includes(MAYBE), scheduleLoadMessage(rob, 0, 1));

  // A genuinely new name is created once, in this store, and its shifts attach to it.
  const newDb = fakeDb({ employee: [emp("e3", "Amy Robinson")], shift: [] });
  const fresh = await planScheduleLoad(newDb, week("8-6 Campbell"), "s1", "u1");
  const made = inserts(newDb, "employee");
  t("a new name is created once in this store", made.length === 1 && made[0].rows.length === 1 && made[0].rows[0].full_name === "Campbell" && made[0].rows[0].store_id === "s1", JSON.stringify(made.map((m) => m.rows)));
  t("its shifts attach to the new employee", fresh.shiftRows.length === 2 && fresh.shiftRows.every((r) => r.employee_id === "new-1" && r.created_by === "u1"));
  t("times read on the store clock", fresh.shiftRows[0].start_time === "08:00" && fresh.shiftRows[0].end_time === "18:00" && fresh.shiftRows[0].work_date === "2026-06-01");
  t("the message counts what loaded", scheduleLoadMessage(fresh, 2, 1) === "Loaded 1 new employees and 2 shifts across 1 weeks. Skipped 0 shifts already on file.", scheduleLoadMessage(fresh, 2, 1));

  // Re-uploading the same week: shifts already on file are skipped, even past 1000 shifts.
  const old = Array.from({ length: 1200 }, (_, i) => ({ id: `sh-${String(i + 1).padStart(4, "0")}`, employee_id: "e5", work_date: `2025-0${1 + (i % 9)}-${String(1 + (i % 28)).padStart(2, "0")}`, start_time: "09:00:00", end_time: "17:00:00" }));
  old[1100] = { ...old[1100], work_date: "2026-06-01", start_time: "08:00:00", end_time: "18:00:00" };
  old[1101] = { ...old[1101], work_date: "2026-06-02", start_time: "08:00:00", end_time: "18:00:00" };
  const reDb = fakeDb({ employee: [emp("e5", "Campbell")], shift: old });
  const again = await planScheduleLoad(reDb, week("8-6 Campbell"), "s1", "u1");
  t("re-upload past 1000 shifts on file: nothing loads twice", again.shiftRows.length === 0 && again.skipped === 2, `${again.shiftRows.length} rows, ${again.skipped} skipped`);
  t("the shift check reads in pages", selects(reDb, "shift").length === 2);

  // A failed employee read stops the import instead of creating everyone again.
  const errDb = fakeDb({ employee: [emp("e1", "Amy")], shift: [] }, { fail: "employee" });
  let stopped = "";
  try { await planScheduleLoad(errDb, week("8-6 Amy"), "s1", "u1"); } catch (e) { stopped = e.message; }
  t("an employee read error stops the import", stopped === "employee: boom" && inserts(errDb, "employee").length === 0, stopped);

  // ---- Name rules, mapScheduleNames directly ----
  const initial = mapScheduleNames([{ id: "e3", full_name: "Amy Robinson" }], ["Amy R."]);
  t("an initial (Amy R.) is held, not created", initial.newNames.length === 0 && initial.held.length === 1);
  const twoMaybes = mapScheduleNames([{ id: "e3", full_name: "Amy Robinson" }, { id: "e4", full_name: "Amy Chen" }], ["Amy"]);
  t("Amy beside two Amy surnames names both", twoMaybes.newNames.length === 0 && /Amy Chen or Amy Robinson/.test(twoMaybes.held[0]?.message || ""), JSON.stringify(twoMaybes.held));
  const spaced = mapScheduleNames([{ id: "e1", full_name: "amy" }, { id: "e2", full_name: " Amy " }], ["Amy"]);
  t("two Amys spelled differently in Staff still count as 2", !spaced.ids.has("Amy") && spaced.held.length === 1);
  const exact = mapScheduleNames([{ id: "e3", full_name: "Amy Robinson" }, { id: "e5", full_name: "Campbell" }], ["amy robinson", "Campbell"]);
  t("an exact match ignores case", exact.ids.get("amy robinson") === "e3" && exact.ids.get("Campbell") === "e5" && exact.held.length === 0);
  const exactWins = mapScheduleNames([{ id: "e1", full_name: "Amy" }, { id: "e3", full_name: "Amy Robinson" }], ["Amy"]);
  t("one exact Amy wins over a longer name", exactWins.ids.get("Amy") === "e1" && exactWins.held.length === 0);
  const jo = mapScheduleNames([{ id: "e6", full_name: "John Smith" }], ["Jo"]);
  t("Jo beside John Smith is a new person", jo.newNames.length === 1 && jo.held.length === 0);
  const twice = mapScheduleNames([], ["Amy", "amy"]);
  t("one new person per name, not per capitalization", twice.newNames.length === 1, twice.newNames.join(","));
  const afterInsert = mapScheduleNames([{ id: "n1", full_name: "Amy" }], ["Amy", "amy"]);
  t("both capitalizations attach to the one created", afterInsert.ids.get("Amy") === "n1" && afterInsert.ids.get("amy") === "n1");

  // ---- Export, through readTable: the call the export route makes per table ----

  const ids = Array.from({ length: 1500 }, (_, i) => `id-${String(i + 1).padStart(4, "0")}`);
  const counts = (rows) => { const m = new Map(); for (const r of rows) m.set(r.id, (m.get(r.id) || 0) + 1); return m; };
  const eachOnce = (rows, want) => { const m = counts(rows); return want.every((id) => m.get(id) === 1); };
  const repeats = (rows) => [...counts(rows)].filter(([, n]) => n > 1).map(([id]) => id);

  // Somebody adds a row that sorts before the cursor while the export is between pages.
  const insDb = fakeDb({ shift: ids.map((id) => ({ id })) }, { beforeRequest: { 1: (tb) => tb.shift.push({ id: "id-0500x" }) } });
  const ins = await caught(() => readTable(insDb, "shift", (q) => q));
  t("insert between pages: every pre-existing id exactly once", eachOnce(ins.rows, ids), ins.why || `repeats ${repeats(ins.rows).join(",") || "none"}`);

  // Somebody hard-deletes a shift that was already exported, between pages.
  const delDb = fakeDb({ shift: ids.map((id) => ({ id })) }, { beforeRequest: { 1: (tb) => tb.shift.splice(tb.shift.findIndex((r) => r.id === "id-0010"), 1) } });
  const del = await caught(() => readTable(delDb, "shift", (q) => q));
  t("delete between pages: no other row dropped", eachOnce(del.rows, ids), del.why || `${del.rows.length} rows`);

  // Every page keeps the route's filter, so page two never reaches another store.
  const mixDb = fakeDb({ vendor: [...ids.map((id) => ({ id, store_id: "s1" })), ...ids.map((id) => ({ id: id + "b", store_id: "s2" }))] });
  const s1 = await caught(() => readTable(mixDb, "vendor", (q) => q.eq("store_id", "s1")));
  t("every page keeps the store filter", s1.rows.length === 1500 && s1.rows.every((r) => r.store_id === "s1"), s1.why || `${s1.rows.length} rows`);
  t("pages are ordered on id, ascending, 1000 at a time",
    EXPORT_PAGE_SIZE === 1000 && selects(mixDb, "vendor").length === 2 && selects(mixDb, "vendor").every(({ q }) => q.order && q.order.c === "id" && q.order.dir === 1 && q.limit === 1000));

  // A database error fails the export with the table named, instead of a short workbook.
  let threw = "";
  try { await readTable(fakeDb({ tax_rules: [] }, { fail: "tax_rules" }), "tax_rules", (q) => q); } catch (e) { threw = e.message; }
  t("a database error throws with the table named", threw === "tax_rules: boom", threw);

  for (const code of ["42P01", "PGRST205", "57014", undefined]) {
    const db = fakeDb({ department_field: [] }, { fail: "department_field", error: { message: "read failed", code } });
    let error;
    try { await readTable(db, "department_field", (q) => q.eq("store_id", "s1")); } catch (e) { error = e; }
    t(`department field read failure preserves ${code || "an absent code"}`,
      error instanceof Error && error.message === "department_field: read failed" && error.code === code);
  }

  // ---- Paging edges, fetchAllByKey directly ----
  const fullDb = fakeDb({ t: ids.slice(0, 1000).map((id) => ({ id })) });
  t("exactly one full page asks once more and stops", (await fetchAllByKey(() => fullDb.from("t").select("*"), "id")).length === 1000 && selects(fullDb, "t").length === 2);
  const shortDb = fakeDb({ t: ids.slice(0, 999).map((id) => ({ id })) });
  t("a short first page stops at once", (await fetchAllByKey(() => shortDb.from("t").select("*"), "id")).length === 999 && selects(shortDb, "t").length === 1);
  const noneDb = fakeDb({ t: [] });
  t("an empty table returns nothing", (await fetchAllByKey(() => noneDb.from("t").select("*"), "id")).length === 0 && selects(noneDb, "t").length === 1);
  // Rows without the key cannot be paged; that fails loudly instead of looping forever.
  let noKey = "";
  const keylessDb = fakeDb({ t: ids.map((id) => ({ ref: id })) });
  try { await fetchAllByKey(() => keylessDb.from("t").select("*"), "id"); } catch (e) { noKey = e.message; }
  t("rows missing the key throw instead of looping", /id/.test(noKey), noKey);

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

main().catch((e) => { console.error(e); process.exit(1); });
