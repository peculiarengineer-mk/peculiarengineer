---
title: 'Running Claude Code on a Kimi Code subscription without breaking your Anthropic login'
description: 'Point Claude Code at Kimi K3 through a separate launcher so both subscriptions stay usable in different terminal tabs: the right endpoint, the model ID Kimi''s own guide gets wrong, and the 401 that blames your API key when the key is perfectly fine.'
pubDate: 'Aug 12 2026'
heroImage: '../../assets/claude-code-kimi-hero.png'
tags: ['ClaudeCode', 'Kimi', 'MoonshotAI', 'LLM', 'AI', 'CLI', 'zsh', 'macOS']
---

I pay for Claude and I pay for Kimi Code, and I want both available from the same terminal without choosing one in the morning. Kimi publishes a guide for pointing Claude Code at their endpoint. It tells you to export a handful of environment variables in your shell profile, which works, and which also routes every Claude Code session on the machine to Kimi from then on. Your Anthropic subscription sits there unused while you wonder why Opus got worse.

The fix is boring: a second settings file and a shell function that loads it. Ten minutes. The part worth writing down is that the headline model ID in Kimi's guide is rejected by Kimi's own endpoint, and it's rejected with a `401` that says your credentials are bad. I lost time auditing a key that was never the problem. Then I found a second version of the same lie living in `~/.claude.json`, and that one is better disguised.

> **TL;DR.** Put the Kimi config in `~/.claude/kimi-settings.json` rather than `~/.claude/settings.json`, then add a `claude-kimi()` function that runs `claude --settings "$HOME/.claude/kimi-settings.json" "$@"`. Base URL is `https://api.kimi.com/coding/` with the key in `ANTHROPIC_API_KEY`. The model is `k3`, not `k3[1m]`, whatever the docs say. Set `CLAUDE_CODE_MAX_CONTEXT_TOKENS` to `1048576` because a bare `k3` gives Claude Code no window to infer. If interactive mode 401s while `curl` and `claude -p` both work, your key is in the rejected list in `~/.claude.json` and no amount of key rotation will fix it.

## Contents

- [Kimi has two API surfaces and only one of them is yours](#kimi-has-two-api-surfaces-and-only-one-of-them-is-yours)
- [1. Get a key](#1-get-a-key)
- [2. Write the settings file](#2-write-the-settings-file)
- [3. The model ID in the official guide does not work](#3-the-model-id-in-the-official-guide-does-not-work)
- [4. Add the launcher](#4-add-the-launcher)
- [5. Test the endpoint before you test Claude Code](#5-test-the-endpoint-before-you-test-claude-code)
- [6. Confirm both lanes](#6-confirm-both-lanes)
- [The rejected key list, which is the worst one](#the-rejected-key-list-which-is-the-worst-one)
- [Living with the request quota](#living-with-the-request-quota)
- [Gotchas worth knowing](#gotchas-worth-knowing)
- [Quick reference](#quick-reference)
- [Backing it out](#backing-it-out)

## Kimi has two API surfaces and only one of them is yours

This is the distinction that decides whether anything else in this post works, so get it straight first.

A **Kimi Code subscription** authenticates against `https://api.kimi.com/coding/`, using `ANTHROPIC_API_KEY`, which is sent as an `x-api-key` header. Model IDs are short: `k3`, `k3-256k`, `kimi-for-coding`.

The **Moonshot platform** is a different thing. It lives at `https://api.moonshot.ai/anthropic`, uses `ANTHROPIC_AUTH_TOKEN` as a bearer token, and wants model IDs with a `kimi-` prefix. That is the surface you pay for by the token. It's also what most of the search results describe.

They are different products. Your subscription key will not authenticate against the platform host, and the failure is a flat `401` that tells you nothing about why. If you follow the popular guide with a subscription key, this is where you stop.

## 1. Get a key

Go to [kimi.com/code/console](https://www.kimi.com/code/console) and create one.

Two things worth knowing before you click. You get at most five keys, and each is shown exactly once, at creation. There is no reveal button later, only delete and make a new one. Copy it somewhere before you close the dialog.

## 2. Write the settings file

Create it empty and lock it down before the key goes anywhere near it, so it's never briefly readable by anything else on the machine:

```bash
touch ~/.claude/kimi-settings.json
chmod 600 ~/.claude/kimi-settings.json
```

Then paste this in, replacing the placeholder:

```json
{
  "env": {
    "ANTHROPIC_BASE_URL": "https://api.kimi.com/coding/",
    "ANTHROPIC_API_KEY": "PASTE_YOUR_KIMI_CODE_KEY_HERE",

    "ANTHROPIC_MODEL": "k3",
    "ANTHROPIC_DEFAULT_OPUS_MODEL": "k3",
    "ANTHROPIC_DEFAULT_SONNET_MODEL": "k3",
    "ANTHROPIC_DEFAULT_FABLE_MODEL": "k3",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL": "kimi-for-coding",
    "CLAUDE_CODE_SUBAGENT_MODEL": "k3",

    "ANTHROPIC_DEFAULT_OPUS_MODEL_NAME": "Kimi K3",
    "ANTHROPIC_DEFAULT_OPUS_MODEL_DESCRIPTION": "Kimi Code K3 (1M context)",
    "ANTHROPIC_DEFAULT_HAIKU_MODEL_NAME": "Kimi K2.7 Code",

    "CLAUDE_CODE_MAX_CONTEXT_TOKENS": "1048576",
    "CLAUDE_CODE_AUTO_COMPACT_WINDOW": "950000",
    "CLAUDE_CODE_EFFORT_LEVEL": "high"
  }
}
```

Check the permissions again after you save. Some editors write a temp file and rename it into place, which lands at your umask and quietly undoes the `chmod` you just ran:

```bash
ls -l ~/.claude/kimi-settings.json   # want -rw-------
```

There are six model slots, not one, and that's deliberate. Claude Code uses the haiku slot for background chores like naming your conversation, and pointing those at K3 spends your quota on titles. `kimi-for-coding` is ungated on every tier, so it's the safe floor for throwaway work.

The two window numbers are the part people get wrong. `CLAUDE_CODE_AUTO_COMPACT_WINDOW` is a trigger threshold, not a statement of how much context you have, so it needs headroom underneath the real window. Kimi's guide sets it to `1048576`, which is out of range anyway: Claude Code accepts `100000` to `1000000`. It also has to be a plain integer. Write `500k` and it parses as `500` and clamps to the floor, and you'll be wondering why compaction fires roughly immediately.

## 3. The model ID in the official guide does not work

Kimi's own Claude Code guide tells you to set `ANTHROPIC_MODEL` to `k3[1m]`. Their endpoint rejects it. I sent each ID at `api.kimi.com/coding/` with curl, and here's what came back:

| Model ID | HTTP | What comes back |
| --- | --- | --- |
| `k3` | 200 | Works. Main conversation model |
| `k3-256k` | 200 | Works. Smaller window variant |
| `kimi-for-coding` | 200 | Works. Ungated on all tiers |
| `k3[1m]` | 401 | `Your model id does not exist, recognized as other:k3[1m]. Please set model id as k3.` |

Read that `401` again. It's an `authentication_error`, and the message body is about a model ID. Nothing in the status code suggests you should go looking at your model configuration, so you go and audit your key instead, and your key is fine. It cost me more time than anything else in this setup.

Use the bare `k3`. It is natively a 1M context model and the suffix was never what unlocked that.

There is a consequence though, and it's why `CLAUDE_CODE_MAX_CONTEXT_TOKENS` is in the config above rather than being decorative. With a `[1m]` style ID, Claude Code can read the window size out of the name. A bare `k3` tells it nothing, so it falls back to a conservative guess and starts compacting your session far earlier than it needs to. Declaring the real number fixes that.

**If you're on `k3-256k` instead**, change `ANTHROPIC_MODEL`, `ANTHROPIC_DEFAULT_OPUS_MODEL`, `ANTHROPIC_DEFAULT_SONNET_MODEL`, `ANTHROPIC_DEFAULT_FABLE_MODEL` and `CLAUDE_CODE_SUBAGENT_MODEL` to `k3-256k`, leave the haiku slot alone, and set `CLAUDE_CODE_MAX_CONTEXT_TOKENS` to `262144` with the compact window at `240000`. I'm listing all five by name on purpose. Forget `CLAUDE_CODE_SUBAGENT_MODEL` and your subagents keep running on the 1M model while you believe you moved everything down.

## 4. Add the launcher

```bash
cat >> ~/.zshrc <<'EOF'

# Claude Code against the Kimi Code subscription.
# Plain `claude` is unaffected and keeps the claude.ai subscription.
claude-kimi() {
  command claude --settings "$HOME/.claude/kimi-settings.json" "$@"
}
EOF

exec zsh
```

Use `$HOME` rather than `~` so the path resolves however the function gets called. The `--settings` flag layers that file on top of your normal user config, and because `~/.claude/settings.json` has no `env` block on my machine, there's nothing for it to collide with. Check yours before you assume the same:

```bash
python3 -c "import json,os;print('env' in json.load(open(os.path.expanduser('~/.claude/settings.json'))))"
```

If that prints `True`, whatever is in there will fight with the Kimi config, and you should move it out first.

## 5. Test the endpoint before you test Claude Code

Confirm the key, host and model at the HTTP layer while there's only one thing that can be wrong. Then any failure in the next step is a Claude Code problem, and you already know it isn't credentials.

```bash
read -rs "KEY?Kimi Code key: "; echo

curl -sS https://api.kimi.com/coding/v1/messages \
  -H "x-api-key: $KEY" \
  -H "anthropic-version: 2023-06-01" \
  -H "content-type: application/json" \
  -d '{"model":"k3","max_tokens":16,
       "messages":[{"role":"user","content":"Say OK."}]}'
```

You want JSON with a `content` array in it. `read -rs` keeps the key out of your shell history, and note the header is `x-api-key` rather than a bearer token, which is the practical tell that you're on the subscription surface and not the platform one. Run `unset KEY` when you're finished with it.

Two notes on this. If you get a `404` on everything, your base URL includes the full path and Claude Code is appending `v1/messages` to something that already ends in it. Set the base, keep the trailing slash, nothing more.

And `k3` needs the Moderato tier or above. If it comes back with a `401` naming the model and linking an upgrade page, that's tier gating rather than a bad ID, and you want every slot on `kimi-for-coding` instead. Both failures arrive as `authentication_error`, so the status code can't tell them apart and the message body is the only thing that can.

A curl probe here is fine, by the way. Kimi's terms require tools to identify themselves honestly, and curl does. Forging a `User-Agent` to make one client look like another is the thing they take issue with.

## 6. Confirm both lanes

In one tab:

```bash
claude-kimi
# then, inside the session:
/status
```

`/status` should show `https://api.kimi.com/coding/` and a Kimi model. Send it a real message so you've exercised the round trip rather than just the startup path.

Then open a **separate** tab and run plain `claude`, and check `/status` there too. This is the whole point of the exercise, so actually do it. Verifying that the isolation held is more important after a Claude Code upgrade than it is today: model variable precedence changed in v2.1.195, and the next release that touches settings layering is not going to send you a note.

Expect one prompt on the first interactive `claude-kimi`, asking whether to use the detected API key. **Say yes.**

## The rejected key list, which is the worst one

Answer no to that prompt, deliberately or with a stray keypress on a dialog you weren't expecting, and Claude Code writes the key's last 20 characters into a rejected list in `~/.claude.json`. From then on, interactive sessions refuse it and tell you this:

```
Please run /login · API Error: 401
```

Here is why this one is genuinely nasty. None of the obvious diagnostics consult that list, so every one of them clears the key. I had `curl` returning 200, `claude -p "hello"` returning 200, a config file that was correct, an endpoint that was up, and a key that was valid. Only interactive mode failed, and it failed with a message pointing at my credentials.

**Do not run `/login` here.** The error asks you to, and it's wrong, and running it inside the Kimi lane is the one action in this whole setup that can disturb the Anthropic credential you were trying to protect.

Check for it instead:

```bash
python3 -c "
import json,os
d=json.load(open(os.path.expanduser('~/.claude.json')))
print(json.dumps(d.get('customApiKeyResponses',{}),indent=2))"
```

If your key's tail is sitting under `rejected`, move it across:

```bash
python3 - <<'PY'
import json, os, shutil
p = os.path.expanduser('~/.claude.json')
shutil.copy(p, p + '.bak-apikey')
d = json.load(open(p))
key = json.load(open(os.path.expanduser(
    '~/.claude/kimi-settings.json')))['env']['ANTHROPIC_API_KEY']
tail = key[-20:]
r = d.setdefault('customApiKeyResponses', {'approved': [], 'rejected': []})
r['rejected'] = [x for x in r.get('rejected', []) if x != tail]
if tail not in r.setdefault('approved', []):
    r['approved'].append(tail)
json.dump(d, open(p, 'w'), indent=2)
print('approved:', r['approved'])
PY
```

Close every Claude Code session before you run that, since `~/.claude.json` is live state and you don't want two writers. Then start fresh, because the list is read at launch. If the prompt appears again, accept it this time.

While we're on things read at launch: settings are too. Editing `kimi-settings.json` does nothing to a session that's already open, and a session started before your last edit will keep sending the old model ID and keep 401ing on every turn, with an error that once again blames the key. To find stale ones:

```bash
ps -eo pid,lstart,command | grep kimi-settings
stat -f '%Sm' ~/.claude/kimi-settings.json
```

Compare the two and kill anything older than the file.

## Living with the request quota

This is the part that changes how you work, and it isn't the setup. Your plan is metered in **requests per rolling five hour window**, somewhere around 300 to 1,200 depending on tier, with up to 30 running at once. Tokens are not the constraint. Round trips are.

Claude Code burns through that faster than a chat client does, because one instruction can fan out into a lot of requests. Subagents are the big one, since each agent runs its own request loop and several can run concurrently, so a single "go investigate this" can cost dozens. Workflows and ultracode fan out hard enough to approach the 30 concurrent ceiling on their own, which is reason enough to keep them off this lane. Raising the effort level means more tool calls per turn, and every tool call is a request. Background chores are small but constant, which is exactly why the haiku slot points at `kimi-for-coding` rather than K3.

One quirk on effort. Kimi Code collapses Claude Code's five effort levels onto K3's three, so `medium` and `xhigh` land in the same place as their neighbors. Tune between `low`, `high` and `max` and don't expect the in between settings to do anything.

## Gotchas worth knowing

**Plain `claude` also goes to Kimi.** The variables reached your global environment. Run `env | grep ANTHROPIC`, and check you didn't paste the config into `~/.claude/settings.json` out of habit.

**A warning that claude.ai connectors are disabled.** Expected, and actually a good sign. An API key outranks your claude.ai login for that session, which is the isolation working. The other tab is unaffected.

**WebFetch says it's temporarily unavailable.** The endpoint doesn't implement it. Paste the content in, or use an MCP scraping server. WebSearch still works on K3.

**`/model` shows unhelpful names.** That's what the `_NAME` and `_DESCRIPTION` keys in the config are for. You can also set `CLAUDE_CODE_ENABLE_GATEWAY_MODEL_DISCOVERY=1` and let the picker populate itself from the endpoint's model list.

**Timestamps in the console request log are UTC+8**, and a request that failed on a bad model ID logs the model as `-`. A row with a dash in the model column is a rejected ID, not a credential fault, whatever the status column says.

**`400 invalid thinking: only type=enabled is allowed`.** The K2.7 Code models used to reject requests that arrived without thinking enabled. I retested on 12 August 2026 and it no longer reproduces, with `kimi-for-coding` returning 200 to a request carrying no `thinking` block at all. I'm leaving it here because my retest used a minimal raw HTTP body rather than Claude Code's real request shape, and I'd rather you recognize it than rediscover it. If you do hit it, stay on K3.

## Quick reference

| Variable | Value | What it does |
| --- | --- | --- |
| `ANTHROPIC_BASE_URL` | `https://api.kimi.com/coding/` | Where requests go. Base only, keep the trailing slash |
| `ANTHROPIC_API_KEY` | your Kimi Code key | Sent as `x-api-key`. Outranks the claude.ai login for this session |
| `ANTHROPIC_MODEL` | `k3` | Main conversation. No `[1m]` suffix |
| `ANTHROPIC_DEFAULT_OPUS_MODEL` | `k3` | What the `opus` alias resolves to |
| `ANTHROPIC_DEFAULT_SONNET_MODEL` | `k3` | What the `sonnet` alias resolves to |
| `ANTHROPIC_DEFAULT_FABLE_MODEL` | `k3` | What the `fable` alias resolves to |
| `ANTHROPIC_DEFAULT_HAIKU_MODEL` | `kimi-for-coding` | Background chores. Ungated on every tier |
| `CLAUDE_CODE_SUBAGENT_MODEL` | `k3` | Subagents and workflow agents. Your main quota burn |
| `CLAUDE_CODE_MAX_CONTEXT_TOKENS` | `1048576` | Required. A bare `k3` gives Claude Code nothing to infer from |
| `CLAUDE_CODE_AUTO_COMPACT_WINDOW` | `950000` | Compaction trigger. `100000` to `1000000`, plain integer |
| `CLAUDE_CODE_EFFORT_LEVEL` | `high` | Kimi collapses five levels onto three |

## Backing it out

```bash
rm ~/.claude/kimi-settings.json
# then delete the claude-kimi() block from ~/.zshrc
exec zsh
```

Your claude.ai login was never touched, so `claude` keeps working the whole time. To pause Kimi without uninstalling anything, just stop typing `claude-kimi`.

One honest caveat on the cleanup. If you accepted that API key prompt, the last 20 characters of your key are still in `~/.claude.json` under `customApiKeyResponses`, and if you ran the repair script there's a `~/.claude.json.bak-apikey` next to it. Neither is dangerous, both are residue, and you'll want to clear them out if you're rotating the key or handing the machine on.

## The one thing to remember

Every failure in this setup arrives dressed as an authentication error. A rejected model ID, a model above your tier, and a key you once declined all surface as `401`, and two of them will send you to the console to rotate a credential that was never broken. Read the message body, not the status code. That's the habit worth keeping.

`[ two lanes, one terminal ]`
