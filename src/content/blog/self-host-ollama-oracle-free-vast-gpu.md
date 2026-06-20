---
title: 'Run your own LLM for almost nothing: self-hosting Ollama on cheap cloud'
description: 'How I install and run Ollama on Ubuntu for a private LLM: $0 on Oracle Cloud free ARM, or a few cents an hour on a Vast.ai GPU. Same Ubuntu commands on both, plus the capacity lottery, the no-auth footgun, and how to keep it secure.'
pubDate: 'Jun 19 2026'
heroImage: '../../assets/self-host-ollama-hero.png'
tags: ['Ollama', 'Ubuntu', 'LLM', 'SelfHosted', 'OracleCloud', 'VastAI', 'GPU', 'AI', 'SysAdmin', 'Cloud', 'Docker']
---

A self-hosted LLM costs me either nothing or a few cents an hour, depending on how fast I need it that day. The whole thing is Ollama on a cheap cloud box, and the nice part is the setup barely changes between the free option and the fast one.

Free is Oracle Cloud's Always Free tier: a CPU only ARM box running Ubuntu that handles small models around the clock at no cost. Fast is a rented RTX 3090 or 4090 on Vast.ai, roughly $0.13 to $0.40 an hour, on demand.

The part that makes this worth a single post instead of two: both setups run the exact same Ollama commands. You install Ollama, you `ollama pull` a model, you `ollama run` it, you hit the HTTP API on port 11434. Nothing changes between the free CPU box and the rented GPU except how fast the tokens come out and what you can afford to load. Learn it once, deploy it anywhere.

> **Heads up if you're reading this after June 2026.** Oracle quietly halved the Always Free compute allowance. It used to be 4 OCPU and 24 GB of RAM across your ARM instances; it's now **2 OCPU and 12 GB**. That's still plenty for a small model and an HTTP endpoint, and everything below targets the new 2/12 number so you don't trip over a quota the moment you click create. If you grandfathered in at 4/24, lucky you.

## Contents

- [Part 1: Free forever on Oracle Cloud](#part-1-free-forever-on-oracle-cloud)
- [Part 2: Cheap, fast GPU on Vast.ai](#part-2-cheap-fast-gpu-on-vastai)
- [Securing the API](#securing-the-api)
- [Bonus: a ChatGPT-style UI with Open WebUI](#bonus-a-chatgpt-style-ui-with-open-webui)
- [Which should you choose?](#which-should-you-choose)

## Part 1: Free forever on Oracle Cloud

Oracle Cloud's Always Free tier is the most generous free compute I know of, and it's not close. You get persistent ARM instances that don't expire after a trial window and don't get billed as long as you stay inside the free shape. For a small Ollama box that you SSH into and treat as a personal API, it's perfect.

### Sign up

Go make an Oracle Cloud account. Yes, it asks for a credit card. No, the Always Free resources never charge it. The card is there for identity verification and to gate the paid tier; the free shapes stay free as long as you don't manually upgrade your account or spin up something outside the allowance.

The one decision that matters at signup is your **home region**, because you can't change it later and ARM capacity varies wildly by region. Pick somewhere geographically near you that actually has A1 capacity. More on that in a second, because it's the real footgun here.

### Launch the ARM instance

In the console, go to **Compute > Instances > Create instance**. The settings that matter:

- **Image:** Ubuntu 24.04 (Canonical, the ARM/aarch64 build, not x86)
- **Shape:** click Change shape, pick **Ampere**, then **VM.Standard.A1.Flex**
- **OCPUs and memory:** set it to **2 OCPUs and 12 GB**, which is the full current Always Free ARM allowance
- **Public IP:** make sure "Assign a public IPv4 address" is on
- **SSH keys:** upload your public key, or let Oracle generate a pair and save the private key somewhere you'll find it again

That A1.Flex shape is the whole point. It's ARM, it's free, and 2 OCPUs of Ampere will run a 3B model at a real if unhurried clip. Expect roughly **5 to 8 tokens per second** on CPU. That's not going to win races, but for a personal endpoint, a coding sidekick, or batch jobs that don't care about latency, it's completely fine.

> **The "Out of capacity" ARM lottery is the real Oracle tax.** A1 free capacity is heavily oversubscribed, so hitting Create and getting back `Out of host capacity` is normal, not a you problem. Three things that actually help: try a **different availability domain** in the dropdown (AD-1, AD-2, AD-3 are separate pools), try again at **off peak hours** for your region, or stop clicking the button by hand and script a retry. The classic move is a small Terraform config (or a bash loop hitting the OCI CLI) that retries the launch every minute until capacity frees up. Set it running, walk away, and you'll usually have an instance within a few hours.

### Open SSH and nothing else

Here's the bit that trips people up. Oracle's default **security list** blocks all inbound traffic except whatever you explicitly allow, and a fresh VCN only opens port 22. That's a good default, so leave it that way. You do **not** want to punch a hole for Ollama's port 11434 to the internet, because Ollama ships with no auth and exposing it raw means anyone can use (and abuse) your endpoint.

So the security list keeps **only port 22 open**. To talk to Ollama from your laptop, you tunnel over SSH instead of opening the port:

```bash
ssh -L 11434:127.0.0.1:11434 ubuntu@<your-instance-ip>
```

Now `localhost:11434` on your machine is wired straight to Ollama on the box, encrypted, with zero exposed ports. We'll cover doing this properly with real auth later in [Securing the API](#securing-the-api), but the tunnel is the safe default and it's free.

### SSH in and install Ollama

Connect as the `ubuntu` user (that's the default on Oracle's Ubuntu images):

```bash
ssh ubuntu@<your-instance-ip>
```

Install Ollama with the official script. It detects ARM, pulls the right binary, and sets up a systemd service so Ollama starts on boot and stays running:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

Confirm it's alive:

```bash
ollama --version
systemctl status ollama
```

You want the service showing `active (running)`. If it is, Ollama is already listening on `127.0.0.1:11434` and you're past the hard part.

### Pull a model and run it

On 2 OCPUs and 12 GB you're in small model territory, and that's genuinely fine. My default is `llama3.2:3b`, which fits comfortably in RAM and responds at that 5 to 8 tok/s pace:

```bash
ollama pull llama3.2:3b
ollama run llama3.2:3b
```

That drops you into an interactive prompt. Type at it, get answers, and press **Ctrl+D** to exit when you're done. The model stays cached on disk, so next time `ollama run` is instant.

A couple of other models that behave well on this box:

```bash
ollama pull qwen2.5:7b-instruct-q4_K_M   # 7B but quantized to 4-bit, still fits in 12 GB
ollama pull phi3:mini                     # tiny and quick, good for simple tasks
```

The `q4_K_M` quantization on that Qwen build is what lets a 7B model squeeze into 12 GB of RAM. It's slower than the 3B, but noticeably smarter, so it's my pick when I can spare the wait.

### Use the HTTP API

The interactive prompt is nice for poking around, but the reason you stood this thing up is the API. Ollama serves an HTTP API on `127.0.0.1:11434`. With your SSH tunnel open, test it from your laptop (or run it directly on the box):

```bash
curl http://127.0.0.1:11434/api/generate -d '{
  "model": "llama3.2:3b",
  "prompt": "Why is the sky blue?",
  "stream": false
}'
```

You'll get back a JSON blob with the completion in the `response` field. Setting `"stream": false` gives you the whole answer in one object instead of a stream of token chunks, which is easier to deal with when you're testing. Flip it to `true` once you're wiring it into something that wants to render tokens as they arrive.

That's the free tier done: an always on ARM box, Ollama running as a service, a small model answering over an SSH tunnel, and a monthly bill of exactly nothing. It's slow, but it's mine, and it never sends a token to anyone else's server.

## Part 2: Cheap, fast GPU on Vast.ai

Oracle's free tier is great until you want to run something bigger than 7B at a speed that doesn't make you stare at the wall. That's where Vast.ai comes in. It's a marketplace where people rent out their GPUs, so you get an RTX 3090 or 4090 for cents per hour instead of the eye watering rates the big clouds charge. The catch is you pay by the hour, so the whole game is renting it, doing your thing, and shutting it off. More on that at the end, because it's the part that actually matters.

### What it actually costs

Vast is a marketplace, so prices float with supply and the exact number changes by the hour. As a sane baseline (checked June 2026), the [RTX 3090](https://vast.ai/pricing/gpu/RTX-3090) sits around **$0.13/hr** and the [RTX 4090](https://vast.ai/pricing/gpu/RTX-4090) around **$0.36/hr** on demand. Storage is billed separately and it's pennies, but it keeps ticking while the instance exists, which is the whole reason you Destroy when you're done.

> **Interruptible instances are 50% or more cheaper, and fine for this.** Vast has three pricing modes: on demand (steady, never reclaimed), interruptible (a spot style bid that can get preempted when someone outbids you), and reserved (cheapest per hour but you commit to a block of time). For poking at a model interactively, interruptible roughly halves the bill and the worst case is your box gets reclaimed and you rent another one. I only bother with on demand when I'm running something I don't want yanked mid job.

Check the [live pricing page](https://vast.ai/pricing) before you rent; treat the numbers here as a ballpark, not a quote.

### Sign up and add a little credit

Make an account at [vast.ai](https://vast.ai) and drop $5 of credit on it. That's not a typo. At these prices $5 buys you a lot of hours, and you don't want to be standing up an instance only to find you can't because your balance is zero.

### Find a GPU

Open the search/console and look for an instance with:

- An **RTX 3090 or 4090**. 24 GB of VRAM is plenty for anything in the 8B to 13B range with room to spare.
- At least **30 GB of disk**. Models are big and you'll pull more than one.
- A good **host reliability rating**. Sort by price by all means, but the cheapest box run by someone with a flaky uptime score is a false economy. A host that vanishes mid pull is not saving you money.

### Pick a base image

You want a CUDA runtime image so the GPU is actually usable. Something like:

```
nvidia/cuda:12.x-runtime-ubuntu22.04
```

works fine. If Vast has an Ollama template in the list, even easier, grab that and you can skip half the setup.

### Rent it and SSH in

Rent the instance, wait for it to spin up, then copy the SSH command Vast gives you. It looks like this:

```bash
ssh -p <PORT> root@<PUBLIC_IP>
```

Once you're in, install Ollama with the exact same one liner from Part 1:

```bash
curl -fsSL https://ollama.com/install.sh | sh
```

It detects CUDA automatically and wires up GPU support for you. No extra flags, no fiddling with drivers. Same command on the free CPU box and the rented GPU, which is the nice thing about this setup.

### Run a real model

Now you can actually stretch your legs:

```bash
ollama pull llama3.1:8b
ollama run llama3.1:8b
```

Confirm the GPU is doing the work and not the CPU:

```bash
ollama ps     # PROCESSOR column should say something like "100% GPU"
nvidia-smi    # you should see the ollama process eating VRAM
```

If `ollama ps` shows the model running on CPU, something's off with the CUDA image and you're paying GPU prices for CPU speed. Fix that before you do anything else.

### STOP the instance when you're done

This is the one that gets people, so read it twice.

> **Billing runs while the instance runs.** Vast charges you for every hour the box is up, whether you're hammering it or it's sitting idle with you logged off. The model doesn't have to be doing anything. The instance just has to exist.

Two buttons, two outcomes:

- **Stop** pauses the instance and keeps your disk around for a tiny storage fee. Good if you're coming back tomorrow and don't want to pull everything again.
- **Destroy** deletes the instance and the disk. Now you pay nothing. Zero. This is what you want when you're truly finished.

A forgotten GPU humming away for a week is the only way this setup ever costs you real money. It's not the model, it's not the pull, it's the instance you forgot about. Get in the habit of hitting Destroy the second you're done, the same way you lock the front door.

## Securing the API

Here's the thing nobody tells you up front: Ollama has no authentication. None. There's no username, no password, no token. Whatever can reach port 11434 can use your model, pull models, and burn your GPU hours.

So the rule is simple: **never bind Ollama to a public IP.** Bots scan the entire internet for open 11434 constantly. Leave it exposed and you'll have company faster than you'd believe.

There are two sane ways to reach it from your laptop.

### Option A: SSH tunnel (recommended)

This is what I use. Nothing gets exposed, everything's encrypted, and there's nothing extra to install because you already have SSH.

```bash
ssh -L 11434:localhost:11434 ubuntu@<PUBLIC_IP>
```

That forwards port 11434 on your laptop to port 11434 on the remote box, through the SSH connection. Now `localhost:11434` on your machine talks to remote Ollama as if it were running locally, fully encrypted, with nothing open to the world. Point your code or your tools at `http://localhost:11434` and they have no idea the model is on another continent.

Works exactly the same for Oracle and Vast. One command, done. For most people this is the whole answer and you can stop reading here.

### Option B: Caddy reverse proxy

If you genuinely need the API reachable over the open internet (a hosted app calling it, a teammate who can't tunnel), put it behind Caddy. You get a login and automatic HTTPS for basically free.

First make a password hash:

```bash
caddy hash-password
```

It'll prompt you and spit out a hash. Drop that into a `Caddyfile`:

```
llm.yourdomain.com {
    basicauth {
        keith <PASTE_THE_HASH_HERE>
    }
    reverse_proxy localhost:11434
}
```

Caddy sorts out the TLS certificate on its own. Now your endpoint is behind a username and password, served over HTTPS, and Ollama itself stays bound to localhost where it belongs.

### Firewall basics

Either way, lock the box down with `ufw`:

```bash
sudo ufw allow 22       # SSH, or you'll lock yourself out
sudo ufw allow 443      # only if you're running Caddy
sudo ufw enable
```

If you're tunneling over SSH (Option A), you don't need 443 open at all. Just 22.

> **Oracle has a second firewall.** `ufw` runs on the instance, but Oracle Cloud also has its own security list at the network level. If a port works locally but not from outside, it's almost always the Oracle security list still blocking it. You have to open the port in both places. This one wastes an hour of everyone's life exactly once.

## Bonus: a ChatGPT-style UI with Open WebUI

The terminal is fine, but sometimes you want the actual chat interface with history, multiple models in a dropdown, the whole thing. Open WebUI gives you that, with its own login, in a single Docker command:

```bash
docker run -d -p 3000:8080 \
  --add-host=host.docker.internal:host-gateway \
  -v open-webui:/app/backend/data \
  --name open-webui \
  --restart always \
  ghcr.io/open-webui/open-webui:main
```

Then point a browser at:

```
http://localhost:3000
```

Do this over an SSH tunnel too. Same trick as before, forward port 3000 the way you forwarded 11434, and you get the full ChatGPT-style experience driving your own model, with nothing exposed to the internet. It finds Ollama through `host.docker.internal` automatically, so there's nothing else to configure.

## Which should you choose?

| Option | Cost | Best for | Speed | Notes |
| --- | --- | --- | --- | --- |
| Oracle Cloud Free | $0/mo | Small models (1B-7B), always on | Slow (CPU) | Free forever, but signup capacity can be a lottery |
| Vast.ai | ~$0.13-0.40/hr | Medium models (8B-13B), on demand | Fast (GPU) | Cheapest way to real speed, but stop it when idle |
| Hetzner CAX | ~$7-14/mo | Reliable small-model hosting | Slow (CPU) | No capacity lottery, EU based |
| RunPod Serverless | ~$0.69/hr active, $0 idle | Bursty, occasional 8B+ | Fast (GPU) | Scales to zero, but needs container setup, not plain Ollama |

So which one? If you're just experimenting or sticking to small models, start with Oracle's free tier and pay nothing. The moment you need real speed for 8B and up, rent a GPU on Vast.ai, run the exact same Ollama commands, and stop the instance when you're done. If you want something reliable and always on without rolling the dice on Oracle's capacity, a Hetzner CAX box at around $7 a month is the boring, dependable answer. And if your usage is genuinely bursty, a few requests now and then, RunPod Serverless scales to zero so you only pay when something's actually running.

Either way you come out the other side with a private LLM you fully control, running for somewhere between absolutely free and a few cents an hour. Try getting that out of an API subscription.
