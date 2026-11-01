export type Department = {
  id: string;
  name: string;
  accent_color: string | null;
  parent_department_id: string | null;
};

export type AppUser = {
  id: string;
  full_name: string;
  role: "staff" | "lead" | "manager" | "owner";
};

export type LineItem = {
  description: string;
  qty: number | null;
  unit_cost: number | null;
  retail_price_note: number | null;
  confidence: number | null;
};

export type Draft = {
  vendor: string;
  invoice_date: string;
  notes: string;
  line_items: LineItem[];
};

export type FeedRow = {
  id: string;
  vendor_name: string | null;
  received_date: string | null;
  status: string;
  source_file_path: string | null;
  created_at: string;
  department: { name: string; accent_color: string | null } | null;
  app_user: { full_name: string } | null;
  receiving_line?: { qty: number | null; unit_cost: number | null }[];
};

export type Vendor = {
  id: string;
  store_id?: string | null;
  department_id: string | null;
  name: string;
  rep_name: string | null;
  phone: string | null;
  email: string | null;
  products_we_carry: string | null;
  default_terms: string | null;
  status: string;
  notes: string | null;
  // The ordering profile: what the buyer needs in front of them before placing an order.
  // All optional, because 130 vendors were on file before these existed. See
  // src/lib/vendorOrdering.ts for the rules and supabase/vendor_ordering_fields.sql.
  minimum_order_amount?: number | null; // what this vendor will not go below
  no_minimum_order?: boolean | null; // mutually exclusive with the amount
  summer_order_timeline?: string | null; // when to order, in the buyer's own words
  order_location?: string[] | null; // gift show, email, rep visit; more than one applies
  order_location_other?: string | null; // the free text behind "Other"
  reorder_status?: string | null; // reordered | no_reorder
  reorder_comments?: string | null; // required when reordered: date, quantity, why
  // Property Maintenance only. The trade this contractor does, from the owner's
  // MaintenancePayments tab ("SpecilizedOn"). Same vocabulary as invoice.service_category,
  // so the person and the payment describe the trade the same way.
  specializes_in?: string | null;
  department?: { name: string; accent_color: string | null } | null;
};

export type PurchaseOrder = {
  id: string;
  vendor_id: string | null;
  department_id: string | null;
  season_year: number | null;
  order_amount: number | null;
  ship_date: string | null;
  delivery_commit: string | null;
  status: string;
  order_filing?: string | null; // where the order confirmation is filed: digital | physical | both
  digital_file_location?: string | null; // the link or path, when any of it is digital
  notes: string | null;
};

export type Invoice = {
  id: string;
  vendor_id: string | null;
  invoice_number: string | null;
  invoice_date?: string | null; // drives the HST-by-department financial-year report
  amount: number | null;
  hst_amount: number | null;
  freight_charges?: number | null; // total owed = amount + freight + HST, unless tax_mode is "included"
  tax_mode?: string | null; // separate | included | none | invoice; see invoiceTotal()
  delivery_status?: string | null; // delivered | partially_delivered | not_delivered
  delivered_date?: string | null; // the day the goods actually arrived
  delivery_comments?: string | null; // short-shipped or damaged, in the receiver's words
  invoice_filing?: string | null; // where the final invoice is filed: physical | digital | both
  digital_file_location?: string | null; // the link or path, when any of it is digital
  estimate_number?: string | null; // Property Maintenance: preplanned work has an estimate #
  work_type?: string | null; // Property Maintenance: repair | upgrade
  service_category?: string | null; // Property Maintenance: Electrical, Plumbing, ... or free text
  work_description?: string | null; // Property Maintenance: short description of the work
  po_number?: string | null; // Hardware invoices carry the purchase order number
  terms: string | null;
  due_date: string | null;
  status: string;
  vendor?: { name: string } | null;
};

export type Payment = {
  id: string;
  invoice_id: string | null; // legacy single-invoice link; allocations are the real links
  vendor_id?: string | null;
  amount: number | null;
  method: string | null;
  paid_date: string | null; // a future date means post-dated, not settled yet
  reference?: string | null;
  notes?: string | null;
  confirmation_filing?: string | null; // physical | digital | both
  digital_file_location?: string | null; // the link or path, when any of it is digital
  created_at?: string;
  vendor?: { name: string } | null;
  payment_allocation?: {
    invoice_id: string;
    amount: number | null;
    invoice?: { invoice_number: string | null } | null;
  }[];
};

export type PaymentAllocation = {
  id: string;
  payment_id: string;
  invoice_id: string;
  amount: number | null;
};

export type Item = {
  id: string;
  department_id: string | null;
  name: string;
  uom: string | null;
  retail_price: number | null;
  sku: string | null;
  department?: { name: string; accent_color: string | null } | null;
};

export type TaxRule = {
  region: string;
  rate: number;
  label: string | null;
};

export type KnowledgeNote = {
  id: string;
  department_id: string | null;
  topic: string | null;
  body: string | null;
  tags: string[] | null;
  created_at: string;
  department?: { name: string; accent_color: string | null } | null;
  app_user?: { full_name: string } | null;
};

export type MaintenanceAsset = {
  id: string;
  store_id: string | null;
  department_id: string | null;
  name: string;
  category: string | null;
  location: string | null;
  notes: string | null;
  department?: { name: string; accent_color: string | null } | null;
};

export type MaintenanceTask = {
  id: string;
  store_id: string | null;
  asset_id: string | null;
  title: string;
  detail: string | null;
  due_date: string | null;
  recurrence: string;
  status: "open" | "in_progress" | "done";
  assigned_to: string | null;
  completed_at: string | null;
  asset?: { name: string } | null;
  assignee?: { full_name: string } | null;
};

export type InsurancePolicy = {
  id: string;
  store_id: string | null;
  name: string;
  provider: string | null;
  policy_number: string | null;
  coverage: string | null;
  premium: number | null;
  renewal_date: string | null;
  notes: string | null;
};

export type Licence = {
  id: string;
  store_id: string | null;
  name: string;
  authority: string | null;
  number: string | null;
  holder: string | null;
  expiry_date: string | null;
};

export type Employee = {
  id: string;
  store_id: string | null;
  department_id: string | null;
  full_name: string;
  role: string | null;
  phone: string | null;
  email: string | null;
  hire_date: string | null;
  status: "active" | "inactive";
  notes: string | null;
  department?: { name: string; accent_color: string | null } | null;
};

export type PayRate = {
  id: string;
  employee_id: string | null;
  rate: number | null;
  unit: "hour" | "salary" | null;
  effective_date: string | null;
};

export type Shift = {
  id: string;
  employee_id: string | null;
  work_date: string | null;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
  employee?: { full_name: string } | null;
};

export type CreditNote = {
  id: string;
  store_id: string | null;
  vendor_id: string;
  invoice_id: string | null;
  invoice_number: string | null;
  credit_amount: number;
  reason: string;
  comments: string | null;
  credit_type?: "bank_account" | "vendor_account" | null;
  status: "pending" | "applied" | "disputed";
  created_by: string | null;
  created_at: string;
  voided_at?: string | null;
  invoice?: {
    invoice_number: string | null;
    amount: number | null;
    hst_amount: number | null;
    freight_charges?: number | null;
    tax_mode?: string | null;
  } | null;
};

// The owner suggestion box: a note with optional screenshot and voice recording.
export type Feedback = {
  id: string;
  store_id: string | null;
  author_id: string | null;
  kind: "idea" | "problem" | "question" | "praise";
  page: string | null;
  body: string | null;
  screenshot_path: string | null;
  audio_path: string | null;
  status: "new" | "planned" | "done" | "declined";
  created_at: string;
  voided_at?: string | null;
  author?: { full_name: string | null } | null;
};

// What the AI read off a suggestion's screenshot. Its own table: with login enforced it opens
// only to the people who may open that screenshot (supabase/auth_setup.sql 3g).
export type FeedbackSummary = {
  feedback_id: string;
  summary: string;
};
