#!/usr/bin/env python3
"""Assemble a self-contained HTML preview of one built post: site CSS, fonts and images inlined.
Usage: python3 scripts/preview-post.py <slug> <out.html> [title]. Run `npm run build` first."""
import re, base64, os, sys, mimetypes
slug, out = sys.argv[1], sys.argv[2]; title = sys.argv[3] if len(sys.argv) > 3 else f"{slug} preview"
h = open(f"dist/blog/{slug}/index.html").read()
def data_uri(fp, mt=None):
    mt = mt or mimetypes.guess_type(fp)[0] or "application/octet-stream"
    if fp.endswith(".woff2"): mt = "font/woff2"
    if fp.endswith(".woff"): mt = "font/woff"
    return f"data:{mt};base64,{base64.b64encode(open(fp,'rb').read()).decode()}"
def find(path):
    for fp in ("dist"+path if path.startswith("/") else None, os.path.join("dist/_astro", os.path.basename(path)), os.path.join("dist/fonts", os.path.basename(path))):
        if fp and os.path.exists(fp): return fp
def css_inline(m):
    fp = find(m.group(1));
    if not fp: return ""
    css = re.sub(r"url\(([^)]+)\)", lambda u: u.group(0) if u.group(1).strip("'\"").startswith(("data:","http")) or not find(u.group(1).strip("'\"")) else f"url({data_uri(find(u.group(1).strip(chr(39)+chr(34))))})", open(fp).read())
    return f"<style>{css}</style>"
h = re.sub(r'<link[^>]+rel="stylesheet"[^>]+href="([^"]+)"[^>]*>', css_inline, h)
h = re.sub(r'<link[^>]+href="([^"]+\.css)"[^>]+rel="stylesheet"[^>]*>', css_inline, h)
h = re.sub(r'src="(/_astro/[^"]+)"', lambda m: m.group(0).replace(m.group(1), data_uri(find(m.group(1)))) if find(m.group(1)) else m.group(0), h)
h = re.sub(r'srcset="[^"]*"', '', h)
h = re.sub(r"<script.*?</script>", "", h, flags=re.S)
h = re.sub(r'<link[^>]*(?:as="font"|\.woff2?|rel="(?:icon|sitemap|alternate|canonical|preload)")[^>]*>', '', h)
h = re.sub(r'href="/(?!/)', 'href="https://peculiarengineer.com/', h)
h = re.sub(r"<title>.*?</title>", f"<title>{title}</title>", h, flags=re.S)
head = re.search(r"<head>(.*?)</head>", h, flags=re.S).group(1); body = re.search(r"<body[^>]*>(.*)</body>", h, flags=re.S).group(1)
head = re.sub(r'<meta charset[^>]*>|<meta name="viewport"[^>]*>', '', head)
open(out, "w").write(head + "\n" + body)
print(out, round(os.path.getsize(out)/1024), "KB; images:", (head+body).count("data:image/"), "; external font refs:", len(re.findall(r'https://peculiarengineer\.com/_astro/fonts', head+body)))
