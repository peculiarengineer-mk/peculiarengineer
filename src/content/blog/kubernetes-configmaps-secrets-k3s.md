---
title: 'Kubernetes, Part Two: ConfigMaps and Secrets, config and passwords out of your image'
description: 'Pull an app''s settings, a whole web page, and its passwords out of the image and into the cluster, as env vars and mounted files, then change them live with no rebuild. Plus the base64 gotcha that trips everyone.'
pubDate: 'Jul 8 2026'
heroImage: '../../assets/k3s-configmaps-hero.png'
tags: ['Kubernetes', 'k3s', 'kubectl', 'ConfigMaps', 'Secrets', 'DevOps', 'SelfHosted', 'Tutorial']
---

In [Part One](/blog/kubernetes-first-app-k3s-single-node/) I got a single k3s node deploying nginx and healing itself, which handed us the one idea the rest of Kubernetes hangs off: you declare the state you want, and the cluster reconciles reality to match. But the app I deployed was still the stock `nginx:1.27` image with nothing of mine in it. The moment you want to run your *own* thing, the next question shows up fast: where does its configuration go, and where do its passwords go?

Baking either into the image is a trap. You can't change a setting without a rebuild, the same image can't run in dev and in prod, and any password you bake in lives in a registry forever. This part gets us out of that trap with the two objects Kubernetes gives you for exactly this, ConfigMaps and Secrets, and it picks up right where Part One left off. The running map of the whole thing is on the [Kubernetes series hub](/blog/kubernetes-series/).

> **TL;DR** Put non-secret settings in a **ConfigMap**, sensitive ones in a **Secret**, and keep both out of your image. A container reads them two ways: as **environment variables** (`envFrom`) for individual values, and as **mounted files** (`volumes` + `volumeMounts`) for whole config files. `kubectl apply` the config objects, wire them into the Deployment by name, then change a value and `kubectl rollout restart` to pick it up, no rebuild. The one thing that bites everyone: a Secret is base64-encoded, not encrypted. Both manifests are inline below, commented line by line.

## Contents

- [The one idea worth holding onto](#the-one-idea-worth-holding-onto)
- [Before you start](#before-you-start)
- [Step 1: read the two manifests before you run them](#step-1-read-the-two-manifests-before-you-run-them)
- [Step 2: create the ConfigMaps and the Secret](#step-2-create-the-configmaps-and-the-secret)
- [Step 3: peek inside, and meet the base64 gotcha](#step-3-peek-inside-and-meet-the-base64-gotcha)
- [Step 4: deploy the app that consumes all three](#step-4-deploy-the-app-that-consumes-all-three)
- [Step 5: read the config as environment variables](#step-5-read-the-config-as-environment-variables)
- [Step 6: read the config as a mounted file](#step-6-read-the-config-as-a-mounted-file)
- [Step 7: change the config and roll it out with no rebuild](#step-7-change-the-config-and-roll-it-out-with-no-rebuild)
- [Step 8: clean up](#step-8-clean-up)
- [Gotchas I hit](#gotchas-i-hit)
- [Quick command reference](#quick-command-reference)
- [Where this series goes next](#where-this-series-goes-next)

## The one idea worth holding onto

Part One's idea was *declare the state you want*. Part Two adds one more, and it's just as portable:

> **Your image says what the app IS. ConfigMaps and Secrets say how it's CONFIGURED. Keep the two separate.**

The image is the app: the binary, the runtime, the stock nginx. Everything that changes between one place you run it and the next, the greeting text, the color, the database password, the home page, lives outside the image, in the cluster, next to the app. Kubernetes gives you two objects for it:

- **ConfigMap** holds non-secret settings: feature flags, URLs, a whole config file, even a whole web page. Plain text.
- **Secret** holds the same idea for values you'd be unhappy to see in a log: passwords, API keys, tokens. Kubernetes handles them more carefully, stored base64-encoded and kept out of most output.

The same app reads them two ways, and you'll do both in this part: as **environment variables** for individual settings, and as **files mounted into the container** for whole config files.

## Before you start

This one assumes you finished Part One, so two things are already true. Your `kubectl` reaches the cluster without `sudo` (that's Part One, Step 0, the `KUBECONFIG` fix that bites everyone), and you cleaned up at the end of Part One, so the cluster is empty right now. An empty cluster is the correct starting point. If `kubectl get pods` says `No resources found`, you're good. Budget about fifteen minutes.

## Step 1: read the two manifests before you run them

Two files do all the work. The first holds the config, the second is the Part One Deployment taught to read it.

Save the first as `config-and-secret.yaml`. It's three objects in one file, separated by `---`, so you can create them in a single `apply`:

```yaml
# config-and-secret.yaml
# Three objects in one file, separated by ---

apiVersion: v1
kind: ConfigMap
metadata:
  name: web-config              # settings that become environment variables
data:
  GREETING: "Hello from a ConfigMap!"
  APP_COLOR: "cornflowerblue"
---
apiVersion: v1
kind: ConfigMap
metadata:
  name: web-content             # a whole file, to be mounted into the container
data:
  index.html: |                 # the | keeps the block below as one string
    <h1>👋 This page lives in a ConfigMap</h1>
---
apiVersion: v1
kind: Secret
metadata:
  name: web-secret              # same idea, for the sensitive values
type: Opaque
stringData:                     # stringData: you write plain text, the cluster stores it base64
  API_KEY: "sk-demo-1234567890"
  DB_PASSWORD: "hunter2-not-really"
```

Two ConfigMaps and a Secret. Notice a ConfigMap value can be a short string (`GREETING`) or a whole file (`index.html`, where the `|` keeps everything indented under it as one multi-line string). The Secret looks exactly like a ConfigMap except for `kind: Secret` and `stringData`, which lets you write the values as plain text and hands the base64 encoding to Kubernetes.

Now save the second as `web-configured.yaml`. It's the nginx Deployment from Part One with three new blocks, and those three blocks are the *only* difference:

```yaml
# web-configured.yaml
# Part One's nginx Deployment, plus three blocks that wire config in.

apiVersion: apps/v1
kind: Deployment
metadata:
  name: web
  labels:
    app: web
spec:
  replicas: 3
  selector:
    matchLabels:
      app: web
  template:
    metadata:
      labels:
        app: web
    spec:
      containers:
        - name: nginx
          image: nginx:1.27          # still the stock image, unchanged
          ports:
            - containerPort: 80
          envFrom:                   # NEW: pull every key in as an env var
            - configMapRef:
                name: web-config
            - secretRef:
                name: web-secret
          volumeMounts:              # NEW: mount the file where nginx serves pages
            - name: html
              mountPath: /usr/share/nginx/html
      volumes:                       # NEW: back that mount with the web-content ConfigMap
        - name: html
          configMap:
            name: web-content
```

The `envFrom` block pulls every key from `web-config` and `web-secret` into the container as environment variables. The `volumeMounts` and `volumes` pair turns the `web-content` ConfigMap into a real file on disk at nginx's document root. In all three cases the Deployment refers to the config objects **by name**. It never copies their contents. That's the whole point: the config has a life of its own, and the Deployment just points at it.

**💡 What happened:** You read both manifests before running either one, which is most of the battle. You saw that a ConfigMap value can be one line or a whole file, and that an app wires in config by referring to objects by name, so the same image plus a different ConfigMap is a different app.

## Step 2: create the ConfigMaps and the Secret

**▶ Do:**

```bash
kubectl apply -f config-and-secret.yaml
```

**✅ You should see** three objects created:

```text
configmap/web-config created
configmap/web-content created
secret/web-secret created
```

List them:

```bash
kubectl get configmaps,secrets
```

**💡 What happened:** Those objects now live in the cluster on their own, and no Pod is using them yet. Config has an independent life cycle from the app that reads it, which is exactly why you can change one without touching the other. Hold onto that, it's what makes Step 7 work.

## Step 3: peek inside, and meet the base64 gotcha

**▶ Do** look at the ConfigMap in full. Its contents are plain text:

```bash
kubectl describe configmap web-config
```

Now look at the Secret the same way:

```bash
kubectl get secret web-secret -o yaml
```

**✅ You should see** the Secret's values are not plain text. They're scrambled-looking strings under `data`:

```text
data:
  API_KEY: c2stZGVtby0xMjM0NTY3ODkw
  DB_PASSWORD: aHVudGVyMi1ub3QtcmVhbGx5
```

Decode one:

```bash
kubectl get secret web-secret -o jsonpath='{.data.API_KEY}' | base64 -d ; echo
# sk-demo-1234567890
```

**💡 What happened, and read this twice:** base64 is encoding, not encryption. Anyone who can read the Secret can decode it in one command, exactly as you just did. A Secret's real protections are two things: Kubernetes keeps it out of `describe` and log output by default, and it can restrict *who* is allowed to read Secrets at all, through RBAC. So treat "can read Secrets" as "knows the passwords," and never commit real Secret values to git. The demo values here are fake for that reason.

## Step 4: deploy the app that consumes all three

You also need the Service from Part One so you can reach the app. If you cleaned up at the end of Part One it's gone, so here it is again, unchanged. Save it as `nginx-service.yaml`:

```yaml
# nginx-service.yaml  (identical to Part One)
apiVersion: v1
kind: Service
metadata:
  name: web
spec:
  selector:
    app: web
  ports:
    - port: 80
      targetPort: 80
```

**▶ Do** apply the wired-up Deployment and the Service:

```bash
kubectl apply -f web-configured.yaml
kubectl apply -f nginx-service.yaml
kubectl get pods
```

**✅ You should see** 3 Pods going `Running`, the same as Part One:

```text
NAME                  READY   STATUS    RESTARTS   AGE
web-977bcdd4c-4k9dl   1/1     Running   0          15s
web-977bcdd4c-fvrtn   1/1     Running   0          15s
web-977bcdd4c-zshqn   1/1     Running   0          15s
```

**💡 What happened:** Nothing about *running* the app changed. It's still the stock `nginx:1.27` image. Everything that makes it yours, its home page, its settings, its password, was injected at start-up from the objects you created in Step 2. Same image, your app.

## Step 5: read the config as environment variables

**▶ Do** run a command *inside* one of the Pods to print three of its environment variables. Use any Pod name from Step 4:

```bash
kubectl exec web-977bcdd4c-4k9dl -- printenv GREETING APP_COLOR API_KEY
```

**✅ You should see:**

```text
Hello from a ConfigMap!
cornflowerblue
sk-demo-1234567890
```

**💡 What happened:** The `envFrom` block pulled every key from `web-config` and `web-secret` into the container as environment variables. The app just reads `$GREETING` or `$API_KEY`, and it neither knows nor cares that one came from a ConfigMap and one from a Secret. That's the payoff: your code stays the same, and the *source* of each value is a deploy-time decision you make in YAML, not a code change.

## Step 6: read the config as a mounted file

**▶ Do** forward a local port to the Service. This command keeps running, so leave it open:

```bash
kubectl port-forward service/web 8080:80
```

In a second terminal:

```bash
curl http://localhost:8080
```

**✅ You should see** *your* page, not the default nginx welcome:

```html
<h1>👋 This page lives in a ConfigMap</h1>
```

Press **Ctrl+C** in the first terminal to stop forwarding.

**💡 What happened:** The `volumes` and `volumeMounts` blocks turned the `web-content` ConfigMap into a file at `/usr/share/nginx/html/index.html`, and nginx served it with no idea it came from a ConfigMap. To the container it's just a file on disk. This is how you inject whole config files, an `nginx.conf`, an `application.yaml`, a set of TLS certs, without ever rebuilding an image.

## Step 7: change the config and roll it out with no rebuild

This is the Part Two payoff, and the direct sequel to Part One's self-healing demo: change a value in the cluster and watch the app pick it up, without touching the image once.

**▶ Do** edit `config-and-secret.yaml` and change the `web-content` ConfigMap's `index.html`, for example the `<h1>` line:

```yaml
    <h1>🎉 I changed this without a rebuild</h1>
```

Save, then apply the change and trigger a rollout:

```bash
kubectl apply -f config-and-secret.yaml
kubectl rollout restart deployment web
kubectl rollout status deployment web
```

Re-forward and check again:

```bash
kubectl port-forward service/web 8080:80
# then, in a second terminal:
curl http://localhost:8080
```

**✅ You should see** your new heading come back in the HTML.

**💡 What happened:** You edited config in the cluster, not in a Dockerfile. The `rollout restart` recreated the Pods so they'd re-read the ConfigMap, and Part One's zero-downtime rollout did it a few Pods at a time, so the site never went dark.

> **Why the restart at all?** A ConfigMap mounted as a *file* does eventually update inside running Pods on its own, but after a delay you can't predict. Environment variables from `envFrom` never update in a running Pod, full stop. `kubectl rollout restart` is the reliable, explicit way to say "pick up the new config now." Real teams often automate this, but doing it by hand once shows you the moving parts.

## Step 8: clean up

**▶ Do** remove everything from Part Two:

```bash
kubectl delete -f web-configured.yaml
kubectl delete -f config-and-secret.yaml
kubectl delete -f nginx-service.yaml
```

Confirm the config objects are gone:

```bash
kubectl get configmaps,secrets
```

**💡 What happened:** ConfigMaps and Secrets are ordinary cluster objects. You create, list, and delete them exactly like Deployments. Worth noticing: deleting the Deployment did *not* delete the ConfigMaps, because config lives independently of the apps that use it. That independence is Step 2's whole point, and you just watched it hold on the way out.

## Gotchas I hit

The things that actually cost me time, so they don't cost you any:

- **Expecting a Secret to be secret.** base64 is not encryption. `kubectl get secret ... -o yaml | ... base64 -d` reads it back in one line. What protects a Secret is that it's kept out of default output and gated by RBAC, not the encoding. Never commit real values to git.
- **Changing a ConfigMap and nothing happening.** Editing the object doesn't restart the Pods that read it. Env vars from `envFrom` never refresh in a running Pod, and mounted files refresh only after an unpredictable delay. Run `kubectl rollout restart deployment <name>` to force a clean pickup.
- **`stringData` versus `data`.** In your YAML, `stringData` lets you write plain text and Kubernetes encodes it for you. If you use `data` instead, every value has to already be base64, and pasting plain text there gives you a Secret full of garbage that decodes to nonsense. Pick `stringData` when you're authoring by hand.
- **Editing `index.html` inside the Pod to "fix" the page.** It won't stick. The file is mounted from the `web-content` ConfigMap, so the next restart overwrites your edit with whatever the ConfigMap says. Change the ConfigMap, not the file in the container.
- **A `volumeMounts` name that doesn't match a `volumes` name.** The `name:` under `volumeMounts` has to match a `name:` under `volumes` exactly, the way `html` does in both blocks above. Typo one of them and the Pod is stuck in `ContainerCreating`. `kubectl describe pod <name>` and read the `Events:` at the bottom, it'll say the volume wasn't found.

## Quick command reference

| Goal | Command |
|---|---|
| List config objects | `kubectl get configmaps,secrets` |
| Inspect a ConfigMap | `kubectl describe configmap <name>` |
| See a Secret's raw (base64) values | `kubectl get secret <name> -o yaml` |
| Decode a Secret value | `kubectl get secret <name> -o jsonpath='{.data.KEY}' \| base64 -d` |
| Run a command in a Pod | `kubectl exec <pod> -- <command>` |
| Force Pods to re-read config | `kubectl rollout restart deployment <name>` |

## Where this series goes next

You moved settings, a whole web page, and a password out of an image and into the cluster, then changed them live, and you saw the one thing that trips everyone up: a Secret is base64-encoded, not encrypted. The rule of thumb to carry forward is short. ConfigMap for anything non-secret, Secret for anything you'd hate to see in a log; env vars for individual settings, mounted files for whole config files; and a `rollout restart` when you want the change picked up now.

That's Part Two. The [Kubernetes series hub](/blog/kubernetes-series/) tracks the whole run, and the parts still ahead pick up naturally from here:

1. **Labels and Namespaces**, for organizing and isolating groups of objects.
2. **Volumes**, to keep data alive when Pods disappear (Step 6 mounted a ConfigMap; real storage is the next step up).
3. **Health probes** (liveness and readiness), to teach Kubernetes when your app is actually OK.
4. **Ingress**, to route real outside web traffic to your Services.

Go change a ConfigMap and watch the page follow along. That's the part that made it click for me. `[ config OK ]`
