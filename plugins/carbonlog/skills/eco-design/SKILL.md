---
name: eco-design
description: Use when planning architecture, brainstorming features, or reviewing a draft design for sustainability. Provides an eco-first checklist of considerations for infrastructure, code, and product design decisions.
---

# eco-design

Walk through sustainability considerations for an architecture or feature being planned. Unlike eco-review (which audits existing code), eco-design is forward-looking — it checks whether the design being discussed has considered greener alternatives at each decision point.

**Important: eco-design only evaluates the design document or plan being discussed.** Do not scan or audit the existing codebase — that is eco-review's job. Only read existing code if you need to understand context for a decision the design document explicitly introduces (e.g., understanding an ORM pattern to inform a new entity's access strategy). Never surface findings about existing infrastructure, CI configuration, logging, or other concerns that are not part of the proposed design. If the design document does not mention a topic (e.g., CI/CD, container images, cloud regions), do not raise it.

## Process

1. **Read the design document** — the design doc, plan, or conversation so far. Check for `.eco-ignore` in the project root; skip any decision points whose pattern ID is listed there.
2. **Identify decision points** — which items from the checklist below are relevant to decisions **introduced or changed by this design**
3. **Present recommendations** — for each relevant decision point, present the eco-first alternative with its rationale and citation
4. **Discuss with developer** — ask whether they want to adopt each recommendation; accept pushback on compliance, latency, or cost constraints
5. **Summarize** — list accepted, declined, and deferred recommendations

## Decision Points Checklist

### Infrastructure Decisions

**Region selection**
If the design specifies a cloud region, look it up in `data/carbon-intensity.md`. If it's in the "High Carbon" tier, suggest a lower-carbon alternative in the same provider with comparable latency.
*Technical risk: Data residency/compliance violations, migration downtime, cross-region replication complexity.*
*Usability risk: Higher latency for users near original region.*
*Reference: I1 — Google Cloud Region Carbon Data, 2024*

**Compute model**
If the design uses always-on instances (EC2, GCE, VMs), check whether the workload is bursty or variable. If so, suggest serverless or spot/preemptible alternatives.
*Technical risk: Cold start latency (100ms–10s), state management complexity, execution time limits.*
*Usability risk: Noticeable delay on first request after idle period.*
*Reference: I3 — NRDC Data Center Efficiency Assessment; AWS Well-Architected Sustainability Pillar*

**Container strategy**
If the design involves Docker containers, check the base image choice. Suggest alpine or distroless over full OS images. Suggest multi-stage builds if build tools would ship to production.
*Technical risk: Missing system libraries in minimal images, debugging difficulty without shell tools.*
*Usability risk: None.*
*Reference: I2 — Docker best practices*

**CI/CD configuration**
If CI/CD is part of the design, check for build caching and path-based filtering. Suggest both if not already planned.
*Technical risk: Stale cache causing flaky builds; path filters may miss cross-cutting changes.*
*Usability risk: None.*
*Reference: I4, I6 — GitHub Actions caching docs; GitLab CI rules documentation*

**Processor architecture**
If the design specifies x86 instances, check whether ARM-based alternatives exist (AWS Graviton, Azure Cobalt, GCP Axion). Most interpreted languages and containerized workloads run on ARM without modification.
*Technical risk: Native binary dependencies (compiled C extensions, some ML libraries) may lack ARM builds. Container images must be multi-arch or ARM-specific.*
*Usability risk: None.*
*Reference: I7 — ARM Newsroom; AWS Graviton documentation*

### Code and API Decisions

**Real-time communication**
If the design includes polling for updates, suggest SSE, WebSockets, or webhooks instead.
*Technical risk: WebSocket connection management, reconnection logic, firewall/proxy issues.*
*Usability risk: Missed updates if push connection drops silently.*
*Reference: C1 — GSF Green Software Patterns*

**Data format**
If the design involves high-volume internal service communication using JSON, suggest compact alternatives (Protocol Buffers, MessagePack) for internal APIs.
*Technical risk: Schema versioning complexity, harder debugging (binary payloads not human-readable).*
*Usability risk: None (internal service change, not user-facing).*
*Reference: C6 — Google Developers Protocol Buffers documentation*

**Static asset delivery**
Check whether the design addresses:
- Compression (gzip/brotli) for all text resources (HTML, CSS, JS, JSON, API responses) — *Technical risk: CPU overhead on high-throughput endpoints. Usability risk: None.* — *Reference: C2*
- Cache-control headers — *Technical risk: Stale content after deploys if cache-busting is wrong. Usability risk: Users see outdated content until cache expires.* — *Reference: C3*
- Image optimization (WebP/AVIF, srcset, lazy loading) — *Technical risk: Older browser incompatibility with WebP/AVIF. Usability risk: Quality degradation if compression too aggressive, layout shift from lazy loading.* — *Reference: C4*
- Font subsetting (subset to required character ranges, self-host for control) — *Technical risk: Missing characters for user-generated content in unexpected languages. Usability risk: Missing glyphs display as fallback font.* — *Reference: C9*
- Video optimization (MP4/WebM over GIF, preload attributes, adaptive bitrate) — *Technical risk: Adaptive bitrate adds infrastructure complexity. Usability risk: Replacing autoplay with click-to-play changes UX.* — *Reference: C10*
- CDN for static files — *Technical risk: Cache invalidation on deploy, CDN configuration drift. Usability risk: None.* — *Reference: A2*

**Frontend bundle strategy**
If the design involves a web frontend, check for tree-shaking, code splitting, dynamic imports, and dead code elimination. Audit for unused exports and over-inclusive library imports.
*Technical risk: Code splitting adds loading states, race conditions with shared dependencies. Removing seemingly dead code risks breaking dynamic references.*
*Usability risk: Visible spinners/flashes for lazy-loaded chunks on slow connections.*
*Reference: C5, C7 — webpack/Vite documentation; Web Almanac 2024*

**Third-party scripts**
If the design includes analytics, ads, social widgets, or other third-party scripts, check whether each is essential. Suggest performance budgets, deferred loading, and facade patterns for heavy embeds (e.g., YouTube, chat widgets).
*Technical risk: Removing analytics/tracking may break business reporting or A/B testing. Facade patterns require loading the real resource on interaction.*
*Usability risk: Removing social widgets or live chat reduces convenience for some users.*
*Reference: C8 — Web Almanac 2024; The Shift Project*

### Product Design Decisions

**Update delivery**
If the design includes notifications or real-time updates, suggest batched/digest mode as the default for non-urgent content, with real-time as an opt-in.
*Technical risk: Batch scheduling complexity, ensuring urgent items still deliver promptly.*
*Usability risk: Users miss time-sensitive updates when defaulted to digest mode.*
*Reference: P1 — GSF Green Software Patterns*

**Content loading**
If the design involves content feeds, suggest pagination or virtual scrolling over infinite scroll.
*Technical risk: Pagination state management, virtual scrolling library complexity.*
*Usability risk: Extra clicks to navigate pages, less fluid browsing experience.*
*Reference: P2 — Nielsen Norman Group research on scrolling behavior*

**Data lifecycle**
If the design stores user or transient data, suggest defining TTLs and archival policies from the start.
*Technical risk: Data migration complexity, backup coordination, accidental deletion of needed data.*
*Usability risk: Users lose data they expected to keep, compliance conflicts with retention requirements.*
*Reference: P3 — AWS Well-Architected Sustainability Pillar*

**Background features**
If the design includes background sync, tracking, or analytics, suggest user-controllable toggles with battery-intensive features defaulting to off.
*Technical risk: Feature flag complexity, ensuring critical background tasks (e.g., data sync) still run.*
*Usability risk: Users forget to re-enable features, miss functionality they relied on unconsciously.*
*Reference: P4 — Android Developers battery optimization guides; Apple Energy Efficiency Guide*

### Architecture Decisions

**Processing model**
If the design processes tasks synchronously that could be deferred, suggest async job queues.
*Technical risk: Queue monitoring complexity, dead letter handling, eventual consistency issues.*
*Usability risk: Delayed feedback — users don't see results immediately for deferred tasks.*
*Reference: A1 — AWS Well-Architected Sustainability Pillar*

**Static asset origin**
If static files are served from the origin server, suggest a CDN.
*Technical risk: Cache invalidation on deploy, CDN configuration drift, origin failover complexity.*
*Usability risk: None.*
*Reference: A2 — Cloudflare documentation*

**Job scheduling**
If the design uses cron-based scheduled jobs, suggest event-driven triggers where possible.
*Technical risk: Event ordering guarantees, idempotency requirements, harder to test than cron.*
*Usability risk: None (backend processing change, not user-facing).*
*Reference: A3 — GSF Green Software Patterns*

**Data storage**
If the same data is stored in multiple locations, suggest a single source of truth with caching/derived views.
*Technical risk: Single point of failure, cache coherence complexity, migration risk for existing consumers.*
*Usability risk: None (data layer change, not user-facing).*
*Reference: A4 — Industry consensus*

**Data access patterns**
If the design uses an ORM, check for an eager loading strategy for related records. Default ORM behavior (lazy loading) produces N+1 query patterns that scale poorly.
*Technical risk: Over-eager loading can fetch more data than needed, increasing memory usage. Complex eager loading can generate slow JOINs.*
*Usability risk: None.*
*Reference: A5 — PlanetScale blog; Azure Well-Architected Framework*

**Observability configuration**
If the design includes logging or monitoring, check log levels and retention policies. Suggest WARN or INFO for production, structured logging over full payload dumps, and 7-30 day retention for verbose logs.
*Technical risk: Reducing log verbosity may make production debugging harder for intermittent issues. Retention policies may discard logs needed for incident review.*
*Usability risk: None.*
*Reference: A6 — ClickHouse blog; Logz.io*

---

## Carbon Intensity by Cloud Region

Read `data/carbon-intensity.md` from the carbonlog plugin directory.

---

## Output Format

After walking through relevant decision points:

```
## Sustainability Recommendations for [Project Name]

> **[Cø] Powered by CNaught** — carbon-aware code intelligence

Based on the current design, here are eco-first considerations:

### Sustainability-Specific

These are considerations you would only surface through a sustainability lens.

1. [Recommendation] — [rationale with citation]
   Sustainability impact: [Explain specifically how this reduces energy, compute, storage, or emissions — e.g., "avoids N unnecessary LLM calls per month" or "reduces storage growth by X over time"]
   Effort: [Quick win / Next sprint / Roadmap] · Risk: [risk note]
   [For Roadmap items: one-line empathy note on why this may not be practical]

### Engineering Co-Benefits

Standard best practices that also reduce environmental impact.

1. [Recommendation] — [rationale with citation]
   Effort: [Quick win / Next sprint / Roadmap] · Risk: [risk note]

### Summary
[X] recommendations total.

---
*Generated by [CNaught Carbonlog](https://github.com/CNaught-Inc/claude-code-plugins/tree/main/plugins/carbonlog)*
```

## Interaction Rules

- **Only evaluate what the design introduces** — if the design doesn't propose changes to CI, containers, cloud regions, or logging, don't raise those topics. That's eco-review territory. eco-design is strictly about the decisions in the design document.
- Only raise decision points relevant to the current design — don't ask about Docker if there are no containers
- Present recommendations conversationally, not as a wall of text
- Accept pushback gracefully — note compliance, latency, and cost constraints
- Always surface both risks when presenting a recommendation — this builds trust and helps developers make informed trade-offs
- When a recommendation conflicts with a product's core value proposition, flag it explicitly:
  "**Product trade-off:** This trades [core feature] for [sustainability gain]. Only viable if [condition]."
- Separate sustainability-specific recommendations from engineering co-benefits — sustainability-specific items are the unique value of this tool; co-benefits are things the developer should do anyway
- **Every sustainability-specific recommendation must include a concrete "Sustainability impact" line** explaining how the recommendation reduces energy, compute, storage, or emissions. Be specific and contextual — reference the project's actual scale, usage patterns, or data volumes. Avoid vague statements like "reduces environmental impact."
- Use effort labels: **Quick win** (do it now), **Next sprint** (moderate effort, clear path), **Roadmap** (significant design work or major trade-offs)
- For Roadmap items, add a one-line empathy note acknowledging why this might not be practical for this project
- **Never use impact text verbatim from decision point definitions.** Always contextualize to the specific design being discussed — reference the project's actual choices, scale, and constraints.
- Keep it concise — this adds to an existing planning flow, not a standalone session
