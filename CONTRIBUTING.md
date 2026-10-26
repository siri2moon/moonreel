# Contributing to MoonReel

Thanks for helping build MoonReel. Bug reports, docs fixes, translations, new niches and new providers are all welcome, whatever their size.

- [Ways to contribute](#ways-to-contribute)
- [Development setup](#development-setup)
- [Making a change](#making-a-change)
- [Code conventions](#code-conventions)
- [Common tasks](#common-tasks)
- [Pull request checklist](#pull-request-checklist)
- [Reporting bugs and security issues](#reporting-bugs-and-security-issues)

## Ways to contribute

| You want to… | Start here |
|---|---|
| Report a bug | [Open a bug report](https://github.com/siri2moon/moonreel/issues/new?template=bug_report.md) |
| Suggest a feature | [Open a feature request](https://github.com/siri2moon/moonreel/issues/new?template=feature_request.md) |
| Fix something small (typo, docs, obvious bug) | Send a pull request directly |
| Build something larger (new provider, new page, schema change) | Open an issue first so we can agree on the approach |
| Add a UI language | See [Add a UI language](#add-a-ui-language) |
| Pick up existing work | Issues labelled [`good first issue`](https://github.com/siri2moon/moonreel/labels/good%20first%20issue) or [`help wanted`](https://github.com/siri2moon/moonreel/labels/help%20wanted) |

## Development setup

The app lives in [`moonreel-studio/`](moonreel-studio). Follow its [Quick start](moonreel-studio/README.md#quick-start) to install dependencies, start Postgres and muse2api with Docker, and connect a muse.ai account. Then run, in two terminals:

```bash
cd moonreel-studio
pnpm dev       # http://localhost:3000
pnpm worker    # Muse jobs and FFmpeg rendering
```

You need a muse.ai account only to exercise generation. UI, i18n, docs and most refactors can be developed and reviewed without one.

> [!TIP]
> Read [docs/ARCHITECTURE.md](moonreel-studio/docs/ARCHITECTURE.md) before touching the pipeline. It explains the data model, the job flow and how failures are retried.

> [!NOTE]
> The app runs on **Next.js 16** (Cache Components, `proxy.ts` instead of middleware, async request APIs). Some APIs differ from older versions; the bundled docs in `node_modules/next/dist/docs/` are the reference.

## Making a change

1. **Fork** the repository and clone your fork.
2. **Create a branch** from `main` with a short prefix:
   `feat/kling-provider`, `fix/scene-retry`, `docs/troubleshooting`, `i18n/japanese`.
3. **Make focused commits.** One logical change per pull request is much easier to review.
4. **Write commit messages** in the [Conventional Commits](https://www.conventionalcommits.org/) style:

   ```
   feat: add Kling provider behind GenerationProvider

   Explain why the change is needed and anything non-obvious about how it works.
   ```

   Common types: `feat`, `fix`, `docs`, `refactor`, `perf`, `chore`, `i18n`.
5. **Run the checks** (from `moonreel-studio/`):

   ```bash
   pnpm typecheck && pnpm lint && pnpm build
   ```

6. **Open a pull request** against `main` and fill in the template. Add a screenshot or a short GIF for anything visible in the UI.

## Code conventions

- **English everywhere in the code:** comments, docs, identifiers, test names and commit messages. User-facing text goes through the dictionaries (see below), never hard-coded in components.
- **TypeScript strict.** Avoid `any`. Validate external input (forms, API payloads, Muse replies) with `zod`.
- **Server first.** Prefer Server Components and Server Actions. Add `"use client"` only where interaction needs it.
- **No N+1 queries.** Never run a database query per item inside `for`, `while`, `.map` or `forEach`. Load the set in one query (`inArray`, relational `with`), then look things up in memory. Batch writes in a single statement or transaction. Reviewers will check every `await` inside a loop.
- **Long work goes to the worker.** Anything that calls Muse or FFmpeg runs as a pg-boss job in `src/lib/pipeline/jobs.ts`, never inside a request.
- **Match the design system.** Reuse `src/components/ui.tsx` (buttons, cards, inputs, badges) and the gold/night tokens in `globals.css` instead of one-off styles.
- **Keep secrets out.** Never commit `.env` files, cookies, or anything from `~/.moonreel/`.

## Common tasks

### Add or change UI text

1. Add the key to `moonreel-studio/src/i18n/dictionaries/en.ts`. English is the source of truth and defines the type.
2. Add the same key to `vi.ts`. `pnpm typecheck` fails until every locale has it.
3. Read it with `getDictionary()` in Server Components, `useI18n()` in Client Components, or `getActionDictionary()` in Server Actions.

If you don't speak Vietnamese, put the English text in `vi.ts` and say so in the pull request. A maintainer will translate it.

### Add a UI language

1. Copy `src/i18n/dictionaries/en.ts` to `<code>.ts` (for example `ja.ts`), type it as `Dictionary` and translate every value.
2. Add the code to `LOCALES` in `src/i18n/config.ts` and to the map in `src/i18n/dictionaries/index.ts`.
3. Add the language's name to `language.names` in every dictionary.
4. Run `pnpm build` and check both the switcher and an `Accept-Language` header in that language.

### Add a generation provider

Providers implement the `GenerationProvider` interface in `src/lib/providers/`. Copy the shape of `muse2api.ts`: image generation with a reference, image-to-video from a keyframe, and chat for scripts. Map provider failures to clear error classes, as `MuseRefusedError` does. Document any new environment variables in the studio README.

### Add a sample niche

Add an entry to `scripts/seed.ts`. Write the script instructions and the visual style the way the existing niches do. Re-running `pnpm db:seed` skips niches that already exist.

### Change the database schema

Edit `src/db/schema.ts`, run `pnpm db:push` against your local database, and describe the change and any manual migration step in the pull request.

## Pull request checklist

- [ ] The change is focused and the description explains **what** and **why**.
- [ ] `pnpm typecheck`, `pnpm lint` and `pnpm build` pass.
- [ ] New UI text exists in every dictionary.
- [ ] No database query runs inside a loop.
- [ ] Docs (README, ARCHITECTURE) are updated when behaviour or setup changes.
- [ ] Screenshots or a GIF are attached for UI changes.
- [ ] No secrets, cookies or personal media are included.

## Reporting bugs and security issues

A good bug report includes:

- What you did, what you expected and what happened.
- The relevant lines from the `pnpm worker` or `pnpm dev` terminal.
- Your OS, Node version and whether muse2api shows a ready account.

**Remove cookies, keys and personal content** from logs before posting.

For security problems, such as a way to leak cookies or reach muse2api without the key, **do not open a public issue**. Use [GitHub's private vulnerability reporting](https://github.com/siri2moon/moonreel/security/advisories/new) instead.

## License

By contributing, you agree that your contributions are licensed under the [MIT License](LICENSE).
