import { supabase } from "@/lib/supabaseClient";
import { FIELD_CHOICE_SELECT, type FieldChoice } from "@/lib/fieldChoices";

// The Department fields screen's ticks for one store.
//
// The forms call this and carry on with the code lists when it fails, because a vendor or
// an invoice must always be recordable: a missing table (department_field.sql not run yet)
// or a refused read leaves `rows` empty, and an empty list means "ask what the code says".
// `missing` and `error` are for the settings screen, which has to say why it cannot save.
export async function loadFieldChoices(
  storeId: string | null | undefined
): Promise<{ rows: FieldChoice[]; missing: boolean; error: string | null }> {
  if (!storeId) return { rows: [], missing: false, error: null };
  try {
    const { data, error } = await supabase
      .from("department_field")
      .select(FIELD_CHOICE_SELECT)
      .eq("store_id", storeId);
    if (error) {
      // Only a table that is not there counts as "not set up". A refused read or a database
      // that does not answer is reported as the error it is.
      const missing = error.code === "42P01" || error.code === "PGRST205" || /does not exist|could not find the table/i.test(error.message || "");
      return { rows: [], missing, error: error.message };
    }
    return { rows: (data as FieldChoice[]) || [], missing: false, error: null };
  } catch (e: any) {
    return { rows: [], missing: false, error: e?.message || "Could not read the department fields." };
  }
}
