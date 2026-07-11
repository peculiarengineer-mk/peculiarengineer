---
title: 'Sharing files between Macs over a network'
description: 'Turn on File Sharing in macOS, choose exactly who can read or write each folder, connect from Finder with SMB, and know when AirDrop is the better tool.'
pubDate: 'Jul 10 2026'
heroImage: '../../assets/mac-file-sharing-hero.png'
tags: ['macOS', 'Mac', 'SMB', 'FileSharing', 'Networking', 'Finder', 'AirDrop']
---

The folder is sitting on the Mac across the room, but reaching it somehow turns into uploading everything to cloud storage and downloading it again. There is a shorter route. One Mac can expose the folder over the local network, and Finder on the other Mac can mount it like another drive in the sidebar.

The one thing to get straight is which Mac does what. The **host** is the Mac with the files. It decides which folders are visible and who can change them. The **connecting Mac** opens those folders through Finder. Once that distinction is clear, the setup is a few clicks on each side.

> **TL;DR.** On the host Mac, open **System Settings**, then **General**, then **Sharing**, and turn on **File Sharing**. Add a folder and give the right user **Read & Write** access. On the other Mac, open Finder, press **Command K**, enter the `smb://` address shown by the host, and sign in with an account from the host Mac. Use the `.local` name instead of the IP address if you want the connection to survive an address change.

## Contents

1. [Set up the host Mac](#set-up-the-host-mac)
2. [Choose the folder and permissions](#choose-the-folder-and-permissions)
3. [Connect from the other Mac](#connect-from-the-other-mac)
4. [Use Finder Network instead](#use-finder-network-instead)
5. [Use the local name, not the IP](#use-the-local-name-not-the-ip)
6. [File Sharing or AirDrop](#file-sharing-or-airdrop)
7. [Gotchas worth knowing](#gotchas-worth-knowing)
8. [Quick reference](#quick-reference)

## Set up the host Mac

Start on the Mac that owns the files.

1. Open the Apple menu and choose **System Settings**.
2. Click **General** in the sidebar.
3. Click **Sharing**.
4. Under **Content & Media**, click the info button next to File Sharing.
5. Turn on **File Sharing**.

The File Sharing window shows two lists. **Shared Folders** controls what leaves the Mac. **Users** controls who can do what inside the selected folder. Turning on the service alone is not the whole setup. You still need to choose a folder and check its permissions.

The same window shows a network address similar to one of these:

```text
smb://192.168.1.42
smb://YourMac.local
```

Write down the address. The `smb://` prefix tells Finder to open a file sharing connection. You do not need to install a server or touch a configuration file. macOS is already running it behind the File Sharing switch.

## Choose the folder and permissions

Under **Shared Folders**, click the plus button and choose the folder you want to share. Select that folder in the list, then look at **Users** on the right.

Each user gets one of three useful permission levels:

| Permission | What it allows |
| --- | --- |
| Read & Write | Open, copy, add, change, and delete files |
| Read Only | Open and copy files, but not change the shared folder |
| Write Only | Add files, but not see what is already in the folder |
| No Access | See nothing inside that share |

Give **Read & Write** only to people who need to change the folder. If another Mac only needs to collect a file, **Read Only** is the safer choice. A shared folder with write access is a folder someone can delete from across the network.

The cleanest setup is to sign in from the other Mac with a normal account that already exists on the host. Guest access does not require an account password and can be enabled for an individual shared folder through **Advanced Options**. That is useful for a temporary drop folder, but it is also easy to leave enabled after the reason for it is gone. Use a registered user for anything that stays available.

Administrator accounts can access the entire Mac over File Sharing, not only the folders in this list. There is also an **Allow full disk access for all users** switch. Leave that off unless you have a specific reason to turn it on. Sharing one folder and sharing the whole disk are very different promises. If you want someone to reach one folder and nothing else, add them as a standard user or create a sharing only account from the Users list.

## Connect from the other Mac

Now move to the Mac that needs the files.

1. Open **Finder**.
2. Choose **Go**, then **Connect to Server**, or press **Command K**.
3. Enter the host address, such as `smb://YourMac.local`.
4. Click **Connect**.
5. Choose **Registered User** and enter a username and password from the host Mac.
6. Select the shared folder you want to mount.

The folder appears in Finder under **Locations**. From there it behaves much like an external drive. You can open files in place or drag them between Macs, subject to the permission you set on the host.

When you are finished, click the eject button next to the share in Finder. Ejecting it closes the connection. It does not delete the shared folder or turn off File Sharing on the host.

If this is a server you use often, open **Go**, then **Connect to Server**, enter the address, and click the plus button to save it as a favorite. You can also select a connected server in Finder and choose **File**, then **Add to Sidebar**.

## Use Finder Network instead

You often do not need the address at all. If both Macs are awake and on the same local network, the host usually announces itself through Bonjour.

1. Open Finder on the connecting Mac.
2. Click **Network** under **Locations**.
3. Open the host Mac.
4. Click **Connect As**.
5. Sign in and choose the shared folder.

This is the easiest path when the Mac appears. The `smb://` address is the dependable path when it does not.

If **Locations** looks empty, move the pointer over the heading and click the disclosure arrow. Still empty? Open **Finder**, then **Settings**, then **Sidebar**, and make sure connected servers are enabled.

## Use the local name, not the IP

An address such as `192.168.1.42` works, but a home router can give that Mac a different address after a reboot. The connection then points at the old IP and Finder acts as if the host disappeared.

The `.local` name follows the Mac instead. Find it on the host under **System Settings**, then **General**, then **Sharing**. The local hostname appears at the bottom of the window. A Mac named `Studio Mac` usually becomes something like this:

```text
Studio-Mac.local
```

Use it with the SMB prefix:

```text
smb://Studio-Mac.local
```

The local name only works while Bonjour can see both machines on the local network. Some guest WiFi networks isolate devices from each other, which means both Macs can reach the internet while remaining invisible to one another. Same WiFi name does not always mean devices are allowed to talk.

## File Sharing or AirDrop

File Sharing and AirDrop move files between Macs, but they solve different jobs.

Use **File Sharing** when you want a folder to stay available, browse files remotely, work with a Mac that acts like a small server, or return to the same share regularly.

Use **AirDrop** when you want to send a few files once and do not need a mounted folder afterward.

1. Open AirDrop from Finder on both Macs.
2. Set discovery to **Contacts Only** or **Everyone**. You may see **Everyone for 10 Minutes** instead.
3. Drag the files onto the other Mac.

AirDrop is a handoff. File Sharing is an ongoing connection. If you only need to move three photos, setting up a permanent share is more ceremony than the job deserves.

## Gotchas worth knowing

1. **The account belongs to the host.** The username and password are for an account on the Mac sharing the files, not necessarily the account you use on the connecting Mac.
2. **A Public folder is already shared.** macOS automatically shares the Public folder for every account. If a folder appears that you did not add, that is probably why. Select it under Shared Folders and click the remove button if you do not want it exposed.
3. **The Macs cannot see each other.** Confirm both are on the same local network. Guest networks and client isolation can block local devices even when internet access works.
4. **The host is asleep.** A sleeping Mac may disappear from Finder until it wakes. Network wake behavior depends on the hardware and power settings.
5. **The firewall has an explicit block.** Turning on File Sharing normally opens what the service needs automatically. If it still fails, open **System Settings**, then **Network**, then **Firewall**, and check Firewall Options for a block. Do not turn the whole firewall off just to make one service work.
6. **Guest login is missing.** Guest access only appears when the host permits it for that folder. A registered user is the more predictable choice.

## Quick reference

| Task | Where to go |
| --- | --- |
| Turn on sharing | System Settings, General, Sharing, File Sharing |
| Add a folder | File Sharing info, Shared Folders, plus button |
| Set access | Select the folder, then set each user to Read & Write or Read Only |
| Find the host address | File Sharing info window |
| Find the local hostname | System Settings, General, Sharing |
| Connect directly | Finder, Go, Connect to Server, or Command K |
| Browse nearby Macs | Finder, Network |
| Disconnect | Eject the share under Finder Locations |
| Send a file once | Finder, AirDrop |

That is the whole setup. The host chooses a folder and a user, the other Mac mounts it through Finder, and the `.local` name keeps the connection from wandering every time the router changes an address. Use AirDrop for a handoff. Use File Sharing when you want the folder to still be there tomorrow.
