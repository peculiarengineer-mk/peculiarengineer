---
title: "Your MCP server's search is bad: ranking, embeddings, and what each one fixes"
description: 'Part Two of the MCP notes server. The search returned the wrong posts because it never ranked anything, and twenty lines fix that. Then local embeddings from Ollama for the questions keyword search cannot answer, with real numbers from a 496 chunk index: what the task prefixes are worth, why num_ctx does not do what the docs imply, and the query that neither search could find.'
pubDate: 'Jul 27 2026'
heroImage: '../../assets/mcp-search-hero.png'
tags: ['MCP', 'ModelContextProtocol', 'Python', 'Embeddings', 'Ollama', 'SemanticSearch', 'uv', 'ClaudeCode', 'LLM', 'AI', 'SelfHosted', 'Tutorial']
---

At the end of [Part One](/blog/build-your-first-mcp-server-python/) I left the notes server with a search I described as dumb, and promised to come back for it. Here is where it stands today, on the same query:

```
search_notes("firewall")
```

```
build-your-first-mcp-server-python: Build your first MCP server in Python: give Claude your own notes
caddy-reverse-proxy-docker-compose-ubuntu-26-04: Reverse Proxy Your Containers with Caddy and Docker Compose on Ubuntu 26.04
create-sudo-user-ubuntu-26-04: Create a Sudo User on Ubuntu 26.04
enable-ssh-on-ubuntu-desktop: Enable SSH on an Ubuntu desktop
extend-azure-windows-disk-run-command: Extending C: on locked-down Azure Windows VMs without RDP
```

It got worse. The top hit is now Part One itself, the post complaining that this search is bad, which mentions "firewall" only because it was quoting this exact output. The blog is up to 51 posts, 17 of them mention firewalls somewhere, and [UFW Firewall Basics](/blog/ufw-firewall-basics-ubuntu/) is still not in the list.

This post fixes it in two stages, because there are two different problems here and only one of them is the one everybody reaches for. The first is a ranking bug and it costs about twenty lines. The second is a query that no amount of ranking will ever answer, and that one costs an embedding model.

> **TL;DR** Score every hit and sort, instead of taking the first five in alphabetical order. That alone puts the right post on top. Then add local embeddings with `ollama pull nomic-embed-text`, chunked on `##` headings and cached in an `.npz` keyed by path, mtime and model name. Prefix documents with `search_document:` and queries with `search_query:`, which doubled how often my index put the right post first. Build the index from a command, not on the first search, because 496 chunks took four minutes on CPU. And keep both searches, because they fail in different places: the exact match misses `brute force` over a hyphen, and the embeddings miss it because two words are not enough meaning to work with.

## Before you start

- The finished server from [Part One](/blog/build-your-first-mcp-server-python/). Everything below edits that `server.py`.
- [Ollama](/blog/install-ollama-ubuntu-26-04-nvidia-gpu/) running locally. That post is about feeding a GPU for chat models, and none of that applies here: embedding models are small and a CPU is fine for this job.
- Two dependencies: `uv add ollama numpy`

## 1. The bug was ranking, not matching

Part One already named this, and it is worth quoting because the diagnosis is the whole of Stage One:

> The substring match did not fail. It found the UFW post fine. The problem is that there is no ranking at all.

Look at what the original loop does:

```python
hits = []
for path in _posts():
    text = path.read_text(encoding="utf-8")
    if query.lower() in text.lower():
        hits.append(f"{path.stem}: {_title(text, path.stem)}")
    if len(hits) == 5:
        break
```

`_posts()` globs the `.md` files and the `.mdx` files separately and concatenates the two sorted lists, so the order is alphabetical within each extension and any `.mdx` file lands at the end no matter what it is called. The loop appends in that order and breaks at five. So `search_notes` is not returning the five best matches for "firewall," it is returning the first five files in that order that contain the string anywhere, code blocks and links included. `u` sorts after `b`, `c`, and `e`, so the post that is entirely about firewalls loses to four posts that mention them in passing.

That is worse than returning nothing, because five confident, plausible, wrong results are an answer the model will happily build on.

The fix is to stop treating a match as a boolean. Collect every hit, score it, sort, then truncate:

```python
def _frontmatter(text: str) -> str:
    parts = text.split("---", 2)
    return parts[1] if len(parts) > 2 else ""


def _fm_line(fm: str, key: str) -> str:
    return next((l for l in fm.splitlines() if l.startswith(key)), "")


def _score(path: Path, text: str, q: str) -> int:
    low = text.lower()
    if q not in low:
        return 0

    fm = _frontmatter(low)
    score = 0
    if q in _fm_line(fm, "title:"):
        score += 100
    if q in path.stem.lower():
        score += 60
    if q in _fm_line(fm, "tags:"):
        score += 40
    # Body mentions count for something, but cap them so a 4,000 word post
    # cannot win on length alone.
    score += min(low.count(q), 10) * 3
    return score
```

Four signals, weighted by how much intent each carries. A title match scores highest because a title is the strongest claim a post makes about its own subject. The slug is close behind, since I hand-write slugs on this blog and they say what the post is about. Tags sit below that, and body count is the tiebreaker, capped at ten so a long post cannot grind out a win on length alone.

Then pull the ranked lookup into its own function, because Stage Two is going to need it separately from the tool:

```python
def _keyword_hits(query: str, k: int = 5) -> list[tuple[str, str]]:
    """Every post containing the phrase, best first, as (slug, title)."""
    q = query.lower()
    scored = []
    for path in _posts():
        text = path.read_text(encoding="utf-8")
        score = _score(path, text, q)
        if score:
            scored.append((score, path.stem, _title(text, path.stem)))

    scored.sort(key=lambda row: (-row[0], row[1]))
    return [(slug, title) for _, slug, title in scored[:k]]


@mcp.tool()
def search_notes(query: str) -> str:
    """Search my blog posts for a word or phrase.

    Matches the literal phrase anywhere in a post. Results are ranked: a match
    in the title, slug or tags outranks a passing mention in the body. Returns
    the 5 best hits with slug and title. Use get_note with a slug to read a
    full post.
    """
    hits = _keyword_hits(query)
    if not hits:
        return f"No posts mention {query!r}."
    return "\n".join(f"{slug}: {title}" for slug, title in hits)
```

Same query, same corpus:

```
ufw-firewall-basics-ubuntu: UFW Firewall Basics on Ubuntu
hardening-ubuntu-desktop: Hardening an Ubuntu Desktop
ssh-connection-refused-port-22-ubuntu: Troubleshooting "ssh: connect to host port 22: Connection refused"
build-your-first-mcp-server-python: Build your first MCP server in Python: give Claude your own notes
enable-ssh-on-ubuntu-desktop: Enable SSH on an Ubuntu desktop
```

The UFW post scores 230 against 61 for the runner up, because it hits the title, the slug, the tags and the body. Part One drops to fourth where it belongs.

The docstring changed too. Part One's said "There is no ranking" and told the model to search repeatedly with different wording. That was honest then and is wrong now, and left alone it would keep the model burning three calls to work around a limitation that no longer exists.

**If you have fifty markdown files, you could stop reading here.** Twenty lines, no new dependencies, no model, nothing to keep in sync. That is a real answer and I am not going to pretend otherwise to justify the rest of the post.

## 2. The query ranking cannot touch

Here is the one that sent me looking further. I have a post about stopping repeated SSH login attempts. Ask for it the way a person would ask:

```
search_notes("brute force")
```

```
No posts mention 'brute force'.
```

Not badly ranked, not buried at position nine. Zero, across 51 posts.

Two separate failures are stacked on top of each other there. [UFW Firewall Basics](/blog/ufw-firewall-basics-ubuntu/) says "throttle brute-force knocking," so the word is right there in the corpus, and it does not match because I typed a space where the post has a hyphen. Substring matching is not looking for a concept, it is looking for a byte sequence, and those are two different byte sequences.

The second failure is the one that matters. The post that actually answers this question is the [Fail2ban post](/blog/set-up-fail2ban-ubuntu-26-04/), and it does not contain the word in any spelling. It never says "brute" or "attack" at all. It opens like this:

> A public SSH server starts collecting failed logins almost as soon as it gets an address. Key-only authentication makes those guesses useless, but it does not stop the same addresses filling the journal all day.

"Failed logins," "guesses," "the same addresses." Every one of those describes the thing better than "brute force" does, and not one of them is the phrase somebody would type into a search box. I wrote a whole post about defending against brute force attacks without ever using the term.

This is where ranking runs out. Ranking orders the matches you already have. It cannot manufacture one for a word you never wrote.

And the caller here is not me. It is a model turning somebody's half-remembered question into search terms, and it will not guess my vocabulary. Part One patched around this by telling the model in the docstring to try different wording, which works about as well as it sounds. What the server needs is a search that matches on meaning instead of spelling.

## 3. What an embedding actually is

A model reads a piece of text and hands back a fixed-length list of floats. That is all. `nomic-embed-text` gives you 768 of them. The useful property is that texts about similar things land near each other in that 768-dimensional space, so "brute force attack" and "the same addresses filling the journal" end up close together despite sharing no words.

"Near" is cosine similarity, which for unit-length vectors is just a dot product: multiply the two lists element by element, add up the results, get a number between -1 and 1. Higher is more related. That is the entire retrieval algorithm.

Here is what you do **not** need, despite what a search for this will tell you: a vector database. No Chroma, no pgvector, no Pinecone, no index structure of any kind. Fifty-one posts chunked by heading comes to 496 sections, so the entire index is a 496 by 768 array of float32, about 1.5 MB. Comparing a query against every single one of them is one matrix multiply. You need a real vector store somewhere in the tens of thousands of documents, when scanning everything stops being free. Below that it is a file you can delete when it gets weird, which is worth more than it sounds.

## 4. Embeddings locally with Ollama

```bash
ollama pull nomic-embed-text
```

The current SDK call is `embed()`, which takes a list and returns a list:

```python
import ollama

r = ollama.embed(model="nomic-embed-text", input=["hello", "goodbye"])
print(len(r.embeddings), len(r.embeddings[0]))
```

Two vectors of 768 floats each. The older `ollama.embeddings(prompt=...)` is the deprecated single-string version. Use `embed()`: batching matters later.

Two things about this model are not optional, and both fail silently.

**Prefix your inputs.** `nomic-embed-text` is trained with task prefixes. Documents go in as `search_document: {text}` and queries as `search_query: {text}`. Ollama will not add them for you. Leave them off and nothing breaks: you get vectors, plausible similarity scores, and ranked results. There is no error to chase.

I nearly talked myself out of this one. Comparing raw cosine scores between two documents, prefixed and not, the numbers barely move, which looks like proof that the prefixes are folklore. They are not. Raw cosine is the wrong thing to measure, because a change that shifts every score equally changes no rankings. What matters is where the right post lands.

So I built the index twice over all 496 chunks and ran eight questions with known answers through both:

| | Mean reciprocal rank | Correct post first | Mean rank |
|---|---|---|---|
| No prefixes | 0.480 | 2 of 8 | 3.6 |
| With prefixes | 0.682 | 4 of 8 | 2.4 |

Prefixing doubles the number of questions answered correctly on the first result. "Something keeps trying to log into my server over and over" goes from seventh place to first. That is not folklore, and it costs one f-string.

**Know where it truncates.** Ollama serves this model with a 2,048 token context. Feed it a longer chunk and it drops the tail and tells you nothing, which is the second silent failure in a row.

`ollama show` will tell you, if you think to ask:

```text
$ ollama show nomic-embed-text
  Model
    architecture        nomic-bert
    parameters          137M
    context length      2048
    embedding length    768
    quantization        F16

  Capabilities
    embedding

  Parameters
    num_ctx    8192
```

Read those last two numbers together, because between them they are the whole trap. The architecture stops at 2,048, and the model file already asks for 8,192. The setting you were about to reach for is set, and it is not doing anything.

The obvious move is `options={"num_ctx": 8192}`, since nomic's own model card describes an 8,192 window. It does not work, and it is worth showing how I know, because "the flag had no effect" is a hard thing to prove by staring at vectors.

Take one long document, copy it, and change only the last sentence. If the model reads the whole thing, the two copies must embed slightly differently. If it truncates, the two copies are byte-identical up to the cut and the vectors come back the same:

```python
filler = "The firewall configuration is stored in the usual place. " * 400
a = filler + " ZEBRA QUASAR MARMALADE."
b = filler + " The cat sat quietly on the warm mat."
```

That is roughly 5,700 tokens of identical text with two very different endings. On Ollama 0.32.4:

```text
num_ctx=None  -> cosine(a,b)=1.000000
num_ctx=8192  -> cosine(a,b)=1.000000
```

Identical to six decimal places, with and without the flag. Everything past the limit was thrown away in both cases. The clamp is in the Ollama log if you go looking, one WARN line and then the model loads at 2,048 regardless:

```text
level=WARN source=server.go:114 msg="requested context size too large for model"
  num_ctx=8192 n_ctx_train=2048
llama_context: n_ctx = 2048
```

Treat `num_ctx` as a request, not a setting, and check it the way I did rather than trusting either the model card or me.

The better answer is to not need it. Chunking on `##` headings does most of the work for you. Across this blog, 496 sections, the longest one in any prose post is 7,825 characters, which at the usual four-characters-per-token rule of thumb lands just under the limit. The only sections that clearly blow through it are the four complete-source dumps at the end of the LÖVE posts, and the largest of those are past 8,192 as well, so raising the window would not have rescued them either. A wall of Lua that size should not be competing for search hits anyway. Split those or skip them.

## 5. Wiring it into the server

Four pieces: chunk, embed, cache, search.

**Chunking is not optional.** One vector for a 4,000 word post averages every idea in it into mush. The [server hardening post](/blog/hardening-ubuntu-26-04-server/) covers SSH, the firewall, unattended upgrades, fail2ban and livepatch; embedded whole, it is a vector for "Ubuntu things," equally mediocre at all five. Chunk it and each section gets to be about one thing.

Every post on this blog uses `##` headings, so the chunk boundaries already exist. That also means a hit can report which section matched, which is strictly more useful to the model than a slug.

```python
import numpy as np
import ollama

MODEL = "nomic-embed-text"
INDEX = Path(__file__).parent / "index.npz"
FLOOR = 0.5          # minimum cosine score worth returning, see below


def _chunks(path: Path) -> list[tuple[str, str]]:
    """Split a post into (heading, text) pairs on ## boundaries."""
    text = path.read_text(encoding="utf-8")
    title = _title(text, path.stem)
    body = text.split("---", 2)[-1]

    sections, heading, buf = [], "intro", []
    for line in body.splitlines():
        if line.startswith("## "):
            if buf:
                sections.append((heading, "\n".join(buf)))
            heading, buf = line[3:].strip(), []
        else:
            buf.append(line)
    if buf:
        sections.append((heading, "\n".join(buf)))

    # Carry the title into every chunk so a section knows what post it is from.
    return [
        (h, f"{title}\n\n## {h}\n\n{b}")
        for h, b in sections
        if b.strip()
    ]


def _embed(texts: list[str], prefix: str) -> np.ndarray:
    try:
        r = ollama.embed(model=MODEL, input=[f"{prefix}: {t}" for t in texts])
    except (ollama.ResponseError, ConnectionError) as e:
        # ConnectionError is the daemon not running. stderr, never stdout.
        print(f"ollama embed failed: {e}", file=sys.stderr)
        raise
    v = np.array(r.embeddings, dtype="float32")
    # Normalize once, here, so search is a plain dot product later.
    return v / np.linalg.norm(v, axis=1, keepdims=True)
```

Now the cache, and this is the part where my first design was wrong.

Embedding the whole blog takes real time. On my Mac, CPU only, 496 chunks indexed in 239 seconds. That is 482 ms per chunk, and it is four minutes of wall clock before the first search can return anything.

My instinct was to build the index lazily on the first search, so `mcp.run()` starts instantly and the handshake never blocks. That is the right instinct and the wrong conclusion: it moves a four minute wait from startup, where nobody is looking, onto a tool call the model is waiting on. Build the index ahead of time instead, from a command you run yourself, and have the server load a file that already exists. The lazy path stays as the fallback for a cold cache, but it should be the exception, not the plan.

So: build it once, keep it on disk, and only re-embed what changed.

```python
def _load_cache() -> tuple[np.ndarray | None, list[tuple]]:
    if not INDEX.exists():
        return None, []
    data = np.load(INDEX, allow_pickle=True)
    if str(data["model"]) != MODEL:      # a model swap invalidates every vector
        return None, []
    return data["vecs"], [tuple(row) for row in data["meta"]]


def _build_index() -> tuple[np.ndarray, list[tuple]]:
    """Load the cached index, re-embedding only posts whose mtime moved."""
    cached_vecs, cached_meta = _load_cache()
    live = {path.stem: str(path.stat().st_mtime_ns) for path in _posts()}

    keep_rows, keep_meta = [], []
    for i, row in enumerate(cached_meta):
        slug, mtime = row[0], row[1]
        if live.get(slug) == mtime:      # unchanged file, reuse its vectors
            keep_rows.append(cached_vecs[i])
            keep_meta.append(row)

    done = {row[0] for row in keep_meta}
    todo_texts, todo_meta = [], []
    for path in _posts():
        if path.stem in done:
            continue
        title = _title(path.read_text(encoding="utf-8"), path.stem)
        for heading, text in _chunks(path):
            todo_texts.append(text)
            todo_meta.append((path.stem, live[path.stem], heading, title))

    if not todo_texts:
        vecs = np.array(keep_rows)
        if len(keep_meta) != len(cached_meta):   # a post was deleted, persist the prune
            np.savez(INDEX, vecs=vecs, meta=np.array(keep_meta, dtype=object), model=MODEL)
        return vecs, keep_meta

    print(f"embedding {len(todo_texts)} chunks", file=sys.stderr)
    new_vecs = _embed(todo_texts, "search_document")   # one batched call
    vecs = np.vstack([np.array(keep_rows), new_vecs]) if keep_rows else new_vecs
    meta = keep_meta + todo_meta
    np.savez(INDEX, vecs=vecs, meta=np.array(meta, dtype=object), model=MODEL)
    return vecs, meta


_INDEX_CACHE: tuple | None = None


def _index():
    """Loaded on first search. Warm cache is instant; a cold one costs minutes."""
    global _INDEX_CACHE
    if _INDEX_CACHE is None:
        _INDEX_CACHE = _build_index()
    return _INDEX_CACHE


if __name__ == "__main__":
    # This replaces Part One's block. Build the index from the shell before
    # starting the server:
    #     uv run --directory /abs/path server.py --reindex
    if "--reindex" in sys.argv:
        vecs, meta = _build_index()
        print(f"indexed {len(meta)} chunks", file=sys.stderr)
        raise SystemExit

    print(f"serving {len(_posts())} posts from {NOTES}", file=sys.stderr)
    mcp.run(transport="stdio")
```

Four things in there matter. The model name goes into the cache file, so swapping models throws the whole index out instead of comparing 768-dimensional rows against a 1024-dimensional query. `st_mtime_ns` is the freshness check, so editing one post re-embeds one post and leaves the other fifty alone, which turns a four minute rebuild into a two second one. Deleting a post is the quiet case: its slug never makes it into `keep_meta`, and the save on the early return writes the pruned index back to disk, because otherwise the dead vectors sit in `index.npz` forever and every run prunes them again. And the `--reindex` path means the expensive build happens when you ask for it, not in the middle of somebody's question.

Search itself is four lines:

```python
def _similar(query: str, k: int = 5) -> list[tuple[float, str, str, str]]:
    vecs, meta = _index()
    q = _embed([query], "search_query")[0]
    scores = vecs @ q                      # both sides normalized, so this is cosine
    top = np.argsort(-scores)[:k]
    # meta rows are (slug, mtime, heading, title)
    return [(float(scores[i]), meta[i][0], meta[i][2], meta[i][3]) for i in top]
```

That `vecs @ q` is the whole search engine. One matrix multiply against every chunk on the blog.

## 6. What it actually retrieves

Here is where I found out my plan for this post was wrong.

The whole setup in Stage Two was that `brute force` should find the Fail2ban post, and that meaning-based search is the thing that gets you there. So I built the index, 496 chunks across 51 posts, and asked it:

```text
query: "brute force"
  0.6237  ufw-firewall-basics-ubuntu        ## Rate limiting the front door
  0.6048  hardening-ubuntu-desktop          ## First, know what you are defending against
  0.5961  hardening-ubuntu-26-04-server     ## See what is actually listening
  0.5951  dev-handoff-claude-code-skill     ## How it works, section by section
  0.5950  hardening-ubuntu-26-04-desktop    ## Per-app permission prompts
```

The Fail2ban post is not in the top five. It is eighth. Fourth place is a post about handing work to AI sub-agents, which has nothing to do with any of this.

That is a better result than the substring match, which returned nothing at all, and the top hit is defensible: the UFW post's rate limiting section really is about throttling repeated connection attempts. But it is not the answer I promised, and the spread across those five is 0.03, which is another way of saying the index has no strong opinion.

Now ask the same thing as a sentence:

```text
query: "how do I stop repeated failed SSH login attempts"
  0.7546  set-up-fail2ban-ubuntu-26-04      ## intro
  0.7425  set-up-ssh-keys-ubuntu            ## 5. Turn off password login
  0.7232  hardening-ubuntu-26-04-server     ## Order matters: do not lock yourself out
  0.7185  set-up-fail2ban-ubuntu-26-04      ## Before you install it
  0.7168  create-sudo-user-ubuntu-26-04     ## Now lock down root
```

First place, and second place is the post it tells you to read first. Phrase it more vaguely and it still holds: "something keeps trying to log into my server over and over" also puts the Fail2ban intro on top.

**Two words is not enough to embed.** That is the lesson, and I would not have believed it without the numbers. An embedding is a summary of meaning, and "brute force" on its own carries almost none: no target, no symptom, no context. The model has to guess whether you mean SSH, or a search algorithm, or a way of solving a puzzle. A sentence gives it something to summarize.

Which is fine, and it is worth understanding why. **The caller is not a human typing two words into a box.** It is a model turning somebody's question into a tool call, and models write sentences. The query shape this search is worst at is the one it will rarely be handed. But it does mean the docstring should tell it so, and mine now does.

## 7. Keep both

I expected this section to be about embeddings falling over on exact strings. It is not, because they do not. Ask the index for `_ctypes` and the top five hits are all sections of the right post, starting at 0.7004. That is the single cleanest result in this whole experiment, and it is the opposite of what I sat down to write.

So the case for keeping both is not that one is bad at literals. It is that they fail in different places, and you now have both failures on record. The substring match returned nothing for `brute force` over a hyphen. The embedding index returned nothing useful for the same two words because two words carry no meaning to summarize. Neither of those is a flaw you can fix from inside the other approach.

The other reason is cheaper and more practical. When I paste an error string into my own notes, I want to know that a post literally contains it, not that a post is thematically nearby. Exact match is a different kind of answer, not a worse one, and it costs one function call to keep.

So the answer is both, in one tool:

```python
@mcp.tool()
def search_notes(query: str) -> str:
    """Search my blog posts.

    Runs two searches and merges them: an exact-phrase search ranked by where
    the phrase appears, and a meaning-based search that finds related posts
    even when they never use your words. Good for both error strings and
    plain-English questions. Returns up to 5 posts, best first, with the
    section that matched. Use get_note with a slug to read a full post.
    """
    exact = _keyword_hits(query)
    # Ask for more chunks than we need: several may come from one post and
    # collapse into a single line below.
    related = _similar(query, k=15)

    seen, out = set(), []
    for slug, title in exact:                    # literal matches win the top
        if slug not in seen:
            seen.add(slug)
            out.append(f"{slug}: {title}")
    for score, slug, heading, title in related:  # semantic fills the rest
        if slug not in seen and score > FLOOR:
            seen.add(slug)
            out.append(f"{slug}: {title}  (matched section: {heading})")

    return "\n".join(out[:5]) or f"Nothing found for {query!r}."
```

The merge rule is deliberately blunt: anything the keyword search found literally goes first, because if you typed an exact string you almost certainly meant it, and semantic hits fill whatever is left. Chunk hits collapse to one line per post, keeping the best-scoring section as the label, since the model wants a slug it can pass to `get_note` and not four near-duplicate rows from the same file.

`FLOOR` exists so a query with no real answer returns nothing instead of the five least-unrelated posts on the blog, which is the semantic version of the bug in Stage One. I set it to 0.5 by guessing, and the numbers say that was useless: on this corpus every hit that came back for every query I tried scored above 0.59, including the sub-agent post that has nothing to do with brute force attacks. A floor of 0.5 filters nothing at all.

Then I went looking for a number that would work, and did not find one. Real scores here sit between 0.59 and 0.76, and across five queries neither obvious rule separates the good answers from the bad ones:

| Query | Top score | Gap to second | Right answer? |
|---|---|---|---|
| `brute force` | 0.6237 | 0.0189 | no |
| `how do I stop repeated failed SSH login attempts` | 0.7546 | 0.0121 | yes |
| `something keeps trying to log into my server over and over` | 0.6540 | 0.0009 | yes |
| `_ctypes` | 0.7004 | 0.0443 | yes |
| `my server forgets its IP address after reboot` | 0.6985 | 0.0080 | no |

A floor of 0.70 would have thrown away a correct answer at 0.6540. And the gap between first and second place, which I assumed would be the tell, does not sort them either. The widest gap on that list is a success and the narrowest gap is also a success, a factor of fifty apart, with both of the failures sitting comfortably in between. Both of the tidy heuristics I expected to find are wrong on my own data.

So `FLOOR` stays at 0.5 as insurance, not as a demonstrated filter. It never fired on any query I tried, and I am keeping it for the query that is genuinely about nothing on this blog, which none of my test queries were. The honest position is that I do not have a reliable confidence signal for this yet, and anyone who tells you a fixed cosine threshold means "relevant" has not printed their own numbers.

**One tool, not two.** It is tempting to ship `search_notes` and `search_notes_semantic` and let the model choose. Do not. The model would have to know which search strategy suits a query it has not run yet, which is a harder problem than the one you are solving, and it will get it wrong in the direction of whichever docstring reads more confidently. Every tool you add is another thing it can pick wrong. Give it one door and do the routing yourself.

## 8. Ask it the way a person would

Testing the function at a terminal is not the point. The caller is a model, so restart Claude Code and ask it the way somebody would actually ask.

```
how do I stop people repeatedly trying to log into my server?
```

```
mcp-server-search-ranking-embeddings-ollama: Your MCP server's search is bad: ranking, embeddings, and what each one fixes
set-up-fail2ban-ubuntu-26-04: Set Up Fail2ban on Ubuntu 26.04 Server  (matched section: intro)
hardening-ubuntu-26-04-server: Hardening Ubuntu 26.04 Server (Resolute Raccoon)  (matched section: Order matters: do not lock yourself out)
create-sudo-user-ubuntu-26-04: Create a Sudo User on Ubuntu 26.04  (matched section: Now lock down root)
set-up-ssh-keys-ubuntu: Set up SSH keys for Ubuntu  (matched section: 5. Turn off password login)
```

The Fail2ban post is there in second place, matched on its intro, which is the section that never says "brute" or "attack." That is the result section 6 promised and the whole point of the exercise.

Now look at what is sitting on top of it.

That is this post. And look at what the top line is missing: every other row carries a matched section, because every other row came out of the embedding index. The top row does not, which means it came back from the exact-phrase half.

When I ran this, the sentence I had just typed existed in exactly one file on the blog. It was in this section, inside an HTML comment, in a note to myself that said to ask something like "how do I stop people repeatedly trying to log into my server?" I wrote the question down before I wrote the section. The literal search found my own unfinished to-do list and ranked it above the answer.

Part One opened with the search returning Part One. Two stages and a rewrite later, it opens with the search returning a comment I had not finished writing.

There is a real lesson under the joke, and it is about the merge rule in Stage One. Exact matches go first because if you typed a literal string you almost certainly meant it. That reasoning holds for `_ctypes`. It does not hold for a twelve word question, because a twelve word question matching a document verbatim does not mean the document answers it. It means the document quotes it. Length should have been part of that decision and it is not.

The contamination is not only literal, either. Ask something with no phrase in common with anything I have written:

```
someone keeps guessing passwords on my ssh server and filling the logs
```

```
hardening-ubuntu-26-04-server: Hardening Ubuntu 26.04 Server (Resolute Raccoon)  (matched section: Order matters: do not lock yourself out)
set-up-ssh-keys-ubuntu: Set up SSH keys for Ubuntu  (matched section: Gotchas I hit)
ssh-config-file-explained: The ~/.ssh/config file explained: aliases, jump hosts, and a key per host  (matched section: A key per host)
mcp-server-search-ranking-embeddings-ollama: Your MCP server's search is bad: ranking, embeddings, and what each one fixes  (matched section: 2. The query ranking cannot touch)
set-up-fail2ban-ubuntu-26-04: Set Up Fail2ban on Ubuntu 26.04 Server  (matched section: intro)
```

Fail2ban falls to fifth, and this post is fourth on the strength of section 2, which is three hundred words about failed SSH logins that solve nothing. Every measurement in section 6 was taken on an index of 51 posts. There are 52 now, and the new one is a long post about searching for the answer rather than a post containing it.

I do not have a clean fix for that and I am not going to invent one. A post about retrieval is a genuinely hard document to keep in a retrieval index, because it is made of other posts' vocabulary. What I have is the knowledge that my corpus now contains a decoy, which is worth more than a confidence score.

## 9. Gotchas I hit

Part One's worst bug was a `print()` that worked fine until a buffer filled weeks later, and the first two here have the same shape: no crash, no error, just an index that is quietly worse than you think.

- **I built the first index without the task prefixes.** Nothing told me. Vectors came back, the scores looked reasonable, the results were ranked, and I nearly shipped it. It took building the whole index a second time and scoring both against eight questions to see that the first one was measurably worse. There is no error to chase here, only the version of the index you did not build.
- **I reached for `num_ctx` before I tested whether it did anything.** Ollama serves this model at 2,048 tokens, drops the rest without a word, and clamps a larger `num_ctx` back down to the trained context. Two documents differing only after the cut embed to cosine 1.000000, which is how I found out. Measure your longest chunk instead of trusting the flag.
- **A four minute index build in the wrong place.** 496 chunks took 239 seconds on CPU. Put that on the first search, the way I first designed it, and the model waits four minutes for a tool call. Build ahead of time and let the server load a file.
- **A model swap poisons a cache keyed only on mtime.** No file changed, so nothing re-embeds, and now a 768-dimensional index meets a 1024-dimensional query. That one at least fails loudly, though in numpy's terms rather than yours:

  ```text
  ValueError: matmul: Input operand 1 has a mismatch in its core dimension 0,
  with gufunc signature (n?,k),(k,m?)->(n?,m?) (size 1024 is different from 768)
  ```

  Nothing in there says "you changed embedding models." Put the model name in the cache file and check it on load, which is what `_load_cache()` above is for.
- **The two halves of the merged tool can disagree about the corpus.** `_INDEX_CACHE` loads once per process, and Part One's rule that config is read at session start applies to it too. Edit a post mid-session and the keyword half sees the change on the next call, because it reads the files live every time, while the embedding half keeps serving the old vectors until the server restarts. One tool, two answers about what the blog says.
- **Ollama being down fails at search time, not startup.** The index builds lazily, so `claude mcp list` reports `✔ Connected`, the tools list normally, and the failure waits until someone searches. The `try` in `_embed` covers both paths that need it, the index build and the query, because `_similar` embeds the query on every single search whether the index is warm or not. The daemon being down surfaces as a plain `ConnectionError`, and the reason goes to stderr, which Part One established is the only channel that will not corrupt the transport.
- **The post you are reading poisoned its own index.** Section 8 has the whole story. A twelve word question matched this file literally, because I had written that question into a to-do comment before I had written the section under it, and the merge rule puts literal matches first. The lesson is not about comments. It is that the corpus is not a fixed thing you index once and reason about afterwards. It contains whatever you are currently writing, including the parts that are not finished, and a post about search is made almost entirely of other posts' vocabulary.
- **The docstring changed three times in two posts.** No ranking, then ranking, then two searches at once. Every time it went stale the model kept working around a limitation that no longer existed. It is still the only description of this tool it will ever see.

## 10. Quick reference

| Task | Command / code |
|---|---|
| Add the deps | `uv add ollama numpy` |
| Pull the model | `ollama pull nomic-embed-text` |
| Embed a batch | `ollama.embed(model=MODEL, input=[...])` |
| Keep chunks under | 2,048 tokens, where Ollama truncates this model |
| Check that limit yourself | `ollama show nomic-embed-text` |
| Prefix documents | `search_document: {text}` |
| Prefix queries | `search_query: {text}` |
| Build the index | `uv run --directory /abs/path server.py --reindex` |
| Normalize | `v / np.linalg.norm(v, axis=1, keepdims=True)` |
| Search | `vecs @ q` then `np.argsort(-scores)[:k]` |
| Cache key | path + `st_mtime_ns` + model name |
| Force a rebuild | `rm index.npz` |
| Inspect the index | `np.load("index.npz", allow_pickle=True)["meta"]` |
| Reload the server | restart Claude Code, config is read at session start |
| Pre-allow headless | `claude -p "..." --allowedTools "mcp__notes__search_notes"` |

Part One's closing line was that the protocol is the easy part and what you put behind the door is your problem. Two stages later that still holds. The ranking fix is twenty lines and should have shipped in Part One. The embeddings are a 768-float vector per section and a matrix multiply.

Neither is the interesting part. The interesting part is that I wrote a whole post about stopping brute force attacks and never once typed the words. Any search I put in front of these notes has to survive that, because the person asking will not know what I called it.

`[ two searches, one door ]`
