# Crew Logistics – SQA tests (Week 1: Playwright)

Local or staging only (the config refuses other hosts). Leave mail settings empty when testing.
Test IDs (`CL-xx`) match the **SQA Test Cases – Tower Apps** sheet.
Month Excel gestures use **NAV-xx** IDs in [docs/excel-nav.md](../docs/excel-nav.md) and [docs/work-log.md](../docs/work-log.md); unit tests run with `npm run test:unit` (also on GitHub Actions).

## One-time setup

```powershell
npm install
npx playwright install chromium
```

```powershell
$env:TEST_CREW_USERNAME = "..."
$env:TEST_CREW_PASSWORD = "..."
```

## Run

```powershell
npm run dev
```

```powershell
npm run test:e2e
```

| Command | What it does |
| --- | --- |
| `npm run test:e2e` | All e2e tests |
| `npm run test:e2e:ui` | Interactive Playwright UI |
| `npm run test:e2e:headed` | Visible browser |
| `npm run test:e2e:report` | Open last HTML report (`tests/report`) |

## Where you see results / how to fix

1. **Terminal** — live pass/fail.
2. **`npm run test:e2e:report`** — HTML report with screenshots.
3. **Trace** from a failed row in that report — step through the run.
4. Fix the **app** if the product is wrong, or the **spec** if the product changed on purpose. Re-run with `npx playwright test tests/e2e/auth.spec.ts`.
