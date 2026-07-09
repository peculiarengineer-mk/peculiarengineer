---
title: 'Kubernetes, Part One: deploy an app on a single k3s node and watch it heal'
description: 'The whole Kubernetes loop on one k3s node: deploy nginx, break a Pod and watch it self-heal, scale it, and roll out an update with no downtime.'
pubDate: 'Jul 7 2026'
heroImage: '../../assets/k3s-hero.png'
tags: ['Kubernetes', 'k3s', 'kubectl', 'DevOps', 'SelfHosted', 'Containers', 'Tutorial']
---

I put [k3s](https://k3s.io) on a spare Ubuntu box on my LAN so I'd finally have a real cluster to poke at instead of reading about one. k3s is Kubernetes with the enterprise weight stripped out: a single binary, one `curl` to install, and it runs happily on a machine you'd otherwise use as a doorstop. What I got out of it was somewhere to actually *see* the one idea that makes Kubernetes make sense, the reconciliation loop, instead of nodding along to a diagram.

I'm assuming you already have k3s running. If you don't, `curl -sfL https://get.k3s.io | sh -` on a Linux box gets you there. Everything below is what happens next, and the one gotcha that hits you thirty seconds in.

> **TL;DR** Copy the k3s config to your home folder and point `KUBECONFIG` at it (Step 0, this is the part that bites everyone). Then `kubectl apply -f` a Deployment and a Service, `kubectl delete pod` one of them and watch a replacement appear, `kubectl scale` to resize, edit the image and re-apply for a rolling update, and `kubectl delete -f` to clean up. Both manifests are inline below, commented line by line.

## Contents

- [The one idea worth holding onto](#the-one-idea-worth-holding-onto)
- [The words you'll meet](#the-words-youll-meet)
- [Step 0: give your user cluster access](#step-0-give-your-user-cluster-access)
- [Step 1: check the cluster is alive](#step-1-check-the-cluster-is-alive)
- [Step 2: read a manifest before you run it](#step-2-read-a-manifest-before-you-run-it)
- [Step 3: deploy the app](#step-3-deploy-the-app)
- [Step 4: watch it come to life](#step-4-watch-it-come-to-life)
- [Step 5: the magic moment, break it and watch it heal](#step-5-the-magic-moment-break-it-and-watch-it-heal)
- [Step 6: scale up, then back down](#step-6-scale-up-then-back-down)
- [Step 7: actually visit the app](#step-7-actually-visit-the-app)
- [Step 8: roll out an update with no downtime](#step-8-roll-out-an-update-with-no-downtime)
- [Step 9: the three debugging commands](#step-9-the-three-debugging-commands)
- [Step 10: clean up](#step-10-clean-up)
- [Gotchas I hit](#gotchas-i-hit)
- [Quick command reference](#quick-command-reference)

## The one idea worth holding onto

Everything in Kubernetes reduces to one sentence:

> **You declare the state you want. Kubernetes continuously makes reality match it.**

You never say "start this container on that machine." You say "I want 3 copies of my app running," and Kubernetes places them, watches them, and if one dies it makes another. That loop is the whole product. You'll watch it happen with your own eyes in Step 5, and once you see it, the rest of Kubernetes stops feeling like a pile of unrelated nouns and starts looking like variations on that one loop.

## The words you'll meet

A handful of terms show up in every command below. Quick definitions so nothing trips you:

- **Container** is your app, packaged in a self-contained box (the same thing Docker builds).
- **Pod** is the smallest thing Kubernetes runs: a thin wrapper around one container.
- **Node** is one machine in the cluster. Mine is a single node running k3s.
- **Cluster** is all the nodes managed together as one system.
- **kubectl** is the command-line tool you talk to the cluster with.
- **Manifest** is a YAML file describing what you want. You'll write two.

## Step 0: give your user cluster access

The cluster is running, but its config file is readable by `root` only. This is the first thing that bites you, so it's worth doing right once. k3s writes its credentials to `/etc/rancher/k3s/k3s.yaml`, owned by `root` with mode 600, and that's the file `kubectl` needs to reach the cluster. Read it as your normal user and you get `permission denied`. The fix is to copy the file to a spot you own and point `KUBECONFIG` at the copy.

**▶ Do** (you'll be asked for your password once):

```bash
mkdir -p ~/.kube
sudo install -m 600 -o "$(id -u)" -g "$(id -g)" /etc/rancher/k3s/k3s.yaml ~/.kube/config
echo 'export KUBECONFIG=$HOME/.kube/config' >> ~/.bashrc
export KUBECONFIG=$HOME/.kube/config
```

**✅ You should see** no output at all. In Unix, silence is success.

**💡 What happened:** `kubectl` finds a cluster by reading the file named in `KUBECONFIG`, falling back to `~/.kube/config` if the variable is unset. You made a copy your user owns, then pointed `KUBECONFIG` at it, now and in every future shell thanks to the `.bashrc` line. Every command from here works without `sudo`. (If you'd rather skip your own `kubectl` entirely, `sudo k3s kubectl ...` uses the bundled one against the root config, but repointing `KUBECONFIG` once is cleaner than typing `sudo` all day.)

If you've already got a terminal open from before this change, run `export KUBECONFIG=$HOME/.kube/config` in it once, or just open a fresh one. If you're on a headless box you reach over SSH, this is worth pairing with a locked-down setup: see [SSH keys for Ubuntu](/blog/set-up-ssh-keys-ubuntu/) and [UFW firewall basics](/blog/ufw-firewall-basics-ubuntu/).

## Step 1: check the cluster is alive

**▶ Do:**

```bash
kubectl get nodes
```

**✅ You should see** one machine, `Ready`, named after your host:

```text
NAME        STATUS   ROLES                  AGE   VERSION
homelab01   Ready    control-plane,master   1d    v1.36.2+k3s1
```

**💡 What happened:** `kubectl get <thing>` is the command you'll run most. It lists things. `Ready` means the node is healthy and able to run your apps. On a big cluster you'd see a wall of nodes here. Mine does both the brain job (control-plane) and the muscle job (running Pods) on one machine, which is exactly what you want for learning.

## Step 2: read a manifest before you run it

Here's the Deployment you're about to apply. Save it as `nginx-deployment.yaml`. Every Kubernetes object has the same four top-level fields, and once you can spot them you can read almost any manifest:

```yaml
# nginx-deployment.yaml
apiVersion: apps/v1        # which API this object belongs to
kind: Deployment           # WHAT you're creating
metadata:
  name: web                # its name, how you'll refer to it later
  labels:
    app: web
spec:                      # the DESIRED STATE, your "wish"
  replicas: 3              # "always keep 3 copies of this running"
  selector:
    matchLabels:
      app: web             # this Deployment manages Pods with this label
  template:                # the blueprint for each Pod it creates
    metadata:
      labels:
        app: web           # every Pod gets stamped with this label
    spec:
      containers:
        - name: nginx
          image: nginx:1.27 # the container image to run
          ports:
            - containerPort: 80
```

The `spec` is the wish. `replicas: 3` is you telling Kubernetes "keep 3 of these alive, forever, no matter what." The `selector` and the `template` labels have to agree: that's how the Deployment knows which Pods are its responsibility. That label match is the single most common thing people typo, so it's worth a second look.

**💡 What happened:** You learned to read a manifest, which is most of the battle. Almost every object you'll ever create follows this exact `apiVersion` / `kind` / `metadata` / `spec` shape.

## Step 3: deploy the app

You also need a Service to sit in front of the Pods. Save this as `nginx-service.yaml`:

```yaml
# nginx-service.yaml
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web          # send traffic to any Pod with this label
  ports:
    - port: 80        # the port the Service listens on
      targetPort: 80  # the port on the Pod it forwards to
```

**▶ Do** apply both files:

```bash
kubectl apply -f nginx-deployment.yaml
kubectl apply -f nginx-service.yaml
```

**✅ You should see:**

```text
deployment.apps/web created
service/web created
```

**💡 What happened:** `kubectl apply -f <file>` submits your wish to the cluster. Notice you never said *how* to run anything: you handed over a description and let Kubernetes work out the placement. That declarative style is what real teams use, because these files live in git and get reviewed like any other code. It's the same reason I keep [Docker Compose files in version control](/blog/plex-sabnzbd-docker-compose-hardware-transcoding/) instead of running containers by hand.

## Step 4: watch it come to life

**▶ Do** (run it a few times over ~15 seconds, or add `-w` to watch live and Ctrl+C to stop):

```bash
kubectl get pods
```

**✅ You should see** 3 Pods move from `ContainerCreating` to `Running`:

```text
NAME                  READY   STATUS    RESTARTS   AGE
web-595d5fcfb-472tz   1/1     Running   0          20s
web-595d5fcfb-brkw2   1/1     Running   0          20s
web-595d5fcfb-l6l2r   1/1     Running   0          20s
```

Now look at the whole family tree one file created:

```bash
kubectl get deployment,replicaset,pods
```

**💡 What happened:** You created *one* Deployment and got a **ReplicaSet** and **3 Pods** for free. The Deployment made a ReplicaSet, and the ReplicaSet has exactly one job: keep 3 Pods with the `app: web` label alive. You're about to watch it do that job. The random suffixes (`-472tz`) are the tell that Pods are disposable: treated as interchangeable cattle, not pets you name and nurse.

## Step 5: the magic moment, break it and watch it heal

This is the step that makes Kubernetes click. Delete a Pod and watch what happens.

**▶ Do** copy any one Pod name from Step 4 and delete it:

```bash
kubectl delete pod web-595d5fcfb-472tz    # use a real name from YOUR output
kubectl get pods
```

**✅ You should see** still **3 Pods**. One is brand new: tiny `AGE`, different name:

```text
NAME                  READY   STATUS    RESTARTS   AGE
web-595d5fcfb-brkw2   1/1     Running   0          2m
web-595d5fcfb-l6l2r   1/1     Running   0          2m
web-595d5fcfb-wsw6h   1/1     Running   0          5s    <- the replacement
```

**💡 What happened:** You said you wanted 3. You deleted one, leaving 2. Within seconds Kubernetes noticed reality (2) didn't match your wish (3) and made a replacement. No human, no alert, no cron job, no script you had to write. That's the self-healing reconciliation loop, and it *is* Kubernetes. If a whole machine had died instead of one Pod, the exact same thing would happen on the surviving machines. This is the moment I stopped seeing Kubernetes as complicated and started seeing it as one idea applied relentlessly.

## Step 6: scale up, then back down

**▶ Do** change your wish from 3 copies to 5, just by saying so:

```bash
kubectl scale deployment web --replicas=5
kubectl get pods
```

**✅ You should see** 2 new Pods appear, for 5 total. Scale back down when you're done gawking:

```bash
kubectl scale deployment web --replicas=3
```

**💡 What happened:** Scaling isn't a special operation with its own machinery. You declared a new desired number and Kubernetes reconciled to it, the same loop as Step 5. The same one command handles a traffic spike at noon and saving power at 2 a.m.

## Step 7: actually visit the app

Your app runs *inside* the cluster. To reach it from your laptop, forward a local port to the Service.

**▶ Do** (this command keeps running, leave it open):

```bash
kubectl port-forward service/web 8080:80
```

**✅ You should see:**

```text
Forwarding from 127.0.0.1:8080 -> 80
```

Open a **second terminal** and hit it:

```bash
curl http://localhost:8080
```

You'll get the nginx **"Welcome to nginx!"** HTML back. Press **Ctrl+C** in the first terminal to stop forwarding.

**💡 What happened:** You aimed at the **Service** named `web` instead of any single Pod. A Service has a stable address and, for real traffic inside the cluster, load-balances across all 3 Pods behind it. Pods come and go, as you watched in Step 5, but the Service in front of them stays put, which is why apps point at Services and never at Pods directly: the Pod you targeted this morning might not exist this afternoon.

One honest caveat about what you just ran: `port-forward` is a debugging shortcut, not the real data path. It resolves the Service to its Pods, picks *one*, and tunnels your local port straight to it, so every `curl` in this step hit the same Pod and bypassed the load-balancing. To actually watch traffic spread across all 3 you'd hit the Service's cluster IP from inside the cluster. For "is my app up from my laptop," `port-forward` is exactly the right tool.

## Step 8: roll out an update with no downtime

**▶ Do** open `nginx-deployment.yaml`, change `image: nginx:1.27` to `image: nginx:1.28`, save, then re-apply and watch:

```bash
kubectl apply -f nginx-deployment.yaml
kubectl rollout status deployment web
```

**✅ You should see** the rollout march along and finish with:

```text
deployment "web" successfully rolled out
```

**💡 What happened:** Kubernetes replaced the Pods a few at a time, bringing new ones up *before* removing old ones, so there's never a moment with fewer than 3 copies serving. (It counts a Pod as "up" the instant its container is Running. Teaching it to wait until your app has actually finished starting is what readiness probes are for, and that's a later part.) If the new version were broken, you'd undo it instantly:

```bash
kubectl rollout undo deployment web
```

That undo is the safety net that makes rolling forward feel a lot less scary.

## Step 9: the three debugging commands

Real learning includes things going sideways. These three commands answer "why is this thing not Running?":

```bash
kubectl get pods              # Is it Running? Or stuck? Read the STATUS column.
kubectl describe pod <name>   # Scroll to the "Events:" section at the very bottom.
kubectl logs <name>           # What did the app itself print before it died?
```

The statuses you'll actually see, and what each one usually means:

| STATUS | Usually means |
|---|---|
| `Running` | Healthy. |
| `Pending` | Can't be placed yet: not enough resources, or waiting on storage. |
| `ContainerCreating` | Normal and brief. It's starting up. |
| `ImagePullBackOff` | Bad image name, or the registry can't be reached. |
| `CrashLoopBackOff` | App starts, crashes, restarts, repeats. Read `logs`. |

`describe` and `logs` are the two I reach for every single time. `describe` tells you what Kubernetes tried to do and why it couldn't; `logs` tells you what your app did right before it fell over.

## Step 10: clean up

**▶ Do** delete everything you made, by pointing at the same files:

```bash
kubectl delete -f nginx-deployment.yaml -f nginx-service.yaml
```

**✅ You should see:**

```text
deployment.apps "web" deleted
service "web" deleted
```

Confirm it's gone:

```bash
kubectl get pods
# No resources found in default namespace.
```

**💡 What happened:** `delete -f` removes exactly what a file describes. Because the Deployment owned the ReplicaSet, which owned the Pods, deleting the Deployment cascaded down and cleaned up all of them. No orphans left behind.

## Gotchas I hit

The things that actually cost me time, so they don't cost you any:

- **`permission denied` on the very first `kubectl` command.** This is the `KUBECONFIG` pointing at the root-owned k3s file, and it's why Step 0 exists. If you skipped it or opened a new shell before the `.bashrc` line took, you'll hit it. Fix: `export KUBECONFIG=$HOME/.kube/config`, or source your `.bashrc`.
- **Editing the config in place instead of copying it.** Don't chmod the original `/etc/rancher/k3s/k3s.yaml`. A k3s upgrade or restart can rewrite it and quietly undo your permission change. Copy it to `~/.kube/config` and leave the original alone.
- **The selector and template labels not matching.** If a Deployment's `spec.selector.matchLabels` doesn't match its `spec.template.metadata.labels`, the API server rejects the `apply` outright with `selector does not match template labels`. A Service is the quieter version of the same mistake: a Service whose selector matches no Pods takes the config happily and then routes to nothing, so when a `port-forward` connects but every request hangs or 503s, check that the Service selector matches the Pod labels.
- **`port-forward` looks hung.** It isn't. `Forwarding from 127.0.0.1:8080 -> 80` is the success message, and the command is *supposed* to sit there occupying the terminal. Open a second terminal to actually curl it.
- **Deleting a Pod expecting it to stay dead.** It won't, and that's the entire point. To actually remove the app you delete the Deployment (Step 10), not the Pods. Delete a Pod and the ReplicaSet cheerfully makes another, every time.

## Quick command reference

| Goal | Command |
|---|---|
| List things | `kubectl get pods` (also `nodes`, `deployment`, `service`, `all`) |
| Full detail on one thing | `kubectl describe pod <name>` |
| See an app's logs | `kubectl logs <name>` |
| Apply a file | `kubectl apply -f <file>` |
| Change replica count | `kubectl scale deployment <name> --replicas=N` |
| Watch a rollout | `kubectl rollout status deployment <name>` |
| Undo a rollout | `kubectl rollout undo deployment <name>` |
| Reach a Service locally | `kubectl port-forward service/<name> 8080:80` |
| Delete what a file made | `kubectl delete -f <file>` |

## Where this series goes next

You just ran the whole core loop: deploy, self-heal, scale, reach through a Service, update with no downtime, tear down. Everything else in Kubernetes is a variation on *declare desired state, let the system reconcile.* This is Part One of a series, and the running map of it lives on the [Kubernetes series hub](/blog/kubernetes-series/). The parts I'm writing up next, roughly in the order they stop being optional:

1. **ConfigMaps and Secrets**, to get config and passwords out of your image.
2. **Labels and Namespaces**, for organizing and isolating groups of objects.
3. **Volumes**, to keep data alive when Pods disappear.
4. **Health probes** (liveness and readiness), to teach Kubernetes when your app is actually OK.
5. **Ingress**, to route real outside web traffic to your Services.

That's Part One. Two YAML files, one node, and the reconciliation loop you can now say you've watched happen instead of read about. Go break it a few more times; that's the part that taught me the most. `[ k3s OK ]`
