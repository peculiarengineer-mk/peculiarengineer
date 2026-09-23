# syntax=docker/dockerfile:1
# Pinned by tag and not by digest, so the image a reader builds is the Rocky
# Linux 10 the post talks about, not one specific rebuild of it.
FROM rockylinux/rockylinux:10 AS server

RUN dnf -y install systemd sudo iproute procps-ng python3 curl nmap-ncat openssh-server \
    && dnf clean all

# The post runs two throwaway http.server listeners on the firewall box. As
# systemd units they come back by themselves after `docker compose restart`,
# which stands in for the post's reboot.
COPY <<'EOF' /etc/systemd/system/lab-web-8080.service
[Unit]
Description=Lab web listener on port 8080
After=network.target

[Service]
ExecStart=/usr/bin/python3 -m http.server 8080 --bind 0.0.0.0
WorkingDirectory=/tmp
Restart=always

[Install]
WantedBy=multi-user.target
EOF

COPY <<'EOF' /etc/systemd/system/lab-web-9100.service
[Unit]
Description=Lab web listener on port 9100
After=network.target

[Service]
ExecStart=/usr/bin/python3 -m http.server 9100 --bind 0.0.0.0
WorkingDirectory=/tmp
Restart=always

[Install]
WantedBy=multi-user.target
EOF

# sshd is here so the post's port 22 checks and the ssh drop rule behave the
# same. Nobody logs in; the clients only open TCP connections to it.
RUN systemctl enable sshd.service lab-web-8080.service lab-web-9100.service

# systemd as PID 1 treats SIGTERM as a request to re-execute itself, not to
# stop. SIGRTMIN+3 asks it to halt, which ends the container cleanly.
STOPSIGNAL SIGRTMIN+3
CMD ["/sbin/init"]

FROM rockylinux/rockylinux:10 AS client

# No systemd here. The client only sends the packets the post sends.
RUN dnf -y install iproute curl nmap-ncat \
    && dnf clean all

CMD ["sleep", "infinity"]
