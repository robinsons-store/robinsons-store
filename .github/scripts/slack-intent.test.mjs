// Is a Slack message a question to answer in its thread, or a request to build?
//
// Both the 30-minute build sweep and the app's Slack answer route read this one rule. If they
// disagreed, a question could become a pull request, or a build request could get a chat
// reply and never be built. Neither guesses with a model: unclear means asking the person.

import { createRequire } from "node:module";
const require = createRequire(import.meta.url);
const { classifyMessage, ANSWERED, ASKED_WHICH } = require("./slack-intent.cjs");

let pass = 0, fail = 0;
const t = (name, ok, detail = "") => {
  ok ? pass++ : fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}${detail ? "  [" + detail + "]" : ""}`);
};
const kind = (s) => classifyMessage(s).kind;
const is = (s, k) => t(`${JSON.stringify(s)} is ${k}`, kind(s) === k, kind(s));

// An explicit prefix wins over everything else, and is removed before the text goes on.
is("ask: when is the next order due", "question");
is("Ask: add a phone column?", "question");
is("question - which vendors are on net 60", "question");
is("build: why does the price sign print small?", "build");
is("Change: the vendor form needs a phone column", "build");
t("the ask prefix is removed", classifyMessage("ask:  who sells the moccasins").text === "who sells the moccasins", classifyMessage("ask:  who sells the moccasins").text);
t("the build prefix is removed", classifyMessage("build: add a rep phone column").text === "add a rep phone column");
is("ask:", "unclear");
is("build:   ", "unclear");

// A question form.
is("When is the moccasin order due?", "question");
is("which vendors are on net 60", "question");
is("How do I record a payment?", "question");
is("how do I add a vendor", "question");
is("Who is our candle supplier?", "question");
is("Is the pesticide licence still valid?", "question");
is("Do we reorder from Pinecrest this year?", "question");
is("Can I record a payment from my phone?", "question");
is("can you tell me what is overdue", "question");
is("Tell me which vendors ship in May", "question");
is("show me the vendors with no minimum", "question");
is("the summer order timeline for candles?", "question");

// A build request, the way the channel already asks for them.
is("add a phone number column to the vendor form", "build");
is("Please make the save button bigger", "build");
is("fix the overdue page sorting", "build");
is("Can you add a rep phone column?", "build");
is("could we rename Others to Misc", "build");
is("the vendor form needs a phone column", "build");
is("price signs are broken on the phone", "build");

// Unclear: says neither, or both. These get a reply asking which.
is("hello team", "unclear");
is("I need the phone number for Pinecrest", "unclear");
is("add a phone column?", "unclear");
is("why doesn't the price sign print?", "unclear");
is("how about adding a dark mode?", "unclear");
is("can you look into the candles", "unclear");
is("", "unclear");
is("   ", "unclear");
t("non-string input is unclear, never a throw", kind(undefined) === "unclear" && kind(null) === "unclear" && kind(42) === "unclear");

// Whitespace and Slack formatting do not change the answer.
is("  When   is the order\n due?  ", "question");
is("*ask:* who sells candles", "question");

t("reaction names are Slack emoji names", ANSWERED === "speech_balloon" && ASKED_WHICH === "grey_question");

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
