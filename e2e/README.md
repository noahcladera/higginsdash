# E2E tests (Playwright)

Mobile-first WebKit tests for member portal and coach workspace (iPhone 14 viewport).

## Setup

```bash
npm run db:seed
npm run db:seed-real-catalog   # programs for enrollment tests
npm run db:seed-examples         # legacy personas (default E2E user)
# or
npm run db:seed-demo-personas    # recommended demo personas

npm run dev                      # :3000
npm run dev:lan                  # same, bound to 0.0.0.0 for iPhone on LAN
npm run warm:mobile              # pre-compile routes (after dev is up)
npm run test:e2e:mobile
```

## Credentials

Password for all seeded users: `higgins-test`

| Email | Persona |
|-------|---------|
| `parent.single.example@higginstennisnl.test` | Default E2E — Beatrice, family joint |
| `parent.multi.example@higginstennisnl.test` | Carla, 3 kids, Triaz family |
| `adult.example@higginstennisnl.test` | Anna, adult student, joint |
| `coach.example@higginstennisnl.test` | Carlos, coach |
| `parent.demo@higginstennisnl.test` | Demo parent + child |

Override default member: `E2E_EMAIL=... npm run test:e2e:mobile`

## Scripts

| Command | Description |
|---------|-------------|
| `npm run test:e2e` | All Playwright projects |
| `npm run test:e2e:mobile` | WebKit iPhone 14 only |

Use `PLAYWRIGHT_NO_SERVER=1` when dev server is already running.

## Helpers

- `e2e/helpers/auth.ts` — login personas
- `e2e/helpers/navigation.ts` — tab bar, More sheet
- `e2e/helpers/goto-and-wait.ts` — warm routes, networkidle
- `e2e/helpers/assert-no-console-errors.ts` — fail on React errors
