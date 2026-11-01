// Navigation model for the app shell. Two faces of one app:
// - Managers and owners get grouped sidebar sections (desktop) and four tabs plus More (phone).
// - Staff and leads get one short list: the few things they do, nothing else.
// The shell (src/components/AppShell.tsx) is the only consumer.

export type NavIcon =
  | "home" | "feed" | "charts" | "capture" | "overdue" | "payments" | "vendors" | "reports" | "reorder"
  | "inventory" | "signs" | "knowledge" | "ask" | "people" | "schedule" | "wrench" | "shield"
  | "import" | "team" | "fields" | "more";

export type NavItem = { href: string; label: string; icon: NavIcon };
export type NavGroup = { label: string | null; items: NavItem[]; adminOnly?: boolean };

// The manager and owner sidebar. Group labels are plain words the owner would use,
// not software words. Admin is gated on the actual role in the shell.
export const NAV_GROUPS: NavGroup[] = [
  {
    label: null,
    items: [
      { href: "/", label: "Today", icon: "home" },
      { href: "/feed", label: "Feed", icon: "feed" },
      { href: "/dashboard", label: "Charts", icon: "charts" }
    ]
  },
  {
    label: "Money",
    items: [
      { href: "/overdue", label: "Due and overdue", icon: "overdue" },
      { href: "/payments", label: "Vendor payouts", icon: "payments" },
      { href: "/vendors", label: "Vendors", icon: "vendors" },
      { href: "/reports", label: "Reports", icon: "reports" },
      { href: "/reorder", label: "Reorder", icon: "reorder" }
    ]
  },
  {
    label: "Store",
    items: [
      { href: "/inventory", label: "Inventory", icon: "inventory" },
      { href: "/price-signs", label: "Price signs", icon: "signs" },
      { href: "/knowledge", label: "Knowledge", icon: "knowledge" },
      { href: "/ask", label: "Ask the store", icon: "ask" },
      { href: "/suggestions", label: "Suggestions", icon: "feed" }
    ]
  },
  {
    label: "People",
    items: [
      { href: "/hr", label: "Employees", icon: "people" },
      { href: "/hr/schedule", label: "Schedule", icon: "schedule" }
    ]
  },
  {
    label: "Property",
    items: [
      { href: "/maintenance", label: "Maintenance", icon: "wrench" },
      { href: "/compliance", label: "Compliance", icon: "shield" }
    ]
  },
  {
    label: "Admin",
    adminOnly: true,
    items: [
      { href: "/import", label: "Import data", icon: "import" },
      { href: "/team", label: "Team", icon: "team" },
      { href: "/department-fields", label: "Department fields", icon: "fields" }
    ]
  }
];

// The staff list: capture-first, then the things a seasonal hire actually opens.
export const STAFF_ITEMS: NavItem[] = [
  { href: "/", label: "Today", icon: "home" },
  { href: "/capture", label: "Capture", icon: "capture" },
  { href: "/hr/schedule", label: "Schedule", icon: "schedule" },
  { href: "/ask", label: "Ask", icon: "ask" },
  { href: "/knowledge", label: "Knowledge", icon: "knowledge" }
];

// Phone tab bars: four destinations plus More. Capture sits in the middle of both.
export const STAFF_TABS: NavItem[] = STAFF_ITEMS.slice(0, 4);
export const MANAGER_TABS: NavItem[] = [
  { href: "/", label: "Today", icon: "home" },
  { href: "/capture", label: "Capture", icon: "capture" },
  { href: "/overdue", label: "Due", icon: "overdue" },
  { href: "/feed", label: "Feed", icon: "feed" }
];

// The single active link: the longest href that matches the path, so /hr/schedule
// lights Schedule and not Employees, and / lights only on the home page.
export function activeHref(paths: string[], pathname: string): string | null {
  let best: string | null = null;
  for (const href of paths) {
    const hit = href === "/" ? pathname === "/" : pathname === href || pathname.startsWith(href + "/");
    if (hit && (best === null || href.length > best.length)) best = href;
  }
  return best;
}
