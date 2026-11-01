"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { supabase } from "@/lib/supabaseClient";
import { chipClass, labelize } from "@/lib/status";
import { formatCAD, daysOverdue, round2, todayISO, hstOn } from "@/lib/format";
import { REQUIRE_AUTH, canSeeMoney, useEffectiveActor } from "@/lib/auth";
import { canEdit, voidRow } from "@/lib/edit";
import {
  PAYMENT_METHODS, CONFIRMATION_FILING, DELIVERY_STATUS, WORK_TYPES, SERVICE_CATEGORIES, CREDIT_TYPES,
  TAX_MODES, ORDER_FILING, orderStatusOptions, needsDigitalLocation, taxWorking,
  methodLabel, referenceLabel, referenceHelp, invoiceTotal as invTotal, hstInside, isFutureDate,
  recordPaymentRpc, voidPaymentRpc, editPaymentRpc, fetchSettlements,
  remainingOwed, remainingToAllocate, type InvoiceSettlement
} from "@/lib/payments";
import { FieldError, fieldInputClass, type FieldErrors } from "@/components/FieldError";
import { VendorOrderingFields, EMPTY_ORDERING_PROFILE, type OrderingProfile } from "@/components/VendorOrderingFields";
// orderLocationLabel and REORDER_STATUS are gone from here: the registry formats those two
// now. minimumOrderLabel stays because the Add order form still quotes the minimum beside
// the amount box, which is a different job from listing the vendor's facts.
import {
  OTHER_LOCATION, minimumOrderLabel,
  validateMinimumOrder, validateReorder
} from "@/lib/vendorOrdering";
import { asksFor, hiddenFieldCount, labelForKey, vendorSelect, visibleFacts } from "@/lib/vendorFields";
import { asksInvoice } from "@/lib/invoiceFields";
import { fieldDepartment } from "@/lib/departments";
import { choicesFor, type FieldChoice } from "@/lib/fieldChoices";
import { loadFieldChoices } from "@/lib/loadFieldChoices";
import type { Vendor, PurchaseOrder, Invoice, Payment, AppUser, CreditNote, Department } from "@/lib/types";

const ACTOR_KEY = "rgs_actor";
const num = (s: string) => (s.trim() === "" ? null : Number(s));
// HST auto-fills from the pre-tax amount (Ontario 13%), matching the capture screen. Blank
// amount leaves HST blank; the field stays editable so a tax-exempt line can be overridden.
const hstFieldFor = (amount: string) => {
  const n = num(amount);
  return n == null || !isFinite(n) ? "" : String(hstOn(n));
};
// The HST for a given tax mode: added on top of the amount, or already inside it. Getting
// this wrong overstates the input tax credit on the HST report, so the field recomputes
// whenever the mode or the amount changes rather than keeping a stale figure.
const hstFieldForMode = (mode: string, amount: string) => {
  const n = num(amount);
  if (n == null || !isFinite(n)) return "";
  if (mode === "included") return String(hstInside(n));
  if (mode === "separate") return String(hstOn(n));
  return "";
};

export default function VendorDetail() {
  const params = useParams();
  const id = String(params?.id || "");
  const [vendor, setVendor] = useState<Vendor | null>(null);
  // The store's departments, so a vendor filed under a section takes its department's
  // questions, and the Department fields screen's ticks for that store.
  const [departments, setDepartments] = useState<Department[]>([]);
  const [fieldRows, setFieldRows] = useState<FieldChoice[]>([]);
  const [orders, setOrders] = useState<PurchaseOrder[]>([]);
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [payments, setPayments] = useState<Payment[]>([]);
  const [users, setUsers] = useState<AppUser[]>([]);
  const [actorId, setActorId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  // Validation messages, keyed by form and field, so each lands under the box it is about
  // instead of in one card at the top of a page with twenty boxes on it.
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const clearField = (name: string) =>
    setFieldErrors((prev) => (prev[name] ? Object.fromEntries(Object.entries(prev).filter(([k]) => k !== name)) : prev));

  const [editVendor, setEditVendor] = useState(false);
  // The escape hatch, same as the add form: one press puts every question back when the
  // department map is wrong for this particular vendor.
  const [showAllFields, setShowAllFields] = useState(false);
  const [vForm, setVForm] = useState({ rep_name: "", phone: "", email: "", products_we_carry: "", default_terms: "", status: "active", notes: "", specializes_in: "", ...EMPTY_ORDERING_PROFILE });
  const [showPO, setShowPO] = useState(false);
  // The order fields the owner asked for, in his order: status, amount, where the
  // confirmation is filed, ship date, comments. The season year is not asked for; it
  // follows the ship date so the seasonal reports still line up.
  const [poForm, setPoForm] = useState({ status: "in_progress", order_amount: "", order_filing: "", digital_file_location: "", ship_date: "", notes: "" });
  const [showInv, setShowInv] = useState(false);
  // The workflow-sheet fields. status "paid" at entry also records the payment
  // (Ravi: an invoice arrives paid or unpaid). Property Maintenance vendors get the
  // estimate / work fields; merchandise vendors get delivery and freight.
  const emptyInvForm = {
    invoice_number: "", invoice_date: todayISO(), amount: "", hst_amount: "", freight_charges: "",
    // tax_mode: separate = the HST figure typed here is added on top; included = the HST is
    // already inside the amount (recorded for the tax report, never added again); none = a
    // no-tax vendor (stores 0); invoice = "refer to the actual invoice" (stores blank).
    tax_mode: "separate", po_number: "",
    delivery_status: "", delivered_date: "", delivery_comments: "",
    invoice_filing: "", digital_file_location: "",
    terms: "", due_date: "", status: "unpaid",
    estimate_number: "", work_type: "", service_category: "", service_category_other: "", work_description: "",
    pay_method: "cheque", pay_date: todayISO(), pay_reference: "", pay_filing: ""
  };
  const [invForm, setInvForm] = useState({ ...emptyInvForm });
  const [payFor, setPayFor] = useState<string | null>(null);
  const [payForm, setPayForm] = useState({ amount: "", method: "cheque", paid_date: todayISO(), reference: "", notes: "", filing: "", digital_file_location: "" });
  const [settlements, setSettlements] = useState<Map<string, InvoiceSettlement>>(new Map());
  // Editing a recorded payment (Ravi typed a wrong date once and was stuck): date, method,
  // reference, notes, and filing are correctable; the amount means void and re-record.
  const [editPayId, setEditPayId] = useState<string | null>(null);
  const [editPayForm, setEditPayForm] = useState({ method: "cheque", paid_date: "", reference: "", notes: "", filing: "", digital_file_location: "" });

  const [editInvId, setEditInvId] = useState<string | null>(null);
  const [editInvForm, setEditInvForm] = useState({
    invoice_number: "", invoice_date: "", amount: "", hst_amount: "", freight_charges: "",
    tax_mode: "separate", po_number: "",
    delivery_status: "", delivered_date: "", delivery_comments: "",
    invoice_filing: "", digital_file_location: "",
    terms: "", due_date: "", status: "unpaid",
    estimate_number: "", work_type: "", service_category: "", service_category_other: "", work_description: ""
  });
  const [editPoId, setEditPoId] = useState<string | null>(null);
  const [editPoForm, setEditPoForm] = useState({ status: "in_progress", order_amount: "", order_filing: "", digital_file_location: "", ship_date: "", notes: "" });

  // Credits
  const [credits, setCredits] = useState<CreditNote[]>([]);
  const [showCredit, setShowCredit] = useState(false);
  const [creditForm, setCreditForm] = useState({ invoice_number: "", credit_amount: "", reason: "", comments: "", invoice_id: "", status: "pending", credit_type: "" });

  // Effective role and actor: in enforced auth the signed-in member, else the dropdown.
  const { effectiveActorId, role } = useEffectiveActor(users, actorId);
  const showMoney = canSeeMoney(role);
  // Which invoice questions this vendor's department gets. One predicate, from the invoice
  // field registry, replacing the three hand-coded booleans (isPropertyDept, isFinanceDept,
  // isHardwareDept) that had already drifted: the edit path was nulling a saved PO number
  // and service category on any invoice whose vendor was not the matching department, while
  // preserving the estimate number beside them. The registry answers once, and the form,
  // the validation and the save paths all read the same answer.
  //
  // The department is the one whose questions apply: a vendor filed under a SECTION (Gifts,
  // say) takes DryGoods & Lakeside's, the same as the add-vendor form has since 2026-08-12.
  // Until 2026-10-25 this page used the section's own name, which matches nothing in
  // departments.ts, so a Gifts vendor was asked DryGoods' questions when it was created and
  // every question when it was edited. fieldDepartment walks to the top; when the department
  // list has not loaded, the joined name is used as before.
  const fieldDept = fieldDepartment(vendor?.department_id, departments);
  const vendorDeptName = fieldDept?.name ?? vendor?.department?.name ?? null;
  const fieldDeptId = fieldDept?.id ?? vendor?.department_id ?? null;
  // The Department fields screen's ticks for that department, one set per form. The
  // rendering, the validation and the save path below all read these same ones.
  const vendorChoices = choicesFor(fieldRows, fieldDeptId, "vendor");
  const invoiceChoices = choicesFor(fieldRows, fieldDeptId, "invoice");
  const asksInv = (key: string) => asksInvoice(vendorDeptName, key, invoiceChoices);

  // Which questions this vendor's department is asked. visibleFacts reads the same
  // department and the same choices, so the display above and the form below cannot
  // disagree about one vendor.
  // What the form DRAWS. Null puts every question back. Validation keeps using the real
  // department name, so revealing a question does not make it mandatory.
  const askDept = showAllFields ? null : vendorDeptName;
  const asks = (key: string) => asksFor(askDept, key, { showMoney, choices: vendorChoices });
  const hiddenCount = hiddenFieldCount(vendorDeptName, { showMoney, choices: vendorChoices });

  // What the tax select stores in hst_amount: "none" is a no-tax vendor (0), "refer to the
  // actual invoice" stores blank so the report shows it as unstated, and both "separate"
  // and "included" keep the typed figure. Included differs only in what is OWED, which
  // invoiceTotal decides from tax_mode, never from the HST figure.
  const hstFromMode = (mode: string, hst: string): number | null =>
    mode === "none" ? 0 : mode === "invoice" ? null : num(hst) ?? 0;
  // The total this form is asking the store to pay, by the same rule as every other screen.
  const formTotal = (f: { amount: string; freight_charges: string; hst_amount: string; tax_mode: string }) =>
    invTotal({
      amount: num(f.amount),
      freight_charges: num(f.freight_charges),
      hst_amount: hstFromMode(f.tax_mode, f.hst_amount),
      tax_mode: f.tax_mode
    });

  async function load() {
    const { data: v, error: ve } = await supabase
      .from("vendor")
      // Derived from the field registry rather than hand-written, so this list cannot drift
      // from what the screens actually draw. Adding a vendor field is one registry entry.
      .select(vendorSelect(["department:department_id(name, accent_color)"]))
      .eq("id", id)
      .is("voided_at", null)
      .maybeSingle();
    if (ve) {
      setError(ve.message);
      return;
    }
    setVendor((v as unknown as Vendor) || null);
    const vendorStore = (v as unknown as Vendor | null)?.store_id ?? null;
    if (vendorStore) {
      const { data: ds } = await supabase.from("department").select("id, name, accent_color, parent_department_id").eq("store_id", vendorStore);
      setDepartments((ds as Department[]) || []);
      setFieldRows((await loadFieldChoices(vendorStore)).rows);
    }
    const { data: po } = await supabase.from("purchase_order").select("id, vendor_id, order_amount, ship_date, delivery_commit, status, order_filing, digital_file_location, season_year, notes, department_id").eq("vendor_id", id).is("voided_at", null).order("ship_date", { ascending: false });
    setOrders((po as unknown as PurchaseOrder[]) || []);
    const { data: inv } = await supabase.from("invoice").select("id, vendor_id, invoice_number, invoice_date, amount, hst_amount, freight_charges, tax_mode, po_number, delivery_status, delivered_date, delivery_comments, invoice_filing, digital_file_location, estimate_number, work_type, service_category, work_description, terms, due_date, status").eq("vendor_id", id).is("voided_at", null).order("due_date", { ascending: true });
    const invList = (inv as unknown as Invoice[]) || [];
    setInvoices(invList);
    try {
      setSettlements(await fetchSettlements(invList.map((i) => i.id)));
    } catch {
      setSettlements(new Map());
    }
    // Payments belong to the vendor now (the migration backfills vendor_id on legacy rows).
    const { data: pay } = await supabase
      .from("payment")
      .select("id, invoice_id, vendor_id, amount, method, paid_date, reference, notes, confirmation_filing, digital_file_location, payment_allocation(invoice_id, amount, invoice:invoice_id(invoice_number))")
      .eq("vendor_id", id)
      .is("voided_at", null)
      .order("paid_date", { ascending: false });
    setPayments((pay as unknown as Payment[]) || []);

    // Load credit notes for this vendor.
    const { data: creds } = await supabase
      .from("credit_note")
      .select("id, store_id, vendor_id, invoice_id, invoice_number, credit_amount, reason, comments, credit_type, status, created_by, created_at, voided_at, invoice:invoice_id(invoice_number, amount, hst_amount, freight_charges, tax_mode)")
      .eq("vendor_id", id)
      .is("voided_at", null)
      .order("created_at", { ascending: false });
    setCredits((creds as unknown as CreditNote[]) || []);
  }

  useEffect(() => {
    if (!id) return;
    (async () => {
      await load();
      const { data: us } = await supabase.from("app_user").select("id, full_name, role").order("full_name");
      const usr = (us as AppUser[]) || [];
      setUsers(usr);
      const saved = typeof window !== "undefined" ? localStorage.getItem(ACTOR_KEY) : null;
      setActorId(saved || usr[0]?.id || "");
      setLoading(false);
    })();
  }, [id]);

  function setActor(uid: string) {
    setActorId(uid);
    if (typeof window !== "undefined") localStorage.setItem(ACTOR_KEY, uid);
  }
  async function log(action: string, entity: string, entity_id: string | null) {
    if (effectiveActorId) await supabase.from("activity_log").insert({ actor_id: effectiveActorId, action, entity, entity_id });
  }

  function startEditVendor() {
    if (!vendor) return;
    setVForm({
      rep_name: vendor.rep_name || "",
      phone: vendor.phone || "",
      email: vendor.email || "",
      products_we_carry: vendor.products_we_carry || "",
      default_terms: vendor.default_terms || "",
      specializes_in: vendor.specializes_in || "",
      status: vendor.status || "active",
      notes: vendor.notes || "",
      minimum_order_amount: vendor.minimum_order_amount != null ? String(vendor.minimum_order_amount) : "",
      no_minimum_order: !!vendor.no_minimum_order,
      summer_order_timeline: vendor.summer_order_timeline || "",
      order_location: vendor.order_location || [],
      order_location_other: vendor.order_location_other || "",
      reorder_status: vendor.reorder_status || "",
      reorder_comments: vendor.reorder_comments || ""
    });
    setFieldErrors({});
    setShowAllFields(false);
    setEditVendor(true);
  }

  async function saveVendor() {
    if (!vendor) return;
    const errs: FieldErrors = {};
    // Same rule as the add form, and for the same reason: the minimum order is the only check
    // that demands an answer where none was given, so it is the only one that has to agree
    // with what this department was asked. It still runs on an answer already given, which is
    // what keeps a value typed through the "add the other questions" button checked.
    //
    // Nothing below writes null over a hidden answer: vForm is seeded from the vendor row in
    // startEditVendor, so a field this department no longer asks round-trips its saved value
    // untouched. That is rule 1 in vendorFields.ts holding on the save path.
    const answeredMinimum = !!vForm.minimum_order_amount.trim() || vForm.no_minimum_order;
    const askMinimum = asksFor(vendorDeptName, "minimum_order", { showMoney, choices: vendorChoices }) || (showMoney && answeredMinimum);
    const minErr = askMinimum ? validateMinimumOrder(vForm.minimum_order_amount, vForm.no_minimum_order) : null;
    if (minErr) errs.minimum_order_amount = minErr;
    const reErr = validateReorder(vForm.reorder_status, vForm.reorder_comments);
    if (reErr) errs.reorder_comments = reErr;
    if (vForm.order_location.includes(OTHER_LOCATION) && !vForm.order_location_other.trim()) {
      errs.order_location_other = "Say where, since Other is ticked.";
    }
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      const r = await supabase.from("vendor").update({
        rep_name: vForm.rep_name || null,
        phone: vForm.phone || null,
        email: vForm.email || null,
        products_we_carry: vForm.products_we_carry || null,
        default_terms: vForm.default_terms || null,
        specializes_in: vForm.specializes_in || null,
        status: vForm.status,
        // Blank is null, never 0: the check constraint refuses a zero minimum.
        minimum_order_amount: vForm.no_minimum_order || !vForm.minimum_order_amount.trim() ? null : Number(vForm.minimum_order_amount),
        no_minimum_order: vForm.no_minimum_order,
        summer_order_timeline: vForm.summer_order_timeline.trim() || null,
        order_location: vForm.order_location.length ? vForm.order_location : null,
        order_location_other: vForm.order_location.includes(OTHER_LOCATION) ? vForm.order_location_other.trim() || null : null,
        reorder_status: vForm.reorder_status || null,
        // Kept whatever the status now says: the owner asked that an earlier reorder note
        // never disappear on its own. The Clear it button is the deliberate way to drop it.
        reorder_comments: vForm.reorder_comments.trim() || null,
        notes: vForm.notes || null
      }).eq("id", vendor.id);
      if (r.error) throw new Error(r.error.message);
      await log("vendor_edited", "vendor", vendor.id);
      setEditVendor(false);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function addPO() {
    if (!vendor) return;
    const errs: FieldErrors = {};
    // The owner's rule: a NEW order's expected ship date cannot be in the past. Editing an
    // old order keeps its historical date, so the check lives only on the add path.
    if (poForm.ship_date && poForm.ship_date < todayISO()) {
      errs["po.ship_date"] = "The expected ship date cannot be before today.";
    }
    // The owner wants these answered on every order, with N/A as the honest answer when
    // there is nothing to say. A blank field and a deliberate "nothing to note" look the
    // same in a report; N/A does not.
    if (!poForm.notes.trim()) {
      errs["po.notes"] = "Order comments are required. Type N/A if there is nothing to note.";
    }
    if (needsDigitalLocation(poForm.order_filing) && !poForm.digital_file_location.trim()) {
      errs["po.digital_file_location"] = "Add the digital file location, so the confirmation can be found again.";
    }
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      const r = await supabase.from("purchase_order").insert({
        store_id: vendor.store_id ?? null,
        vendor_id: vendor.id,
        department_id: vendor.department_id,
        // The season is the year the goods ship, so a January order for the April delivery
        // still counts against that season.
        season_year: Number((poForm.ship_date || todayISO()).slice(0, 4)),
        order_amount: num(poForm.order_amount),
        ship_date: poForm.ship_date || null,
        status: poForm.status,
        order_filing: poForm.order_filing || null,
        digital_file_location: poForm.digital_file_location.trim() || null,
        notes: poForm.notes || null,
        created_by: effectiveActorId
      }).select("id").single();
      if (r.error) throw new Error(r.error.message);
      await log("order_added", "purchase_order", r.data.id as string);
      setShowPO(false);
      setFieldErrors({});
      setPoForm({ status: "in_progress", order_amount: "", order_filing: "", digital_file_location: "", ship_date: "", notes: "" });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function updatePOStatus(poId: string, status: string) {
    setBusy(true);
    setError(null);
    try {
      const r = await supabase.from("purchase_order").update({ status }).eq("id", poId);
      if (r.error) throw new Error(r.error.message);
      await log("order_status_changed", "purchase_order", poId);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function addInvoice() {
    if (!vendor) return;
    const errs: FieldErrors = {};
    // Delivery notes matter most on the invoices nobody re-reads: a short shipment recorded
    // as blank is indistinguishable from a delivery nobody checked.
    if (asksInv("delivery") && !invForm.delivery_comments.trim()) {
      errs["inv.delivery_comments"] = "Delivery comments are required. Type N/A if nothing was short or damaged.";
    }
    if (needsDigitalLocation(invForm.invoice_filing) && !invForm.digital_file_location.trim()) {
      errs["inv.digital_file_location"] = "Add the digital file location, so the invoice can be found again.";
    }
    // The "arrived already paid" flow records a payment for the full total right after the
    // insert, and the RPC refuses a zero allocation. Validate BEFORE anything is written so
    // a bad form never leaves an orphan invoice behind.
    if (invForm.status === "paid" && formTotal(invForm) <= 0) {
      errs["inv.amount"] = "Enter the invoice amount before saving it as already paid.";
    }
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      // Insert as unpaid; if the invoice arrived already paid, the payment recorded next
      // flips it. That way a paid invoice always has its payment row behind it.
      const svcCat = invForm.service_category === "Others" ? invForm.service_category_other.trim() : invForm.service_category;
      const r = await supabase.from("invoice").insert({
        store_id: vendor.store_id ?? null,
        vendor_id: vendor.id,
        invoice_number: invForm.invoice_number || null,
        invoice_date: invForm.invoice_date || null,
        amount: num(invForm.amount),
        hst_amount: hstFromMode(invForm.tax_mode, invForm.hst_amount),
        tax_mode: invForm.tax_mode,
        freight_charges: num(invForm.freight_charges),
        po_number: asksInv("po_number") ? invForm.po_number.trim() || null : null,
        delivery_status: invForm.delivery_status || null,
        delivered_date: invForm.delivered_date || null,
        delivery_comments: invForm.delivery_comments.trim() || null,
        invoice_filing: invForm.invoice_filing || null,
        digital_file_location: invForm.digital_file_location.trim() || null,
        estimate_number: asksInv("property_work") ? invForm.estimate_number || null : null,
        work_type: asksInv("property_work") ? invForm.work_type || null : null,
        service_category: asksInv("property_work") ? svcCat || null : null,
        work_description: asksInv("property_work") ? invForm.work_description || null : null,
        terms: invForm.terms || null,
        due_date: invForm.due_date || null,
        status: "unpaid"
      }).select("id").single();
      if (r.error) throw new Error(r.error.message);
      await log("invoice_added", "invoice", r.data.id as string);
      if (invForm.status === "paid") {
        const total = formTotal(invForm);
        try {
          await recordPaymentRpc({
            vendorId: vendor.id,
            method: invForm.pay_method,
            paidDate: invForm.pay_date || todayISO(),
            reference: invForm.pay_reference,
            confirmationFiling: invForm.pay_filing,
            actorId: effectiveActorId,
            allocations: [{ invoice_id: r.data.id as string, amount: round2(total) }]
          });
        } catch (payErr: any) {
          // The payment did not record: take the just-inserted invoice back out so a retry
          // starts clean instead of duplicating it, then surface the real error.
          await supabase.from("invoice").delete().eq("id", r.data.id as string);
          throw new Error(`The invoice was not saved because its payment failed: ${payErr.message}`);
        }
      }
      setShowInv(false);
      setFieldErrors({});
      setInvForm({ ...emptyInvForm });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function startEditInvoice(i: Invoice) {
    setEditInvId(i.id);
    const knownCat = i.service_category && SERVICE_CATEGORIES.includes(i.service_category);
    setEditInvForm({
      invoice_number: i.invoice_number || "",
      invoice_date: i.invoice_date || "",
      amount: i.amount != null ? String(i.amount) : "",
      hst_amount: i.hst_amount != null && Number(i.hst_amount) !== 0 ? String(i.hst_amount) : "",
      // The mode is stored now. Invoices recorded before it existed carried it inside the
      // HST figure: blank meant "refer to the actual invoice", zero meant a no-tax vendor.
      tax_mode: i.tax_mode || (i.hst_amount == null ? "invoice" : Number(i.hst_amount) === 0 ? "none" : "separate"),
      freight_charges: i.freight_charges != null ? String(i.freight_charges) : "",
      po_number: i.po_number || "",
      delivery_status: i.delivery_status || "",
      delivered_date: i.delivered_date || "",
      delivery_comments: i.delivery_comments || "",
      invoice_filing: i.invoice_filing || "",
      digital_file_location: i.digital_file_location || "",
      estimate_number: i.estimate_number || "",
      work_type: i.work_type || "",
      service_category: i.service_category ? (knownCat ? i.service_category : "Others") : "",
      service_category_other: i.service_category && !knownCat ? i.service_category : "",
      work_description: i.work_description || "",
      terms: i.terms || "",
      due_date: i.due_date || "",
      status: i.status || "unpaid"
    });
  }

  async function saveInvoice() {
    if (!editInvId) return;
    const errs: FieldErrors = {};
    if (asksInv("delivery") && !editInvForm.delivery_comments.trim()) {
      errs["editInv.delivery_comments"] = "Delivery comments are required. Type N/A if nothing was short or damaged.";
    }
    if (needsDigitalLocation(editInvForm.invoice_filing) && !editInvForm.digital_file_location.trim()) {
      errs["editInv.digital_file_location"] = "Add the digital file location, so the invoice can be found again.";
    }
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      const svcCat = editInvForm.service_category === "Others" ? editInvForm.service_category_other.trim() : editInvForm.service_category;
      const r = await supabase.from("invoice").update({
        invoice_number: editInvForm.invoice_number || null,
        invoice_date: editInvForm.invoice_date || null,
        amount: num(editInvForm.amount),
        hst_amount: hstFromMode(editInvForm.tax_mode, editInvForm.hst_amount),
        tax_mode: editInvForm.tax_mode,
        freight_charges: num(editInvForm.freight_charges),
        // Written from the form state, which startEditInvoice seeded from the row. When the
        // department is not asked for a PO number the box is not drawn, the seeded value
        // rides through untouched, and a saved PO number survives an amount correction.
        // The old code nulled it here, which is how fixing a typo could erase a fact.
        po_number: editInvForm.po_number.trim() || null,
        delivery_status: editInvForm.delivery_status || null,
        delivered_date: editInvForm.delivered_date || null,
        delivery_comments: editInvForm.delivery_comments.trim() || null,
        invoice_filing: editInvForm.invoice_filing || null,
        digital_file_location: editInvForm.digital_file_location.trim() || null,
        estimate_number: editInvForm.estimate_number || null,
        work_type: editInvForm.work_type || null,
        // Same preservation rule as po_number above. estimate_number and work_type beside
        // this were already written unconditionally, which is the drift the registry ends.
        service_category: svcCat || null,
        work_description: editInvForm.work_description || null,
        terms: editInvForm.terms || null,
        due_date: editInvForm.due_date || null
      }).eq("id", editInvId);
      if (r.error) throw new Error(r.error.message);
      // Status is DERIVED, never written here: an amount change can move an invoice
      // between paid and partially paid, so the engine re-derives it right away.
      await supabase.rpc("recompute_invoice_status", { p_invoice_id: editInvId });
      await log("invoice_edited", "invoice", editInvId);
      setFieldErrors({});
      setEditInvId(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeInvoice(i: Invoice) {
    if (!window.confirm(`Delete invoice ${i.invoice_number || ""}? It will be hidden but kept for the tax history.`)) return;
    setBusy(true);
    setError(null);
    try {
      await voidRow("invoice", i.id, effectiveActorId);
      if (editInvId === i.id) setEditInvId(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function startEditPO(o: PurchaseOrder) {
    setEditPoId(o.id);
    setEditPoForm({
      status: o.status || "in_progress",
      order_amount: o.order_amount != null ? String(o.order_amount) : "",
      order_filing: o.order_filing || "",
      digital_file_location: o.digital_file_location || "",
      ship_date: o.ship_date || "",
      notes: o.notes || ""
    });
    setFieldErrors({});
  }

  async function savePO() {
    if (!editPoId) return;
    const errs: FieldErrors = {};
    if (!editPoForm.notes.trim()) {
      errs["editPo.notes"] = "Order comments are required. Type N/A if there is nothing to note.";
    }
    if (needsDigitalLocation(editPoForm.order_filing) && !editPoForm.digital_file_location.trim()) {
      errs["editPo.digital_file_location"] = "Add the digital file location, so the confirmation can be found again.";
    }
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      const r = await supabase.from("purchase_order").update({
        order_amount: num(editPoForm.order_amount),
        ship_date: editPoForm.ship_date || null,
        status: editPoForm.status,
        order_filing: editPoForm.order_filing || null,
        digital_file_location: editPoForm.digital_file_location.trim() || null,
        // The season follows the ship date, the same rule the add form uses. Only when a
        // ship date is actually set: imported orders carry a season with no ship date, and
        // stamping today's year over it would move them into the wrong season.
        ...(editPoForm.ship_date ? { season_year: Number(editPoForm.ship_date.slice(0, 4)) } : {}),
        notes: editPoForm.notes || null
      }).eq("id", editPoId);
      if (r.error) throw new Error(r.error.message);
      await log("order_edited", "purchase_order", editPoId);
      setFieldErrors({});
      setEditPoId(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removePO(o: PurchaseOrder) {
    if (!window.confirm(`Delete this ${o.season_year || ""} order? It will be hidden but kept for the tax history.`)) return;
    setBusy(true);
    setError(null);
    try {
      await voidRow("purchase_order", o.id, effectiveActorId);
      if (editPoId === o.id) setEditPoId(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  function startEditPayment(p: Payment) {
    setEditPayId(p.id);
    setEditPayForm({
      method: p.method || "cheque",
      paid_date: p.paid_date || todayISO(),
      reference: p.reference || "",
      notes: p.notes || "",
      filing: p.confirmation_filing || "",
      digital_file_location: p.digital_file_location || ""
    });
    setFieldErrors({});
  }

  async function saveEditPayment() {
    if (!editPayId) return;
    const errs: FieldErrors = {};
    if (!editPayForm.paid_date) errs["editPay.paid_date"] = "Enter the paid date.";
    if (editPayForm.method === "other" && !editPayForm.notes.trim()) {
      errs["editPay.notes"] = "Payment method is Other: say what it was in the comments.";
    }
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      // One transaction: the corrected facts plus a re-derive of every invoice this
      // payment touches, so moving the date across today flips post-dated correctly.
      await editPaymentRpc({
        paymentId: editPayId,
        method: editPayForm.method,
        paidDate: editPayForm.paid_date,
        reference: editPayForm.reference,
        notes: editPayForm.notes,
        confirmationFiling: editPayForm.filing,
        actorId: effectiveActorId
      });
      await saveDigitalLocation(editPayId, editPayForm.digital_file_location);
      setFieldErrors({});
      setEditPayId(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removePayment(p: Payment) {
    if (!window.confirm("Void this payment? It will be hidden but kept for the tax history, and its invoices go back to owing.")) return;
    setBusy(true);
    setError(null);
    try {
      // void_payment also puts every invoice this payment touched back to its true status.
      await voidPaymentRpc(p.id, effectiveActorId);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function addCredit() {
    if (!vendor) return;
    const amount = Number(creditForm.credit_amount);
    const errs: FieldErrors = {};
    if (!amount || amount <= 0) errs["credit.credit_amount"] = "Enter the credit amount.";
    if (!creditForm.reason.trim()) errs["credit.reason"] = "Enter the reason for the credit.";
    setFieldErrors(errs);
    if (Object.keys(errs).length) return;
    setBusy(true);
    setError(null);
    try {
      const r = await supabase.from("credit_note").insert({
        store_id: vendor.store_id ?? null,
        vendor_id: vendor.id,
        invoice_id: creditForm.invoice_id || null,
        invoice_number: creditForm.invoice_number.trim() || null,
        credit_amount: amount,
        reason: creditForm.reason.trim(),
        comments: creditForm.comments.trim() || null,
        credit_type: creditForm.credit_type || null,
        status: creditForm.status,
        created_by: effectiveActorId
      }).select("id").single();
      if (r.error) throw new Error(r.error.message);
      await log("credit_added", "credit_note", r.data.id as string);
      setShowCredit(false);
      setFieldErrors({});
      setCreditForm({ invoice_number: "", credit_amount: "", reason: "", comments: "", invoice_id: "", status: "pending", credit_type: "" });
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeCredit(c: CreditNote) {
    if (!window.confirm("Delete this credit note? It will be hidden but kept for the history.")) return;
    setBusy(true);
    setError(null);
    try {
      await voidRow("credit_note", c.id, effectiveActorId);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  async function removeVendor() {
    if (!vendor) return;
    if (!window.confirm(`Delete ${vendor.name}? It will be hidden from the directory but kept for the tax history.`)) return;
    setBusy(true);
    setError(null);
    try {
      await voidRow("vendor", vendor.id, effectiveActorId);
      window.location.href = "/vendors";
    } catch (e: any) {
      setError(e.message);
      setBusy(false);
    }
  }

  function startPay(i: Invoice) {
    setPayFor(i.id);
    // Prefill what is left to allocate: partial payments and post-dated cheques already
    // covering their share reduce it.
    const left = round2(remainingToAllocate(invTotal(i), settlements.get(i.id)));
    setPayForm({ amount: left > 0 ? String(left) : "", method: "cheque", paid_date: todayISO(), reference: "", notes: "", filing: "", digital_file_location: "" });
    setFieldErrors({});
  }

  // Stamp the file location onto a payment the engine has already written. Non-fatal: the
  // payment is real either way, and losing a path must never look like losing money.
  async function saveDigitalLocation(paymentId: string | null | undefined, location: string) {
    const value = (location || "").trim();
    if (!paymentId || !value) return;
    try {
      await supabase.from("payment").update({ digital_file_location: value }).eq("id", paymentId);
    } catch {
      /* the payment stands; the location can be added by editing it */
    }
  }

  async function recordPayment() {
    if (!payFor || !vendor) return;
    const amount = num(payForm.amount);
    const errs: FieldErrors = {};
    if (!amount || amount <= 0) errs["pay.amount"] = "Enter the payment amount.";
    if (!payForm.notes.trim()) {
      errs["pay.notes"] = payForm.method === "other"
        ? "Payment method is Other: say what it was in the comments."
        : "Payment comments are required. Type N/A if there is nothing to note.";
    }
    if (needsDigitalLocation(payForm.filing) && !payForm.digital_file_location.trim()) {
      errs["pay.digital_file_location"] = "Add the digital file location, so the confirmation can be found again.";
    }
    setFieldErrors(errs);
    // The amount check is repeated here rather than assumed from the error map, so the
    // compiler can see the allocation below is never handed a null.
    if (Object.keys(errs).length || !amount) return;
    setBusy(true);
    setError(null);
    try {
      // One atomic call: payment + allocation + invoice status + audit. A partial amount
      // leaves the invoice partially paid; a future date records it as post-dated.
      const paymentId = await recordPaymentRpc({
        vendorId: vendor.id,
        method: payForm.method,
        paidDate: payForm.paid_date || todayISO(),
        reference: payForm.reference,
        notes: payForm.notes,
        confirmationFiling: payForm.filing,
        actorId: effectiveActorId,
        allocations: [{ invoice_id: payFor, amount }]
      });
      // Where the confirmation is filed is written after the engine commits, on purpose.
      // The RPC owns the money; this is a file path, and a failure here costs a path, not a
      // dollar. Widening the money function's signature to carry it would risk more.
      await saveDigitalLocation(paymentId, payForm.digital_file_location);
      setFieldErrors({});
      setPayFor(null);
      await load();
    } catch (e: any) {
      setError(e.message);
    } finally {
      setBusy(false);
    }
  }

  // True when a typed order amount falls under the vendor's recorded minimum. Only ever a
  // note on screen: nothing here stops an order being saved.
  const belowMinimum = (amountText: string): boolean => {
    const min = Number(vendor?.minimum_order_amount);
    const typed = Number(amountText);
    if (!vendor?.minimum_order_amount || !isFinite(min) || !amountText.trim() || !isFinite(typed)) return false;
    return typed > 0 && typed < min;
  };

  const invoiceTotal = (i: Invoice) => invTotal(i);
  // Owed right now: post-dated money has not left the account, so it still counts as owed
  // here; the invoice chip shows it is covered.
  const outstanding = invoices
    .filter((i) => i.status !== "paid")
    .reduce((s, i) => s + remainingOwed(invTotal(i), settlements.get(i.id)), 0);

  // The two situations that make a bare $0.00 read like a bug (Ravi asked): money paid on
  // account with no invoice to land on, and orders whose invoices have not been entered
  // yet. Say both out loud next to the Outstanding figure.
  const depositOnAccount = payments
    .filter((p) => (p.payment_allocation || []).length === 0 && !isFutureDate(p.paid_date))
    .reduce((s, p) => s + (Number(p.amount) || 0), 0);
  const invoicedTotal = invoices.reduce((s, i) => s + invTotal(i), 0);
  const orderedAwaitingInvoice = Math.max(0,
    orders.filter((o) => o.status !== "cancelled").reduce((s, o) => s + (Number(o.order_amount) || 0), 0) - invoicedTotal
  );

  // The statement: what a vendor mails once an account runs past due, rebuilt from our own
  // ledger. Charges and payments in date order with a running balance, so their "remaining
  // amount" letter can be checked line by line against ours. Post-dated cheques appear as
  // scheduled lines but do not reduce the balance until their date arrives.
  const statement = (() => {
    type Row = { date: string; label: string; detail: string; charge: number; credit: number; scheduled: boolean };
    const rows: Row[] = [];
    for (const i of invoices) {
      rows.push({
        date: i.invoice_date || i.due_date || "",
        label: `Invoice ${i.invoice_number || ""}`.trim(),
        detail: [i.terms, i.due_date ? `due ${i.due_date}` : ""].filter(Boolean).join(" . "),
        charge: invTotal(i), credit: 0, scheduled: false
      });
    }
    for (const p of payments) {
      const scheduled = isFutureDate(p.paid_date);
      rows.push({
        date: p.paid_date || "",
        label: scheduled ? `Post-dated ${methodLabel(p.method)}` : `Payment, ${methodLabel(p.method)}`,
        detail: [p.reference, (p.payment_allocation || []).map((a) => a.invoice?.invoice_number).filter(Boolean).join(", ")].filter(Boolean).join(" . "),
        charge: 0, credit: Number(p.amount) || 0, scheduled
      });
    }
    rows.sort((a, b) => {
      const da = a.date || "9999-99-99", db = b.date || "9999-99-99";
      if (da !== db) return da < db ? -1 : 1;
      // Same day: the charge lands before its payment, so the running balance never dips
      // negative mid-statement for an arrived-already-paid invoice.
      if ((a.charge > 0) !== (b.charge > 0)) return a.charge > 0 ? -1 : 1;
      return 0;
    });
    let bal = 0;
    const withBal = rows.map((r) => {
      if (!r.scheduled) bal = round2(bal + r.charge - r.credit);
      return { ...r, balance: bal };
    });
    return { rows: withBal, ending: bal };
  })();
  const [showStatement, setShowStatement] = useState(false);

  if (loading) return <p className="help">Loading vendor.</p>;
  if (error && !vendor)
    return (
      <div className="card" style={{ padding: 16 }}>
        <span className="chip chip-error">Connection</span>
        <p className="help" style={{ marginTop: 8 }}>{error}. Check your Supabase env values and that the schema has been run.</p>
      </div>
    );
  if (!vendor)
    return (
      <div className="card" style={{ padding: 24, textAlign: "center" }}>
        <p style={{ margin: "0 0 12px" }}>Vendor not found.</p>
        <Link href="/vendors" className="btn-ghost" style={{ textDecoration: "none" }}>Back to vendors</Link>
      </div>
    );

  return (
    <div style={{ display: "grid", gap: 20 }}>
      <header className="page-head">
        <div>
          <Link href="/vendors" className="help" style={{ textDecoration: "none" }}>&larr; Vendors</Link>
          <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 8 }}>
            <h1 className="page-title">{vendor.name}</h1>
            {vendor.department && <span className="chip" style={{ background: "#EEF1F4", color: vendor.department.accent_color || "#6B7480" }}>{vendor.department.name}</span>}
            <span className={`chip ${chipClass(vendor.status)}`}>{labelize(vendor.status)}</span>
          </div>
        </div>
        {!REQUIRE_AUTH && (
          <div className="page-actions">
            <label className="help" htmlFor="actor">Acting as </label>
            <select id="actor" className="input" style={{ width: "auto", display: "inline-block", padding: "6px 8px" }} value={actorId} onChange={(e) => setActor(e.target.value)}>
              {users.map((u) => <option key={u.id} value={u.id}>{u.full_name} ({u.role})</option>)}
            </select>
          </div>
        )}
      </header>

      {error && (
        <div className="card" style={{ padding: 12 }}>
          <span className="chip chip-error">Error</span>
          <span className="help" style={{ marginLeft: 8 }}>{error}</span>
        </div>
      )}

      <div className="card" style={{ padding: 16, display: "grid", gap: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", flexWrap: "wrap", gap: 12 }}>
          <div>
            <div className="help">Contact</div>
            <div>{vendor.rep_name || "No rep on file"}</div>
            <div className="help">{[vendor.phone, vendor.email].filter(Boolean).join(" . ")}</div>
          </div>
          <div style={{ textAlign: "right" }}>
            {showMoney && (
              <>
                <div className="help">Outstanding</div>
                <div className="tabular" style={{ fontSize: 20, fontWeight: 700 }}>{formatCAD(outstanding)}</div>
                {canEdit(role) && outstanding > 0 && invoices.filter((i) => i.status !== "paid").length > 1 && (
                  <Link href={`/payments?vendor=${vendor.id}`} className="btn-ghost" style={{ padding: "4px 10px", marginTop: 6, display: "inline-block", textDecoration: "none" }}>
                    Pay across invoices
                  </Link>
                )}
                {depositOnAccount > 0 && (
                  <div className="help" style={{ marginTop: 4 }}>
                    {formatCAD(depositOnAccount)} paid on account, waiting for an invoice
                  </div>
                )}
                {orderedAwaitingInvoice > 0 && (
                  <div className="help" style={{ marginTop: 2 }}>
                    {formatCAD(orderedAwaitingInvoice)} ordered, invoice not entered yet
                  </div>
                )}
                {/* The glance facts Ravi asked for: the latest order and the latest cleared
                    payment, right where the eye lands when the page opens. */}
                {(orders[0] || payments.find((p) => !isFutureDate(p.paid_date))) && (
                  <div className="help" style={{ marginTop: 6 }}>
                    {orders[0] && <span>Last order {orders[0].order_amount != null ? formatCAD(orders[0].order_amount) : ""}{orders[0].ship_date ? ` (ship ${orders[0].ship_date})` : ""}</span>}
                    {orders[0] && payments.find((p) => !isFutureDate(p.paid_date)) && <span> . </span>}
                    {(() => { const lp = payments.find((p) => !isFutureDate(p.paid_date)); return lp ? <span>last paid {lp.paid_date}</span> : null; })()}
                  </div>
                )}
              </>
            )}
            <div className="help">{vendor.default_terms || ""}</div>
          </div>
        </div>
        {vendor.products_we_carry && <div><div className="help">Products</div><div>{vendor.products_we_carry}</div></div>}
        {/* The ordering profile, between Products and Notes, where the owner asked for it.
            Drawn from the field registry now, so this screen, the AI routes and the entry
            form all answer "what is a vendor" the same way.

            Two behaviours come from the registry rather than from here. A line still appears
            only once it has been answered, because a row of "not set" labels across 130
            vendors would be noise. And a saved answer shows even when this vendor's
            department is no longer asked that question, so changing the department map never
            looks like deleting data. */}
        {(() => {
          const facts = visibleFacts(vendor, { showMoney, group: "ordering", departmentName: vendorDeptName, choices: vendorChoices });
          if (!facts.length) return null;
          return (
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
              {facts.map((f) => (
                <div key={f.field.key}>
                  <div className="help">{f.label}</div>
                  <div>{f.text}</div>
                  {f.detail && <div className="help" style={{ marginTop: 2 }}>{f.detail}</div>}
                </div>
              ))}
            </div>
          );
        })()}
        {vendor.notes && <div><div className="help">Notes and rules</div><div>{vendor.notes}</div></div>}
        {!editVendor && canEdit(role) && (
          <div style={{ display: "flex", gap: 8 }}>
            <button className="btn-ghost" onClick={startEditVendor}>Edit vendor</button>
            <button className="btn-ghost" onClick={removeVendor} disabled={busy}>Delete vendor</button>
          </div>
        )}

        {editVendor && (
          <div style={{ display: "grid", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {asks("rep_name") && (
                <div><label className="label">{labelForKey("rep_name", vendorDeptName)}</label><input className="input" value={vForm.rep_name} onChange={(e) => setVForm({ ...vForm, rep_name: e.target.value })} /></div>
              )}
              {asks("phone") && (
                <div><label className="label">Phone</label><input className="input" value={vForm.phone} onChange={(e) => setVForm({ ...vForm, phone: e.target.value })} /></div>
              )}
              {asks("email") && (
                <div><label className="label">Email</label><input className="input" value={vForm.email} onChange={(e) => setVForm({ ...vForm, email: e.target.value })} /></div>
              )}
              <div><label className="label">Status</label>
                <select className="input" value={vForm.status} onChange={(e) => setVForm({ ...vForm, status: e.target.value })}>
                  {["active", "skip", "discontinue", "bankrupt"].map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
              </div>
              {asks("default_terms") && (
                <div><label className="label">Payment terms</label><input className="input" value={vForm.default_terms} onChange={(e) => setVForm({ ...vForm, default_terms: e.target.value })} /></div>
              )}
              {asks("specializes_in") && (
                <div><label className="label">{labelForKey("specializes_in", vendorDeptName)}</label>
                  <select className="input" value={vForm.specializes_in} onChange={(e) => setVForm({ ...vForm, specializes_in: e.target.value })}>
                    <option value="">Not said</option>
                    {SERVICE_CATEGORIES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                </div>
              )}
              {asks("products_we_carry") && (
                <div><label className="label">Products</label><input className="input" value={vForm.products_we_carry} onChange={(e) => setVForm({ ...vForm, products_we_carry: e.target.value })} /></div>
              )}
            </div>
            <VendorOrderingFields
              value={vForm as OrderingProfile}
              onChange={(patch) => setVForm({ ...vForm, ...patch })}
              errors={fieldErrors}
              showMoney={showMoney}
              departmentName={askDept}
              choices={vendorChoices}
            />
            {asks("notes") && (
              <div><label className="label">Notes and rules</label><textarea className="input" rows={2} value={vForm.notes} onChange={(e) => setVForm({ ...vForm, notes: e.target.value })} /></div>
            )}
            {/* A question hidden here is not an answer deleted: the saved value rides through
                the update untouched, and the facts above this form still show it. */}
            {hiddenCount > 0 && (
              <div>
                <button type="button" className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => setShowAllFields((v) => !v)}>
                  {showAllFields ? "Hide the extra questions" : `Add the other questions (${hiddenCount})`}
                </button>
                <p className="help" style={{ margin: "4px 0 0" }}>
                  {showAllFields
                    ? "Every question is showing. Leave blank anything this vendor does not need."
                    : `${vendorDeptName || "This department"} is not usually asked these. Add them if this vendor needs them.`}
                </p>
              </div>
            )}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="btn-primary" onClick={saveVendor} disabled={busy}>{busy ? "Saving." : "Save vendor"}</button>
              <button className="btn-ghost" onClick={() => setEditVendor(false)}>Cancel</button>
            </div>
          </div>
        )}
      </div>

      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Purchase orders</h2>
          {showMoney && <button className="btn-ghost" onClick={() => setShowPO((s) => !s)}>{showPO ? "Close" : "+ Add order"}</button>}
        </div>
        {showMoney && showPO && (
          <div className="card" style={{ padding: 14, marginBottom: 10, display: "grid", gap: 10 }}>
            {/* What this vendor will not go below, in front of the buyer at the moment the
                amount is being typed. That is the whole point of recording it. */}
            {(minimumOrderLabel(vendor) || vendor.summer_order_timeline) && (
              <p className="help" style={{ margin: 0 }}>
                {minimumOrderLabel(vendor)}
                {minimumOrderLabel(vendor) && vendor.summer_order_timeline ? " . " : ""}
                {vendor.summer_order_timeline ? `Summer order: ${vendor.summer_order_timeline}` : ""}
              </p>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
              <div><label className="label">Order status</label>
                <select className="input" value={poForm.status} onChange={(e) => setPoForm({ ...poForm, status: e.target.value })}>
                  {orderStatusOptions(poForm.status).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                </select>
              </div>
              <div><label className="label">Order amount</label><input className="input tabular" type="number" step="0.01" value={poForm.order_amount} onChange={(e) => setPoForm({ ...poForm, order_amount: e.target.value })} />
                {/* A soft flag, not a block. Vendors waive their own minimum, and a top-up
                    order against an earlier one is a normal reason to be under it. */}
                {belowMinimum(poForm.order_amount) && (
                  <p className="help" style={{ margin: "4px 0 0" }}>Below the {minimumOrderLabel(vendor)} on file for this vendor.</p>
                )}
              </div>
              <div><label className="label">Order confirmation filed</label>
                <select className="input" value={poForm.order_filing} onChange={(e) => setPoForm({ ...poForm, order_filing: e.target.value })}>
                  <option value="">Not said</option>
                  {ORDER_FILING.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
                <p className="help" style={{ margin: "4px 0 0" }}>Where the confirmation is kept.</p>
              </div>
              {needsDigitalLocation(poForm.order_filing) && (
                <div><label className="label">Digital file location</label><input className={fieldInputClass(fieldErrors, "po.digital_file_location")} placeholder="Link or folder path" value={poForm.digital_file_location} onChange={(e) => { setPoForm({ ...poForm, digital_file_location: e.target.value }); clearField("po.digital_file_location"); }} />
                  <p className="help" style={{ margin: "4px 0 0" }}>Required. Where the confirmation is saved.</p>
                  <FieldError errors={fieldErrors} name="po.digital_file_location" />
                </div>
              )}
              <div><label className="label">Ship date</label><input className={fieldInputClass(fieldErrors, "po.ship_date")} type="date" min={todayISO()} value={poForm.ship_date} onChange={(e) => { setPoForm({ ...poForm, ship_date: e.target.value }); clearField("po.ship_date"); }} />
                <FieldError errors={fieldErrors} name="po.ship_date" />
              </div>
            </div>
            <div><label className="label">Order comments</label><input className={fieldInputClass(fieldErrors, "po.notes")} placeholder="Anything worth noting, or N/A" value={poForm.notes} onChange={(e) => { setPoForm({ ...poForm, notes: e.target.value }); clearField("po.notes"); }} />
              <p className="help" style={{ margin: "4px 0 0" }}>Required. If there is nothing to note, type N/A.</p>
              <FieldError errors={fieldErrors} name="po.notes" />
            </div>
            <div><button className="btn-primary" onClick={addPO} disabled={busy}>{busy ? "Saving." : "Save order"}</button></div>
          </div>
        )}
        {orders.length === 0 && <p className="help">No orders on file.</p>}
        <div style={{ display: "grid", gap: 8 }}>
          {orders.map((o) => (
            <div key={o.id} className="card" style={{ padding: 12 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong>{o.season_year || ""} order</strong>
                    <select className="input" style={{ width: "auto", padding: "2px 6px", fontSize: 12 }} value={o.status} onChange={(e) => updatePOStatus(o.id, e.target.value)} disabled={busy || !canEdit(role)} aria-label="order status">
                      {orderStatusOptions(o.status).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                    </select>
                  </div>
                  <div className="help" style={{ marginTop: 4 }}>{o.ship_date ? `ship ${o.ship_date}` : ""}{o.notes ? ` . ${o.notes}` : ""}</div>
                </div>
                <div style={{ textAlign: "right" }}>
                  {showMoney && <div className="tabular" style={{ fontWeight: 600 }}>{o.order_amount != null ? formatCAD(o.order_amount) : "n/a"}</div>}
                  {canEdit(role) && (
                    <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 4, flexWrap: "wrap" }}>
                      <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => startEditPO(o)} disabled={busy}>Edit</button>
                      <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => removePO(o)} disabled={busy}>Delete</button>
                    </div>
                  )}
                </div>
              </div>
              {canEdit(role) && editPoId === o.id && (
                <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 10, display: "grid", gap: 10 }}>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
                    <div><label className="label">Order status</label>
                      <select className="input" value={editPoForm.status} onChange={(e) => setEditPoForm({ ...editPoForm, status: e.target.value })}>
                        {orderStatusOptions(editPoForm.status).map((s) => <option key={s.value} value={s.value}>{s.label}</option>)}
                      </select>
                    </div>
                    <div><label className="label">Order amount</label><input className="input tabular" type="number" step="0.01" value={editPoForm.order_amount} onChange={(e) => setEditPoForm({ ...editPoForm, order_amount: e.target.value })} /></div>
                    <div><label className="label">Order confirmation filed</label>
                      <select className="input" value={editPoForm.order_filing} onChange={(e) => setEditPoForm({ ...editPoForm, order_filing: e.target.value })}>
                        <option value="">Not said</option>
                        {ORDER_FILING.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                      </select>
                    </div>
                    {needsDigitalLocation(editPoForm.order_filing) && (
                      <div><label className="label">Digital file location</label><input className={fieldInputClass(fieldErrors, "editPo.digital_file_location")} placeholder="Link or folder path" value={editPoForm.digital_file_location} onChange={(e) => { setEditPoForm({ ...editPoForm, digital_file_location: e.target.value }); clearField("editPo.digital_file_location"); }} />
                        <FieldError errors={fieldErrors} name="editPo.digital_file_location" />
                      </div>
                    )}
                    <div><label className="label">Ship date</label><input className="input" type="date" value={editPoForm.ship_date} onChange={(e) => setEditPoForm({ ...editPoForm, ship_date: e.target.value })} /></div>
                  </div>
                  <div><label className="label">Order comments</label><input className={fieldInputClass(fieldErrors, "editPo.notes")} placeholder="Anything worth noting, or N/A" value={editPoForm.notes} onChange={(e) => { setEditPoForm({ ...editPoForm, notes: e.target.value }); clearField("editPo.notes"); }} />
                    <FieldError errors={fieldErrors} name="editPo.notes" />
                  </div>
                  <div style={{ display: "flex", gap: 8 }}>
                    <button className="btn-primary" onClick={savePO} disabled={busy}>{busy ? "Saving." : "Save order"}</button>
                    <button className="btn-ghost" onClick={() => setEditPoId(null)}>Cancel</button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      </section>

      <section>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Invoices</h2>
          {showMoney && <button className="btn-ghost" onClick={() => setShowInv((s) => !s)}>{showInv ? "Close" : "+ Add invoice"}</button>}
        </div>
        {showMoney && showInv && (
          <div className="card" style={{ padding: 14, marginBottom: 10, display: "grid", gap: 10 }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
              {asksInv("delivery") && (
                <>
                  <div><label className="label">Delivery status</label>
                    <select className="input" value={invForm.delivery_status} onChange={(e) => setInvForm({ ...invForm, delivery_status: e.target.value })}>
                      <option value="">Not said</option>
                      {DELIVERY_STATUS.map((d) => <option key={d.value} value={d.value}>{d.label}</option>)}
                    </select>
                  </div>
                  <div><label className="label">Delivered date</label><input className="input" type="date" value={invForm.delivered_date} onChange={(e) => setInvForm({ ...invForm, delivered_date: e.target.value })} /></div>
                </>
              )}
              <div><label className="label">Invoice number</label><input className="input" value={invForm.invoice_number} onChange={(e) => setInvForm({ ...invForm, invoice_number: e.target.value })} /></div>
              <div><label className="label">Invoice subtotal</label><input className={fieldInputClass(fieldErrors, "inv.amount") + " tabular"} type="number" step="0.01" value={invForm.amount} onChange={(e) => { setInvForm({ ...invForm, amount: e.target.value, hst_amount: hstFieldForMode(invForm.tax_mode, e.target.value) }); clearField("inv.amount"); }} />
                <FieldError errors={fieldErrors} name="inv.amount" />
              </div>
              <div><label className="label">Tax</label>
                <select className="input" value={invForm.tax_mode} onChange={(e) => setInvForm({ ...invForm, tax_mode: e.target.value, hst_amount: hstFieldForMode(e.target.value, invForm.amount) })}>
                  {TAX_MODES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
              {(invForm.tax_mode === "separate" || invForm.tax_mode === "included") && (
                <div><label className="label">HST</label><input className="input tabular" type="number" step="0.01" value={invForm.hst_amount} onChange={(e) => setInvForm({ ...invForm, hst_amount: e.target.value })} />
                  {taxWorking(invForm.tax_mode, num(invForm.amount), num(invForm.hst_amount)) && (
                    <p className="help" style={{ margin: "4px 0 0" }}>{taxWorking(invForm.tax_mode, num(invForm.amount), num(invForm.hst_amount))}</p>
                  )}
                </div>
              )}
              {asksInv("freight") && <div><label className="label">Freight charge</label><input className="input tabular" type="number" step="0.01" value={invForm.freight_charges} onChange={(e) => setInvForm({ ...invForm, freight_charges: e.target.value })} /></div>}
              <div><label className="label">Due date</label><input className="input" type="date" value={invForm.due_date} onChange={(e) => setInvForm({ ...invForm, due_date: e.target.value })} /></div>
              <div><label className="label">Payment status</label>
                <select className="input" value={invForm.status} onChange={(e) => setInvForm({ ...invForm, status: e.target.value })}>
                  <option value="unpaid">Unpaid (has a due date)</option>
                  <option value="paid">Paid already</option>
                </select>
              </div>
              <div><label className="label">Invoice date</label><input className="input" type="date" value={invForm.invoice_date} onChange={(e) => setInvForm({ ...invForm, invoice_date: e.target.value })} /></div>
              {asksInv("terms") && <div><label className="label">Terms</label><input className="input" value={invForm.terms} onChange={(e) => setInvForm({ ...invForm, terms: e.target.value })} /></div>}
              {asksInv("po_number") && <div><label className="label">PO number</label><input className="input" value={invForm.po_number} onChange={(e) => setInvForm({ ...invForm, po_number: e.target.value })} /></div>}
            </div>
            {asksInv("delivery") && (
              <div><label className="label">Delivery comments</label><input className={fieldInputClass(fieldErrors, "inv.delivery_comments")} placeholder="Anything short-shipped or damaged, or N/A" value={invForm.delivery_comments} onChange={(e) => { setInvForm({ ...invForm, delivery_comments: e.target.value }); clearField("inv.delivery_comments"); }} />
                <p className="help" style={{ margin: "4px 0 0" }}>Required. If there is nothing to note, type N/A.</p>
                <FieldError errors={fieldErrors} name="inv.delivery_comments" />
              </div>
            )}
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
              <div><label className="label">Final invoice filing</label>
                <select className="input" value={invForm.invoice_filing} onChange={(e) => setInvForm({ ...invForm, invoice_filing: e.target.value })}>
                  <option value="">Not said</option>
                  {CONFIRMATION_FILING.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                </select>
              </div>
              {needsDigitalLocation(invForm.invoice_filing) && (
                <div><label className="label">Digital file location</label><input className={fieldInputClass(fieldErrors, "inv.digital_file_location")} placeholder="Link or folder path" value={invForm.digital_file_location} onChange={(e) => { setInvForm({ ...invForm, digital_file_location: e.target.value }); clearField("inv.digital_file_location"); }} />
                  <p className="help" style={{ margin: "4px 0 0" }}>Required. Where the file is saved, so it can be found again.</p>
                  <FieldError errors={fieldErrors} name="inv.digital_file_location" />
                </div>
              )}
            </div>
            {showMoney && formTotal(invForm) > 0 && (
              <p className="help" style={{ margin: 0 }}>Total owed {formatCAD(round2(formTotal(invForm)))}</p>
            )}
            {asksInv("property_work") && (
              <div style={{ display: "grid", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                <div className="help">Property Maintenance work</div>
                <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                  <div><label className="label">Estimate #</label><input className="input" placeholder="Blank if not preplanned" value={invForm.estimate_number} onChange={(e) => setInvForm({ ...invForm, estimate_number: e.target.value })} /></div>
                  <div><label className="label">Type of work</label>
                    <select className="input" value={invForm.work_type} onChange={(e) => setInvForm({ ...invForm, work_type: e.target.value })}>
                      <option value="">Pick one</option>
                      {WORK_TYPES.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                    </select>
                  </div>
                  <div><label className="label">Service category</label>
                    <select className="input" value={invForm.service_category} onChange={(e) => setInvForm({ ...invForm, service_category: e.target.value })}>
                      <option value="">Pick one</option>
                      {SERVICE_CATEGORIES.map((s) => <option key={s} value={s}>{s}</option>)}
                    </select>
                  </div>
                  {invForm.service_category === "Others" && (
                    <div><label className="label">Which service?</label><input className="input" value={invForm.service_category_other} onChange={(e) => setInvForm({ ...invForm, service_category_other: e.target.value })} /></div>
                  )}
                </div>
                <div><label className="label">Description of the work</label>
                  <textarea className="input" rows={2} maxLength={500} value={invForm.work_description} onChange={(e) => setInvForm({ ...invForm, work_description: e.target.value })} />
                </div>
              </div>
            )}
            {invForm.status === "paid" && (
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 10 }}>
                <div><label className="label">Payment method</label>
                  <select className="input" value={invForm.pay_method} onChange={(e) => setInvForm({ ...invForm, pay_method: e.target.value })}>
                    {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                  </select>
                </div>
                <div><label className="label">Paid date</label><input className="input" type="date" value={invForm.pay_date} onChange={(e) => setInvForm({ ...invForm, pay_date: e.target.value })} /></div>
                <div><label className="label">{referenceLabel(invForm.pay_method)}</label><input className="input" value={invForm.pay_reference} onChange={(e) => setInvForm({ ...invForm, pay_reference: e.target.value })} />
                  <p className="help" style={{ margin: "4px 0 0" }}>{referenceHelp(invForm.pay_method)}</p>
                </div>
                <div><label className="label">Payment confirmation filed</label>
                  <select className="input" value={invForm.pay_filing} onChange={(e) => setInvForm({ ...invForm, pay_filing: e.target.value })}>
                    <option value="">Not said</option>
                    {CONFIRMATION_FILING.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </select>
                </div>
              </div>
            )}
            <div><button className="btn-primary" onClick={addInvoice} disabled={busy}>{busy ? "Saving." : invForm.status === "paid" ? "Save invoice and payment" : "Save invoice"}</button></div>
          </div>
        )}
        {invoices.length === 0 && <p className="help">No invoices on file.</p>}
        <div style={{ display: "grid", gap: 8 }}>
          {invoices.map((i) => {
            const d = daysOverdue(i.due_date);
            const overdue = (i.status === "unpaid" || i.status === "partially_paid") && d != null && d > 0;
            const owedNow = remainingOwed(invTotal(i), settlements.get(i.id));
            const partly = i.status === "partially_paid" || (i.status !== "paid" && owedNow > 0 && owedNow < invTotal(i));
            return (
              <div key={i.id} className="card" style={{ padding: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                  <div>
                    <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                      <strong>{i.invoice_number || "Invoice"}</strong>
                      <span className={`chip ${overdue ? "chip-error" : chipClass(i.status)}`}>{overdue ? `${d} days overdue` : labelize(i.status)}</span>
                      {overdue && i.status === "partially_paid" && <span className={`chip ${chipClass(i.status)}`}>{labelize(i.status)}</span>}
                      {i.delivery_status && <span className={`chip ${chipClass(i.delivery_status)}`}>{labelize(i.delivery_status)}</span>}
                      {i.work_type && <span className="chip chip-neutral">{labelize(i.work_type)}</span>}
                    </div>
                    <div className="help" style={{ marginTop: 4 }}>
                      {i.invoice_date ? `dated ${i.invoice_date} . ` : ""}{i.terms || ""}{i.due_date ? ` . due ${i.due_date}` : ""}
                      {i.po_number ? ` . PO ${i.po_number}` : ""}
                      {i.estimate_number ? ` . estimate ${i.estimate_number}` : ""}
                      {i.service_category ? ` . ${i.service_category}` : ""}
                      {i.hst_amount == null ? " . tax: see the invoice" : ""}
                      {showMoney && Number(i.freight_charges) > 0 ? ` . freight ${formatCAD(Number(i.freight_charges))}` : ""}
                      {showMoney && partly && i.status !== "paid" ? ` . ${formatCAD(owedNow)} still owed` : ""}
                    </div>
                    {i.work_description && <div className="help" style={{ marginTop: 2 }}>{i.work_description}</div>}
                  </div>
                  {showMoney && (
                    <div style={{ textAlign: "right" }}>
                      <div className="tabular" style={{ fontWeight: 600 }}>{formatCAD(invoiceTotal(i))}</div>
                      <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 4, flexWrap: "wrap" }}>
                        {i.status !== "paid" && <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => startPay(i)}>Record payment</button>}
                        {canEdit(role) && <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => startEditInvoice(i)} disabled={busy}>Edit</button>}
                        {canEdit(role) && <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => removeInvoice(i)} disabled={busy}>Delete</button>}
                      </div>
                    </div>
                  )}
                </div>
                {canEdit(role) && editInvId === i.id && (
                  <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 10, display: "grid", gap: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
                      {asksInv("delivery") && (
                        <>
                          <div><label className="label">Delivery status</label>
                            <select className="input" value={editInvForm.delivery_status} onChange={(e) => setEditInvForm({ ...editInvForm, delivery_status: e.target.value })}>
                              <option value="">Not said</option>
                              {DELIVERY_STATUS.map((ds) => <option key={ds.value} value={ds.value}>{ds.label}</option>)}
                            </select>
                          </div>
                          <div><label className="label">Delivered date</label><input className="input" type="date" value={editInvForm.delivered_date} onChange={(e) => setEditInvForm({ ...editInvForm, delivered_date: e.target.value })} /></div>
                        </>
                      )}
                      <div><label className="label">Invoice number</label><input className="input" value={editInvForm.invoice_number} onChange={(e) => setEditInvForm({ ...editInvForm, invoice_number: e.target.value })} /></div>
                      <div><label className="label">Invoice subtotal</label><input className="input tabular" type="number" step="0.01" value={editInvForm.amount} onChange={(e) => setEditInvForm({ ...editInvForm, amount: e.target.value, hst_amount: hstFieldForMode(editInvForm.tax_mode, e.target.value) })} /></div>
                      <div><label className="label">Tax</label>
                        <select className="input" value={editInvForm.tax_mode} onChange={(e) => setEditInvForm({ ...editInvForm, tax_mode: e.target.value, hst_amount: hstFieldForMode(e.target.value, editInvForm.amount) })}>
                          {TAX_MODES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                        </select>
                      </div>
                      {(editInvForm.tax_mode === "separate" || editInvForm.tax_mode === "included") && (
                        <div><label className="label">HST</label><input className="input tabular" type="number" step="0.01" value={editInvForm.hst_amount} onChange={(e) => setEditInvForm({ ...editInvForm, hst_amount: e.target.value })} />
                          {taxWorking(editInvForm.tax_mode, num(editInvForm.amount), num(editInvForm.hst_amount)) && (
                            <p className="help" style={{ margin: "4px 0 0" }}>{taxWorking(editInvForm.tax_mode, num(editInvForm.amount), num(editInvForm.hst_amount))}</p>
                          )}
                        </div>
                      )}
                      {asksInv("freight") && <div><label className="label">Freight charge</label><input className="input tabular" type="number" step="0.01" value={editInvForm.freight_charges} onChange={(e) => setEditInvForm({ ...editInvForm, freight_charges: e.target.value })} /></div>}
                      <div><label className="label">Due date</label><input className="input" type="date" value={editInvForm.due_date} onChange={(e) => setEditInvForm({ ...editInvForm, due_date: e.target.value })} /></div>
                      <div><label className="label">Payment status</label>
                        <div style={{ paddingTop: 6 }}>
                          <span className={`chip ${chipClass(editInvForm.status)}`}>{labelize(editInvForm.status)}</span>
                        </div>
                        <p className="help" style={{ margin: "4px 0 0" }}>Follows the payments: record one to mark paid, void one to undo.</p>
                      </div>
                      <div><label className="label">Invoice date</label><input className="input" type="date" value={editInvForm.invoice_date} onChange={(e) => setEditInvForm({ ...editInvForm, invoice_date: e.target.value })} /></div>
                      {asksInv("terms") && <div><label className="label">Terms</label><input className="input" value={editInvForm.terms} onChange={(e) => setEditInvForm({ ...editInvForm, terms: e.target.value })} /></div>}
                      {asksInv("po_number") && <div><label className="label">PO number</label><input className="input" value={editInvForm.po_number} onChange={(e) => setEditInvForm({ ...editInvForm, po_number: e.target.value })} /></div>}
                    </div>
                    {asksInv("delivery") && (
                      <div><label className="label">Delivery comments</label><input className={fieldInputClass(fieldErrors, "editInv.delivery_comments")} placeholder="Anything short-shipped or damaged, or N/A" value={editInvForm.delivery_comments} onChange={(e) => { setEditInvForm({ ...editInvForm, delivery_comments: e.target.value }); clearField("editInv.delivery_comments"); }} />
                        <p className="help" style={{ margin: "4px 0 0" }}>Required. If there is nothing to note, type N/A.</p>
                        <FieldError errors={fieldErrors} name="editInv.delivery_comments" />
                      </div>
                    )}
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
                      <div><label className="label">Final invoice filing</label>
                        <select className="input" value={editInvForm.invoice_filing} onChange={(e) => setEditInvForm({ ...editInvForm, invoice_filing: e.target.value })}>
                          <option value="">Not said</option>
                          {CONFIRMATION_FILING.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                      </div>
                      {needsDigitalLocation(editInvForm.invoice_filing) && (
                        <div><label className="label">Digital file location</label><input className={fieldInputClass(fieldErrors, "editInv.digital_file_location")} placeholder="Link or folder path" value={editInvForm.digital_file_location} onChange={(e) => { setEditInvForm({ ...editInvForm, digital_file_location: e.target.value }); clearField("editInv.digital_file_location"); }} />
                          <FieldError errors={fieldErrors} name="editInv.digital_file_location" />
                        </div>
                      )}
                    </div>
                    {asksInv("property_work") && (
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(150px, 1fr))", gap: 10 }}>
                        <div><label className="label">Estimate #</label><input className="input" value={editInvForm.estimate_number} onChange={(e) => setEditInvForm({ ...editInvForm, estimate_number: e.target.value })} /></div>
                        <div><label className="label">Type of work</label>
                          <select className="input" value={editInvForm.work_type} onChange={(e) => setEditInvForm({ ...editInvForm, work_type: e.target.value })}>
                            <option value="">Pick one</option>
                            {WORK_TYPES.map((w) => <option key={w.value} value={w.value}>{w.label}</option>)}
                          </select>
                        </div>
                        <div><label className="label">Service category</label>
                          <select className="input" value={editInvForm.service_category} onChange={(e) => setEditInvForm({ ...editInvForm, service_category: e.target.value })}>
                            <option value="">Pick one</option>
                            {SERVICE_CATEGORIES.map((s) => <option key={s} value={s}>{s}</option>)}
                          </select>
                        </div>
                        {editInvForm.service_category === "Others" && (
                          <div><label className="label">Which service?</label><input className="input" value={editInvForm.service_category_other} onChange={(e) => setEditInvForm({ ...editInvForm, service_category_other: e.target.value })} /></div>
                        )}
                        <div style={{ gridColumn: "1 / -1" }}><label className="label">Description of the work</label>
                          <textarea className="input" rows={2} maxLength={500} value={editInvForm.work_description} onChange={(e) => setEditInvForm({ ...editInvForm, work_description: e.target.value })} />
                        </div>
                      </div>
                    )}
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn-primary" onClick={saveInvoice} disabled={busy}>{busy ? "Saving." : "Save invoice"}</button>
                      <button className="btn-ghost" onClick={() => setEditInvId(null)}>Cancel</button>
                    </div>
                  </div>
                )}
                {showMoney && payFor === i.id && (
                  <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 10, display: "grid", gap: 10 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
                      <div><label className="label">Amount</label><input className={fieldInputClass(fieldErrors, "pay.amount") + " tabular"} type="number" step="0.01" value={payForm.amount} onChange={(e) => { setPayForm({ ...payForm, amount: e.target.value }); clearField("pay.amount"); }} />
                        <p className="help" style={{ margin: "4px 0 0" }}>A smaller amount records a partial payment.</p>
                        <FieldError errors={fieldErrors} name="pay.amount" />
                      </div>
                      <div><label className="label">Payment method</label>
                        <select className="input" value={payForm.method} onChange={(e) => setPayForm({ ...payForm, method: e.target.value })}>
                          {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                        </select>
                      </div>
                      <div><label className="label">Paid date</label><input className="input" type="date" value={payForm.paid_date} onChange={(e) => setPayForm({ ...payForm, paid_date: e.target.value })} />
                        {isFutureDate(payForm.paid_date) && <p className="help" style={{ margin: "4px 0 0" }}>Future date: records as post-dated.</p>}
                      </div>
                      <div><label className="label">{referenceLabel(payForm.method)}</label><input className="input" value={payForm.reference} onChange={(e) => setPayForm({ ...payForm, reference: e.target.value })} />
                        <p className="help" style={{ margin: "4px 0 0" }}>{referenceHelp(payForm.method)}</p>
                      </div>
                      <div><label className="label">Payment confirmation filed</label>
                        <select className="input" value={payForm.filing} onChange={(e) => setPayForm({ ...payForm, filing: e.target.value })}>
                          <option value="">Not said</option>
                          {CONFIRMATION_FILING.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                        </select>
                      </div>
                      {needsDigitalLocation(payForm.filing) && (
                        <div><label className="label">Digital file location</label><input className={fieldInputClass(fieldErrors, "pay.digital_file_location")} placeholder="Link or folder path" value={payForm.digital_file_location} onChange={(e) => { setPayForm({ ...payForm, digital_file_location: e.target.value }); clearField("pay.digital_file_location"); }} />
                          <FieldError errors={fieldErrors} name="pay.digital_file_location" />
                        </div>
                      )}
                      <div><label className="label">Payment comments{payForm.method === "other" ? " (say what the method was)" : ""}</label><input className={fieldInputClass(fieldErrors, "pay.notes")} placeholder="Anything worth noting, or N/A" value={payForm.notes} onChange={(e) => { setPayForm({ ...payForm, notes: e.target.value }); clearField("pay.notes"); }} />
                        <p className="help" style={{ margin: "4px 0 0" }}>Required. If there is nothing to note, type N/A.</p>
                        <FieldError errors={fieldErrors} name="pay.notes" />
                      </div>
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="btn-primary" onClick={recordPayment} disabled={busy}>{busy ? "Saving." : "Record payment"}</button>
                      <button className="btn-ghost" onClick={() => setPayFor(null)}>Cancel</button>
                    </div>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      </section>

      {showMoney && (
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>Statement</h2>
            <div style={{ display: "flex", gap: 8 }}>
              {showStatement && <button className="btn-ghost" onClick={() => window.print()}>Print</button>}
              <button className="btn-ghost" onClick={() => setShowStatement((s) => !s)}>{showStatement ? "Close" : "Open statement"}</button>
            </div>
          </div>
          {showStatement && (
            <div className="card" style={{ padding: 16, display: "grid", gap: 6 }}>
              <p className="help" style={{ margin: "0 0 6px" }}>
                Every charge and payment in date order, the way the vendor&rsquo;s own statement reads. Check their
                &ldquo;remaining amount&rdquo; against the ending balance here, line by line.
              </p>
              <div className="tbl-wrap"><div style={{ minWidth: 560 }}>
              <div className="help" style={{ display: "grid", gridTemplateColumns: "90px 1fr 90px 90px 100px", gap: 8, fontWeight: 600 }}>
                <span>Date</span><span>Item</span><span style={{ textAlign: "right" }}>Charge</span><span style={{ textAlign: "right" }}>Payment</span><span style={{ textAlign: "right" }}>Balance</span>
              </div>
              {statement.rows.length === 0 && <p className="help" style={{ margin: 0 }}>Nothing on file yet.</p>}
              {statement.rows.map((r, idx) => (
                <div key={idx} style={{ display: "grid", gridTemplateColumns: "90px 1fr 90px 90px 100px", gap: 8, fontSize: 13, alignItems: "baseline", opacity: r.scheduled ? 0.75 : 1 }}>
                  <span className="tabular">{r.date || ""}</span>
                  <span style={{ minWidth: 0 }}>
                    {r.label}
                    {r.scheduled && <span className="chip chip-progress" style={{ marginLeft: 6 }}>not cleared yet</span>}
                    {r.detail && <span className="help" style={{ display: "block" }}>{r.detail}</span>}
                  </span>
                  <span className="tabular" style={{ textAlign: "right" }}>{r.charge ? formatCAD(r.charge) : ""}</span>
                  <span className="tabular" style={{ textAlign: "right" }}>{r.credit ? formatCAD(r.credit) : ""}</span>
                  <span className="tabular" style={{ textAlign: "right", fontWeight: 600 }}>{r.scheduled ? "" : formatCAD(r.balance)}</span>
                </div>
              ))}
              </div></div>
              <div style={{ borderTop: "1px solid var(--border)", marginTop: 6, paddingTop: 8, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
                <span style={{ fontWeight: 600 }}>Remaining to pay off</span>
                <span className="tabular" style={{ fontWeight: 700, fontSize: 16 }}>{formatCAD(statement.ending)}</span>
              </div>
              {Math.abs(statement.ending - outstanding) >= 0.01 && (
                <p className="help" style={{ margin: 0 }}>
                  The Outstanding figure above shows {formatCAD(outstanding)} because a deposit or prepayment has not been
                  applied to a specific invoice yet; the statement subtracts every cleared payment.
                </p>
              )}
              {credits.length > 0 && (
                <p className="help" style={{ margin: 0 }}>
                  Credits on file ({credits.map((c) => formatCAD(c.credit_amount)).join(", ")}) are tracked in the Credits
                  section and are not subtracted here until the vendor applies them on their side.
                </p>
              )}
            </div>
          )}
        </section>
      )}

      {showMoney && (
        <section>
          <h2 style={{ fontSize: 16, margin: "0 0 10px" }}>Payments</h2>
          {payments.length === 0 && <p className="help">No payments recorded.</p>}
          <div style={{ display: "grid", gap: 8 }}>
            {payments.map((p) => {
              const covered = (p.payment_allocation || []).map((a) => a.invoice?.invoice_number).filter(Boolean).join(", ");
              return (
                <div key={p.id} className="card" style={{ padding: 12 }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                    <div>
                      <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                        <strong>{methodLabel(p.method)}</strong>
                        {isFutureDate(p.paid_date) && <span className="chip chip-progress">post-dated, clears {p.paid_date}</span>}
                      </div>
                      <div className="help" style={{ marginTop: 4 }}>
                        {p.paid_date && !isFutureDate(p.paid_date) ? `paid ${p.paid_date}` : ""}
                        {p.reference ? ` . ${p.reference}` : ""}
                        {covered ? ` . ${covered}` : " . deposit / prepayment"}
                        {p.confirmation_filing ? ` . filed ${p.confirmation_filing}` : ""}
                        {p.notes ? ` . ${p.notes}` : ""}
                      </div>
                    </div>
                    <div style={{ textAlign: "right" }}>
                      <div className="tabular" style={{ fontWeight: 600 }}>{formatCAD(p.amount)}</div>
                      {canEdit(role) && (
                        <div style={{ display: "flex", gap: 6, justifyContent: "flex-end", marginTop: 4, flexWrap: "wrap" }}>
                          <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => startEditPayment(p)} disabled={busy}>Edit</button>
                          <button className="btn-ghost" style={{ padding: "4px 10px" }} onClick={() => removePayment(p)} disabled={busy}>Void</button>
                        </div>
                      )}
                    </div>
                  </div>
                  {canEdit(role) && editPayId === p.id && (
                    <div style={{ borderTop: "1px solid var(--border)", marginTop: 10, paddingTop: 10, display: "grid", gap: 10 }}>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
                        <div><label className="label">Payment method</label>
                          <select className="input" value={editPayForm.method} onChange={(e) => setEditPayForm({ ...editPayForm, method: e.target.value })}>
                            {PAYMENT_METHODS.map((m) => <option key={m.value} value={m.value}>{m.label}</option>)}
                          </select>
                        </div>
                        <div><label className="label">Paid date</label><input className={fieldInputClass(fieldErrors, "editPay.paid_date")} type="date" value={editPayForm.paid_date} onChange={(e) => { setEditPayForm({ ...editPayForm, paid_date: e.target.value }); clearField("editPay.paid_date"); }} />
                          <FieldError errors={fieldErrors} name="editPay.paid_date" />
                          {isFutureDate(editPayForm.paid_date) && <p className="help" style={{ margin: "4px 0 0" }}>Future date: becomes post-dated.</p>}
                        </div>
                        <div><label className="label">{referenceLabel(editPayForm.method)}</label><input className="input" value={editPayForm.reference} onChange={(e) => setEditPayForm({ ...editPayForm, reference: e.target.value })} />
                          <p className="help" style={{ margin: "4px 0 0" }}>{referenceHelp(editPayForm.method)}</p>
                        </div>
                        <div><label className="label">Payment confirmation filed</label>
                          <select className="input" value={editPayForm.filing} onChange={(e) => setEditPayForm({ ...editPayForm, filing: e.target.value })}>
                            <option value="">Not said</option>
                            {CONFIRMATION_FILING.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                          </select>
                        </div>
                        {needsDigitalLocation(editPayForm.filing) && (
                          <div><label className="label">Digital file location</label><input className="input" placeholder="Link or folder path" value={editPayForm.digital_file_location} onChange={(e) => setEditPayForm({ ...editPayForm, digital_file_location: e.target.value })} /></div>
                        )}
                        <div><label className="label">Payment comments{editPayForm.method === "other" ? " (say what the method was)" : ""}</label><input className={fieldInputClass(fieldErrors, "editPay.notes")} placeholder="Anything worth noting, or N/A" value={editPayForm.notes} onChange={(e) => { setEditPayForm({ ...editPayForm, notes: e.target.value }); clearField("editPay.notes"); }} />
                          <FieldError errors={fieldErrors} name="editPay.notes" />
                        </div>
                      </div>
                      <p className="help" style={{ margin: 0 }}>The amount stays {formatCAD(p.amount)}. Wrong amount? Void this payment and record it again.</p>
                      <div style={{ display: "flex", gap: 8 }}>
                        <button className="btn-primary" onClick={saveEditPayment} disabled={busy}>{busy ? "Saving." : "Save payment"}</button>
                        <button className="btn-ghost" onClick={() => setEditPayId(null)}>Cancel</button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}

      {showMoney && (
        <section>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <h2 style={{ fontSize: 16, margin: 0 }}>Credits</h2>
            {canEdit(role) && <button className="btn-ghost" onClick={() => setShowCredit((s) => !s)}>{showCredit ? "Close" : "+ Record credit"}</button>}
          </div>
          {showCredit && (
            <div className="card" style={{ padding: 14, marginBottom: 10, display: "grid", gap: 10 }}>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))", gap: 10 }}>
                <div>
                  <label className="label">Invoice number</label>
                  <input className="input" placeholder="The invoice this credit applies to" value={creditForm.invoice_number} onChange={(e) => setCreditForm({ ...creditForm, invoice_number: e.target.value })} />
                </div>
                <div>
                  <label className="label">Link to invoice</label>
                  <select className="input" value={creditForm.invoice_id} onChange={(e) => setCreditForm({ ...creditForm, invoice_id: e.target.value })}>
                    <option value="">None (standalone credit)</option>
                    {invoices.map((i) => <option key={i.id} value={i.id}>{i.invoice_number || "Invoice"} ({formatCAD(invTotal(i))})</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Credit amount</label>
                  <input className={fieldInputClass(fieldErrors, "credit.credit_amount") + " tabular"} type="number" step="0.01" value={creditForm.credit_amount} onChange={(e) => { setCreditForm({ ...creditForm, credit_amount: e.target.value }); clearField("credit.credit_amount"); }} />
                  <FieldError errors={fieldErrors} name="credit.credit_amount" />
                </div>
                <div>
                  <label className="label">How it comes back</label>
                  <select className="input" value={creditForm.credit_type} onChange={(e) => setCreditForm({ ...creditForm, credit_type: e.target.value })}>
                    <option value="">Not said</option>
                    {CREDIT_TYPES.map((t) => <option key={t.value} value={t.value}>{t.label}</option>)}
                  </select>
                </div>
                <div>
                  <label className="label">Status</label>
                  <select className="input" value={creditForm.status} onChange={(e) => setCreditForm({ ...creditForm, status: e.target.value })}>
                    <option value="pending">Pending</option>
                    <option value="applied">Applied</option>
                    <option value="disputed">Disputed</option>
                  </select>
                </div>
              </div>
              <div>
                <label className="label">Reason for credit</label>
                <input className={fieldInputClass(fieldErrors, "credit.reason")} placeholder="Damaged goods, short shipment, overcharge, return" value={creditForm.reason} onChange={(e) => { setCreditForm({ ...creditForm, reason: e.target.value }); clearField("credit.reason"); }} />
                <FieldError errors={fieldErrors} name="credit.reason" />
              </div>
              <div>
                <label className="label">Comments</label>
                <textarea className="input" rows={2} value={creditForm.comments} onChange={(e) => setCreditForm({ ...creditForm, comments: e.target.value })} />
              </div>
              {(() => {
                const linked = invoices.find((i) => i.id === creditForm.invoice_id);
                if (!linked) return null;
                return (
                  <div className="help">
                    Adjusted invoice amount after credit: {formatCAD(invTotal(linked) - (Number(creditForm.credit_amount) || 0))}
                  </div>
                );
              })()}
              <div>
                <button className="btn-primary" onClick={addCredit} disabled={busy}>{busy ? "Saving." : "Save credit"}</button>
              </div>
            </div>
          )}
          {credits.length === 0 && !showCredit && <p className="help">No credits recorded.</p>}
          <div style={{ display: "grid", gap: 8 }}>
            {credits.map((c) => (
              <div key={c.id} className="card" style={{ padding: 12, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
                <div>
                  <div style={{ display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
                    <strong>{c.invoice_number || c.invoice?.invoice_number || "Credit"}</strong>
                    <span className={`chip ${c.status === "applied" ? "chip-success" : c.status === "disputed" ? "chip-warning" : "chip-neutral"}`}>{c.status}</span>
                  </div>
                  <div className="help" style={{ marginTop: 4 }}>
                    {c.reason}{c.comments ? ` . ${c.comments}` : ""}
                    {c.credit_type ? ` . ${CREDIT_TYPES.find((t) => t.value === c.credit_type)?.label || c.credit_type}` : ""}
                    {c.invoice ? ` . invoice total ${formatCAD(invTotal(c.invoice))}, adjusted ${formatCAD(invTotal(c.invoice) - c.credit_amount)}` : ""}
                  </div>
                </div>
                <div style={{ textAlign: "right" }}>
                  <div className="tabular" style={{ fontWeight: 600, color: "var(--success-base, #1E8E5A)" }}>{formatCAD(c.credit_amount)}</div>
                  {canEdit(role) && <button className="btn-ghost" style={{ padding: "4px 10px", marginTop: 4 }} onClick={() => removeCredit(c)} disabled={busy}>Delete</button>}
                </div>
              </div>
            ))}
          </div>
        </section>
      )}
    </div>
  );
}
