import { supabase, DOCUMENTS_BUCKET } from "@/lib/supabaseClient";

// Signed URLs expire; an hour comfortably outlives any screen session without leaving
// long-lived links in browser history or forwarded screenshots.
const SIGNED_URL_TTL_SECONDS = 60 * 60;

// Resolve stored-document paths to viewable URLs. Prefers signed, expiring URLs so a
// production (private) bucket never exposes a permanent public link to an invoice photo.
// A file the member may not open gets no URL, so the screen shows no picture rather than a
// broken one. Only when the signing request itself fails does it fall back to public URLs,
// which serve the open demo bucket, so demo thumbnails never break.
export async function docUrls(paths: Array<string | null>): Promise<Map<string, string>> {
  const map = new Map<string, string>();
  const wanted = Array.from(new Set(paths.filter((p): p is string => Boolean(p))));
  if (!wanted.length) return map;

  const { data, error } = await supabase.storage.from(DOCUMENTS_BUCKET).createSignedUrls(wanted, SIGNED_URL_TTL_SECONDS);
  for (const entry of data || []) {
    if (entry.path && entry.signedUrl) map.set(entry.path, entry.signedUrl);
  }
  if (!error) return map;
  for (const p of wanted) {
    if (map.has(p)) continue;
    const { data: pub } = supabase.storage.from(DOCUMENTS_BUCKET).getPublicUrl(p);
    if (pub?.publicUrl) map.set(p, pub.publicUrl);
  }
  return map;
}
