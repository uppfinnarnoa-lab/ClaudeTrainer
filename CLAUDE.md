# TrainingLab

Personal AI-powered training platform. Connects Strava activity data + Garmin physiological data with an AI coach. Single user, self-hosted on Ubuntu/Apache. See `IMPLEMENTATION_PLAN.md` for full feature spec.

## Stack
- **Framework**: Next.js 15 (App Router, TypeScript)
- **Database**: PostgreSQL + Prisma ORM
- **Auth**: NextAuth.js v5
- **Styling**: Tailwind CSS + shadcn/ui
- **AI**: Claude API + Gemini Flash (switchable per user setting)
- **Package manager**: pnpm

## Session Start — Always
1. `git pull` before touching anything
2. Read the GlobalDoc files relevant to your task (see below)

## Session End — Always
1. Stage changed files by name, commit, and push
2. If any API endpoint or cross-module function signature changed → update its doc in `docs/`
3. If architecture, workflow, or integration knowledge changed → update the relevant `GlobalDoc/` file
4. Update `IMPLEMENTATION_PLAN.md` to reflect what was built or changed (see below)

## Keeping IMPLEMENTATION_PLAN.md Current
`IMPLEMENTATION_PLAN.md` is a living document — it must always reflect reality, not just intent.

**After building something:** Mark the relevant Phase checklist item as done (`- [x]`), and if the implementation deviated from the spec (different approach, added detail, simplified), update the spec text to match what was actually built.

**After fixing a bug:** Add a brief note in the relevant feature section describing what the correct behavior is (so the same misunderstanding doesn't recur).

**After a design decision during implementation:** If something was decided differently than planned (a component merged, a flow changed, a field renamed), update the plan section to reflect the actual decision.

The goal: any future session should be able to read `IMPLEMENTATION_PLAN.md` and know exactly what exists, how it works, and what remains to be built — without reading the code.

## GlobalDoc — Read Before Working
Determine which files apply to your task before starting:

| File | When to read |
|---|---|
| [GlobalDoc/architecture.md](GlobalDoc/architecture.md) | Any work touching DB schema, file structure, or data flow |
| [GlobalDoc/integrations.md](GlobalDoc/integrations.md) | Any work touching Strava, Garmin, weather, or AI APIs |
| [GlobalDoc/workflows.md](GlobalDoc/workflows.md) | Running, building, or deploying the app |
| [GlobalDoc/documentation-rules.md](GlobalDoc/documentation-rules.md) | Adding any endpoint, schema change, or cross-module function |

## Hard Rules
- Write I/O docs in `docs/` **before** implementing endpoints — see `GlobalDoc/documentation-rules.md`
- AI context is always summarized — never send raw bulk activity data to the model
- Strava is the sole source for activities (descriptions are AI context); Garmin only for HRV/sleep
- Sport types and workout types are user-defined — never hardcode them in logic or UI
- No comments unless the WHY is non-obvious to a future reader
- No error handling for scenarios that cannot happen

## Bug Audit Practice
When performing a bug audit, **verify each suspected bug is real before fixing it**:
1. Read the exact code path — do not assume the bug exists based on description alone
2. Confirm the bug is actually reachable (e.g. check if the code path runs at all)
3. Confirm the fix doesn't break existing correct behaviour (check all callers)
4. Only mark a bug as fixed after verifying the corrected code path end-to-end
5. If a "bug" turns out to be correct behaviour, document why it looks suspicious but is intentional
This prevents fixing non-bugs and breaking things that already work correctly.
