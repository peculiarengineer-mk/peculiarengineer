---
title: 'Kubernetes, Part Five: secrets in Git with sealed-secrets'
description: 'Encrypt Secrets so they can live in a public GitOps repo, then rebuild the cluster and watch them all fail until the one key you backed up comes back.'
pubDate: 'Sep 2 2026'
heroImage: '../../assets/sealed-secrets-hero.png'
tags:
  ['Kubernetes', 'k3s', 'ArgoCD', 'GitOps', 'SealedSecrets', 'Secrets', 'kubectl', 'DevOps', 'SelfHosted', 'Tutorial']
---

[Part Two](/blog/kubernetes-configmaps-secrets-k3s/) ended with a warning I never followed up on: a Secret is base64, not encryption, so never commit one to Git. Then [Part Three](/blog/gitops-argocd-k3s/) and [Part Four](/blog/kubernetes-app-of-apps-argocd/) built a cluster that deploys itself from a public GitHub repo, and quietly left the question sitting there. If every manifest has to be in Git, and the repo is public, where does the database password go?

You can hold it back and `kubectl apply` it by hand, which is the exact habit the last two parts were about breaking. Or you can encrypt it before it goes in the repo, and let something inside the cluster decrypt it on the way out. That is what [sealed-secrets](https://github.com/bitnami/sealed-secrets) does, and the setup is short enough that it is not why this post exists.

The reason is what you have just built by doing it. There is now one private key inside the cluster that turns your public repo back into passwords. Lose it and every secret in Git is a paperweight. I wanted to see what that actually looks like, so I destroyed the cluster and rebuilt it from Git with the key gone, and then I got the rotation order wrong and broke it a second way. Both are below, with the output.

> **TL;DR.** Install the controller into `kube-system`, then `kubectl create secret ... --dry-run=client -o yaml | kubeseal --format yaml` turns a Secret into a `SealedSecret` you can commit anywhere. The controller decrypts it into a real Secret in under a second, Argo CD reports it `Synced` and `Healthy`, and the API masks the decrypted value. Back up the key with `kubectl get secret -n kube-system -l sealedsecrets.bitnami.com/sealed-secrets-key -o yaml` the same day, because a rebuilt cluster generates a new key and every existing `SealedSecret` fails with `no key could decrypt secret`. Restoring the key and restarting the controller fixed mine in 31 seconds. When you rotate, seal everything again with `kubeseal --re-encrypt` **before** you label the old key `compromised`, not after.

## Contents

- [The one idea worth holding onto](#the-one-idea-worth-holding-onto)
- [Before you start](#before-you-start)
- [Step 1: prove the obvious thing is wrong](#step-1-prove-the-obvious-thing-is-wrong)
- [Step 2: install the controller and kubeseal](#step-2-install-the-controller-and-kubeseal)
- [Step 3: seal a secret and commit it](#step-3-seal-a-secret-and-commit-it)
- [Step 4: what Argo CD shows, and what it hides](#step-4-what-argo-cd-shows-and-what-it-hides)
- [Step 5: what is still public](#step-5-what-is-still-public)
- [Step 6: back up the key, today](#step-6-back-up-the-key-today)
- [Step 7: destroy the cluster and rebuild it from Git](#step-7-destroy-the-cluster-and-rebuild-it-from-git)
- [Step 8: restore the key](#step-8-restore-the-key)
- [Step 9: rotation, and the order that breaks everything](#step-9-rotation-and-the-order-that-breaks-everything)
- [Why sealed-secrets and not SOPS](#why-sealed-secrets-and-not-sops)
- [Gotchas I hit](#gotchas-i-hit)
- [Quick command reference](#quick-command-reference)
- [Where this series goes next](#where-this-series-goes-next)

## The one idea worth holding onto

Sealed-secrets is asymmetric encryption with a Kubernetes shaped wrapper. A controller in the cluster holds a private key. You get the public half, and `kubeseal` uses it to encrypt a normal Secret into a `SealedSecret` object. Anyone can read the `SealedSecret`. Only the controller can turn it back into a Secret, and it does that automatically the moment the `SealedSecret` lands in the cluster.

So the repo can be public. The thing that is not public is one `kubernetes.io/tls` Secret in `kube-system`, and that one object is now the difference between a Git repo full of config and a Git repo full of your passwords. Everything in this post is either using that key or protecting it.

## Before you start

You need the cluster as Part Four left it: k3s, Argo CD in the `argocd` namespace, a `root` Application pointing at `bootstrap/`, and the `hello` app deployed from `apps/hello/`. If `kubectl get applications -n argocd` shows `hello` and `root` both `Synced` and `Healthy`, you are ready. The `argocd` CLI alias from Part Three is assumed too, so `argocd app get hello --hard-refresh --core` works without `configmap "argocd-cm" not found` shouting at you.

I tested this on Argo CD v3.5.2, sealed-secrets v0.39.1 and k3s v1.36.4, on Ubuntu 24.04. The project moved from `bitnami-labs` to `bitnami` on GitHub at some point. The old URLs still redirect, so older posts you find will still work, but use the new ones.

Everything below is one k3s node and about forty minutes, most of which is Step 7 waiting for a cluster to rebuild.

## Step 1: prove the obvious thing is wrong

I wanted to see the mistake rather than take Part Two's word for it. Commit a plain Secret into `apps/hello/` and let Argo CD deploy it.

**▶ Do:** create `apps/hello/secret.yaml`:

```yaml
apiVersion: v1
kind: Secret
metadata:
  name: hello-db
type: Opaque
stringData:
  password: hunter2-but-in-git
```

Push it, refresh, and look at both ends:

```bash
git show HEAD:apps/hello/secret.yaml | tail -2
kubectl get secret hello-db -o jsonpath='{.data.password}' | base64 -d; echo
```

```text
stringData:
  password: hunter2-but-in-git
hunter2-but-in-git
```

**💡 What happened:** nothing, and that is the problem. Argo CD synced it happily, the Secret works, and the password is sitting in plain text in a public repo forever, including in the history after you delete it. Using `data:` with a base64 value instead of `stringData:` changes nothing except that the attacker has to type `base64 -d`. Delete the file and push before going any further. On this cluster `prune: true` removes the Secret within seconds. The commit is still there, which is why the demo value is fake.

## Step 2: install the controller and kubeseal

Two pieces. The controller runs in the cluster and owns the private key. `kubeseal` runs wherever you write YAML and only ever sees the public key.

**▶ Do:**

```bash
kubectl apply -f https://github.com/bitnami/sealed-secrets/releases/download/v0.39.1/controller.yaml
kubectl -n kube-system rollout status deploy/sealed-secrets-controller

curl -sSL https://github.com/bitnami/sealed-secrets/releases/download/v0.39.1/kubeseal-0.39.1-linux-amd64.tar.gz \
  | tar xz -C /tmp kubeseal
sudo install -m 755 /tmp/kubeseal /usr/local/bin/kubeseal
kubeseal --version
```

**✅ You should see** the controller roll out in `kube-system`, `kubeseal version: 0.39.1`, and one new Secret that did not exist a minute ago:

```bash
kubectl get secret -n kube-system -l sealedsecrets.bitnami.com/sealed-secrets-key
```

```text
NAME                      TYPE                DATA   AGE
sealed-secrets-keyjvgfv   kubernetes.io/tls   2      38s
```

**💡 What happened:** on first start the controller found no key, generated a 4096 bit RSA pair, and stored it as that TLS Secret with a random suffix and the label `sealedsecrets.bitnami.com/sealed-secrets-key=active`. That object is the entire trust root. Step 6 is about it. The certificate it issued for itself is valid for ten years, so you will not be chasing an expiry, but you will meet the 30 day renewal in Step 9.

The controller costs almost nothing. Mine sat at `1m` CPU and `12Mi` of memory on `kubectl top`, and it ships with no resource requests at all, so on a small box there is nothing to tune.

## Step 3: seal a secret and commit it

The pipeline that matters is one line, and the point of it is that the plain text never touches disk.

**▶ Do:** from the root of your GitOps repo:

```bash
kubectl create secret generic hello-db --namespace default \
  --from-literal=password='s3cr3t-pg-pass' \
  --dry-run=client -o yaml \
  | kubeseal --format yaml > apps/hello/hello-db.sealed.yaml
```

`--dry-run=client` makes `kubectl` print the Secret it would have created instead of creating it. `kubeseal` reads that from stdin, fetches the public certificate from the controller through the API server, encrypts every value, and writes the result. Keep `--namespace` on the `kubectl` side even though `default` is the default, because the namespace is baked into the ciphertext, and Step 5 explains what that costs you.

**✅ You should see** something you can commit to a public repo without flinching:

```yaml
---
apiVersion: bitnami.com/v1alpha1
kind: SealedSecret
metadata:
  name: hello-db
  namespace: default
spec:
  encryptedData:
    password: AgDbPa8GSoLADay0GI27Kd2ckJD0H6hBY4c3LZ1efTDGt5njJFEBmQTlmOZd4sBs...
  template:
    metadata:
      name: hello-db
      namespace: default
```

Do not paste mine. That blob only opens under the key that sealed it, which belonged to a cluster I have since deleted, so it is a worked example and nothing more. Seal your own. That `template` block is what the generated Secret will look like, minus the data. Labels, annotations and `type` go in there if whatever reads the Secret needs them.

Now make the app actually depend on it, so a broken secret is visible instead of theoretical. Add an environment variable to the container in `apps/hello/deployment.yaml`:

```yaml
          env:
            - name: DB_PASSWORD
              valueFrom:
                secretKeyRef:
                  name: hello-db
                  key: password
```

Commit the sealed file and the Deployment change together and push. Do not run `kubectl`.

**✅ You should see**, after a refresh, a real Secret that nobody applied:

```bash
kubectl get secret hello-db -o jsonpath='{.metadata.ownerReferences[0].kind}/{.metadata.ownerReferences[0].name}'; echo
kubectl get secret hello-db -o jsonpath='{.data.password}' | base64 -d; echo
kubectl exec deploy/hello -- printenv DB_PASSWORD
```

```text
SealedSecret/hello-db
s3cr3t-pg-pass
s3cr3t-pg-pass
```

**💡 What happened:** Argo CD applied the `SealedSecret` like any other manifest. The controller saw it, decrypted it with the private key, and created the Secret with an owner reference pointing back at the `SealedSecret`. On my node the Secret existed before I could run the next command. The controller log says exactly that:

```text
level=INFO msg="Event(...Kind:\"SealedSecret\"... Name:\"hello-db\"...): type: 'Normal' reason: 'Unsealed' SealedSecret unsealed successfully"
```

The Deployment rolled out on top of it without a single `CreateContainerConfigError` event. On my node the Secret won that race comfortably. Argo CD does not promise an order inside one sync, so if it ever loses, the kubelet retries and the Pods start a few seconds late.

One thing worth doing now, while you are here. `kubeseal` only needed the public certificate, and you can save that to the repo so sealing works from a laptop with no cluster access at all:

```bash
kubeseal --fetch-cert > pub-cert.pem
kubectl create secret generic whatever --namespace default --from-literal=k=v --dry-run=client -o yaml \
  | kubeseal --format yaml --cert pub-cert.pem
```

I ran the second command with `KUBECONFIG` pointed at a file that does not exist and it produced a valid `SealedSecret`. The cert is public by design, so committing it is fine. Step 8 has a note about when it goes stale.

## Step 4: what Argo CD shows, and what it hides

The question I had going in was whether Argo CD would fight the controller. The `SealedSecret` is in Git. The Secret it produces is not. Does Argo CD flag the Secret as something it did not ask for, or show the `SealedSecret` as permanently `OutOfSync` because the controller keeps writing to its status?

Neither, on v3.5.2.

**▶ Do:**

```bash
argocd app get hello --core
```

```text
NAME    SYNC     HEALTH
hello   Synced   Healthy

GROUP        KIND          NAMESPACE  NAME      STATUS  HEALTH   HOOK  MESSAGE
             Service       default    hello     Synced  Healthy        service/hello unchanged
apps         Deployment    default    hello     Synced  Healthy        deployment.apps/hello configured
bitnami.com  SealedSecret  default    hello-db  Synced  Healthy        sealedsecret.bitnami.com/hello-db created
```

**💡 What happened:** Argo CD ships a health check for `bitnami.com/SealedSecret` that reads the controller's status conditions, which is why you get `Healthy` rather than a blank. The generated Secret does not appear in this list because it is not a managed resource, but it does show up in the resource tree as a child of the `SealedSecret`, the same way a Pod shows up under a ReplicaSet. I pulled the tree from the API to check:

```text
SealedSecret/hello-db  parent=-/-
Secret/hello-db        parent=SealedSecret/hello-db
```

And the part I actually cared about, since Part Three made a point of the Argo CD UI being a window into the cluster. Asking the API for the live Secret manifest returns this:

```json
{
  "data": {
    "password": "++++++++"
  }
}
```

The masking happens in argocd-server before the manifest leaves the API. I checked the API with a token rather than clicking through the UI, but the UI reads through that same API, so there is no route in it to the plain value for someone who can see the app but cannot `kubectl get secret`. The `SealedSecret` comes back with its full ciphertext, which is fine, because that is what is in the repo anyway.

## Step 5: what is still public

Encrypting the value does not encrypt the shape. Look at the sealed file again and count what you can read: the Secret's name, its namespace, and every key inside it. If your Secret is called `stripe-live-api-key` with a key called `token`, the repo now announces that you have a live Stripe key, and where it lives.

The ciphertext length also tracks the plain text. I sealed three values and measured the base64:

```text
plaintext   2 bytes -> ciphertext  712 chars
plaintext  40 bytes -> ciphertext  760 chars
plaintext 400 bytes -> ciphertext 1240 chars
```

There is a fixed overhead for the wrapped session key and then the length grows with the payload, so a 2 character password and a 40 character one are distinguishable from Git alone. Sealing is not deterministic, which is the good news: the same 2 byte value sealed twice gave two completely different blobs, so nobody can confirm a guess by sealing it themselves and comparing.

The other thing baked in is the name and namespace. By default a `SealedSecret` is sealed with **strict** scope, meaning the ciphertext is bound to `hello-db` in `default` and nothing else. I found out what that means by renaming the file's `metadata.name` to `hello-db-renamed` and pushing:

```bash
kubectl get sealedsecret hello-db-renamed \
  -o jsonpath='{range .status.conditions[*]}{.type}={.status}: {.message}{"\n"}{end}'
argocd app get hello --core | head -3
```

```text
Synced=False: no key could decrypt secret (password)

NAME    SYNC     HEALTH
hello   Synced   Degraded
```

`no key could decrypt` is misleading, because the key is fine. The ciphertext simply refuses to open under a different name. That is the feature: someone with write access to the repo cannot copy your production `SealedSecret` into a namespace they control and have the controller decrypt it for them. It also means you cannot rename or move a sealed secret without sealing it again from the plain text. The Argo CD app goes `Degraded` for as long as it stays that way, which at least makes it hard to miss.

If you want to be able to rename, seal with `--scope namespace-wide`, which binds to the namespace only. `kubeseal` records the choice as an annotation, and a namespace wide secret I renamed after sealing decrypted fine. There is also `cluster-wide`, which binds to nothing. My rule: strict for everything unless I have a reason, because the failure mode of strict is a `Degraded` app, and the failure mode of `cluster-wide` is a decryptable secret in a namespace I did not choose.

## Step 6: back up the key, today

Everything above works, and none of it is the reason for the post. This is.

**▶ Do:**

```bash
kubectl get secret -n kube-system -l sealedsecrets.bitnami.com/sealed-secrets-key -o yaml \
  > sealed-secrets-key-backup.yaml
```

**✅ You should see** a 7 KB file containing a `tls.crt` and a `tls.key`. Do not commit it. Do not leave it in the repo directory where a `git add -A` will find it. It is the plain text equivalent of every secret you will ever seal for this cluster, and it needs to go wherever your real backups go. Mine goes into the [restic repository](/blog/backup-homelab-restic-object-storage/) from the last post, which means it lives under a password that is itself written down somewhere that is not this box.

Two things about the file. It is a `List`, and it will grow: the controller generates a new key every 30 days by default and keeps the old ones, so re-run this after a rotation or you have backed up a key that can no longer decrypt your newest secrets. And it comes out with `resourceVersion` and `uid` fields still in it. I expected to have to strip those before restoring. I did not, and Step 8 shows it going straight back in with `kubectl apply`.

## Step 7: destroy the cluster and rebuild it from Git

The promise of Parts Three and Four is that the cluster is disposable, because Git can rebuild it. So I took the promise literally.

**▶ Do:** on the node, wipe k3s entirely and put it back:

```bash
/usr/local/bin/k3s-uninstall.sh
curl -sfL https://get.k3s.io | sh -
sudo install -m 600 /etc/rancher/k3s/k3s.yaml ~/.kube/config
```

Then reinstall the two platform pieces exactly as before:

```bash
kubectl create namespace argocd
kubectl apply -n argocd --server-side -f https://raw.githubusercontent.com/argoproj/argo-cd/stable/manifests/install.yaml
kubectl apply -f https://github.com/bitnami/sealed-secrets/releases/download/v0.39.1/controller.yaml
kubectl -n kube-system rollout status deploy/sealed-secrets-controller
kubectl get secret -n kube-system -l sealedsecrets.bitnami.com/sealed-secrets-key \
  -o custom-columns=NAME:.metadata.name,CREATED:.metadata.creationTimestamp
```

```text
NAME                      CREATED
sealed-secrets-keymt58q   2026-09-03T02:35:29Z
```

Different suffix. This is a brand new key that has never seen your repo. Now the one manual step from Part Four, and then don't touch anything:

```bash
kubectl apply -f bootstrap/root.yaml
```

**✅ You should see** the cluster come back from Git, up to a point:

```bash
kubectl get applications -n argocd
kubectl get pods
```

```text
NAME    SYNC     HEALTH
hello   Synced   Degraded
root    Synced   Healthy

NAME                     READY   STATUS                       RESTARTS   AGE
hello-7bb887b46b-8zfvz   0/1     CreateContainerConfigError   0          24s
hello-7bb887b46b-wlm2m   0/1     CreateContainerConfigError   0          24s
hello-7bb887b46b-znznp   0/1     CreateContainerConfigError   0          24s
```

Root came back. The `hello` Application came back. The Deployment, Service and `SealedSecret` all came back, and Argo CD says every one of them is `Synced`, because they are. Git and the cluster agree perfectly. And no Pod can start:

```bash
kubectl get sealedsecret hello-db \
  -o jsonpath='{range .status.conditions[*]}{.type}={.status}: {.message}{"\n"}{end}'
argocd app get hello --core | tail -4
```

```text
Synced=False: no key could decrypt secret (password)

GROUP        KIND          NAMESPACE  NAME      STATUS  HEALTH       HOOK  MESSAGE
             Service       default    hello     Synced  Healthy            service/hello unchanged
apps         Deployment    default    hello     Synced  Progressing        deployment.apps/hello unchanged
bitnami.com  SealedSecret  default    hello-db  Synced  Degraded           sealedsecret.bitnami.com/hello-db unchanged
```

**💡 What happened:** this is the sentence to remember. **`Synced` means the cluster matches Git. It has never meant the cluster works.** Part Three said that about a broken image. Here it is again with a secret. The `SealedSecret` was applied exactly as written. The new controller tried every key it has, which is one, and none of them is the key that sealed it. The controller logs `ErrUnsealFailed`, gives up, and the Deployment sits in `CreateContainerConfigError` waiting for a Secret that will never arrive. I watched it for nearly two minutes to be sure it was not slow. It was not slow. It was permanent.

Without the file from Step 6, this is the point where you go and find every plain text value again and seal them all with the new key. If any of those values only ever existed in the old cluster, they are gone.

## Step 8: restore the key

**▶ Do:**

```bash
kubectl apply -f sealed-secrets-key-backup.yaml
kubectl -n kube-system rollout restart deploy/sealed-secrets-controller
kubectl -n kube-system rollout status deploy/sealed-secrets-controller
```

**✅ You should see** `secret/sealed-secrets-keyjvgfv created`, the old key sitting next to the new one, and then the controller picking both up on the way back in:

```bash
kubectl get secret -n kube-system -l sealedsecrets.bitnami.com/sealed-secrets-key \
  -o custom-columns=NAME:.metadata.name,CREATED:.metadata.creationTimestamp
kubectl -n kube-system logs deploy/sealed-secrets-controller | grep -i "private key"
```

```text
NAME                      CREATED
sealed-secrets-keyjvgfv   2026-09-03T02:38:02Z
sealed-secrets-keymt58q   2026-09-03T02:35:29Z
```

```text
level=INFO msg="Searching for existing private keys"
level=INFO msg="registered private key" secretname=sealed-secrets-keymt58q
level=INFO msg="registered private key" secretname=sealed-secrets-keyjvgfv
level=INFO msg=Updating key=default/hello-db
```

And then, without touching the Deployment or Argo CD:

```text
NAME                     READY   STATUS    RESTARTS   AGE
hello-7bb887b46b-8zfvz   1/1     Running   0          2m22s
hello-7bb887b46b-wlm2m   1/1     Running   0          2m22s
hello-7bb887b46b-znznp   1/1     Running   0          2m22s

NAME    SYNC     HEALTH
hello   Synced   Healthy
root    Synced   Healthy
```

**💡 What happened:** 31 seconds from the restart command to a decrypted Secret, most of which was the controller rollout. The restart is the documented step because the controller loads its keys when it starts. I restarted straight away and did not test whether it would have noticed the new key on its own, so do the restart. Once it had the old key it decrypted `hello-db` on its next pass, the kubelet's retry loop found the Secret and started the containers, and Argo CD's health flipped to `Healthy` on its own. The same Pods, too, note the age. Nothing was recreated. Kubernetes had been patiently retrying the whole time.

One subtlety that bit me a step later. The restored key has a newer `creationTimestamp` than the fresh one, because it was created just now, but the controller orders keys by the certificate's `NotBefore` date by default, and by that measure the restored key is the older of the two. So new seals now use the fresh key, and `kubeseal --fetch-cert` hands out a certificate that no longer matches the `pub-cert.pem` you committed in Step 3. Both keys decrypt, so nothing breaks, but refresh the committed cert after a rebuild or your offline seals will keep using a key you would rather retire.

## Step 9: rotation, and the order that breaks everything

The controller generates a new key every 30 days (`--key-renew-period`, default `720h0m0s`) and keeps every old one for decryption, so in normal life rotation is invisible: new secrets get the new key, old secrets keep working, and your backup file from Step 6 gets one entry longer each month.

The interesting case is when you want a key gone, say because the backup file was somewhere it should not have been. The documented move is to label the key `compromised` and restart the controller. I did that, and then deleted the `hello-db` Secret to prove the old `SealedSecret` still decrypted.

It did not:

```bash
kubectl -n kube-system label secret sealed-secrets-keyjvgfv \
  sealedsecrets.bitnami.com/sealed-secrets-key=compromised --overwrite
kubectl -n kube-system rollout restart deploy/sealed-secrets-controller
kubectl delete secret hello-db
# ...60 seconds later
kubectl get secret hello-db
kubectl get sealedsecret hello-db -o jsonpath='{.status.conditions[0].type}={.status.conditions[0].status}'
```

```text
Error from server (NotFound): secrets "hello-db" not found
Synced=False
```

**💡 What happened:** a key labelled `compromised` is not just retired from sealing. The controller stops using it for decryption at all. Every `SealedSecret` that was sealed with it is now undecryptable, exactly as if the key had never been restored. Worse, the tool that would fix this needs the controller to decrypt first:

```bash
kubeseal --re-encrypt < apps/hello/hello-db.sealed.yaml
```

```text
error: cannot re-encrypt secret: an error on the server ("") has prevented the request from succeeding (post services http:sealed-secrets-controller:)
```

An empty error string, from a request proxied through the API server to the controller, because the controller cannot open the thing you asked it to seal again. So once the label is on, you are back to plain text or back to the backup.

And here is the part that makes it dangerous rather than just annoying. The running Pods did not care:

```text
NAME                     READY   STATUS    RESTARTS   AGE
hello-7bb887b46b-8zfvz   1/1     Running   0          5m15s
```

The environment variable was injected when the container started. Nothing re-reads a missing Secret until a Pod is rescheduled, so the app looks fine right up to the next node reboot or rollout, and then every new Pod is `CreateContainerConfigError`. I deleted one Pod to see it and got exactly that.

The order that works is the reverse. I put the label back to `active`, restarted the controller, watched `hello-db` come straight back, and then did it properly:

```bash
# 1. seal everything again with the current key. No plain text needed, the controller does it.
kubeseal --re-encrypt < apps/hello/hello-db.sealed.yaml > /tmp/hello-db.sealed.yaml
mv /tmp/hello-db.sealed.yaml apps/hello/hello-db.sealed.yaml
git commit -am "re-encrypt hello-db" && git push

# 2. only now retire the old key
kubectl -n kube-system label secret sealed-secrets-keyjvgfv \
  sealedsecrets.bitnami.com/sealed-secrets-key=compromised --overwrite
kubectl -n kube-system rollout restart deploy/sealed-secrets-controller

# 3. refresh the committed public cert
kubeseal --fetch-cert > pub-cert.pem
```

After that, deleting `hello-db` brought it back immediately with the right value, decrypted under the new key. `--re-encrypt` changes the ciphertext without you ever seeing the plain text, which is the right tool for "every secret in the repo" and the wrong tool for "after I have already pulled the key". Re-encrypt, commit, then retire. Never the other way round.

## Why sealed-secrets and not SOPS

The other common answer is [SOPS](https://github.com/getsops/sops) with age keys, and it is a good one. The difference is where the private key lives. With sealed-secrets it lives in the cluster and the cluster decrypts. With SOPS it lives with you, and something on the deploy path has to be handed it: an Argo CD plugin, a Flux controller, or a human.

For one cluster I run myself, sealed-secrets wins because there is nothing to wire into Argo CD. The `SealedSecret` is a plain manifest, the stock health check understands it, and the whole install was one `kubectl apply`. SOPS is what I would reach for the day I have two clusters that need the same secret, or need to read the decrypted values outside Kubernetes, because a sealed secret is useless anywhere except the one cluster whose key sealed it. That is a limitation and a feature at the same time. For this series it is a feature.

## Gotchas I hit

**The key is the backup, and it is one file.** `kubectl get secret -n kube-system -l sealedsecrets.bitnami.com/sealed-secrets-key -o yaml` before you seal anything you care about. A rebuilt cluster has a new key and every existing `SealedSecret` fails with `no key could decrypt secret`, permanently, while Argo CD reports `Synced` throughout.

**`Synced` does not mean the secret decrypted.** Watch `HEALTH`. Argo CD's built in check turns the app `Degraded` when the controller reports `Synced=False` on the `SealedSecret`, and that is the only place it will tell you.

**Restart the controller after touching keys.** Restoring a key or changing its label is followed by `kubectl -n kube-system rollout restart deploy/sealed-secrets-controller` every time in this post, and that is the sequence I know works.

**Labelling a key `compromised` breaks every secret sealed with it, immediately.** Not just new seals. Decryption too. `kubeseal --re-encrypt` everything and commit **before** the label, because after it the re-encrypt call fails with an empty error.

**A missing Secret is invisible until a Pod restarts.** Running containers already have the value. The `CreateContainerConfigError` arrives with the next rollout or reboot, which can be weeks later.

**Renaming a sealed secret breaks it.** Strict scope binds the ciphertext to name and namespace. The error is the same `no key could decrypt` you get for a lost key, which sends you looking in the wrong place. Seal again from plain text, or use `--scope namespace-wide` if renames are a thing you do.

**Hand edits to the generated Secret stick, until they don't.** I patched the decrypted Secret to `tampered` and it was still `tampered` fifteen seconds later. Argo CD does not manage that Secret so it did not care either. A controller restart, or any change to the `SealedSecret`, overwrote it with the sealed value. Deleting the Secret outright got it recreated in under a second. Either way, the repo wins eventually, so do not fix a wrong password with `kubectl edit`.

**After a restore, `kubeseal --fetch-cert` gives you the new key's cert, not the restored one.** Keys are ordered by certificate `NotBefore`, not by when the Secret object was created. Refresh any `pub-cert.pem` you committed.

**`--from-literal` lands in your shell history.** The seal pipeline keeps plain text off disk, but not out of `~/.bash_history`. `read -s PW` first and then `--from-literal=password="$PW"` keeps it out of both.

## Quick command reference

| Task | Command |
| --- | --- |
| Install the controller | `kubectl apply -f https://github.com/bitnami/sealed-secrets/releases/download/v0.39.1/controller.yaml` |
| Seal a secret | `kubectl create secret generic <name> -n <ns> --from-literal=k=v --dry-run=client -o yaml \| kubeseal --format yaml > <name>.sealed.yaml` |
| Seal without cluster access | `... \| kubeseal --format yaml --cert pub-cert.pem` |
| Save the public cert | `kubeseal --fetch-cert > pub-cert.pem` |
| **Back up the private key** | `kubectl get secret -n kube-system -l sealedsecrets.bitnami.com/sealed-secrets-key -o yaml > sealed-secrets-key-backup.yaml` |
| Restore it | `kubectl apply -f sealed-secrets-key-backup.yaml && kubectl -n kube-system rollout restart deploy/sealed-secrets-controller` |
| Why won't it decrypt | `kubectl get sealedsecret <name> -o jsonpath='{range .status.conditions[*]}{.type}={.status}: {.message}{"\n"}{end}'` |
| Controller log | `kubectl -n kube-system logs deploy/sealed-secrets-controller` |
| List keys and their state | `kubectl get secret -n kube-system -l sealedsecrets.bitnami.com/sealed-secrets-key -L sealedsecrets.bitnami.com/sealed-secrets-key` |
| Seal again under the current key | `kubeseal --re-encrypt < old.sealed.yaml > new.sealed.yaml` |
| Retire a key (after re-encrypting) | `kubectl -n kube-system label secret <key> sealedsecrets.bitnami.com/sealed-secrets-key=compromised --overwrite` |
| Read the decrypted value | `kubectl get secret <name> -o jsonpath='{.data.<key>}' \| base64 -d` |

## Where this series goes next

The repo can be public now, all of it, and the cluster rebuilds from it with one `kubectl apply` plus one key restore. That closes the loop Part Three opened.

The three minute poll is still there, so a repo webhook is next. Then pointing all of this at [my own Forgejo](/blog/self-host-forgejo-tailscale-docker-compose/) over a private repo, which needs Argo CD to hold a credential of its own, and now there is a sensible place to keep it. Helm and Kustomize as sources are still on the list, and the [series hub](/blog/kubernetes-series/) still owes you Labels, Volumes, health probes and Ingress.

Go and run the backup command. Then go and check it actually landed in the restic repo, because a key you think you backed up is the same as no key. `[ key backed up ]`
