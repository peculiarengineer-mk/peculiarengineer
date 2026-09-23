# firewalld lab for the Rocky Linux 10 post

This is the lab for [firewalld for ufw people on Rocky Linux 10](https://peculiarengineer.com/blog/firewalld-for-ufw-people-rocky-linux-10/). It puts a firewall box and two clients on one private network so you can run most of the post on your own machine, with no cloud account. The firewall box boots with systemd running and no firewalld installed, which is the state the post starts from. The list further down says what does not carry over.

## What you need

- Docker Engine or Docker Desktop with Compose 2.15 or later.
- A host with cgroup v2. Rocky 10's systemd does not run on cgroup v1. Any current Docker Desktop, and most Linux distributions from the last few years, are cgroup v2.
- On Intel or AMD, a CPU with x86-64-v3 (roughly Haswell, 2013, or newer). Rocky 10 will not start on older CPUs.
- Willingness to run a privileged container. See the next section.

I tested it with Docker Desktop on an Intel Mac. I have not tested it on Apple Silicon, on Docker Engine on a Linux host, on Podman, or on rootless Docker.

## The server container is privileged

`compose.yaml` runs the server with `privileged: true`, so systemd can run as PID 1 and firewalld can load nftables rules. A privileged container is root on the Docker host: with Docker Engine on Linux that is your machine, with Docker Desktop it is Desktop's Linux VM. That is fine for a throwaway lab on a laptop or a spare box. Do not run it on a machine that matters, and take it down when you are done.

## Start it

```console
$ docker compose up -d --build
$ docker compose exec server bash
```

You are root inside, and `sudo` is installed, so the post's commands work with or without it. Start at section 1 of the post: `sudo dnf install firewalld`, then `sudo systemctl enable --now firewalld`. The package count will differ from the post's ten, because this image is not the cloud image and has a different set of packages already installed.

Already running on the server: web listeners on 8080 and 9100 (standing in for the `python3 -m http.server` processes in the post) and sshd on 22, so the post's port 22 checks and the ssh `drop` rule behave the same. Section 4 also wants a listener on 7000 for its long lived connection. Start one in the server shell with `ncat -lk 7000 &`, open the port with `sudo firewall-cmd --add-port=7000/tcp` (a runtime rule, which is the point of that section), and connect from a client with `docker compose exec client20 ncat 10.20.1.10 7000`.

## How the post maps to the lab

| In the post | In the lab |
| --- | --- |
| the firewall box at 10.20.1.10 | the `server` service |
| the client I tested from at 10.20.1.20 | `docker compose exec client20 curl ...` |
| `curl --interface 10.20.1.21 ...` from the client's second address | `docker compose exec client21 curl ...` |
| the private interface `eth1`, which sits in `no zone` | the container's `eth0`, which shows `no zone` the same way. Type `eth0` wherever the post says `eth1`, including `--change-interface=eth1` in section 6 and `--remove-interface=eth1` in section 7 |
| a reboot of the firewall box | `docker compose restart server` |

`docker compose restart server` keeps the container's files, so firewalld stays installed and the permanent rules come back, while runtime rules are gone, as after a reboot. `docker compose down` followed by `up` is not a reboot: it throws the container away and you start again from a box without firewalld.

## What does not replicate

- **The public interface.** The post's box has `eth0` in `public` and `eth1` in no zone. The container has one interface, in no zone. So in sections 2 and 6, `--list-all` shows `public` with no interfaces and `--get-active-zones` shows `public (default)` with nothing under it. The rules still apply, because traffic from an interface in no zone gets the default zone.
- **Denied packet log lines** from `--set-log-denied` in section 8. The kernel does not log netfilter rejections from a container's network namespace by default (`net.netfilter.nf_log_all_netns` is 0), so no `filter_IN_public_REJECT` lines appear. `journalctl -k` still shows other kernel messages from the host.
- **Zones on an interface NetworkManager manages**, the `eth0` half of section 6. There is no NetworkManager in the container, and no `nmcli`. Skip that part: the container's only interface is also called `eth0`, and moving it into `home` would work without the NetworkManager message and then get in the way of section 7.
- **SELinux**, from the checklist in section 8. The container has no SELinux policy of its own, so the post's `semanage port` case cannot happen here.
- **The provider firewall timeout** from outside. There is no cloud firewall in front of the lab. Traffic between the containers still crosses Docker's bridge on the host, so host firewall rules can in principle get in the way, though they did not in my test.

## If 10.20.1.0/24 is taken

If another Docker network already uses `10.20.1.0/24`, `docker compose up` fails. If a VPN or your LAN uses it, the lab may start and your traffic to that network may go to the lab instead. Either way, change the subnet and the three addresses in `compose.yaml`, and then use your addresses instead of the post's in every command.

## Stop and clean up

```console
$ docker compose down --rmi local
```

That removes the containers, the network and the images the build created.
