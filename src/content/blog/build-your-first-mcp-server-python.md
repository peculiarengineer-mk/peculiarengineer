---
title: 'Build your first MCP server in Python: give Claude your own notes'
description: 'A beginner guide to the Model Context Protocol. Build a real MCP server in about sixty lines of Python with uv and the official SDK, expose two tools over stdio, and wire it into Claude Code with one command. Includes the stdout footgun that hides behind block buffering and only bites you later.'
pubDate: 'Jul 14 2026'
# heroImage: '../../assets/mcp-server-hero.png'
tags: ['MCP', 'ModelContextProtocol', 'Python', 'uv', 'ClaudeCode', 'LLM', 'AI', 'Tutorial', 'SelfHosted']
---

There are 48 posts on this site. I wrote every one of them so I would never have to Google the same thing twice, and it works: when I need the Netplan syntax or the exact `ufw` incantation, I come here instead of wading through Stack Overflow.

The annoying part is that the model I am talking to has not read any of it. It knows the general shape of Netplan, not the version I settled on after the third time it bit me. I can paste a post into the chat window, and I have, plenty of times. But pasting is not a system. It is a thing you do again every session, forever, and it only works when you already know which post you needed.

What I actually want is a door. Let the model knock when it wants something, and let it read the notes itself.

That door is the **Model Context Protocol**, and the useful part is not the protocol. It is that you write the integration once. Without MCP, giving a model access to your notes means a bespoke integration per tool per client: one for Claude Code, another for the desktop app, another for whatever you use next year. With MCP you write one server that knows how to search your notes, and every client that speaks the protocol can call it. The server does not know or care who is asking.

This post builds that server. It is about sixty lines of Python.

> **TL;DR** `uv add "mcp[cli]"`, decorate two functions with `@mcp.tool()`, end the file with `mcp.run(transport="stdio")`, and register it with `claude mcp add notes -- uv run --directory /abs/path server.py`. Use an absolute path or it will not connect, and never `print()` to stdout, because stdout is the transport.

## Before you start

You need [uv](/blog/install-uv-macos-cheat-sheet/) and Claude Code. That is the whole list. There is no server to deploy, no Docker, no port to open. A local MCP server is just a program that Claude Code launches as a subprocess and talks to over stdin and stdout.

That last point is worth sitting with, because it is the thing people expect to be complicated and it is not. MCP defines two transports. **Streamable HTTP** is for remote servers that many clients connect to over the network, and it comes with the whole authentication story. **stdio** is for local servers, and it is a pipe. Your process, the client's process, JSON going back and forth. Nothing is listening on a port and nothing is exposed.

Everything below is stdio. It is the right place to start, and for a server that reads files on your own laptop it may be the right place to stay.

## What you are building

Two tools:

- `search_notes(query)` finds posts containing a phrase and returns their slugs and titles.
- `get_note(slug)` returns one whole post.

That split matters more than it looks. Search returns a small list so the model can pick, then it fetches only what it wants. If `search_notes` returned full post bodies, a three word query would dump 40,000 words into the context window and the model would drown before it started.

I am pointing this at my blog because that is what I have. Point `NOTES` at any folder of markdown and it works identically. That is the whole idea.

## Set up the project

```bash
mkdir mcp-notes && cd mcp-notes
uv init .
uv add "mcp[cli]"
```

`mcp[cli]` is the official Python SDK. The `cli` extra brings along the development tooling, which you will want later.

## The server

Here is the whole thing, `server.py`:

```python
"""An MCP server that lets Claude read my blog posts.

Two tools: search_notes finds posts containing a phrase, get_note returns one
whole post. Point NOTES at any folder of markdown and it works the same.
"""

import sys
from pathlib import Path

from mcp.server.fastmcp import FastMCP

NOTES = Path.home() / "projects/peculiarengineer/src/content/blog"

mcp = FastMCP("notes")


def _posts() -> list[Path]:
    return sorted(NOTES.glob("*.md")) + sorted(NOTES.glob("*.mdx"))


def _title(text: str, fallback: str) -> str:
    # Frontmatter title, e.g.  title: 'Set up SSH keys for Ubuntu'
    for line in text.splitlines()[:15]:
        if line.startswith("title:"):
            return line.removeprefix("title:").strip().strip("'\"")
    return fallback


@mcp.tool()
def search_notes(query: str) -> str:
    """Search my blog posts for a word or phrase.

    Matches the literal phrase anywhere in a post, including its frontmatter.
    Returns up to 5 hits with slug and title. There is no ranking: hits come
    back in filename order, so a post that merely mentions the phrase can crowd
    out the post that is about it. Search more than once with different wording.
    Use get_note with a slug to read the full post.
    """
    hits = []
    for path in _posts():
        text = path.read_text(encoding="utf-8")
        if query.lower() in text.lower():
            hits.append(f"{path.stem}: {_title(text, path.stem)}")
        if len(hits) == 5:
            break

    if not hits:
        return f"No posts mention {query!r}."
    return "\n".join(hits)


@mcp.tool()
def get_note(slug: str) -> str:
    """Return the full text of one blog post, by slug.

    The slug is the filename without its extension, as returned by search_notes.
    """
    for path in _posts():
        if path.stem == slug:
            return path.read_text(encoding="utf-8")
    return f"No post with slug {slug!r}. Use search_notes to find one."


if __name__ == "__main__":
    # stdout is the transport. A stray print() lands in the middle of the
    # JSON-RPC stream, and block buffering means it may not bite until the
    # buffer fills hours later. Diagnostics go to stderr, always.
    print(f"serving {len(_posts())} posts from {NOTES}", file=sys.stderr)
    mcp.run(transport="stdio")
```

That is a complete MCP server. Three parts are doing the work.

`FastMCP("notes")` is the server. The name is what shows up in clients.

`@mcp.tool()` is where the magic is, and it is worth understanding what it saves you. The protocol requires each tool to advertise a JSON Schema describing its inputs. FastMCP builds that schema from your **type hints**, and it takes the tool's description from your **docstring**. You write a normal Python function and the protocol paperwork is generated for you. This is why the post is short.

`mcp.run(transport="stdio")` starts the loop that reads JSON off stdin and writes JSON to stdout.

Notice the search is a case insensitive substring match. That is not a placeholder I am going to upgrade at the end. It is the point: the protocol is twenty minutes of work, and search quality is a different problem that would eat this entire post. More on where that falls over below.

## Wire it into Claude Code

One command:

```bash
claude mcp add notes -- uv run --directory /Users/you/projects/mcp-notes server.py
```

The `--` matters. Everything before it belongs to `claude mcp add`, and everything after it is the literal command Claude Code runs to start your server. Without the separator, `claude` tries to parse your command's flags as its own.

The `--directory` matters more, and this is the first thing that got me. Claude Code runs that command from **whatever directory you launched `claude` in**, not from where your server lives. I registered it with a bare `uv run server.py`, started Claude in my blog repo, and got this:

```
notes: uv run server.py - ✘ Failed to connect
```

Of course it failed. There is no `server.py` in my blog repo. `uv run --directory /abs/path server.py` pins it, and now it does not matter where you start Claude from.

Check it:

```bash
claude mcp list
```

```
notes: uv run --directory /Users/you/projects/mcp-notes server.py - ✔ Connected
```

`✔ Connected` means Claude Code launched the process, completed the handshake, and got a tool list back. For more detail, `claude mcp get notes` shows the scope, the exact command, and any error.

### A word on scope

By default your server is added with **local** scope, which means it is private to you and tied to the directory you added it from. This confused me for a solid minute: I added the server while sitting in my blog repo, went over to the server's own directory, ran `claude mcp list`, and it was not there. Not broken, not an error, just not listed. Local scope is per project, and I was in a different project.

Your options:

- `--scope local` (the default) for this project only, stored in `~/.claude.json`.
- `--scope user` for every project you work in. This is what you want for a notes server.
- `--scope project` writes a `.mcp.json` in the repo so anyone who clones it gets the server too.

## Use it

Start Claude Code and ask it something that is in your notes and not in its training data:

```
> What did I decide about Secure Boot when installing NVIDIA drivers?
```

The first time a tool runs, Claude Code asks your permission, once per tool. Approve it and you will not be asked again. The names are namespaced by server, so mine show up as `mcp__notes__search_notes` and `mcp__notes__get_note`. `/mcp` inside a session lists the server and its tools.

Then it works. It calls `search_notes("Secure Boot")`, gets a slug back, calls `get_note` on it, and answers out of my own post: if Secure Boot is on, enroll the MOK key when the driver install prompts you, or turn Secure Boot off in the BIOS before you start.

That is the correct answer, and it is correct because it came from [my own post](/blog/install-ollama-ubuntu-26-04-nvidia-gpu/) rather than from a general impression of how NVIDIA drivers work.

But the part I did not expect was what came next. Unprompted, it searched again, found my [Hardening Ubuntu 26.04 Desktop](/blog/hardening-ubuntu-26-04-desktop/) post, and pointed out that the two contradict each other: on the desktop I recommend TPM backed full disk encryption, which relies on Secure Boot being on. So "turn Secure Boot off" is advice scoped to a headless GPU box, not a rule, and I had never written that down anywhere because I had never had both posts in my head at the same time.

That is the moment the door earns its keep. I did not ask it to reconcile two posts written a month apart. It just had access to both.

## Where the dumb search falls over

I promised this, and it is more interesting than I expected.

Ask for something specific and it is great. `search_notes("fail2ban")` returns exactly the right three posts. Then try a general word:

```
search_notes("firewall")
```

```
create-sudo-user-ubuntu-26-04: Create a Sudo User on Ubuntu 26.04
enable-ssh-on-ubuntu-desktop: Enable SSH on an Ubuntu desktop
extend-azure-windows-disk-run-command: Extending C: on locked-down Azure Windows VMs
hardening-ubuntu-26-04-desktop: Hardening Ubuntu 26.04 Desktop (Resolute Raccoon)
hardening-ubuntu-26-04-server: Hardening Ubuntu 26.04 Server (Resolute Raccoon)
```

Every one of those is a real match. And the actual firewall post, [UFW Firewall Basics](/blog/ufw-firewall-basics-ubuntu/), is not in the list.

The substring match did not fail. It found the UFW post fine. The problem is that there is no ranking at all: `_posts()` returns files in alphabetical order and I stop at five, so five posts that mention "firewall" once in passing crowded out the post that is entirely about firewalls, purely because `u` sorts after `c`, `e`, and `h`.

This is the real lesson, and it is why I did not paper over it with a better search. **MCP got your notes to the model in twenty minutes. Deciding which notes are the right ones is the actual work,** and it is the same search problem it always was. The protocol does not help you with it and was never going to.

There is a cheap fix that costs nothing, though, and it is the most MCP-shaped part of this whole post: I told the model about the limitation. Read the docstring on `search_notes` again. It says there is no ranking, and it says to search more than once with different wording. The model reads that and compensates by trying `ufw` after `firewall` comes back weak. You cannot fix bad search with a comment, but you can stop the model from trusting it.

## Gotchas I hit

- **Never `print()` in a stdio server, and do not trust your own testing on this one.** stdout is the transport. Anything you print goes into the JSON-RPC stream and the client fails to parse it. The catch is that it often looks fine: when stdout is a pipe rather than a terminal, Python block buffers it at around 8 KB, so your debug line sits in the buffer and never interleaves. Add `flush=True`, or print enough to fill the buffer, or just run long enough, and it corrupts. Mine failed exactly as advertised the moment I flushed: `Failed to parse JSONRPC message from server ... input_value='DEBUG: searching for fail2ban'`. A footgun that works in testing and detonates in week three is worse than one that fails immediately. Send diagnostics to stderr with `file=sys.stderr`, which the client ignores and you can still read.
- **Relative paths fail.** The command runs from wherever you started `claude`, not where the server lives. Use `uv run --directory /abs/path server.py`.
- **Local scope is tied to a directory.** Added from one project, invisible from another, with no error to explain it. Use `--scope user` for anything you want everywhere.
- **The docstring is your API contract.** It is not a comment. It is the only description of your tool the model ever sees, and it decides how the tool gets called. Mine said "newest matches first" when the order was actually alphabetical, and no compiler was ever going to catch that. A stale docstring is a lying API spec.
- **`✔ Connected` does not mean the model can call it.** Connected means the handshake worked. Each tool still needs your approval the first time it runs. This bites hardest in a headless session (`claude -p ...`), where there is nobody to approve anything and the call is simply refused. Pre-allow them with `--allowedTools "mcp__notes__search_notes,mcp__notes__get_note"`.
- **Config is read at session start.** Edit the server and the running session keeps the old one. Restart Claude Code.
- **Test the command standalone first.** If `uv run --directory /abs/path server.py` does not start on its own, it will not start under Claude Code either, and the error is much easier to read in your terminal.

## Quick reference

| Task | Command |
|---|---|
| New project | `uv init . && uv add "mcp[cli]"` |
| Server object | `mcp = FastMCP("notes")` |
| Define a tool | `@mcp.tool()` above a typed function |
| Run over stdio | `mcp.run(transport="stdio")` |
| Log safely | `print(msg, file=sys.stderr)` |
| Register it | `claude mcp add notes -- uv run --directory /abs/path server.py` |
| Register everywhere | `claude mcp add --scope user notes -- ...` |
| List servers | `claude mcp list` |
| Inspect one | `claude mcp get notes` |
| Manage in session | `/mcp` |
| Pre-allow tools | `claude -p "..." --allowedTools "mcp__notes__search_notes"` |
| Remove it | `claude mcp remove notes` |

Sixty lines, two decorators, one command. The protocol really is the easy part, and once the door exists every client that speaks MCP can walk through it without you writing a second integration.

What you put behind the door is your problem, and mine is currently a substring match that thinks "Create a Sudo User" is a firewall post. That is the next post.

`[ your notes, your door, any client ]`
