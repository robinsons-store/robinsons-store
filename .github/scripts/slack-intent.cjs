// Is a Slack message a question to answer in its thread, or a request to build?
//
// ONE RULE, TWO READERS. The 30-minute build sweep (slack-find-work.mjs) skips anything this
// calls a question or unclear, and the app's Slack answer route (src/app/api/slack/events)
// answers only what this calls a question. If the two disagreed, a question could become a
// pull request, or a build request could get a chat reply and never be built. So both import
// this file rather than each keeping a copy. It is CommonJS because it is the one format the
// runner's bare node, the Next.js build and the compiled check scripts can all load.
//
// It lives under .github/ on purpose: what the automation will build is the automation's own
// limit, and .github/** is tier C (docs/LOOP_ENGINEERING.md). A build request cannot loosen it.
//
// NO MODEL. Words decide, in this order: an explicit prefix ("ask:" or "build:"), then the
// shape of the sentence. Anything that reads as neither, or as both, is "unclear" and the
// person is asked which they meant. A wrong guess costs more than one extra message: a
// question built as a pull request wastes a model run and a reviewer, and a build request
// answered as a question is silently never built.
//
// Pure and dependency-free, so it is tested in node as is (slack-intent.test.mjs).

/** The reaction the answer route puts on a question it has taken. */
const ANSWERED = "speech_balloon";
/** The reaction the answer route puts on a message it asked "which did you mean" about. */
const ASKED_WHICH = "grey_question";

const ASK_PREFIX = /^(ask|question)\s*[*_~]*\s*[:\-]\s*[*_~]*\s*/i;
const BUILD_PREFIX = /^(build|change)\s*[*_~]*\s*[:\-]\s*[*_~]*\s*/i;

// "why doesn't X work" is as likely a bug report as a question; "how about adding" is a
// suggestion. Neither is safe to guess.
const CONCERN = /^(why\s+(does|doesn'?t|does not|is|isn'?t|is not|won'?t|can'?t|did|didn'?t|are|aren'?t)\b|how about\b|what about\b|what if\b)/;
// Asking to be told something.
const ASK_VERBS = new Set(["tell", "show", "give", "remind", "explain", "list", "find"]);
const ASK_ME = /^(please\s+)?(tell|show|give|remind)\s+(me|us)\b/;
// Asking someone else to do something: the verb after "can you" decides which.
const POLITE = /^(can|could|would|will)\s+(you|u|we|someone|somebody|anyone)\s+(please\s+)?([a-z']+)/;
const BUILD_VERBS = new Set([
  "add", "make", "change", "fix", "remove", "build", "create", "update", "rename", "move", "hide",
  "delete", "replace", "put", "turn", "allow", "let", "stop", "include", "drop", "sort", "split",
  "link", "redesign", "implement", "enable", "disable"
]);
const BUILD_START = new RegExp(`^(please\\s+)?(${[...BUILD_VERBS].join("|")})\\b`);
const QUESTION_START = /^(what'?s?|when|where|who|whom|whose|which|why|how|is|are|was|were|am|do|does|did|has|have|had|can|could|should|may|will|would|shall)\b/;
// A statement about the app itself ("the vendor form needs a phone column") has always been a
// build request in this channel, and stays one.
const BUILD_CUE = /\b(column|button|screen|page|form|field|feature|bug|broken|not working|error|crash(es)?|layout|menu|tab|dashboard|sidebar)\b/;

/**
 * @param {unknown} raw the message text with the bot's own mention already removed
 * @returns {{ kind: "question" | "build" | "unclear", text: string }} text is the message
 *   with any prefix removed, whitespace collapsed
 */
function classifyMessage(raw) {
  if (typeof raw !== "string") return { kind: "unclear", text: "" };
  // Slack bold or italics around a prefix ("*ask:*") is formatting, not words.
  let text = raw.replace(/\s+/g, " ").trim().replace(/^[*_~]+/, "");
  if (ASK_PREFIX.test(text)) {
    text = text.replace(ASK_PREFIX, "").trim();
    return { kind: text ? "question" : "unclear", text };
  }
  if (BUILD_PREFIX.test(text)) {
    text = text.replace(BUILD_PREFIX, "").trim();
    return { kind: text ? "build" : "unclear", text };
  }
  if (!text) return { kind: "unclear", text };

  const s = text.toLowerCase().replace(/[’]/g, "'");
  const endsWithQuestionMark = /\?\s*$/.test(s);

  if (CONCERN.test(s)) return { kind: "unclear", text };
  if (ASK_ME.test(s)) return { kind: "question", text };
  const polite = s.match(POLITE);
  if (polite) {
    const verb = polite[4];
    if (ASK_VERBS.has(verb)) return { kind: "question", text };
    if (BUILD_VERBS.has(verb)) return { kind: "build", text };
    return { kind: "unclear", text };
  }
  if (BUILD_START.test(s)) return { kind: endsWithQuestionMark ? "unclear" : "build", text };
  if (QUESTION_START.test(s)) return { kind: "question", text };
  if (BUILD_CUE.test(s)) return { kind: endsWithQuestionMark ? "unclear" : "build", text };
  if (endsWithQuestionMark) return { kind: "question", text };
  return { kind: "unclear", text };
}

/** What the person is told when classifyMessage says unclear. Plain words, no em dashes. */
const ASK_WHICH_TEXT =
  "I could not tell whether this is a question or a change to the app. " +
  "Send it again starting with ask: for an answer here from the store's records, " +
  "or build: for a change to the app.";

module.exports = { classifyMessage, ANSWERED, ASKED_WHICH, ASK_WHICH_TEXT };
