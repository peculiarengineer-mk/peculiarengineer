---
title: 'Hardening Ubuntu 26.04 Desktop (Resolute Raccoon)'
description: 'What changes for desktop hardening on Ubuntu 26.04 LTS: TPM-backed full-disk encryption as a first-class option, a Wayland-only session that isolates apps for free, per-app permission prompts, and where the screen-lock setting moved in GNOME 50.'
pubDate: 'Jun 22 2026'
heroImage: '../../assets/ubuntu-2604-desktop-hero.png'
tags: ['Ubuntu', 'Ubuntu2604', 'Linux', 'Security', 'Hardening', 'Encryption', 'TPM', 'Wayland', 'Desktop']
---

Ubuntu 26.04 LTS ("Resolute Raccoon") landed on 23 April 2026, and it is the first release where a few of the security things I used to treat as fiddly extras are just the default path. If you want the version-agnostic checklist, my [general desktop hardening post](/blog/hardening-ubuntu-desktop/) still holds. This one is only the parts that are genuinely different on 26.04, so I am not repeating the firewall and password-manager basics.

> **TL;DR** On 26.04 the big three are TPM-backed full-disk encryption (now a proper option in the installer, with a real tradeoff to understand), a Wayland-only session that sandboxes apps from each other for free, and per-app permission prompts. The screen-lock setting is under Privacy & Security in GNOME 50.

## TPM-backed disk encryption is now the headline option

On 24.04 this was experimental and you had to go looking for it. On 26.04 the installer offers TPM-backed full-disk encryption as a first-class choice alongside the classic passphrase setup, and it is worth understanding the difference before you pick, because they protect against slightly different things.

Classic LUKS asks for a passphrase at every boot. The key is derived from something in your head, so a powered-off laptop is useless to a thief even if they know your login password.

TPM-backed encryption seals the key to the machine's TPM chip and the measured boot state, so the disk unlocks automatically at boot with no passphrase, dropping you straight at the login screen. That is genuinely nicer to live with. The catch is that your login password becomes the real gate, because the disk has already unsealed itself by the time you see the prompt. It defends against someone pulling the drive out and reading it elsewhere (the TPM will not release the key to different hardware), but it leans on Secure Boot and a strong login password rather than on something only you know.

For most people the TPM option is the right call: you get encryption you will not disable out of annoyance. If your threat model includes someone who might coerce or trick the running machine, the passphrase still has its place. Either way, encrypt at install time. Retrofitting is still a backup, wipe, reinstall job.

## Wayland-only, and why that is a quiet security win

GNOME 50 on 26.04 removes the old GNOME-on-X11 session. The desktop runs on Wayland, full stop. Beyond the smoothness, this closes a real hole that lived in X11 for decades: under X11 any app you ran could read every keystroke and screenshot every other window, because the X server did not isolate clients from each other. A malicious or compromised app did not need root to spy on your password manager; it just asked X.

Wayland does not allow that. Apps are isolated, and things like screen capture go through portals that ask permission. You get this for free by being on 26.04, with nothing to configure. The only thing to know is that a handful of older tools that poked at X11 directly (some screen recorders, automation utilities, a few remote-access tools) need their Wayland-native path or a portal, so if something that used to "just work" suddenly cannot see the screen, that is why, and it is the security model doing its job.

## Per-app permission prompts

26.04 leans harder into asking before an app touches sensitive things, in the same spirit as the Flatpak permissions I covered in the general post. You will see prompts when an app wants the camera, the microphone, your location, or to capture the screen, and you can review and revoke those grants in Settings under Privacy & Security. Treat a prompt that does not match what you just did as the warning it is. A text editor asking for the microphone is a reason to stop and look, not to click through.

## Where the screen-lock setting went

This moves between releases and trips people up every time. On 22.04 it was Settings then Privacy then Screen Lock. On 26.04 with GNOME 50 it is Settings then **Privacy & Security** then Screen Lock. Set the idle timeout there, and keep using Super+L by hand whenever you step away. The encryption protects a powered-off machine; the lock protects the one sitting open.

## What carries over unchanged

Everything in the [general hardening post](/blog/hardening-ubuntu-desktop/) still applies on 26.04: automatic security updates are on by default, UFW is the same `default deny incoming` story, a password manager with 2FA is still the highest-leverage online move, and Déjà Dup is still the easy backup. 26.04 does not change any of that. It just makes the encryption and the app-isolation pieces less of a fight, which is exactly the direction I want a desktop OS moving.

One bonus worth knowing: 26.04 is an LTS, so it gets security updates until April 2031, and with a free Ubuntu Pro subscription that extends to ten years. The single best long-term hardening decision is staying on a release that is still getting patches, and an LTS buys you years of not having to think about it.
