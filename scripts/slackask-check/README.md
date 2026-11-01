# Checking Ask in Slack

Runs the real compiled `/api/slack/events` route with a fake database, a mocked Supabase
client and a mocked `fetch` for Slack and Anthropic. It checks the Slack signature and replay
window, the URL handshake, retries, the claim reaction, that a question is answered in its
thread and a build request is left alone, that unclear messages get the ask-which reply, that
no money reaches the prompt or the channel, the grounding check, store scoping, the store name
read from data, the daily cap, and that model output cannot ping the channel.

No network call leaves the process and no real key or token is used.

## Running it

```sh
npx tsc -p scripts/slackask-check/tsconfig.json
cp scripts/slackask-check/check.js scripts/slackask-check/out/
node scripts/slackask-check/out/check.js
```

A step in `.github/workflows/ci.yml`. The `out/` folder is ignored by the root `.gitignore`.
