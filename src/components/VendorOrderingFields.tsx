"use client";

// The vendor's ordering profile: minimum order, when the summer order goes in, where orders
// are placed, and whether last season needed a reorder.
//
// One component, used by both the add-vendor form and the edit-vendor form, because the
// owner asked for these fields in both places and two copies of the same JSX is how two
// screens quietly stop agreeing about what is mandatory.
//
// Placement is the owner's: below Products, above Notes and Rules.

import {
  ORDER_LOCATIONS, OTHER_LOCATION, REORDER_STATUS,
  MAX_SUMMER_TIMELINE, MAX_LOCATION_OTHER, MAX_REORDER_COMMENTS,
  SUMMER_TIMELINE_PLACEHOLDER, REORDER_COMMENTS_PLACEHOLDER,
  toggleOrderLocation
} from "@/lib/vendorOrdering";
import { FieldError, fieldInputClass, type FieldErrors } from "@/components/FieldError";
import { asksFor } from "@/lib/vendorFields";
import type { FieldChoices } from "@/lib/fieldChoices";

export type OrderingProfile = {
  minimum_order_amount: string;
  no_minimum_order: boolean;
  summer_order_timeline: string;
  order_location: string[];
  order_location_other: string;
  reorder_status: string;
  reorder_comments: string;
};

export const EMPTY_ORDERING_PROFILE: OrderingProfile = {
  minimum_order_amount: "",
  no_minimum_order: false,
  summer_order_timeline: "",
  order_location: [],
  order_location_other: "",
  reorder_status: "",
  reorder_comments: ""
};

export function VendorOrderingFields({
  value, onChange, errors, showMoney, departmentName, choices
}: {
  value: OrderingProfile;
  onChange: (patch: Partial<OrderingProfile>) => void;
  errors: FieldErrors;
  // The minimum order is a dollar figure, so it obeys the same gate as every other one:
  // hidden from anyone who cannot see money, and not required of them either. The other
  // three fields carry no money and stay visible to whoever is doing the ordering.
  showMoney: boolean;
  // The department decides which of these four are asked at all. The owner's own workbook
  // has never used one shape: a bakery has no gift show and no summer order. Pass the
  // TOP-LEVEL department name; null or an unrecognised one asks everything, so nothing is
  // ever lost by a department this app does not know about yet.
  //
  // Null is also how the page's "add the other questions" button works: it passes null and
  // every question comes back. The button belongs to the page rather than to this block so
  // that one press restores the whole form, not just the four fields below.
  departmentName?: string | null;
  // That department's ticks on the Department fields screen. The page passes the same ones
  // its own fields and its validation use, so this block cannot disagree with the save path.
  choices?: FieldChoices;
}) {
  const asks = (key: string) => asksFor(departmentName, key, { showMoney, choices });
  // Nothing in this block applies to this department, so the heading would sit above an
  // empty space.
  if (!asks("minimum_order") && !asks("summer_order_timeline") && !asks("order_location") && !asks("reorder")) {
    return null;
  }
  const reordered = value.reorder_status === "reordered";
  // A note written when the vendor was marked Reordered, still on file after the status
  // moved on. It is not thrown away silently: the owner asked for that explicitly, so it
  // stays saved and there is a button to clear it on purpose.
  const strandedNote = !reordered && !!value.reorder_comments.trim();

  return (
    <div style={{ display: "grid", gap: 10, borderTop: "1px solid var(--border)", paddingTop: 12 }}>
      <div className="help" style={{ fontWeight: 600 }}>Ordering</div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 10 }}>
        {asks("minimum_order") && (
        <div>
          <label className="label" htmlFor="minimum_order_amount">Minimum order amount</label>
          <input
            id="minimum_order_amount"
            className={fieldInputClass(errors, "minimum_order_amount") + " tabular"}
            type="number"
            step="0.01"
            min="0"
            placeholder="1500.00"
            disabled={value.no_minimum_order}
            value={value.no_minimum_order ? "" : value.minimum_order_amount}
            onChange={(e) => onChange({ minimum_order_amount: e.target.value })}
          />
          <label className="help" style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6 }}>
            <input
              type="checkbox"
              checked={value.no_minimum_order}
              // Ticking the box clears the amount: the two cannot be saved together, and
              // the database check constraint refuses a row that claims both.
              onChange={(e) => onChange({ no_minimum_order: e.target.checked, minimum_order_amount: e.target.checked ? "" : value.minimum_order_amount })}
            />
            No minimum order
          </label>
          <FieldError errors={errors} name="minimum_order_amount" />
        </div>
        )}

        {asks("summer_order_timeline") && (
        <div>
          <label className="label" htmlFor="summer_order_timeline">Summer order timeline</label>
          <input
            id="summer_order_timeline"
            className={fieldInputClass(errors, "summer_order_timeline")}
            maxLength={MAX_SUMMER_TIMELINE}
            placeholder={SUMMER_TIMELINE_PLACEHOLDER}
            value={value.summer_order_timeline}
            onChange={(e) => onChange({ summer_order_timeline: e.target.value })}
          />
          <p className="help" style={{ margin: "4px 0 0" }}>When the summer order should go in, in your own words.</p>
          <FieldError errors={errors} name="summer_order_timeline" />
        </div>
        )}

        {asks("order_location") && (
        <div>
          <span className="label">Location of the order</span>
          <div style={{ display: "flex", flexWrap: "wrap", gap: "4px 12px" }}>
            {ORDER_LOCATIONS.map((loc) => (
              <label key={loc} className="help" style={{ display: "flex", alignItems: "center", gap: 6 }}>
                <input
                  type="checkbox"
                  checked={value.order_location.includes(loc)}
                  onChange={() => {
                    const next = toggleOrderLocation(value.order_location, loc);
                    // Unticking Other clears its text, so orphaned wording cannot reappear
                    // the next time somebody ticks the box.
                    const clearsOther = loc === OTHER_LOCATION && !next.includes(OTHER_LOCATION);
                    onChange({ order_location: next, ...(clearsOther ? { order_location_other: "" } : {}) });
                  }}
                />
                {loc}
              </label>
            ))}
          </div>
          <p className="help" style={{ margin: "4px 0 0" }}>Tick every one that applies.</p>
          {value.order_location.includes(OTHER_LOCATION) && (
            <div style={{ marginTop: 8 }}>
              <label className="label" htmlFor="order_location_other">Where else?</label>
              <input
                id="order_location_other"
                className={fieldInputClass(errors, "order_location_other")}
                maxLength={MAX_LOCATION_OTHER}
                value={value.order_location_other}
                onChange={(e) => onChange({ order_location_other: e.target.value })}
              />
              <FieldError errors={errors} name="order_location_other" />
            </div>
          )}
        </div>
        )}

        {asks("reorder") && (
        <div>
          <label className="label" htmlFor="reorder_status">Reorder status</label>
          <select
            id="reorder_status"
            className={fieldInputClass(errors, "reorder_status")}
            value={value.reorder_status}
            onChange={(e) => onChange({ reorder_status: e.target.value })}
          >
            <option value="">Not said</option>
            {REORDER_STATUS.map((r) => <option key={r.value} value={r.value}>{r.label}</option>)}
          </select>
          <p className="help" style={{ margin: "4px 0 0" }}>Did anything from this vendor need reordering this year?</p>
          {strandedNote && (
            <p className="help" style={{ margin: "6px 0 0" }}>
              An earlier reorder note is still saved.{" "}
              <button
                type="button"
                className="btn-ghost"
                style={{ padding: "2px 8px", fontSize: 12 }}
                onClick={() => onChange({ reorder_comments: "" })}
              >
                Clear it
              </button>
            </p>
          )}
        </div>
        )}
      </div>

      {asks("reorder") && reordered && (
        <div>
          <label className="label" htmlFor="reorder_comments">Reorder comments</label>
          <textarea
            id="reorder_comments"
            className={fieldInputClass(errors, "reorder_comments")}
            rows={2}
            maxLength={MAX_REORDER_COMMENTS}
            placeholder={REORDER_COMMENTS_PLACEHOLDER}
            value={value.reorder_comments}
            onChange={(e) => onChange({ reorder_comments: e.target.value })}
          />
          <p className="help" style={{ margin: "4px 0 0" }}>Required. The date, the quantity, and why.</p>
          <FieldError errors={errors} name="reorder_comments" />
        </div>
      )}
    </div>
  );
}
