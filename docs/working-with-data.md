# Working on the app: code and data

There are two things to keep in step between your computer (local) and the
live app on Azure: the **code** and the **data**.

## Code (how the app looks and works)

Git keeps it in step. Change files in VS Code, then in the terminal:

```
git add .
git commit -m "what you changed"
git push
```

GitHub runs the tests and, if they pass, deploys to Azure (about 5 to 10
minutes). If a test fails, nothing goes live. Watch it under the repo's
**Actions** tab.

## Data (the schedule, moves, bookings, notes)

The live app is the master. Everyone using the live app shares one copy and
sees each other's changes within 15 seconds.

Your local app (`npm run dev`) keeps its own copy in `.data/`, so testing never
touches the real schedule by accident. Three commands keep it in step:

| Command | What it does |
| --- | --- |
| `npm run data:pull` | Copy the live data down. Your local app now matches live. |
| `npm run data:status` | Show what you changed locally and haven't pushed. |
| `npm run data:push` | Send your local changes up to live (asks first). |

`data:push` only sends what **you** changed since your last pull, merged with
anything people changed live in the meantime. It never undoes their work.
Afterwards your local copy matches live again.

`data:pull` refuses to run while you have unpushed local changes, so you can't
lose them by accident. Push first, or run `npm run data:pull -- --force` to
throw your local changes away.

### One-time setup

Add these two lines to `.env.local` (this file is never committed):

```
CREW_LIVE_URL=https://<your-app>.azurewebsites.net
CREW_LIVE_PASSWORD=<the Office password>
```

### A normal day

1. `npm run data:pull` to start from the latest live schedule.
2. `npm run dev` and work in the local app.
3. Happy with data changes? `npm run data:push`.
4. Changed code? `git add .`, `git commit -m "..."`, `git push`.

## The Excel

The 2026 schedule was read from the Excel master once. That reading is
finished: the old import scripts are in `scripts/retired/` and are not used.
From now on everything is changed in the app.
