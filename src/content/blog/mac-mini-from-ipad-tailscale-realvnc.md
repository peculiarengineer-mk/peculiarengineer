---
title: 'Run a headless Mac mini dev box from an iPad with Tailscale and RealVNC'
description: "How I turned a Mac mini into a headless dev box I drive from an iPad over Tailscale: set it up with a monitor, turn on Apple's built in Screen Sharing, then pull the monitor and reach it with RealVNC Viewer. Nothing is exposed to the internet because Tailscale carries and encrypts the link. Plus the two things that actually bite once the monitor's gone: the 1080p virtual display and the Mac going to sleep on WiFi."
pubDate: 'Jun 20 2026'
heroImage: '../../assets/ipad-mac-tailscale-hero.png'
tags: ['Tailscale', 'RealVNC', 'VNC', 'Mac', 'MacMini', 'iPad', 'RemoteDesktop', 'macOS', 'Headless', 'WireGuard', 'VPN', 'SelfHosted']
---

I have a Mac mini sitting on a shelf with nothing plugged into it but power. It's my
dev box, an Intel Mac mini. It had a monitor while I set it up, then I pulled the
monitor and now I never touch it directly. When I want that full macOS desktop I pick up the iPad on
the sofa and the mini's screen shows up there, full keyboard and trackpad, wherever
I happen to be. No KVM, no walking over to it, and nothing about that Mac is exposed
to the internet.

The whole thing is three pieces, and it's genuinely simple once it's set up:

1. **Tailscale** on both devices, so the iPad and the mini share a private network.
2. **Screen Sharing** turned on in macOS, which is just Apple's built in VNC server.
3. **RealVNC Viewer** on the iPad, pointed at the mini.

That's it. RealVNC Viewer talks straight to Apple's built in Screen Sharing over the
tailnet. No RealVNC Server install on the Mac, no extra account. The parts worth
writing down are the order you do it in (configure with a monitor, then go headless)
and the two things that bite once the monitor is gone.

> **TL;DR:** Install Tailscale on both devices so they share a private `100.x`
> network. While the monitor is still attached, turn on **Screen Sharing**, set a VNC
> password, and set the Mac to **never sleep**. Then pull the monitor (mine sits at
> 1080p headless, which I just left) and connect from **RealVNC Viewer** to the
> mini's MagicDNS name on port `5900`. Apple's VNC is unencrypted, but that's fine
> here because the whole session rides inside Tailscale, which is WireGuard.

## Contents

- [The one thing to get straight](#the-one-thing-to-get-straight)
- [1. Tailscale on both devices](#1-tailscale-on-both-devices)
- [2. Do the setup with the monitor attached](#2-do-the-setup-with-the-monitor-attached)
- [3. Pull the monitor: it lands at 1080p](#3-pull-the-monitor-it-lands-at-1080p)
- [4. Connect from the iPad](#4-connect-from-the-ipad)
- [Gotchas I hit](#gotchas-i-hit)
- [Quick reference](#quick-reference)

## The one thing to get straight

The confusion I started with: there is no Apple "Screen Sharing" app on the iPad.
That app is Mac only. So people assume you can't use Apple's Screen Sharing from an
iPad at all, and go hunting for some other system.

You don't need to. Apple's Screen Sharing is two halves. The *app* (the client) is
Mac only, yes. But the *service* you turn on in System Settings is a plain VNC
server, and any VNC client can talk to it. RealVNC Viewer on the iPad is a VNC
client. So RealVNC Viewer connects to the Mac's built in Screen Sharing directly.
You're using Apple's server with RealVNC's client, and that combination is the whole
trick.

The catch worth knowing: Apple's built in VNC is **not encrypted** on the wire for a
generic client like this. On a normal network that would make me uneasy. Here it
doesn't matter, because the connection never travels as bare VNC. It goes inside the
Tailscale tunnel, which is WireGuard, encrypted end to end. Tailscale is doing the
security job, and Screen Sharing is just painting the picture. If RealVNC Viewer
warns you the connection is unencrypted, that warning is technically right and also
nothing to worry about in this setup.

## 1. Tailscale on both devices

If you've read my [Tailscale post](/blog/tailscale-private-networking-workers-to-prod/)
you already know the model: every device joins a private network and gets a stable
`100.x.y.z` address that follows it across networks, NAT, and reboots. Same idea
here, just two devices instead of a fleet, so I'll keep it short.

**iPad:** install Tailscale from the App Store, sign in to your tailnet. That's the
whole job on the iPad.

**Mac mini:** install Tailscale and sign in to the same tailnet. The standalone app
from Tailscale's site is the one I'd use; it's more capable than the Mac App Store
build.

Here's a nice side effect that matters once the box is on WiFi with no screen. The
mini's local WiFi address is handed out by DHCP and can change. Its **Tailscale
address doesn't**. That `100.x` address (and its MagicDNS name) stays put across
reconnects and reboots, so the iPad always reaches the mini the exact same way, even
if the router gave it a different local IP overnight. Enable **MagicDNS** in the
Tailscale admin console for a name instead of a number, then grab the mini's details
on the Mac:

```bash
tailscale ip -4        # the 100.x.y.z address
tailscale status       # names and IPs for everything on the tailnet
```

From here on I'll call the Mac `mac-mini.your-tailnet.ts.net`. Yours will be
whatever you named it.

## 2. Do the setup with the monitor attached

This is the bit of advice I'd give anyone: get everything working while you can still
see the screen, then pull the monitor. Configuring Screen Sharing, clicking through
the first permission prompts, and confirming a remote session all work blind, but
they're miserable to debug blind. Do them with a display, prove the iPad can connect,
then go headless. So while the monitor is still plugged in:

**Turn on Screen Sharing.** It's the built in VNC server, and it's two clicks plus
one easy to miss step:

1. System Settings, **General**, **Sharing**, toggle **Screen Sharing** on.
2. Click the **info button** next to Screen Sharing, then **Computer Settings**.
3. Tick **"VNC viewers may control screen with password"** and set a password.

That third step is the one people skip. Without it, a third party VNC client like
RealVNC Viewer has no password scheme it can use and the connection fails in a
confusing way. With it, RealVNC Viewer authenticates with that VNC password.

> **Heads up on the password length.** Classic VNC silently truncates the password to
> **eight characters**. That's a limitation of the old VNC protocol, not a macOS bug,
> so a long passphrase gives you a false sense of security here. Keep it to eight
> characters and lean on the fact that the tailnet is doing the real gatekeeping.

**Stop it sleeping.** A headless Mac that goes to sleep drops off the tailnet and
stops answering, and on WiFi that's worse than on ethernet: a sleeping machine lets
its WiFi go, so there's nothing there to wake. You reach for the iPad, the connection
times out, and the mini looks dead when it's just napping. So I set mine to stay on:

```bash
sudo pmset -c sleep 0            # on AC power, never sleep
sudo pmset -c disablesleep 1     # belt and braces
```

You can do the same from **System Settings, Energy**: let the display sleep if you
like, but **prevent the computer itself from sleeping**. While you're there, turn on
**"Start up automatically after a power failure"** so a power blip brings it back on
its own instead of leaving you a dark box on a shelf you have to go press the button
on.

One conflict to avoid: don't have **Remote Management** on at the same time as Screen
Sharing. They both want port `5900` and fight over it. Pick Screen Sharing.

## 3. Pull the monitor: it lands at 1080p

Here's what happens when the monitor comes off. Mine's an Intel Mac mini, and headless
it just sits at **1920x1080**. No black screen, no drama, it keeps serving the desktop
over VNC at 1080p. I left it exactly like that.

None of the rest of this post cares whether your mini is Intel or Apple Silicon. An
Apple Silicon mini lands in the same place here too: with no monitor it auto creates a
virtual display that also comes up around 1080p, so it's the same call either way.

The reason I didn't bother: 1080p is fine to work in when you're viewing it on the
iPad anyway. It fills the screen, the text is readable, and chasing a sharper desktop
wasn't worth it for a box I drive from the sofa.

If your mini behaves worse than mine (some Intel minis drop to an ugly low resolution
or a black screen with no display attached), there are two fixes:

- **A dummy plug** (hardware). A cheap HDMI or DisplayPort headless display emulator
  that makes macOS think a real monitor is attached at a sane resolution. The
  traditional fix for a headless Intel Mac. It pins you to one resolution and it's
  another thing dangling off the back, but it's reliable.
- **BetterDisplay** (software). Creates a virtual display at whatever resolution you
  want, including HiDPI modes, and it persists across reboots.

I didn't need either. 1080p over VNC was good enough and still is.

## 4. Connect from the iPad

Open RealVNC Viewer on the iPad and add a connection pointed at the Mac's tailnet
name:

```
mac-mini.your-tailnet.ts.net
```

Port `5900` is the default VNC port and Screen Sharing's port, so you usually don't
have to type it. The `100.x.y.z` address works just as well if you skipped MagicDNS.
Enter the VNC password you set and you're on the desktop.

Two things turn this from a novelty into something you'd actually develop on:

- **Switch the interaction mode to Touch Panel.** RealVNC Viewer defaults to direct
  touch, where tapping the screen is like tapping that exact spot on the Mac. On a
  full desktop that's maddening. Touch Panel turns the iPad into a trackpad: you drag
  the pointer around and tap to click, which is how a Mac wants to be driven.
- **Pair a Bluetooth keyboard.** Recent RealVNC Viewer builds handle a Magic Keyboard
  or any Bluetooth keyboard properly, so you get real typing instead of the on screen
  keyboard eating half the display. For an actual dev box this is the difference
  between usable and a toy.

Worth restating what makes this safe: nothing is port forwarded, nothing of the mini
sits on a public address, and a scan of your home IP finds no open VNC port. The mini
answers only to devices on your tailnet, and the VNC stream is wrapped in WireGuard
the whole way.

## Gotchas I hit

- **The mini sleeping looks like the network died.** If it stops answering after a
  while, it's almost always sleep, not Tailscale. Set it to never sleep and the
  problem disappears. This is the single most common "it broke" that isn't actually
  broken.
- **Headless lands at 1080p on an Intel mini.** That's just what you get with no
  display attached, and it's perfectly usable from the iPad. A dummy plug or
  BetterDisplay bumps it if you care. I didn't.
- **The "VNC viewers may control screen with password" tick.** Easy to miss, and
  without it RealVNC Viewer can't authenticate against Screen Sharing. First thing to
  check if the connection refuses you. Set it before you pull the monitor.
- **The VNC password truncates to eight characters.** A long one doesn't buy you
  anything. Tailscale is the real gate.
- **Don't run Remote Management and Screen Sharing at once.** Both fight over port
  `5900`. Pick Screen Sharing.
- **FileVault stops a remote reboot dead.** If FileVault is on and the mini reboots,
  it sits at the pre boot unlock screen and nothing remote reaches the desktop until
  someone unlocks it at a keyboard you no longer have plugged in. On a headless shelf
  box that's a real trap. Decide on FileVault before the monitor comes off, not after
  a reboot strands you.

## Quick reference

| Task | Where / command |
|---|---|
| Tailscale on iPad | App Store, sign in to your tailnet |
| Tailscale on Mac | Standalone app, sign in to the same tailnet |
| Mac's tailnet address | `tailscale ip -4` |
| Everything on the tailnet | `tailscale status` |
| Never sleep | `sudo pmset -c sleep 0` (and Energy settings) |
| Hold awake for one session | `caffeinate -dimsu` |
| VNC server on the Mac | System Settings, General, Sharing, Screen Sharing |
| Let VNC clients in | Computer Settings, "VNC viewers may control screen with password" |
| Better headless resolution | BetterDisplay, or an HDMI dummy plug |
| Connect string on iPad | `mac-mini.your-tailnet.ts.net` (port `5900`) |
| Make the iPad usable | RealVNC Viewer, Touch Panel mode, Bluetooth keyboard |

That's the setup: a Mac mini on a shelf with nothing but a power cable, an iPad on
the sofa, a private network between them, and a full dev desktop wherever I sit. Do
the fiddly part with a monitor attached, pull it once the iPad connects, and the
only thing left to remember is to never let the thing sleep. `[ headless ✓ ]`
