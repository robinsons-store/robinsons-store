// One status card per request, updated in place from asked to live.
//
// The alternative was a new message at each stage, which turns one request into six
// notifications and buries the actual answer. A card that edits itself means the thread under
// somebody's request always shows the current state in one place, and the channel stays
// readable.
//
// HOW IT FINDS ITS OWN CARD, with nothing stored anywhere. The request's Slack timestamp IS
// the thread id, and the autopilot puts that timestamp in the branch name
// (claude/slack-<ts>), so every later workflow can recover the thread from the branch alone.
// Inside the thread the card is found by asking conversations.replies and picking the bot's
// own message carrying MARKER. No database, no artifact passed between workflows, nothing to
// get out of step.
//
// STANDARDS THIS FOLLOWS, each because Slack punishes the alternative:
//   - `text` is always sent alongside `blocks`. Slack uses it for the notification and for
//     screen readers, and a card with no fallback text arrives as an empty ping.
//   - Updating sends blocks every time. chat.update with text alone DELETES the blocks, so a
//     lazy update would silently flatten the card.
//   - A failed update falls back to posting. edit_window_closed and message_not_found are
//     real and recoverable, and losing the update is worse than a second message.
//   - 429 is honoured with its Retry-After. Slack allows one message per second per channel.
//   - Nothing here ever fails the run. The build either happened or it did not; a Slack
//     outage must not turn finished work into a red run somebody re-runs.

import { existsSync, readFileSync } from "node:fs";

const TOKEN = (process.env.SLACK_BOT_TOKEN || "").trim();
const CHANNEL = (process.env.SLACK_REQUEST_CHANNEL || "").trim();
const THREAD_TS = (process.env.THREAD_TS || "").trim();
const STAGE = (process.env.STAGE || "").trim();
const REQUEST = (process.env.REQUEST || "").trim();
const URL_ = (process.env.LINK || "").trim();
const NOTE = (process.env.NOTE || "").trim();
// Optional. A file whose text is posted once as a plain reply under the card: the reviewers'
// reports. Kept out of the card so the card stays a status, not a wall of findings.
const DETAIL_FILE = (process.env.DETAIL_FILE || "").trim();

/** How the card knows which message is its own. Invisible enough not to read as clutter. */
export const MARKER = "Request status";

// The stages a request passes through, in order, in the owner's words rather than ours.
// `reaction` is what shows on the original message so the channel reads at a glance.
export const STAGES = {
  picked_up: { icon: "👀", title: "Working on it", reaction: "eyes" },
  built: { icon: "📝", title: "Ready for someone to look", reaction: "eyes" },
  checks_passed: { icon: "☑️", title: "Checks passed, waiting to be merged", reaction: "eyes" },
  checks_failed: { icon: "🔴", title: "Checks failed", reaction: "warning" },
  merged: { icon: "🚀", title: "Merged, going out to the store", reaction: "white_check_mark" },
  live: { icon: "🟢", title: "Live on the store's site", reaction: "white_check_mark" },
  stopped: { icon: "✋", title: "Stopped, this one needs a person", reaction: "warning" }
};

const shorten = (s, n) => {
  const t = (s || "").replace(/\s+/g, " ").trim();
  return t.length > n ? t.slice(0, n - 1) + "…" : t;
};

/**
 * The card for one stage.
 *
 * Pure, so what the store's people actually read can be checked without a Slack workspace.
 * Returns both halves on purpose: `text` is the notification and the screen-reader line,
 * `blocks` is what is drawn.
 */
export function card({ stage, request = "", link = "", note = "" }) {
  const s = STAGES[stage] || STAGES.picked_up;
  const blocks = [
    {
      type: "section",
      text: { type: "mrkdwn", text: `${s.icon}  *${s.title}*` }
    }
  ];
  if (request) {
    blocks.push({
      type: "context",
      elements: [{ type: "mrkdwn", text: `_${shorten(request, 150)}_` }]
    });
  }
  if (note) {
    blocks.push({ type: "section", text: { type: "mrkdwn", text: shorten(note, 2500) } });
  }
  if (link) {
    blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: `<${link}|Open it>` }] });
  }
  // The marker rides in a context block: present, findable, and not something anyone reads
  // as a message. Slack caps a message at 50 blocks; this is never near it.
  blocks.push({ type: "context", elements: [{ type: "mrkdwn", text: MARKER }] });
  return { text: `${s.title}${note ? ": " + shorten(note, 200) : ""} (${MARKER})`, blocks };
}

/**
 * The bot's own status card among a thread's replies, or null.
 *
 * Anything else in the thread is a person talking, and editing somebody's message would be
 * both wrong and impossible.
 */
export function findCard(messages) {
  for (const m of messages || []) {
    if (!m || !m.bot_id) continue;
    const inText = typeof m.text === "string" && m.text.includes(MARKER);
    const inBlocks = JSON.stringify(m.blocks || []).includes(MARKER);
    if (inText || inBlocks) return m;
  }
  return null;
}

/**
 * The Slack timestamp a branch was built for, or null.
 *
 * This is the join that lets a workflow triggered by a pull request find the Slack thread
 * that asked for it, without anything being stored between the two.
 */
export function tsFromBranch(branch) {
  const m = /(?:^|\/)slack-(\d{10}\.\d{6})$/.exec((branch || "").trim());
  return m ? m[1] : null;
}

async function slack(method, body, { retries = 2 } = {}) {
  for (let attempt = 0; attempt <= retries; attempt++) {
    const res = await fetch(`https://slack.com/api/${method}`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${TOKEN}`,
        "content-type": "application/json; charset=utf-8",
        "user-agent": "robinsons-store-autopilot"
      },
      body: JSON.stringify(body)
    });
    if (res.status === 429) {
      // Slack says exactly how long to wait. Guessing instead is how you get rate limited
      // twice.
      const wait = Number(res.headers.get("retry-after") || 1);
      console.log(`Rate limited by Slack, waiting ${wait}s.`);
      await new Promise((r) => setTimeout(r, wait * 1000));
      continue;
    }
    const data = await res.json();
    // SAY WHAT HAPPENED, EVERY TIME, SUCCESS INCLUDED.
    //
    // This used to log only on failure, which meant a successful run said nothing about what
    // it had actually posted or where. When somebody reported seeing no reply, there was no
    // way to tell from the log whether the message went to the wrong channel, went nowhere,
    // or went exactly where it should and was simply missed. Silence on success is not
    // efficiency, it is a missing witness.
    //
    // Slack returns the channel and timestamp it wrote to. Printing them turns "it says it
    // worked" into "here is the message id, go and look at it".
    const expected = data.error === "already_reacted" || data.error === "no_reaction";
    if (data.ok) {
      const where = data.channel ? ` channel=${data.channel}` : "";
      const when = data.ts ? ` ts=${data.ts}` : "";
      console.log(`Slack ${method}: ok${where}${when}`);
    } else if (expected) {
      console.log(`Slack ${method}: ${data.error} (normal, nothing to do)`);
    } else {
      console.log(`::warning::Slack ${method} FAILED: ${data.error}`);
    }
    return data;
  }
  return { ok: false, error: "rate_limited" };
}

async function get(method, params) {
  const url = `https://slack.com/api/${method}?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${TOKEN}`, "user-agent": "robinsons-store-autopilot" }
  });
  const data = await res.json();
  if (data.ok) {
    const n = Array.isArray(data.messages) ? ` (${data.messages.length} messages in the thread)` : "";
    console.log(`Slack ${method}: ok${n}`);
  } else {
    console.log(`::warning::Slack ${method} FAILED: ${data.error}`);
  }
  return data;
}

/** The reaction on the ORIGINAL message, so the channel reads without opening threads. */
async function setReaction(want) {
  const others = [...new Set(Object.values(STAGES).map((s) => s.reaction))].filter((r) => r !== want);
  for (const r of others) {
    // no_reaction just means it was not there, which is the normal case.
    await slack("reactions.remove", { channel: CHANNEL, timestamp: THREAD_TS, name: r });
  }
  await slack("reactions.add", { channel: CHANNEL, timestamp: THREAD_TS, name: want });
}

async function main() {
  if (!TOKEN || !CHANNEL || !THREAD_TS || !STAGE) {
    console.log("Slack status: not configured, or nothing to report. Saying nothing.");
    return;
  }
  const { text, blocks } = card({ stage: STAGE, request: REQUEST, link: URL_, note: NOTE });
  const thread = await get("conversations.replies", { channel: CHANNEL, ts: THREAD_TS, limit: "50" });
  const existing = findCard(thread.messages);

  if (existing) {
    const updated = await slack("chat.update", { channel: CHANNEL, ts: existing.ts, text, blocks });
    if (!updated.ok) {
      // edit_window_closed and message_not_found are both recoverable, and a lost update is
      // worse than one extra message in a thread.
      console.log("Could not update the card, posting a fresh one instead.");
      await slack("chat.postMessage", { channel: CHANNEL, thread_ts: THREAD_TS, text, blocks });
    }
  } else {
    await slack("chat.postMessage", { channel: CHANNEL, thread_ts: THREAD_TS, text, blocks });
  }
  const want = (STAGES[STAGE] || STAGES.picked_up).reaction;
  await setReaction(want);
  const detail = DETAIL_FILE && existsSync(DETAIL_FILE) ? readFileSync(DETAIL_FILE, "utf8").trim() : "";
  if (detail) {
    // Slack stops rendering a single message well somewhere past 4,000 characters.
    const text = detail.length > 3900 ? detail.slice(0, 3899) + "…" : detail;
    await slack("chat.postMessage", { channel: CHANNEL, thread_ts: THREAD_TS, text });
  }
  // Names the channel and the message, so anybody reading this log can open exactly the
  // thing it claims to have written and see for themselves.
  console.log(`Status is now "${STAGE}" on ${CHANNEL} thread ${THREAD_TS}, reaction :${want}:`);
}

if (process.argv[1] && process.argv[1].endsWith("slack-status.mjs")) {
  await main();
}
