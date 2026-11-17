# SalesPatriot · Solicitation Browser

The U.S. Defense Logistics Agency posts about 2,000 new RFQs a day on [DIBBS](https://www.dibbs.bsm.dla.mil/). This tool pulls them into a local database and lets a vendor find the ones worth quoting. You describe what you supply in plain words, and a ranked list of matching RFQs appears beside the chat, each with the reason it matched and a link back to DIBBS.

Built in 50 minutes for the Sales Patriot on-site assignment.

## Run it

```bash
npm install --legacy-peer-deps
cp .env.example .env.local        # add GROQ_API_KEY and OPENAI_API_KEY
npm run scrape -- --days 2        # ~3 min, about 4,700 RFQs into data/dibbs.db
npm run embed                     # embeds item names for semantic search
npm run dev                       # http://localhost:3000
```

The scraper needs Google Chrome installed, or set `CHROME_PATH`. It needs Node 22.5 or later because it uses the built-in `node:sqlite`.

## How users find opportunities

- **Find:** chat with a results sidebar.
  - A vendor writes, for example, "we stock ball bearings and hex cap screws, due in the next 2 weeks". Follow-ups like "also gaskets" or "drop textiles" refine the same search, because the session remembers the conversation.
  - **The LLM only translates.** Groq (`openai/gpt-oss-120b`) turns the message and the history into a search intent: keywords, a semantic phrase, Federal Supply Classes, NSNs, a due window and quantity bounds. zod validates it. If the model fails, the raw text becomes a keyword search.
  - **Ranking is deterministic:**
    - keyword search with SQLite FTS5 (BM25) over the item name, NSN and solicitation number;
    - semantic search with OpenAI `text-embedding-3-small` cosine similarity;
    - the two lists merged with reciprocal rank fusion;
    - hard filters for NSN, FSC (the first 4 digits of an NSN), due date and quantity.
  - **Every result shows why it matched**, e.g. `keyword: BEARING`, `similar meaning` or `NSN class 3110`. The parsed intent is shown under each reply, so the vendor can see what the AI understood.
  - Intents and embeddings are cached in SQLite, so repeat questions are free.
- **Browse:** the full table with a word or NSN search and sorting by due date, issue date or quantity.
- **Every row opens on DIBBS:** the solicitation page, the NSN page and the RFQ PDF.

## Architecture

```
DIBBS ──Playwright──▶ scraper ──▶ SQLite (rfqs, FTS5, embeddings, sessions, cache)
                                        ▲
browser ──▶ /api/chat ──▶ Groq intent ──┤ hybrid search (FTS5 + embeddings + RRF)
        └─▶ /api/rfqs ──────────────────┘
```

- **Scraper:** DIBBS rejects plain HTTP clients and puts a DoD consent banner first. The scraper drives real Chrome, accepts the banner, and pages through the grid with the page's own ASP.NET postbacks.
- **Database:** `node:sqlite` (built in). The native `better-sqlite3` was blocked by Windows Application Control on the build machine, so I switched rather than bypass the policy.

## Scope decisions

| Feature | Kept or deferred | Why | How I'd build it |
|---|---|---|---|
| Scrape the latest 2 issue days | Kept | Proves the data pull, and gives about 4.5k rows | A nightly job that backfills all 27 listed days |
| Chat with hybrid search and sidebar | Kept | The core "how vendors find" answer | |
| Browse table with DIBBS links | Kept | Browse and open-on-DIBBS requirements | |
| Saved vendor profile and daily alert | Deferred | Needs auth | The profile is a stored intent re-run after each scrape |
| Parse RFQ PDFs (specs, set-asides, FOB) | Deferred | Slow, and the formats vary | Text extraction plus a per-field LLM pass |
| Award history and last price per NSN | Deferred | A separate DIBBS area | Scrape awards by NSN and show them on the card |
| Accessible component library (ui-sdk), deploy | Deferred | Time | |

## Security risks I accepted for a 50-minute prototype

- **Prompt injection.** The LLM output is schema-validated and only feeds parameterized SQL. It never writes data or runs queries.
- **Cost abuse.** The chat endpoint is open, with no auth, rate limit or spend cap. Message length is capped and results are cached. Auth and rate limits would be the first production change.
- **Data leakage.** Chat text goes to Groq and OpenAI. That's fine for public DIBBS data; real vendor profiles would need a data agreement or a self-hosted model.
- **Hallucinated filters.** Invalid codes are dropped and the intent is shown to the user, but FSCs aren't checked against the official list yet.
- **Sessions.** These are client UUIDs with no auth, and they only hold search phrases.
- **Scraper.** It accepts the consent banner automatically and is rate-limited. Production should use DLA's bulk files or confirm the terms of use.

## How it was built

I used Claude Code with a subagent-driven workflow:
- one approved design, architecture and plan page (`docs/design-and-plan.md`);
- one implementer subagent per task: scraper, search and chat API, UI;
- the UI built in parallel in a separate worktree against a fixed API contract;
- a review at the end.
