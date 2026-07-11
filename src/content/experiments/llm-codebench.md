---
title: 'llm-codebench'
description: 'A Python harness that benchmarks LLM coding ability across Python, C#, TypeScript, and Bash, plus speed and cost. Submits problems through OpenRouter, runs the generated code in sandboxed Docker containers, and scores pass@k with cost-per-correct, latency, and failure-mode breakdowns. Live results are on the benchmark page.'
repo: 'https://github.com/peculiarengineer-mk/llm-codebench'
pubDate: 'Jul 10 2026'
tags: ['Python', 'Docker', 'LLM', 'Benchmark', 'OpenRouter', 'pass@k']
---

The models all pass the easy problems. What separates them is what you pay and how long you wait, so this harness measures all three at once and puts the numbers on a [live leaderboard](/benchmark/). Run it yourself with a `--dry-run` cost estimate first, then a real run behind a spend cap.
