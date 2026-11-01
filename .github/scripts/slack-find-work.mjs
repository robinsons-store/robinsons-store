// Finds the next request to build, in a Slack channel.
//
// This is the intake loop the Jira autopilot used to be, moved to where the work is actually
// asked for. Somebody types what they want in the requests channel; this picks the oldest one
// nobody has started yet and hands it to a build.
//
// STATE IS A REACTION, not a database and not a marker buried in text. The bot adds :eyes:
// when it picks a message up, :white_check_mark: when it finishes, and :warning: when it
// stops and needs a person. The state of every request is therefore visible to anyone
// scrolling the channel, it survives this script being rewritten, and it costs no storage.
// A message carrying ANY of those three is spoken for and is skipped, which is what stops
// the loop working the same request forever. See CLAIMED below: every one of them, plus the two the answer route sets.
//
// WHAT IS WORK: a message that NAMES THE BOT. The channel this watches is the store's
// ordinary channel, where people say hello and talk about the weekend, so an unaddressed
// message is not a request. Without that rule "Hello Robinson Tech Team" becomes a pull
// request. Naming the bot is the Slack-native way to address something and cannot be typed
// by accident. A channel that exists only for requests can set SLACK_REQUIRE_MENTION=false.
//
// QUESTIONS ARE NOT WORK. A message that slack-intent.cjs calls a question is answered in its
// thread by the app's Slack answer route within seconds, and one it calls unclear gets a
// reply asking which was meant. Only "build" reaches this loop. The same file decides for
// both, so a question cannot also become a pull request (docs/adr/ADR-006).
//
// WHAT IS NOT WORK: anything the bot itself said, anything from another app, and thread
// replies. Replies are skipped on purpose for now: a thread under a finished request is
// usually people talking about it, and treating every comment as a new build is how an
// intake loop turns a conversation into ten pull requests.
//
// Silent and empty-handed when SLACK_BOT_TOKEN or SLACK_REQUEST_CHANNEL is unset, so the
// workflow is safe to merge before either exists.

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { classifyMessage, ANSWERED, ASKED_WHICH } = require("./slack-intent.cjs");

const TOKEN = (process.env.SLACK_BOT_TOKEN || "").trim();
const CHANNEL = (process.env.SLACK_REQUEST_CHANNEL || "").trim();
const ONE_TS = (process.env.ONE_MESSAGE_TS || "").trim();
// Default ON. This watches the store's ordinary channel, so silence is the safe answer to
// "was this meant for me". Only set false for a channel that exists solely for requests.
const REQUIRE_MENTION = (process.env.SLACK_REQUIRE_MENTION || "true").trim() !== "false";
const HOW_MANY = 25;

/** Reactions that mean somebody, or something, already has this one. */
export const PICKED_UP = "eyes";
export const DONE = "white_check_mark";
/** Tried, and it needs a person. Set by the status card when a build stops or fails. */
export const STOPPED = "warning";
/** Set by the app's Slack answer route: answered as a question, or asked which was meant. */
export { ANSWERED, ASKED_WHICH };

/**
 * Every reaction that means "this has been seen". ALL of them must be skipped.
 *
 * The first real run proved why this is a list and not two constants. A build failed, the
 * card correctly set a warning on the message, and the warning was not in the skip list, so
 * the next sweep would have picked the same request up, failed the same way, and done it
 * again every thirty minutes forever. A request that stopped needs a person, not a retry
 * loop: re-running it unattended just fails again, and each failure costs a model run.
 *
 * To retry one on purpose, take the reaction off the message. That is a deliberate act by
 * somebody who has looked at why it stopped.
 */
export const CLAIMED = [PICKED_UP, DONE, STOPPED, ANSWERED, ASKED_WHICH];

/**
 * The oldest message that is a request nobody has started, or null.
 *
 * Pure, so the rule that decides what the automation will go and build can be tested without
 * a Slack workspace. This is the decision worth testing: getting it wrong either means
 * ignoring somebody's request forever, or building the same one on a loop.
 */
export function pickWork(messages, opts = {}) {
  const { onlyTs = "", requireMention = true, botUserId = "" } = opts;
  // The channel this watches is the store's ordinary channel, where people say hello and
  // talk about the weekend. Without an explicit signal, "Hello Robinson Tech Team" is a
  // build request, and the automation would open a pull request for it.
  //
  // So a message only counts when it names the bot. That is the Slack-native way to address
  // something, it cannot be typed by accident, and it means the channel stays a channel.
  // A dedicated requests channel can turn this off with SLACK_REQUIRE_MENTION=false.
  const mention = botUserId ? `<@${botUserId}>` : "";
  // conversations.history returns newest first. Oldest-first means the person who asked
  // first is served first, which is the behaviour anybody would expect of a queue.
  const oldestFirst = [...(messages || [])].reverse();
  for (const m of oldestFirst) {
    if (!m || typeof m.text !== "string" || !m.text.trim()) continue;
    // Anything posted by an app, including this automation's own replies. Without this the
    // bot reads its own "working on it" message as a new request.
    if (m.bot_id || m.subtype) continue;
    // A reply inside a thread. thread_ts equals ts on the parent message itself.
    if (m.thread_ts && m.thread_ts !== m.ts) continue;
    const reactions = (m.reactions || []).map((r) => r.name);
    if (reactions.some((r) => CLAIMED.includes(r))) continue;
    if (onlyTs && m.ts !== onlyTs) continue;
    // Fails CLOSED: asked to require a mention but given no bot id, nothing is work. The
    // alternative is treating every message in the store's channel as a build request
    // because one API call did not answer.
    if (requireMention && (!mention || !m.text.includes(mention))) continue;
    // The bot's name is addressing, not part of the request. "@bot add a phone column"
    // should reach the model as "add a phone column".
    const addressedText = mention ? m.text.split(mention).join(" ") : m.text;
    // Questions and unclear messages belong to the answer route, never to a build. The
    // prefix ("build:") is addressing too, so the model gets the request alone.
    const intent = classifyMessage(addressedText);
    if (intent.kind !== "build" || !intent.text) continue;
    return { ...m, text: intent.text };
  }
  return null;
}

async function slack(method, params) {
  const url = `https://slack.com/api/${method}?${new URLSearchParams(params)}`;
  const res = await fetch(url, {
    headers: { authorization: `Bearer ${TOKEN}`, "user-agent": "robinsons-store-autopilot" }
  });
  const data = await res.json();
  if (!data.ok) throw new Error(`${method} failed: ${data.error}`);
  // Same reasoning as slack-status.mjs: a run that finds nothing should say what it looked
  // at, or "nothing waiting" is indistinguishable from "looked in the wrong place".
  if (method === "conversations.history") {
    console.log(`Slack ${method}: ok, ${Array.isArray(data.messages) ? data.messages.length : 0} messages read from ${CHANNEL}`);
  } else if (method === "auth.test") {
    console.log(`Slack auth.test: ok, I am ${data.user || "?"} (${data.user_id || "?"}) in ${data.team || "?"}`);
  }
  return data;
}

function out(name, value) {
  const file = process.env.GITHUB_OUTPUT;
  if (!file) return;
  const fs = require("node:fs");
  // Multi-line values need the heredoc form or the runner truncates at the first newline,
  // and a request typed in Slack is very often more than one line.
  const token = `EOF_${Math.abs(name.length * 7919)}`;
  fs.appendFileSync(file, `${name}<<${token}\n${value}\n${token}\n`);
}

async function main() {
  if (!TOKEN || !CHANNEL) {
    console.log("Slack autopilot is not configured yet. See docs/SLACK_AUTOPILOT.md.");
    out("found", "false");
    return;
  }
  // Who the bot is, so it can tell when it is being spoken to. One free call per sweep.
  let botUserId = "";
  try {
    botUserId = (await slack("auth.test", {})).user_id || "";
  } catch (e) {
    console.log(`Could not work out who I am: ${e.message}`);
  }
  const history = await slack("conversations.history", { channel: CHANNEL, limit: String(HOW_MANY) });
  const work = pickWork(history.messages, { onlyTs: ONE_TS, requireMention: REQUIRE_MENTION, botUserId });
  if (!work) {
    console.log("Nothing waiting.");
    out("found", "false");
    return;
  }
  // Claimed before the build starts, not after. A run that dies halfway still leaves the
  // request marked as taken, which is the safe direction: a human sees :eyes: with no reply
  // and knows to look, whereas an unclaimed request would be picked up again on the next
  // sweep and built twice.
  await slack("reactions.add", { channel: CHANNEL, timestamp: work.ts, name: PICKED_UP });
  console.log(`Picked up the message at ${work.ts}.`);
  out("found", "true");
  out("ts", work.ts);
  out("request", work.text);
}


if (process.argv[1] && process.argv[1].endsWith("slack-find-work.mjs")) {
  await main();
}
