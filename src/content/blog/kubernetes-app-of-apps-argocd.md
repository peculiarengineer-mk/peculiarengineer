---
title: 'Kubernetes, Part Four: app of apps, or who deploys the deployer'
description: 'Put the Argo CD Application objects themselves into Git so one root app deploys the rest. The adoption that does not bounce your Pods, the two ways I could not get a wrong path to destroy anything, and the finalizer that is supposed to wipe a cluster two levels deep and wedges a self managing root instead.'
pubDate: 'Aug 22 2026'
heroImage: '../../assets/app-of-apps-hero.png'
tags:
  ['Kubernetes', 'k3s', 'ArgoCD', 'GitOps', 'kubectl', 'DevOps', 'SelfHosted', 'Tutorial']
---

At the end of [Part Three](/blog/gitops-argocd-k3s/) I left one thing deliberately broken, and said so at the time. Every manifest in the cluster comes from Git, gets reconciled forever, and reverts if you touch it by hand. Except one. The `Application` object that makes all of that happen was applied with `kubectl apply -f hello-app.yaml`, from a file sitting on the node, tracked by nothing.

So the thing driving my GitOps is the one thing not under GitOps. Rebuild that box and the cluster comes back empty, because the instruction to build it lived on the box that died.

The fix has a name, app of apps, and the idea underneath it is smaller than the name suggests. What makes it worth a post is not the setup, which is one extra file. It is what happens when you try to break it, because I went in expecting to write a warning about blast radius and the cluster refused to cooperate with me twice.

> **TL;DR.** An `Application` whose `path` points at a folder of other `Application` files. Argo CD does not care that the manifests happen to be Argo CD objects. Adopting a hand made Application is free: it gets patched in place, same UID, and your Pods never notice. Point the root at a folder that does not exist and nothing is deleted. Point it at an empty folder and Argo CD refuses with `auto-sync will wipe out all resources`. The genuine danger is `resources-finalizer.argocd.argoproj.io`, which cascades two levels deep on a single `kubectl delete`, and which deadlocks a self managing root into `Terminating` forever.

## Contents

- [The one idea worth holding onto](#the-one-idea-worth-holding-onto)
- [Before you start](#before-you-start)
- [Step 1: the shape of the repo](#step-1-the-shape-of-the-repo)
- [Step 2: put the Application into Git](#step-2-put-the-application-into-git)
- [Step 3: the root Application](#step-3-the-root-application)
- [Step 4: the adoption, and why nothing bounced](#step-4-the-adoption-and-why-nothing-bounced)
- [Step 5: add an app by pushing one file](#step-5-add-an-app-by-pushing-one-file)
- [Step 6: let root manage itself](#step-6-let-root-manage-itself)
- [Step 7: try to destroy it with a typo](#step-7-try-to-destroy-it-with-a-typo)
- [Step 8: the finalizer, which is the actual danger](#step-8-the-finalizer-which-is-the-actual-danger)
- [Step 9: the root that will not finish dying](#step-9-the-root-that-will-not-finish-dying)
- [Gotchas I hit](#gotchas-i-hit)
- [Quick command reference](#quick-command-reference)
- [Where this series goes next](#where-this-series-goes-next)

## The one idea worth holding onto

An Argo CD `Application` is a Kubernetes object like any other. It is YAML, it lives in a namespace, `kubectl get` shows it. Nothing about it is special to Argo CD's syncing machinery.

So when you point an `Application` at a folder of manifests, and those manifests happen to themselves be `Application` objects, Argo CD applies them exactly the way it applies a Deployment. It does not know it is bootstrapping itself. It is just reconciling YAML, and the YAML happens to describe more reconciliation.

That is the whole pattern. One `Application`, conventionally called `root`, whose job is to make the other Applications exist. Adding an app to your cluster stops being "write manifests, then remember to `kubectl apply` an Application" and becomes "write manifests, add one file, push".

## Before you start

You need the cluster from [Part Three](/blog/gitops-argocd-k3s/): k3s, Argo CD installed in the `argocd` namespace, and the `hello` app synced from your repo. If `kubectl get application hello -n argocd` prints `Synced` and `Healthy`, you are ready.

You also need the repo from Step 1 of that post. Mine is [peculiarengineer-gitops](https://github.com/peculiarengineer-mk/peculiarengineer-gitops), and so far it holds only `apps/hello/deployment.yaml` and `apps/hello/service.yaml`.

I tested this on Argo CD v3.5.1, installed from the same `stable` manifests URL Part Three used, which gave v3.4.5 at the time. Steps 8 and 9 are the parts most likely to drift between versions, and I will say so again when we get there.

A couple of commands below use the `argocd` CLI in `--core` mode, exactly as Part Three set it up. If one of them returns `configmap "argocd-cm" not found`, you are in a fresh shell without `KUBECONFIG` exported. I hit that again while testing this post, which is a small comfort.

Everything below is one k3s node and about thirty minutes.

## Step 1: the shape of the repo

Two folders, and the distinction between them is the entire mental model:

```text
apps/          what to run       (Deployments, Services, the actual workloads)
  hello/
    deployment.yaml
    service.yaml
bootstrap/     what to deploy    (Application objects, one per app)
  hello.yaml
  root.yaml
```

`apps/` is the stuff. `bootstrap/` is the list of stuff. The root Application points at `bootstrap/`, every file in `bootstrap/` points at a folder under `apps/`, and that indirection is what buys you the one file push later.

Keep them as separate top level folders. Nest `bootstrap/` inside `apps/` and you have put Application manifests inside the tree your workload apps point at, so the first time somebody writes a slightly too broad `path` you get Applications deploying Applications deploying Applications. Keeping them siblings makes that impossible by construction.

## Step 2: put the Application into Git

This is the same object from Part Three, Step 4. Same name, same spec. The only difference is where it lives.

**▶ Do:** create `bootstrap/hello.yaml` in your repo:

```yaml
# The hello-app.yaml from Part Three, with one addition: the finalizer.
# Part Three's version had no finalizers block. Step 8 is what that line costs.
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: hello
  namespace: argocd
  finalizers:
    # Delete this Application and its Deployment and Service go too.
    # This one stays. Step 8 is why, and why root does not get one.
    - resources-finalizer.argocd.argoproj.io
spec:
  project: default
  source:
    repoURL: https://github.com/peculiarengineer-mk/peculiarengineer-gitops.git
    targetRevision: main
    path: apps/hello
  destination:
    server: https://kubernetes.default.svc
    namespace: default
  syncPolicy:
    automated:
      selfHeal: true
      prune: true
```

Swap in your own repo URL, then commit and push.

Nothing happens yet. No Application in the cluster is watching `bootstrap/`, so this is just a file. That is the correct and slightly anticlimactic state to be in.

## Step 3: the root Application

**▶ Do:** create `bootstrap/root.yaml` in the same folder:

```yaml
# The only object you will ever apply by hand. Its path is the folder
# holding every other Application, including this file.
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: root
  namespace: argocd
  # Deliberately no finalizer here. Step 9 explains what happens when you
  # add one to an app that manages itself, and it is not good.
spec:
  project: default
  source:
    repoURL: https://github.com/peculiarengineer-mk/peculiarengineer-gitops.git
    targetRevision: main
    path: bootstrap
  destination:
    server: https://kubernetes.default.svc
    namespace: argocd # Applications live here, not in default
  syncPolicy:
    automated:
      selfHeal: true
      prune: true
```

Two lines are easy to get wrong. `path` is `bootstrap`, the folder of Applications, not `apps`. And `destination.namespace` is `argocd`, because that is where `Application` objects live. Point it at `default` and Argo CD will cheerfully create Applications in the wrong namespace where the controller will never look at them.

Commit and push both files. Do not apply anything yet, because the next step wants a baseline first.

## Step 4: the adoption, and why nothing bounced

Here is the part I was most suspicious of. There is already a live `hello` Application, created by hand, running two Pods that are serving. Now a root app arrives claiming to own it. Does Argo CD delete and recreate it, and take my Pods down on the way through?

Before you apply the root, write down what you have:

**▶ Do:**

```bash
kubectl get pods -l app=hello \
  -o custom-columns=NAME:.metadata.name,UID:.metadata.uid,START:.status.startTime --no-headers
kubectl get application hello -n argocd -o jsonpath='{.metadata.uid}'
```

Mine:

```text
hello-5d6b7fbfc4-vhzf5   0475ca1d-ebf7-4aa7-baf7-c787d0bac27c   2026-08-22T15:20:50Z
hello-5d6b7fbfc4-z6ktp   87db3d4c-f90b-426b-94fb-054daede09cc   2026-08-22T15:20:50Z
8f6c0a18-17bd-4f78-8d40-4e21d373c341
```

Now apply the root once, wait for it to sync, and run exactly the same two commands:

```bash
kubectl apply -f bootstrap/root.yaml
```

That `kubectl apply` is the last one you should need against this cluster by hand. Everything after it is a `git push`. Step 7 is where I find out how badly I meant that.

**✅ You should see** the identical output. Same Pod names, same UIDs, same start times, and the same Application UID. A UID is assigned once at creation and never changes, so an unchanged UID is proof the object was patched rather than replaced.

**💡 What happened:** Argo CD applied `bootstrap/hello.yaml` on top of an object that already existed and matched. That is an update, not a create, so the `hello` Application was never deleted, never recreated, and never re-synced its workload. The Deployment stayed on generation 1 with a single rollout revision.

The one visible change is an annotation:

```bash
kubectl get application hello -n argocd \
  -o jsonpath='{.metadata.annotations.argocd\.argoproj\.io/tracking-id}'
```

```text
root:argoproj.io/Application:argocd/hello
```

That string is Argo CD writing down "root owns this now". It is the entire migration. If you were putting off adopting a hand made Application because you assumed it meant downtime, it does not, as long as the spec in Git matches what is already running.

Delete the old file off the node so you are not tempted to edit it later:

```bash
rm hello-app.yaml
```

## Step 5: add an app by pushing one file

The payoff, and it should feel like nothing happened.

**▶ Do:** add a second workload under `apps/whoami/`. Two files, same shape as `hello`:

```yaml
# apps/whoami/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: whoami
  labels:
    app: whoami
spec:
  replicas: 1
  selector:
    matchLabels:
      app: whoami
  template:
    metadata:
      labels:
        app: whoami
    spec:
      containers:
        - name: whoami
          image: traefik/whoami:v1.10
          ports:
            - containerPort: 80
          resources:
            requests:
              cpu: 10m
              memory: 16Mi
            limits:
              memory: 64Mi
```

```yaml
# apps/whoami/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: whoami
spec:
  type: ClusterIP
  selector:
    app: whoami
  ports:
    - port: 80
      targetPort: 80
```

Then one file in `bootstrap/` pointing at that folder:

```yaml
# bootstrap/whoami.yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: whoami
  namespace: argocd
  finalizers:
    - resources-finalizer.argocd.argoproj.io
spec:
  project: default
  source:
    repoURL: https://github.com/peculiarengineer-mk/peculiarengineer-gitops.git
    targetRevision: main
    path: apps/whoami
  destination:
    server: https://kubernetes.default.svc
    namespace: default
  syncPolicy:
    automated:
      selfHeal: true
      prune: true
```

Commit all three and push. Do not run `kubectl`.

**✅ You should see**, within the three minute poll or right after `argocd app get root --hard-refresh --core`:

```text
NAME     SYNC STATUS   HEALTH STATUS
hello    Synced        Healthy
root     Synced        Healthy
whoami   Synced        Healthy
```

```text
NAME     READY   UP-TO-DATE   AVAILABLE   AGE
hello    2/2     2            2           70s
whoami   1/1     1            1           25s
```

**💡 What happened:** Root saw a new file in `bootstrap/`, created the `whoami` Application, and that Application deployed its own folder. Two levels of reconciliation from one commit, and the only thing you did was `git push`.

Now reverse it. Delete `bootstrap/whoami.yaml`, push, and refresh:

```text
NAME    SYNC STATUS   HEALTH STATUS
hello   Synced        Healthy
root    Synced        Healthy
```

```text
NAME    READY   UP-TO-DATE   AVAILABLE   AGE
hello   2/2     2            2           101s
```

Both the Application and its Deployment are gone. Root's `prune: true` removed the Application because it vanished from Git, and that Application's finalizer took its workload down on the way out. Removing an app from the cluster is now `git rm`, which is the sentence this whole pattern exists to make true.

## Step 6: let root manage itself

Root is currently the one object not under Git's control, which is the same complaint that started this post, just moved up a level. Since `root.yaml` already lives in `bootstrap/`, and root manages everything in `bootstrap/`, it already manages itself. It just does not know it yet.

**▶ Do:** force a refresh, then look at what root thinks it owns:

```bash
argocd app get root --hard-refresh --core
kubectl get application root -n argocd \
  -o jsonpath='{range .status.resources[*]}{.kind}/{.name}{"\n"}{end}'
```

**✅ You should see** root listing itself:

```text
Application/hello
Application/root
```

and picking up its own tracking annotation:

```bash
kubectl get application root -n argocd \
  -o jsonpath='{.metadata.annotations.argocd\.argoproj\.io/tracking-id}'
```

```text
root:argoproj.io/Application:argocd/root
```

**💡 What happened, and it is less alarming than it sounds.** Root reconciled a folder that contains its own definition, found itself already matching, and did nothing. It does not loop. In my run the events showed two sync operations and then silence. From here, changing root's own spec is a `git push` like everything else.

## Step 7: try to destroy it with a typo

Every app of apps writeup warns you that the blast radius just got bigger, and the reasoning sounds right: root has `prune: true`, so point it at the wrong folder and it will decide every Application is surplus and delete the lot.

I could not make that happen. Twice.

**First attempt, a path that does not exist.** Root manages itself now, so I broke it the way I would break anything else: edited `bootstrap/root.yaml`, changed `path: bootstrap` to `path: bootstrapp`, committed and pushed.

```bash
kubectl get application root -n argocd \
  -o custom-columns=NAME:.metadata.name,SYNC:.status.sync.status,HEALTH:.status.health.status
```

```text
NAME   SYNC      HEALTH
root   Unknown   Healthy
```

```text
Failed to load target state: failed to generate manifest for source 1 of 1:
rpc error: code = Unknown desc = bootstrapp: app path does not exist
```

`Unknown`, not `OutOfSync`. Argo CD could not build the desired state at all, so it has nothing to compare against and refuses to act. `hello` stayed `Synced` and `Healthy` throughout and the Pods never moved. Your workloads are entirely safe.

Root is not. I fixed the typo in Git, pushed, and forced a refresh every fifteen seconds for three and a half minutes:

```text
NAME   SYNC      HEALTH
root   Unknown   Healthy
```

```bash
kubectl get application root -n argocd -o jsonpath='{.spec.source.path}'
```

```text
bootstrapp
```

Still broken, and the live object still carries the bad path. The condition explains why:

```text
ComparisonError: Failed to load target state: failed to generate manifest for source 1 of 1:
rpc error: code = Unknown desc = bootstrapp: app path does not exist
```

**💡 This is the trap in the pattern.** A self managing root updates its own spec by reading the folder its spec points at. Break that path and it can no longer read the folder, so it can never see the commit that fixes it. Git is correct, the cluster is wrong, and the loop that is supposed to close that gap is the exact loop you broke.

There is one way out, and it is the command I said in Step 4 you would never need again:

```bash
kubectl apply -f bootstrap/root.yaml
```

Root goes `Synced` immediately. So keep that file, and know that a one character typo in the root app is the one mistake in this setup that Git cannot undo for you.

**Second attempt, a path that exists but is empty.** This is the one that should work, because now the desired state is computable and it is "nothing". Git will not track an empty directory, so the folder needs a file in it that Argo CD will ignore. A `README.md` does the job.

```text
NAME   SYNC        HEALTH
root   OutOfSync   Healthy
```

```bash
kubectl get application root -n argocd \
  -o jsonpath='{range .status.resources[*]}{.kind}/{.name} requiresPruning={.requiresPruning}{"\n"}{end}'
```

```text
Application/hello requiresPruning=true
Application/root requiresPruning=true
```

It worked out exactly what I feared. Both Applications marked for deletion. And then it declined:

```bash
kubectl get application root -n argocd \
  -o jsonpath='{range .status.conditions[*]}{.type}: {.message}{"\n"}{end}'
```

```text
SyncError: Skipping sync attempt to [78dfb5c...]: auto-sync will wipe out all resources
```

**💡 This is the paragraph I would underline.** Argo CD has a guard against exactly this mistake. Automated sync will not run when the sync would remove every resource the Application manages. It sits in `OutOfSync`, tells you why in a condition, and waits for a human. The famous app of apps disaster is not reachable by typo with automated sync alone.

It is reachable if you insist. Patching a manual sync operation onto the object overrides the guard, and that did delete the child Applications when I tried it. The protection is on automated sync, not on you. Which brings us to what deleting an Application actually means.

## Step 8: the finalizer, which is the actual danger

Delete an `Application` and one of two very different things happens, and the difference is four words of YAML.

**Without the finalizer.** To try this you need an Application that has no `finalizers` block, so take those two lines back out of `bootstrap/hello.yaml` and push. That propagates in a few seconds. Then:

```bash
kubectl delete application hello -n argocd
kubectl get deploy hello
```

```text
NAME    READY   UP-TO-DATE   AVAILABLE   AGE
hello   2/2     2            2           6m53s
```

The Application is gone and the Deployment is still running, at the same age it was before, managed by nobody. That is an orphan: the workload survives and Argo CD has forgotten it exists.

On this cluster the orphan does not last, because root notices `bootstrap/hello.yaml` still in Git and recreates the Application within about five seconds, which re-adopts the Deployment. The orphan is real and the window is short. It matters on a cluster where the parent is gone too, which is where Step 9 ends up.

**With the finalizer.** Add this to the Application's metadata:

```yaml
  finalizers:
    - resources-finalizer.argocd.argoproj.io
```

Now deleting the Application deletes everything it manages. Kubernetes will not remove the object until Argo CD has torn down its resources and released the finalizer.

Here is the bit that surprised me. Under a self healing root, that deletion does not stick:

```text
NAME    READY   UP-TO-DATE   AVAILABLE   AGE
hello   2/2     2            2           14s
```

The Deployment really was deleted, and the age proves it, because it was six minutes old a moment earlier. Root then noticed that `bootstrap/hello.yaml` exists in Git while the Application does not exist in the cluster, recreated it, and that Application redeployed the workload. Total outage measured in seconds, entirely automatic. GitOps undid my `kubectl delete`, which is the whole point of the series arriving to bite me in a useful way.

**Now delete root.** With no finalizer on root, `hello` and its workload survive untouched. Root goes, nothing else moves, and you put it back with one `kubectl apply`.

With the finalizer on root, one command is supposed to take out everything. To see that cleanly I took root's self management back out first, by moving `root.yaml` out of `bootstrap/`, then put the finalizer on root and deleted it:

```bash
kubectl delete application root -n argocd
kubectl get deploy hello -n default
kubectl get applications -n argocd
```

```text
application.argoproj.io "root" deleted from argocd namespace
Error from server (NotFound): deployments.apps "hello" not found
No resources found in argocd namespace.
```

Root's finalizer deletes its managed resources, which are the child `Application` objects. Each child's own finalizer then deletes its workloads. Two levels of cascade, one command, no confirmation prompt.

That took about two seconds. Note the setup though: root was **not** managing itself. Once it does, which is exactly what Step 6 told you to do, the same command behaves differently and worse. That is Step 9.

So: finalizers on the child apps, so removing an app from Git removes it from the cluster. Not on root. The only thing root's finalizer buys you is the ability to break your cluster from one line, and as it turns out you do not even get a clean break.

## Step 9: the root that will not finish dying

I put the finalizer on root anyway, to see. This is the failure worth knowing about, and it is a direct consequence of Step 6.

Root manages `bootstrap/`, and `bootstrap/root.yaml` is in `bootstrap/`, so root is one of its own managed resources. Now delete it:

```bash
kubectl delete application root -n argocd
```

**✅ You should see** the command print that the object was deleted, and then **hang**. It does not come back. `kubectl delete` waits for the object to actually go away, and this one never does. I killed mine after ninety seconds:

```text
application.argoproj.io "root" deleted from argocd namespace
# ...and then nothing. killed at 90s, exit 124
```

Five minutes later, root is still there:

```bash
kubectl get application root -n argocd \
  -o jsonpath='deletionTimestamp={.metadata.deletionTimestamp}{"\n"}finalizers={.metadata.finalizers}{"\n"}'
```

```text
deletionTimestamp=2026-08-22T18:14:27Z
finalizers=["resources-finalizer.argocd.argoproj.io"]
```

and the controller is saying the same thing on a loop, forever:

```text
"msg":"Deleting resources","application":"root"
"msg":"1 objects remaining for deletion","application":"root"
```

**💡 What happened:** Kubernetes will not remove an object until its finalizers are released. Argo CD will not release this finalizer until root's managed resources are gone. Root manages itself, so the one object remaining for deletion is root. It is waiting for itself, and it will wait until you intervene.

Be careful about what you conclude from the child apps here. In my runs the cascade to `hello` and its Deployment had already happened by the time root wedged, and a separate run on a different cluster had root wedge with the children still standing. The deadlock on root is reliable. What survives underneath it is not, which is its own argument for never getting into this state.

Get out by removing the finalizer by hand:

```bash
kubectl patch application root -n argocd \
  --type merge -p '{"metadata":{"finalizers":null}}'
```

Root disappears within a few seconds. Anything the cascade already took is gone, and anything it did not take is now an orphan. Put root back and let Git sort it out:

```bash
kubectl apply -f bootstrap/root.yaml
```

Worth watching what it does to an orphan it finds still running. In a run where `hello` carried no finalizer of its own, freeing root left both Applications gone and the `hello` Deployment still up, unmanaged at six minutes old. Once root returned it was the same Deployment, seven minutes old and climbing, same UID, adopted rather than replaced. The patch in place behavior from Step 4, doing the useful thing at the worst possible moment.

This is the intersection of two things that are individually fine. Self management is good. Cascade deletion is good. Together on the same object they deadlock, and nothing warns you at the point where you combine them.

## Gotchas I hit

**`path` is the folder of Applications, not the folder of manifests.** Root points at `bootstrap`, not `apps`. Getting this backwards makes root try to deploy your Deployments into the `argocd` namespace.

**`destination.namespace` must be `argocd` for the root app.** `Application` objects only do anything in the namespace the controller watches.

**An unreachable path fails safe, an empty one fails loudly, neither destroys anything.** `Unknown` means Argo CD could not build the desired state. `OutOfSync` plus `auto-sync will wipe out all resources` means it built it, hated it, and stopped.

**A manual sync overrides that guard.** The protection is on automated sync only. If you reach for `--prune` by hand on a root app, you are on your own.

**Deleting an Application without a finalizer orphans its workload.** The Deployment keeps running with no owner and nothing warns you. A live root will recreate the Application within seconds and re-adopt it, so the orphan only persists when the parent is gone too.

**A self managing root plus a finalizer equals a permanent `Terminating`.** The `kubectl delete` hangs rather than returning, and the object never goes. Patch the finalizer to `null` to escape. Do not put the finalizer on root and you never meet this.

**Adoption is free, but watch what else you change.** The Pods survive because Argo CD patched an object rather than replacing it, and that held even though `bootstrap/hello.yaml` adds a finalizer Part Three never had. Change the `source` or `destination` in the same commit that adopts it and you get an adoption and a re-sync at once, and then you cannot tell which one moved your Pods.

## Quick command reference

| Task | Command |
| --- | --- |
| Apply the root, once, by hand | `kubectl apply -f bootstrap/root.yaml` |
| List every app | `kubectl get applications -n argocd` |
| What does root own | `kubectl get application root -n argocd -o jsonpath='{range .status.resources[*]}{.kind}/{.name}{"\n"}{end}'` |
| Who owns this app | `kubectl get application hello -n argocd -o jsonpath='{.metadata.annotations.argocd\.argoproj\.io/tracking-id}'` |
| Why is root unhappy | `kubectl get application root -n argocd -o jsonpath='{range .status.conditions[*]}{.type}: {.message}{"\n"}{end}'` |
| Skip the three minute poll | `argocd app get root --hard-refresh --core` |
| Prove nothing bounced | `kubectl get pods -l app=hello -o custom-columns=NAME:.metadata.name,UID:.metadata.uid,START:.status.startTime` |
| Unstick a `Terminating` app | `kubectl patch application root -n argocd --type merge -p '{"metadata":{"finalizers":null}}'` |
| Delete an app without waiting on it | `kubectl delete application <name> -n argocd --wait=false` |

## Where this series goes next

The cluster now rebuilds itself from one `kubectl apply`. Point a fresh Argo CD at `bootstrap/`, and every app comes back without you remembering what was supposed to be running, which is the answer to the question Part Three ended on.

The three minute poll is next, because waiting three minutes to see whether your commit worked gets old fast, and a repo webhook makes it instant. After that, private repo authentication, so this can point at [my own Forgejo](/blog/self-host-forgejo-tailscale-docker-compose/) instead of a public GitHub repo, which is the version I actually want to run. Then Helm and Kustomize as sources, and the [series hub](/blog/kubernetes-series/) still owes you Labels, Volumes, health probes and Ingress.

Go and delete `bootstrap/whoami.yaml`, push, and watch the app disappear from a cluster you never touched. `[ root synced ]`
