import { NextRequest, NextResponse } from "next/server";
import { handleMention, runAfterResponse, serverDb, slackAskConfig, verifySlackSignature } from "@/lib/slackAsk";

export const runtime = "nodejs";
// Montreal, next to the Toronto database, like /api/ask.
export const preferredRegion = "yul1";
export const maxDuration = 60;

// Slack's Events API calls this when somebody names the bot in a channel it is in. A question
// is answered in the message's thread from the store's records; everything else is left to the
// 30-minute build sweep (src/lib/slackAsk.ts, docs/adr/ADR-006).
//
// Every request must carry Slack's signature. Without SLACK_SIGNING_SECRET nothing is accepted,
// not even Slack's one-time URL check, so the route is inert until it is set.
export async function POST(req: NextRequest) {
  const cfg = slackAskConfig();
  if (!cfg.signingSecret) {
    return NextResponse.json({ error: "Slack questions are not set up." }, { status: 503 });
  }
  const raw = await req.text();
  const ok = verifySlackSignature(raw, req.headers.get("x-slack-request-timestamp"), req.headers.get("x-slack-signature"), cfg.signingSecret);
  if (!ok) return NextResponse.json({ error: "bad signature" }, { status: 401 });

  let payload: any;
  try {
    payload = JSON.parse(raw);
  } catch {
    return NextResponse.json({ error: "bad body" }, { status: 400 });
  }
  if (payload?.type === "url_verification") {
    return NextResponse.json({ challenge: String(payload.challenge || "") });
  }
  // Slack retries a delivery it thinks timed out. The first delivery owns the message, so a
  // retry is acknowledged and not worked; the reaction claim in handleMention backs this up.
  if (req.headers.get("x-slack-retry-num")) return NextResponse.json({ ok: true });

  if (payload?.type === "event_callback" && payload.event?.type === "app_mention") {
    const botUserId = String(payload.authorizations?.[0]?.user_id || "");
    const work = handleMention(payload.event, botUserId, cfg, serverDb()).catch((err) => {
      console.error(JSON.stringify({ slack_ask: "crashed", detail: String(err?.message || err).slice(0, 200) }));
    });
    if (!runAfterResponse(work)) await work;
  }
  return NextResponse.json({ ok: true });
}
