"use client";

// The app shell: one app, two faces.
// Desktop gets a grouped sidebar (managers and owners) or a short list (staff and leads),
// with a slim topbar for view-as, notifications, and account. Phones get a bottom tab bar
// with Capture in reach of a thumb and a More sheet for everything else.
// All chrome lives here; screens render inside .app-main and never draw their own nav.

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
  NAV_GROUPS, STAFF_ITEMS, STAFF_TABS, MANAGER_TABS, activeHref,
  type NavItem, type NavIcon
} from "@/lib/nav";
import { useActiveStore } from "@/lib/store";
import { REQUIRE_AUTH, useMember, canManageStore, signOut, type Role } from "@/lib/auth";
import { useViewRole, isManagerView, ROLE_RANK } from "@/lib/view";
import NotificationBell from "@/components/NotificationBell";

const ROLE_LABEL: Record<Role, string> = { staff: "Staff", lead: "Lead", manager: "Manager", owner: "Owner" };

// Quiet line icons, one hue, drawn inline so the shell ships no icon dependency.
export function Icon({ name, size = 18 }: { name: NavIcon; size?: number }) {
  const p = { width: size, height: size, viewBox: "0 0 24 24", fill: "none", stroke: "currentColor", strokeWidth: 1.8, strokeLinecap: "round" as const, strokeLinejoin: "round" as const, "aria-hidden": true };
  switch (name) {
    case "home": return <svg {...p}><path d="M3 10.5L12 4l9 6.5" /><path d="M5.5 9.5V20h13V9.5" /></svg>;
    case "feed": return <svg {...p}><path d="M9 6h12M9 12h12M9 18h12" /><path d="M4 6h.01M4 12h.01M4 18h.01" strokeWidth={2.6} /></svg>;
    case "charts": return <svg {...p}><path d="M5 20v-7M12 20V5M19 20v-10" /><path d="M3 20h18" /></svg>;
    case "capture": return <svg {...p}><rect x="3" y="7" width="18" height="13" rx="2.5" /><circle cx="12" cy="13.5" r="3.6" /><path d="M9 7l1.4-2.5h3.2L15 7" /></svg>;
    case "overdue": return <svg {...p}><circle cx="12" cy="12" r="8.5" /><path d="M12 7.5V12l3 2.5" /></svg>;
    case "payments": return <svg {...p}><rect x="2.8" y="6.5" width="18.4" height="11" rx="2" /><circle cx="12" cy="12" r="2.7" /><path d="M6.2 9.7h.01M17.8 14.3h.01" strokeWidth={2.6} /></svg>;
    case "vendors": return <svg {...p}><path d="M3 7h11v10H3z" /><path d="M14 10.5h3.6L21 14v3h-7" /><circle cx="7" cy="19" r="1.7" /><circle cx="17" cy="19" r="1.7" /></svg>;
    case "reports": return <svg {...p}><rect x="5" y="3" width="14" height="18" rx="2" /><path d="M9 8h6M9 12h6M9 16h4" /></svg>;
    case "reorder": return <svg {...p}><path d="M4.5 10a8 8 0 0 1 13.6-3.4L20 8.5" /><path d="M20 3.5v5h-5" /><path d="M19.5 14a8 8 0 0 1-13.6 3.4L4 15.5" /><path d="M4 20.5v-5h5" /></svg>;
    case "inventory": return <svg {...p}><path d="M21 8l-9-4.2L3 8l9 4.2L21 8z" /><path d="M3 8v8.2l9 4.2 9-4.2V8" /><path d="M12 12.2v8.2" /></svg>;
    case "signs": return <svg {...p}><path d="M20.5 13.2L13 20.7 3.3 11V3.3H11l9.5 9.9z" /><circle cx="7.4" cy="7.4" r="1.3" /></svg>;
    case "knowledge": return <svg {...p}><path d="M4 5a2 2 0 0 1 2-2h14v18H6a2 2 0 0 0-2 2V5z" /><path d="M20 17H6a2 2 0 0 0-2 2" /></svg>;
    case "ask": return <svg {...p}><path d="M21 11.5a7.5 7.5 0 0 1-7.5 7.5H4l2.2-3.1A7.5 7.5 0 1 1 21 11.5z" /><path d="M8.5 11.5h7" /></svg>;
    case "people": return <svg {...p}><circle cx="9" cy="8" r="3.4" /><path d="M3 20a6 6 0 0 1 12 0" /><path d="M16 4.8a3.4 3.4 0 0 1 0 6.4" /><path d="M21 20a6 6 0 0 0-4.5-5.8" /></svg>;
    case "schedule": return <svg {...p}><rect x="3.5" y="5" width="17" height="16" rx="2" /><path d="M3.5 10h17" /><path d="M8 3v4M16 3v4" /></svg>;
    case "wrench": return <svg {...p}><path d="M20.3 6.3a5 5 0 0 1-6.6 6.6L7 19.6a2.1 2.1 0 0 1-3-3l6.7-6.7a5 5 0 0 1 6.6-6.6L14 6.6l3.4 3.4 2.9-3.7z" /></svg>;
    case "shield": return <svg {...p}><path d="M12 3l8 3v6c0 4.6-3.2 7.7-8 9-4.8-1.3-8-4.4-8-9V6z" /><path d="M9 12l2 2 4-4.5" /></svg>;
    case "import": return <svg {...p}><path d="M12 15V4" /><path d="M7.5 8.5L12 4l4.5 4.5" /><path d="M4 20h16" /></svg>;
    case "team": return <svg {...p}><circle cx="10" cy="8" r="3.4" /><path d="M4 20a6 6 0 0 1 12 0" /><path d="M19 8v6M16 11h6" /></svg>;
    case "fields": return <svg {...p}><rect x="4" y="4" width="5" height="5" rx="1" /><path d="M5.6 6.6l1 1 1.6-1.8" /><rect x="4" y="15" width="5" height="5" rx="1" /><path d="M12 6.5h8M12 17.5h8" /></svg>;
    case "more": return <svg {...p}><path d="M5 12h.01M12 12h.01M19 12h.01" strokeWidth={3.2} /></svg>;
  }
}

function SideLink({ item, active }: { item: NavItem; active: boolean }) {
  return (
    <Link href={item.href} className={active ? "side-link active" : "side-link"}>
      <Icon name={item.icon} />
      <span>{item.label}</span>
    </Link>
  );
}

function ViewAsPills({ options, viewRole, actualRole, setViewRole }: {
  options: Role[]; viewRole: Role | null; actualRole: Role | null; setViewRole: (r: Role | null) => void;
}) {
  if (!options.length) return null;
  return (
    <div role="tablist" aria-label="View as" className="pill-group">
      {options.map((r) => {
        const on = r === viewRole;
        return (
          <button key={r} role="tab" aria-selected={on} className={on ? "pill active" : "pill"}
            onClick={() => setViewRole(r === actualRole ? null : r)}>
            {ROLE_LABEL[r]}
          </button>
        );
      })}
    </div>
  );
}

export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() || "/";
  const router = useRouter();
  const { stores, storeId, setStore } = useActiveStore();
  const { member } = useMember();
  const { actualRole, viewRole, canPreview, setViewRole } = useViewRole();
  const [moreOpen, setMoreOpen] = useState(false);

  // Navigating closes the More sheet so it never lingers over the new screen.
  useEffect(() => { setMoreOpen(false); }, [pathname]);

  const managerView = isManagerView(viewRole);
  const previewing = canPreview && actualRole !== null && viewRole !== null && viewRole !== actualRole;
  const canAdmin = !REQUIRE_AUTH || canManageStore(actualRole);

  const groups = managerView
    ? NAV_GROUPS.filter((g) => !g.adminOnly || canAdmin)
    : [{ label: null as string | null, items: STAFF_ITEMS }];
  const sideActive = activeHref(groups.flatMap((g) => g.items.map((i) => i.href)), pathname);

  const tabs = managerView ? MANAGER_TABS : STAFF_TABS;
  const tabActive = activeHref(tabs.map((t) => t.href), pathname);

  const viewOptions: Role[] = actualRole
    ? (["owner", "manager", "lead", "staff"] as Role[]).filter((r) => ROLE_RANK[r] <= ROLE_RANK[actualRole])
    : [];

  async function handleSignOut() {
    await signOut();
    router.replace("/login");
  }

  // The login screen owns its full page; no chrome there.
  if (pathname === "/login") return <>{children}</>;

  const storeName = stores.find((s) => s.id === storeId)?.name || "Robinsons General Store";

  const brand = (
    <Link href="/" className="brand">
      <span className="brand-mark" aria-hidden>R</span>
      <span className="brand-name">Robinsons<br />General Store</span>
    </Link>
  );

  const storePicker = stores.length > 1 && (
    <label className="side-store">
      <span className="side-group-label" style={{ padding: 0 }}>Store</span>
      <select className="input" aria-label="Active store" value={storeId || ""} onChange={(e) => setStore(e.target.value)}>
        {stores.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
      </select>
    </label>
  );

  const account = REQUIRE_AUTH && (
    <div className="side-account">
      {member && <span className="help">{member.full_name} ({member.role})</span>}
      <button className="btn-ghost" style={{ padding: "6px 10px", fontSize: 12.5 }} onClick={handleSignOut}>Sign out</button>
    </div>
  );

  return (
    <div className="app">
      <aside className="app-sidebar no-print">
        {brand}
        <Link href="/capture" className="btn-primary side-capture">
          <Icon name="capture" /> Capture
        </Link>
        <nav className="side-nav" aria-label="Main">
          {groups.map((g, i) => (
            <div className="side-group" key={g.label || i}>
              {g.label && <div className="side-group-label">{g.label}</div>}
              {g.items.map((item) => <SideLink key={item.href} item={item} active={item.href === sideActive} />)}
            </div>
          ))}
        </nav>
        <div className="side-foot">
          {storePicker}
          {account}
        </div>
      </aside>

      <div className="app-body">
        <header className="app-topbar no-print">
          <div className="topbar-brand">{brand}</div>
          <div className="topbar-store help" title={storeName}>{storeName}</div>
          <div className="topbar-right">
            {canPreview && (
              <div className="topbar-viewas">
                <span className="help">View as</span>
                <ViewAsPills options={viewOptions} viewRole={viewRole} actualRole={actualRole} setViewRole={setViewRole} />
              </div>
            )}
            <NotificationBell />
            <Link href="/capture" className="btn-primary topbar-capture" aria-label="Capture">
              <Icon name="capture" /><span className="topbar-capture-text">Capture</span>
            </Link>
          </div>
        </header>

        {previewing && viewRole && (
          <div className="preview-bar no-print">
            Previewing as {ROLE_LABEL[viewRole].toLowerCase()}. Use View as to switch back.
          </div>
        )}

        <main className="app-main">{children}</main>
      </div>

      <nav className="app-tabbar no-print" aria-label="Quick navigation">
        {tabs.map((t) => {
          const on = t.href === tabActive && !moreOpen;
          return (
            <Link key={t.href} href={t.href} className={on ? "tab-item active" : "tab-item"}>
              <Icon name={t.icon} size={21} />
              <span>{t.label}</span>
            </Link>
          );
        })}
        <button className={moreOpen ? "tab-item active" : "tab-item"} onClick={() => setMoreOpen(true)} aria-label="More">
          <Icon name="more" size={21} />
          <span>More</span>
        </button>
      </nav>

      {moreOpen && (
        <div className="sheet no-print" onClick={() => setMoreOpen(false)}>
          <div className="sheet-panel" role="dialog" aria-label="Menu" onClick={(e) => e.stopPropagation()}>
            <div className="sheet-head">
              <strong>Menu</strong>
              <button className="btn-ghost" style={{ padding: "6px 12px" }} onClick={() => setMoreOpen(false)}>Close</button>
            </div>
            {canPreview && (
              <div className="sheet-section">
                <div className="side-group-label">View as</div>
                <ViewAsPills options={viewOptions} viewRole={viewRole} actualRole={actualRole} setViewRole={setViewRole} />
              </div>
            )}
            {groups.map((g, i) => (
              <div className="sheet-section" key={g.label || i}>
                {g.label && <div className="side-group-label">{g.label}</div>}
                <div className="sheet-links">
                  {g.items.map((item) => <SideLink key={item.href} item={item} active={item.href === sideActive} />)}
                </div>
              </div>
            ))}
            <div className="sheet-section">
              {storePicker}
              {account}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
