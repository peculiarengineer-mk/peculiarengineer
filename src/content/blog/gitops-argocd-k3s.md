---
title: 'Kubernetes, Part Three: GitOps with Argo CD, let Git drive your cluster'
description: 'Install Argo CD on k3s, point it at a Git repo, and watch it deploy your app, revert anything you change by hand, and roll back a bad release with git revert. Plus the six gotchas I hit doing it for real.'
pubDate: 'Aug 3 2026'
heroImage: '../../assets/gitops-argocd-hero.png'
tags:
  ['Kubernetes', 'k3s', 'ArgoCD', 'GitOps', 'kubectl', 'DevOps', 'SelfHosted', 'Tutorial']
---

In [Part One](/blog/kubernetes-first-app-k3s-single-node/) I deployed nginx on a single k3s node and killed a Pod to watch a replacement appear. In [Part Two](/blog/kubernetes-configmaps-secrets-k3s/) I pulled the config and the passwords out of the image. Both parts had the same weak spot, and it's the one nobody mentions when they teach you `kubectl`: I was still standing at a terminal typing `kubectl apply` at a cluster.

That works fine until it doesn't. A month later nobody can tell you what's actually running, or who changed it, or what the cluster looked like before someone "just quickly fixed" something at 11pm. The YAML on your laptop and the YAML in the cluster quietly drift apart, and the only way to find out is to go and look.

[Argo CD](https://argo-cd.readthedocs.io) fixes that by taking the terminal away from you. You put your manifests in Git, you tell Argo CD where that repo is, and from then on the repo is the truth. Change the cluster by hand and Argo CD changes it back. I ran the whole thing on the same 4GB box that already hosts my [Forgejo instance](/blog/self-host-forgejo-tailscale-docker-compose/), and I'm writing it down because six separate things bit me and I'd rather not rediscover any of them.

> **TL;DR** Put your manifests in a Git repo **first**. Install Argo CD with `kubectl apply --server-side` (plain `apply` fails on one oversized CRD). Create an `Application` object that names three things: which repo, which folder, where it goes. Sync it once by hand and watch `OutOfSync` become `Synced`. Then set `syncPolicy.automated` with `selfHeal: true` and `prune: true`, and try to fight it: scale a Deployment, delete a Service, swap an image. It puts all of them back within fifteen seconds. Deploy by pushing to Git, roll back with `git revert`. And remember that `Synced` means "matches Git", not "works".

## Contents

- [The one idea worth holding onto](#the-one-idea-worth-holding-onto)
- [Before you start](#before-you-start)
- [Step 1: the repo comes first](#step-1-the-repo-comes-first)
- [Step 2: install Argo CD](#step-2-install-argo-cd)
- [Step 3: the CLI and the admin password](#step-3-the-cli-and-the-admin-password)
- [Step 4: the Application, and the moment it clicks](#step-4-the-application-and-the-moment-it-clicks)
- [Step 5: the first sync](#step-5-the-first-sync)
- [Step 6: reach the UI without publishing it to the internet](#step-6-reach-the-ui-without-publishing-it-to-the-internet)
- [Step 7: break the cluster on purpose](#step-7-break-the-cluster-on-purpose)
- [Step 8: turn on self-heal and try to win](#step-8-turn-on-self-heal-and-try-to-win)
- [Step 9: deploy by pushing to Git](#step-9-deploy-by-pushing-to-git)
- [Step 10: delete a file, delete the object](#step-10-delete-a-file-delete-the-object)
- [Step 11: ship something broken, then roll it back](#step-11-ship-something-broken-then-roll-it-back)
- [Step 12: rotate that admin password](#step-12-rotate-that-admin-password)
- [Gotchas I hit](#gotchas-i-hit)
- [Quick command reference](#quick-command-reference)
- [Where this series goes next](#where-this-series-goes-next)

## The one idea worth holding onto

Part One's idea was that you declare the state you want and Kubernetes makes reality match it. Part Three is the same sentence moved one level out:

> **You declare the state you want in Git. Argo CD makes the cluster match it.**

Kubernetes watches its own objects. Argo CD watches your repo. That's the entire product, and every feature below is a variation on it.

What you get for free is the part I didn't expect. Because every change to the cluster is now a commit, Git becomes your audit log, your rollback mechanism, and your review gate without you building any of those things. "Who scaled this to five replicas and why" stops being an unanswerable question.

## Before you start

You need a working cluster and a `kubectl` that reaches it without `sudo`. That's Part One, Step 0, the `KUBECONFIG` fix that catches everyone. You also need a GitHub account, and about forty minutes.

Mine is a single k3s node, v1.36.2, on a 4GB Hetzner box in Falkenstein that was already running Forgejo in Docker. Argo CD cost me about 500MB across seven Pods, taking the box from 2.3GB free to 1.8GB free. It fits on a small machine comfortably. Nothing got OOM killed.

One warning that matters if your box has a public IP like mine does. Argo CD ships with an `admin` account and a bootstrap password, and Step 6 is where I make sure the web UI is reachable from my devices and from nowhere else. Don't skip it and don't reorder it.

## Step 1: the repo comes first

This ordering is the whole philosophy in miniature, so do it in this order even though it feels backwards: the repo exists before Argo CD does.

Create a new public repo. Mine is [peculiarengineer-gitops](https://github.com/peculiarengineer-mk/peculiarengineer-gitops), and it holds exactly two files under `apps/hello/`.

Save the first as `apps/hello/deployment.yaml`:

```yaml
# A Deployment says "keep N copies of this container running, forever."
# Argo CD's job is to make sure this file and the cluster always agree.
apiVersion: apps/v1
kind: Deployment
metadata:
  name: hello
  labels:
    app: hello
spec:
  replicas: 2 # change this number, push, and watch Argo CD notice
  selector:
    matchLabels:
      app: hello # which Pods this Deployment owns
  template:
    metadata:
      labels:
        app: hello # must match the selector above, or nothing happens
    spec:
      containers:
        - name: nginx
          image: nginx:1.27
          ports:
            - containerPort: 80
          resources:
            # Small box, so be explicit about what this is allowed to eat.
            requests:
              cpu: 10m
              memory: 16Mi
            limits:
              memory: 64Mi
```

And the second as `apps/hello/service.yaml`:

```yaml
# A Service gives the Pods above one stable address inside the cluster.
# ClusterIP means "reachable from inside the cluster only", so nothing is
# published to the internet by this file.
apiVersion: v1
kind: Service
metadata:
  name: hello
spec:
  type: ClusterIP
  selector:
    app: hello # sends traffic to any Pod carrying this label
  ports:
    - port: 80
      targetPort: 80
```

Nothing new here. This is Part One's Deployment and Service with resource limits added, because a 4GB box deserves them. Commit and push both.

**💡 What happened:** You wrote down what you want running without running any of it. From here on, editing these files is how you change the cluster. That's the habit the rest of the post builds.

## Step 2: install Argo CD

Argo CD installs into the cluster as ordinary Kubernetes objects in its own namespace. No operator, no Helm required, no packages on the host.

**▶ Do:**

```bash
kubectl create namespace argocd
kubectl apply -n argocd -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

**❌ And that fails.** Most of it applies, then right at the end:

```text
The CustomResourceDefinition "applicationsets.argoproj.io" is invalid:
metadata.annotations: Too long: may not be more than 262144 bytes
```

This one confused me for a minute because the error blames the CRD, and the CRD is fine. `kubectl apply` stashes a copy of the entire manifest it just applied into a `last-applied-configuration` annotation so it can compute diffs later. The ApplicationSet CRD is bigger than the 256KB limit Kubernetes puts on annotations, so the copy can't be stored.

Server side apply doesn't use that annotation at all. It hands the whole document to the API server and lets it track ownership properly.

**▶ Do:**

```bash
kubectl apply -n argocd --server-side -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
```

**✅ You should see** three CRDs land:

```text
customresourcedefinition.apiextensions.k8s.io/applications.argoproj.io serverside-applied
customresourcedefinition.apiextensions.k8s.io/applicationsets.argoproj.io serverside-applied
customresourcedefinition.apiextensions.k8s.io/appprojects.argoproj.io serverside-applied
```

Now wait for the Pods. Seven of them come up, and on my box that took about forty seconds:

```bash
kubectl wait --for=condition=Ready pods --all -n argocd --timeout=300s
```

**💡 What happened:** Argo CD is now a workload in your cluster like any other, watching for `Application` objects that don't exist yet. Worth noticing that it installed by declaring a pile of YAML, which is the same trick it's about to do on your behalf.

## Step 3: the CLI and the admin password

Grab the CLI on the node. This is the Linux x86 build, so if you'd rather run it from a Mac or an ARM box, take the matching binary from the [releases page](https://github.com/argoproj/argo-cd/releases).

**▶ Do:**

```bash
sudo curl -sSL -o /usr/local/bin/argocd https://github.com/argoproj/argo-cd/releases/latest/download/argocd-linux-amd64
sudo chmod +x /usr/local/bin/argocd
argocd version --client --short
```

**✅ You should see** a version line and nothing else:

```text
argocd: v3.4.5+564b949
```

The installer generates a random admin password and leaves it in a Secret. Reading it is a callback to Part Two, base64 and all:

```bash
kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" | base64 -d ; echo
```

Same reminder as Part Two: base64 is encoding, not encryption. You just decoded a password with a pipe. Step 12 replaces this one properly.

## Step 4: the Application, and the moment it clicks

This is the object the whole product hangs off, and it's smaller than you'd think. An `Application` answers three questions and nothing else. Which repo. Which folder inside it. Where the result goes.

You can create it with `argocd app create`, but write the YAML instead. Seeing the object is what makes the idea stick. Save it as `hello-app.yaml`:

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: hello
  namespace: argocd # Applications live in the argocd namespace
spec:
  project: default
  source:
    repoURL: https://github.com/peculiarengineer-mk/peculiarengineer-gitops.git
    targetRevision: main # which branch to track
    path: apps/hello # which folder in the repo to apply
  destination:
    server: https://kubernetes.default.svc # this same cluster
    namespace: default # where the manifests land
  # No syncPolicy yet. This first one syncs only when we tell it to.
```

Swap in your own repo URL. Leaving `syncPolicy` out is deliberate, and it's the best decision in this whole tutorial, because it lets you see the next bit.

**▶ Do:**

```bash
kubectl apply -f hello-app.yaml
sleep 5
kubectl get application hello -n argocd \
  -o custom-columns=NAME:.metadata.name,SYNC:.status.sync.status,HEALTH:.status.health.status
```

**✅ You should see** two words that are the entire pitch:

```text
NAME    SYNC        HEALTH
hello   OutOfSync   Missing
```

**💡 What happened, and this is the paragraph I'd underline.** Nobody asked it to do that. In the five seconds since you created the object, Argo CD cloned your repo, read `apps/hello`, compared both files against the live cluster, and reported the gap: `OutOfSync` means Git and the cluster disagree, `Missing` means those objects don't exist yet. It will keep doing that comparison forever, whether or not you ever sync anything.

The sync is almost an afterthought. The **diff** is what you're actually buying.

## Step 5: the first sync

The `argocd` CLI has two modes and they behave differently, which caused me the second gotcha. `--core` talks straight to the Kubernetes API with no Argo CD server in the middle. It's the quickest way to work from the node.

**▶ Do:**

```bash
argocd app sync hello --core
```

**❌ And it fails** with a message that is actively misleading:

```text
{"level":"fatal","msg":"configmap \"argocd-cm\" not found"}
```

Go and look and `argocd-cm` is sitting right there in the `argocd` namespace. The problem is that core mode has no server session telling it where Argo CD lives, so it reads the namespace from your **kubeconfig context**. On k3s that context has no namespace set, so it looks in `default` and finds nothing.

Setting `ARGOCD_NAMESPACE` does not help. I tried, twice.

The obvious fix is `kubectl config set-context --current --namespace=argocd`, and that's the third gotcha, because it poisons every `kubectl` command you run on that box afterwards. Suddenly `kubectl get pods` shows you Argo CD's internals instead of your app, forever, and you will not remember why. Use a separate kubeconfig for the `argocd` CLI instead.

**▶ Do:**

```bash
cp ~/.kube/config ~/.kube/argocd-core.yaml
KUBECONFIG=~/.kube/argocd-core.yaml kubectl config set-context --current --namespace=argocd
KUBECONFIG=~/.kube/argocd-core.yaml argocd app sync hello --core
```

That copies the kubeconfig Part One had you set up, so you're not going back to the root owned `/etc/rancher/k3s/k3s.yaml` that Step 0 told you to stop touching.

**✅ You should see:**

```text
Sync Status:        Synced to main (d1395f1)
Phase:              Succeeded
Message:            successfully synced (all tasks run)

GROUP  KIND        NAMESPACE  NAME   STATUS  HEALTH       MESSAGE
       Service     default    hello  Synced  Healthy      service/hello created
apps   Deployment  default    hello  Synced  Progressing  deployment.apps/hello created
```

Check what landed:

```bash
kubectl get deploy,pods -l app=hello -n default
```

```text
deployment.apps/hello   2/2   2   2   22s
pod/hello-5d6b7fbfc4-f6kxf   1/1   Running   0   23s
pod/hello-5d6b7fbfc4-p4x64   1/1   Running   0   23s
```

That `KUBECONFIG=` prefix is needed on **every** `argocd` command from here on, and typing it each time gets old fast. Set an alias for the rest of the session:

```bash
alias argocd='KUBECONFIG=~/.kube/argocd-core.yaml argocd'
```

Every `argocd` command below assumes you did that. If one of them ever comes back with `configmap "argocd-cm" not found`, you're in a new shell and the alias is gone.

**💡 What happened:** You never ran `kubectl apply` on those manifests. Argo CD read GitHub and created both objects itself. That's a small thing on two files and a very large thing on two hundred.

## Step 6: reach the UI without publishing it to the internet

The CLI does everything, but the web UI is genuinely good and the resource tree is the bit that makes Kubernetes legible to people who don't live in it.

Here's the trap. A k3s NodePort binds to `0.0.0.0`, which on a box with a public IP means the open internet. Argo CD has a known admin username and a bootstrap password. So the firewall goes on **first** and the service gets exposed **second**. If you get that order backwards you spend a few minutes with an unauthenticated door open, and that's plenty.

My box wasn't on my tailnet at all. Only the Forgejo container was, through its sidecar. So the host joins properly:

```bash
curl -fsSL https://tailscale.com/install.sh | sh
tailscale up --hostname=k3s-1 --accept-dns=false --accept-routes=false
```

Both of those flags are deliberate. `--accept-dns=false` stops Tailscale rewriting `/etc/resolv.conf`, and `--accept-routes=false` stops it touching the routing table. On a box already running k3s and Docker I want Tailscale to add an interface and change nothing else.

Now the firewall, and here's the fourth gotcha, which is the one that can genuinely take your services down. Ubuntu ships this in `/etc/default/ufw`:

```text
DEFAULT_FORWARD_POLICY="DROP"
```

Enable ufw with that set and you break pod to pod networking in k3s **and** Docker's bridge. On my box that would have taken Forgejo down as collateral. Fix it before you enable anything:

```bash
sed -i 's/^DEFAULT_FORWARD_POLICY=.*/DEFAULT_FORWARD_POLICY="ACCEPT"/' /etc/default/ufw
```

Before you turn the firewall on, arm a dead man switch. Enabling a firewall over SSH on a box whose only access is SSH is how people lose servers, and a Hetzner rescue console at midnight is a bad time.

**▶ Do:**

```bash
setsid nohup bash -c "sleep 300; ufw --force disable" >/dev/null 2>&1 < /dev/null &
echo $! > /root/ufw-deadman.pid
```

That undoes the firewall in five minutes unless you cancel it. Now the rules. SSH, the tailnet, and the k3s internal networks:

```bash
ufw default deny incoming
ufw default allow outgoing
ufw allow 22/tcp
ufw allow in on tailscale0
ufw allow 41641/udp        # tailscale wireguard
ufw allow in on cni0       # k3s pods
ufw allow in on flannel.1
ufw allow in on docker0
ufw allow from 10.42.0.0/16   # k3s pod cidr
ufw allow from 10.43.0.0/16   # k3s service cidr
ufw --force enable
```

Open a second SSH session and confirm you can still get in. Check your cluster and anything else on the box is still healthy. Then cancel the timer using the PID file:

```bash
kill $(cat /root/ufw-deadman.pid)
```

Use the PID file, not `pkill -f "sleep 300"`. I tried the `pkill` version and it killed my own shell, because the command line running that `pkill` contains the string `sleep 300` and therefore matches itself. Exit code 255, dropped connection, and a few seconds of wondering whether I'd just locked myself out.

Now expose the UI:

```bash
kubectl -n argocd patch svc argocd-server -p '{"spec":{"type":"NodePort","ports":[
  {"name":"http","port":80,"targetPort":8080,"protocol":"TCP"},
  {"name":"https","port":443,"targetPort":8080,"protocol":"TCP","nodePort":30443}]}}'
```

If you go looking for a listening socket you won't find one, and that threw me for a second:

```bash
ss -tlnp | grep 30443    # returns nothing, and that's correct
```

kube-proxy implements NodePorts with iptables rules, not a bound socket. The test that actually matters is reaching it from two places:

```text
https://100.87.x.y:30443  ->  HTTP 200     # over the tailnet
https://203.0.113.88:30443  ->  HTTP 000     # public IP, blocked
```

**💡 What happened:** The UI is reachable from every device on my tailnet, including the iPad, and invisible from everywhere else. The cert is self signed so your browser will complain once. Log in as `admin` with the password from Step 3, click into the `hello` app, and you get the resource tree: Application, Deployment, ReplicaSet, Pods, each with a health dot. That view is why people keep the UI around.

## Step 7: break the cluster on purpose

Now the interesting part. Do the exact thing GitOps is supposed to prevent.

**▶ Do:**

```bash
kubectl scale deployment hello -n default --replicas=5
sleep 15
kubectl get application hello -n argocd \
  -o custom-columns=SYNC:.status.sync.status,HEALTH:.status.health.status
```

**✅ You should see:**

```text
SYNC        HEALTH
OutOfSync   Healthy
```

Five Pods running, and Argo CD spotted it within seconds and did **nothing at all**.

That's not a bug, it's the lesson. Detecting drift and correcting drift are separate features, and right now you only have the first one. Seeing Argo CD notice and deliberately sit on its hands is what makes the next step land.

`Healthy` sitting next to `OutOfSync` is worth its own thought too. Health and sync are different axes. Health means the five Pods are fine. Sync means this matches Git. An app can be in perfect health and completely wrong.

Ask what's wrong and it tells you exactly:

```bash
argocd app diff hello --core
```

```text
===== apps/Deployment default/hello ======
120c120
<   replicas: 5
---
>   replicas: 2
```

`<` is the live cluster, `>` is Git. Four lines that answer "how does reality differ from what I said I wanted". You can run that against anything, at any time, and get a real answer.

## Step 8: turn on self-heal and try to win

Three settings. `selfHeal` corrects drift, `prune` deletes objects whose files vanish from the repo, and `automated` means it acts without being asked.

**▶ Do:**

```bash
kubectl -n argocd patch application hello --type=merge -p '{
  "spec": {"syncPolicy": {"automated": {"prune": true, "selfHeal": true}}}
}'
```

Then watch, without running any sync command:

```text
 5s  OutOfSync Healthy   replicas=5  pods=5
10s  Synced Healthy      replicas=2  pods=2
```

**Five Pods became two on their own.** I changed a policy, not the cluster, and Argo CD dragged reality back to what the repo says. For my money this is the moment the whole idea clicks, more than the first sync was.

Now try to win. I made three attempts and lost all three inside fifteen seconds:

| What I did | What happened |
| --- | --- |
| `kubectl scale --replicas=4` | back to 2 |
| `kubectl delete svc hello` | Service recreated |
| `kubectl set image nginx=nginx:1.25` | back to `nginx:1.27` |

**💡 What happened, plus the fifth gotcha.** Look closely at that recreated Service and it has a **different ClusterIP** and an age of fifteen seconds. Argo CD did not restore the object you deleted. It created a new one that matches the file. Anything that cached the old address is now talking to nothing. Self-heal keeps your cluster matching your repo, and that is not the same as a backup. Don't let it talk you out of having real backups.

## Step 9: deploy by pushing to Git

The whole point. Edit the repo, not the cluster.

**▶ Do** change `replicas: 2` to `replicas: 3` in `apps/hello/deployment.yaml`, then:

```bash
git commit -am "Scale hello to 3 replicas"
git push
```

Now touch nothing and watch:

```text
  0s  revision=d1395f1  replicas=2
...
124s  revision=d1395f1  replicas=2
136s  revision=e6c57cb  replicas=3
```

**136 seconds.** That isn't Argo CD being slow, it's the default polling interval. With no webhook configured it asks GitHub "anything new?" every three minutes. In production you point a repo webhook at it and deployments become instant. While you're writing a tutorial and don't want to wait, force it:

```bash
argocd app get hello --hard-refresh --core
```

**💡 What happened:** Check the Pod ages afterwards and you get 28m, 28m, 2s. It scaled up. It did not redeploy. Argo CD works out the difference between the repo and the cluster and applies only that, so a one line change doesn't churn your running workload.

## Step 10: delete a file, delete the object

`prune` is the setting that decides whether removing a file removes the thing it described. I tested it with something disposable.

Add `apps/hello/temp-configmap.yaml`:

```yaml
apiVersion: v1
kind: ConfigMap
metadata:
  name: hello-temp
data:
  note: 'delete this file from git and prune should remove the object'
```

Commit, push, hard refresh, and the ConfigMap appears in the cluster. Now `git rm` the file, commit, push, hard refresh again:

```bash
kubectl get configmap hello-temp -n default
```

```text
Error from server (NotFound): configmaps "hello-temp" not found
```

**💡 What happened:** Deleting a file deleted the object. Worth knowing that `prune: false` is the default, and with it off Argo CD will happily add and update things but never remove them. That sounds safer and mostly it is, but you end up with orphaned objects in your cluster that no file in any repo describes and nobody remembers creating. Turn prune on early, while your cluster is small enough that a mistake is obvious.

## Step 11: ship something broken, then roll it back

This is the most important section in the post, so I deliberately shipped a release that could not possibly work. In `deployment.yaml`:

```yaml
image: nginx:9.9.9-doesnotexist
```

Commit, push, refresh, wait thirty seconds:

```text
=== app health ===
Synced   Progressing

=== pods ===
hello-5d6b7fbfc4-f6kxf 1/1 Running       32m
hello-5d6b7fbfc4-p4x64 1/1 Running       32m
hello-5d6b7fbfc4-vzq7x 1/1 Running       6m
hello-6d96c85587-lgxml 0/1 ErrImagePull  31s

=== is the site still up? ===
HTTP 200
```

Read that first line again. **`Synced`, and completely broken.**

`Synced` means the cluster matches Git. It does not mean the app works. I put something wrong in the repo, so Argo CD faithfully made the cluster wrong. GitOps guarantees fidelity to your repo, not correctness, and if you remember one sentence from this post make it that one. Your repo is now the thing that needs code review, because it's the thing that ships.

The site stayed up for a reason worth knowing: Kubernetes' rolling update will not kill a healthy Pod until its replacement reports Ready, so three good Pods kept serving while the fourth failed to pull. It also sits in `Progressing` for a full ten minutes before it admits to being `Degraded`, which is `progressDeadlineSeconds` defaulting to 600 rather than Argo CD dragging its feet. I stared at `Progressing` for a while assuming something was stuck.

Now the fix, and notice what the fix *is*:

```bash
git revert --no-edit <bad-sha>
git push
```

```text
Synced   Healthy
image: nginx:1.27
HTTP 200
```

Pod ages afterwards: 32m, 32m, 6m. **Not one Pod died.** The bad release never took hold, the old Pods served throughout, and recovery was a normal commit.

**💡 What happened:** Your rollback procedure is the same command as every other change. No special runbook, no "quick fix" applied straight to prod that nobody writes down. The revert is right there in the log next to the mistake it undoes.

Small thing that cost me a minute: `git revert -q` is not a flag. It quietly prints the usage text and reverts nothing, and if you're not reading closely you'll push an empty change and wonder why nothing recovered.

## Step 12: rotate that admin password

The bootstrap password from Step 3 is meant to be temporary. The documented command is `argocd account update-password`, and here's the sixth gotcha:

```text
$ argocd account update-password --account admin ... --core
failed to get issue time: unable to extract token claims
```

Core mode has no server session, so there's no token to authenticate a password change. You either log in through the API server properly, or you write the hash yourself:

```bash
NEW="pick-something-better-than-this"
HASH=$(argocd account bcrypt --password "$NEW")
kubectl -n argocd patch secret argocd-secret \
  -p "{\"stringData\":{\"admin.password\":\"$HASH\",\"admin.passwordMtime\":\"$(date +%FT%T%Z)\"}}"
kubectl -n argocd rollout restart deployment argocd-server
kubectl -n argocd delete secret argocd-initial-admin-secret
```

Confirm both directions. The old password should be refused:

```text
$ argocd login <host>:30443 --username admin --password "<old>" --insecure --grpc-web
Invalid username or password

$ argocd login <host>:30443 --username admin --password "<new>" --insecure --grpc-web
'admin:login' logged in successfully
```

Worth understanding that those two CLI modes really are different tools wearing the same name. `--core` skips the server and talks to the Kubernetes API, which is fast and needs no login but can't do anything that depends on a session. `--server <host> --grpc-web` goes through argocd-server with a real login, which is what you want for anything touching accounts, tokens, or RBAC.

## Gotchas I hit

- **Plain `kubectl apply` fails on the install manifest.** The ApplicationSet CRD exceeds the 256KB annotation limit that `apply` needs for its `last-applied-configuration` copy. Use `--server-side`. The error blames the CRD, which sends you looking in the wrong place.
- **`argocd --core` reads its namespace from the kubeconfig context.** Not from `ARGOCD_NAMESPACE`, which does nothing. On k3s the context has no namespace, so you get `configmap "argocd-cm" not found` while the ConfigMap is plainly sitting in the `argocd` namespace.
- **Fixing that by repointing your main kubeconfig poisons everything else.** `kubectl config set-context --current --namespace=argocd` means every later `kubectl get pods` on that box shows Argo CD internals. Keep a separate kubeconfig for the `argocd` CLI.
- **`DEFAULT_FORWARD_POLICY="DROP"` breaks k3s and Docker when you enable ufw.** Set it to `ACCEPT` in `/etc/default/ufw` first, and allow the pod and service CIDRs. Skip this and you take down pod networking and every container on the box at the same time.
- **Self-heal is not a backup.** Delete a Service and Argo CD creates a new one matching the file, with a new ClusterIP. It restores the description, not the object. Anything holding the old address is now pointing at nothing.
- **`argocd account update-password` does not work in core mode.** No session, no token, no password change. Patch the bcrypt hash into `argocd-secret` instead.
- **`Synced` does not mean working.** It means the cluster matches Git. Put a broken image tag in the repo and you get a proudly `Synced` broken app.
- **Don't cancel a background timer with `pkill -f "sleep 300"`.** The shell running that command contains the string, matches itself, and kills your session. Use a PID file.

## Quick command reference

| Goal | Command |
| --- | --- |
| Install Argo CD | `kubectl apply -n argocd --server-side -f <install.yaml>` |
| Read bootstrap password | `kubectl -n argocd get secret argocd-initial-admin-secret -o jsonpath="{.data.password}" \| base64 -d` |
| App status | `kubectl get application <app> -n argocd` |
| See Git versus cluster | `argocd app diff <app> --core` |
| Sync now | `argocd app sync <app> --core` |
| Skip the 3 minute poll | `argocd app get <app> --hard-refresh --core` |
| List apps through the server | `argocd app list --server <host>:30443 --insecure --grpc-web` |
| Turn on self-heal and prune | patch `spec.syncPolicy.automated` with `selfHeal` and `prune` |
| Roll back | `git revert --no-edit <sha> && git push` |

## Where this series goes next

You now have a cluster that argues with you, which is the correct behaviour. Change something by hand and it changes it back. Deploy by pushing a commit. Roll back with `git revert` and lose nothing.

There's one loose thread I left deliberately, and it's the obvious next part. That `hello-app.yaml` from Step 4 is still sitting on the node, applied by hand with `kubectl`. The thing driving all my GitOps is itself not under GitOps, which is a slightly embarrassing place to stop. The fix has a good name, app of apps, and it answers the question of who deploys the deployer.

After that: repo webhooks to kill the three minute poll, private repo authentication so this can point at my own Forgejo rather than GitHub, and Helm and Kustomize as sources instead of plain YAML. The [Kubernetes series hub](/blog/kubernetes-series/) tracks the lot, and Labels, Volumes, health probes and Ingress are all still on the list.

Go and scale something by hand, then watch it change back while you're still looking at it. That's the bit that made it real for me. `[ synced ]`
