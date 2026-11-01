// Where a stored file goes in the documents bucket: its store's folder, then a folder for its
// kind. The storage rules (supabase/auth_setup.sql 3f) read both folders to decide who may save
// and open the file, so a file saved anywhere else is refused once login is enforced.
//   invoices   Capture's invoice photos, opened by lead, manager and owner
//   feedback   Suggestions' screenshots and voice notes, opened by those three and the author
//   imports    the archive of imported workbooks, opened by owner and manager
export type DocumentKind = "invoices" | "feedback" | "imports";

export function documentPath(storeId: string, kind: DocumentKind, ...rest: string[]): string {
  return [storeId, kind, ...rest].join("/");
}
