## What and why

<!-- What does this change, and what problem does it solve? Link the issue: "Closes #123". -->

## How to test

<!-- Steps a reviewer can follow. Mention if a muse.ai account is needed. -->

## Screenshots

<!-- Required for UI changes: before/after screenshots or a short GIF. -->

## Checklist

- [ ] `pnpm typecheck`, `pnpm lint` and `pnpm build` pass (in `moonreel-studio/`)
- [ ] New UI text is in every dictionary (`src/i18n/dictionaries/`)
- [ ] No database query runs inside a loop
- [ ] Docs updated if behaviour or setup changed
- [ ] No secrets, cookies or personal media included
