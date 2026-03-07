# Higgins Tennis — Ops Dashboard

Local-first operations dashboard for Higgins Tennis Amsterdam.  
**Zero npm dependencies** — runs on Node.js built-ins only.

## Quick Start

```bash
# 1. Put your schedule CSV at:
#    data/schedule.csv
#    (already included from your Google Sheets export)

# 2. Start the server
node server.js

# 3. Open in browser
open http://localhost:3000
```

With Node 18+ you can use `--watch` for auto-reload on file changes:

```bash
node --watch server.js
```

## Project Structure

```
higgins-tennis-ops/
├── server.js          ← HTTP server (no deps, pure Node)
├── data/
│   ├── parse.js       ← CSV parser (reads your Google Sheets export)
│   └── schedule.csv   ← Your class schedule (replace to update)
├── views/             ← HTML pages served at clean URLs
│   ├── index.html     → /
│   ├── calendar.html  → /calendar
│   ├── coaches.html   → /coaches
│   ├── gocap.html     → /gocap
│   ├── finance.html   → /finance
│   └── seasons.html   → /seasons
└── public/
    ├── css/main.css   ← Shared design system
    └── js/shared.js   ← Shared client JS (API helpers, season switcher)
```

## API Endpoints

| Endpoint | Description |
|---|---|
| `GET /api/classes` | All classes. Filter: `?season=&type=&coach=&day=` |
| `GET /api/stats?season=` | Aggregate stats for a season |
| `GET /api/coaches?season=` | Coach list for a season |
| `GET /api/seasons` | Available season names |
| `GET /api/class/:id` | Single class by ID |
| `POST /api/reload` | Hot-reload the CSV without restart |

### Examples

```bash
# All Winter GoCAP classes
curl "http://localhost:3000/api/classes?season=Winter%202026&type=GoCAP"

# Season stats
curl "http://localhost:3000/api/stats?season=Spring%202026"

# Reload after editing the CSV
curl -X POST http://localhost:3000/api/reload
```

## Updating the Schedule

1. Export your Google Sheet as CSV
2. Replace `data/schedule.csv`
3. Run `curl -X POST http://localhost:3000/api/reload` — no restart needed

## Pages

- **Home** `/` — Command center with stats, week-at-a-glance, fill rates
- **Calendar** `/calendar` — Week/day/list views, filter by coach or type
- **Transportation** `/gocap` — Pickup route cards with step-by-step timelines, schematic map
- **Coaches** `/coaches` — Pay calculator, rate sheet, per-class breakdown
- **Finance** `/finance` — P&L table, revenue by location/type, sortable
- **Seasons** `/seasons` — Winter vs Spring comparison across all metrics

## Requirements

- Node.js 18 or later (uses `--watch` flag for dev mode)
- No npm install needed
