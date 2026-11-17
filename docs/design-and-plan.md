# DIBBS Solicitation Browser: design, architecture and plan

Status: Approved 2026-11-17
Skipped by user: separate architecture doc, architecture review subagents, separate plan gate. All three are folded into this one page because of the 50-minute limit.

## Problem
DLA posts about 2,000 RFQs on DIBBS every weekday. A vendor only cares about a few of them. Today someone scrolls a 40-page table by hand.

## Users and flow
- **User:** a bid or sales rep at a distributor who quotes DLA work.
- **Flow:**
  1. The rep says what they supply in plain words, for example "we stock bearings and hex cap screws, nothing under qty 50, due in 2 weeks".
  2. A ranked list of matching RFQs appears in the sidebar, each with the reason it matched.
  3. The rep refines it in the chat ("drop textiles", "also NSN 5310-…"). The chat remembers earlier turns.
  4. Clicking a row opens the RFQ on DIBBS; a second link opens its PDF.
- **Second view, Browse:** the full table with a keyword filter and sorting by due date. This covers "browse" for anyone who doesn't want to chat.

## Screens
1. **Find:** chat on the left, results sidebar on the right.
   - Each result shows the NSN, item name, solicitation number, quantity, a "due in N days" badge and match chips (keyword, meaning, NSN class).
2. **Browse:** a dense table with a search box and sort controls. Every row links to DIBBS.

## The AI's role (advisory only)
- **Groq (Llama)** turns each chat message plus the session history into a search intent: keywords, a semantic phrase, NSN or FSC prefixes, due within N days, and a minimum quantity. The output is validated with zod. If the call fails or returns invalid output, the raw text is used as the query.
- **Ranking stays deterministic:** a hybrid search with SQLite FTS5 (BM25) for keywords and OpenAI `text-embedding-3-small` cosine for meaning, merged with reciprocal rank fusion. Hard filters cover NSN/FSC, due date and quantity.
  - NSN is the exact-digits path: the first 4 digits are the Federal Supply Class (5310 = nuts and washers, 3110 = bearings).
- **Caching:** chat history per session in SQLite (context memory), intents cached by session plus message hash, and embeddings cached by text hash so repeat queries cost nothing.
- **Keys:** `GROQ_API_KEY` and `OPENAI_API_KEY` in `.env.local`, copied from keys.env.

## Architecture notes
- **Next.js 15** (App Router, TypeScript, Tailwind) with **better-sqlite3**, stored in `data/dibbs.db`.
- **Scraper:** `npm run scrape -- --days 2`, using Playwright with installed Chrome.
  - Clicks the DoD consent OK button (`#butAgree`).
  - Goes to `RfqRecs.aspx?category=issue&TypeSrch=dt&Value=MM-DD-YYYY`.
  - Reads grid `#ctl00_cph1_grdRfqSearch` and pages through it with `__doPostBack(...,'Page$N')`.
  - Upserts on the solicitation number plus NSN.
- **Tables:**
  - `rfqs`: sol_number, nsn, fsc, nomenclature, pr_number, qty, issued, return_by, status, tech_docs, detail_url, pdf_url, scraped_at.
  - `rfqs_fts`: FTS5 over nomenclature, nsn and sol_number.
  - `embeddings`: rfq key and a float32 blob.
  - `sessions`: id, messages, created.
  - `cache`: key and json.
- **Embedding step:** `npm run embed` embeds the item names in batches. About 4k rows costs well under $0.01.
- **APIs:**
  - `POST /api/chat {sessionId, message}` returns `{reply, intent, results[]}`.
  - `GET /api/rfqs?q&sort&page` serves Browse.
- **Security:** read-only public data with no auth, keys only on the server, all SQL parameterized, and the FTS query sanitized.
- **Frontend:** the Sales Patriot brand from `~/.config/lionel-playbooks/brands/sales-patriot`:
  - blue #1957ea, ink #12171a, background #f6f6f6;
  - Inter, with Geist Mono for NSNs and solicitation numbers;
  - cards with clipped corners and an RFQ-queue look.
  - **ui-sdk:** none, for time. Tabs and sort use native elements; this would be the first follow-up.

## Plan (subagent-driven, one implementer at a time, a review after each)
1. **Scraper and DB:** schema, Playwright scraper with paging, live run for the latest 2 days, and a test that parses a saved HTML page. Model: Sonnet.
2. **Hybrid search lib:** FTS5 plus embeddings plus RRF, filters, an embed script, and unit tests with fake vectors. Model: Sonnet.
3. **Chat API:** Groq intent with zod, fallback, session memory, caches and `/api/rfqs`. Model: Sonnet.
4. **UI:** brand tokens, Find (chat and sidebar) and Browse, DIBBS links, and a Playwright smoke test. Model: Opus.
5. **README:** setup, approach, and the scope table. Model: Haiku.

## Scope
| Feature | Kept or deferred | Why | How I'd build it |
|---|---|---|---|
| Scrape the latest 2 issue days | Kept | Proves requirement 1 and gives about 4k rows | Nightly cron to backfill all 27 days |
| Chat with hybrid search and sidebar | Kept | The "how users find" answer | |
| Browse table with DIBBS links | Kept | Requirements 2 and 4 | |
| Saved vendor profile and daily email alert | Deferred | Needs auth | Profile becomes a stored intent re-run on each scrape |
| Parse RFQ PDFs (specs, set-asides, FOB) | Deferred | Slow, and the format varies | Extract text, then a per-field LLM pass |
| Award history and pricing | Deferred | Different DIBBS area | Scrape awards by NSN and show the last price |
| ui-sdk controls, deploy | Deferred | Time | |

Rule used to decide: keep only what proves the four required capabilities plus the one idea that shows judgment (intent → deterministic hybrid ranking).

## After the build
- Push to GitHub (with your OK).
- 2-minute brief video: the decisions are presented as made before the build, with no ask, and the time goes to the build process and the subagent task split.
- writeup.md.
