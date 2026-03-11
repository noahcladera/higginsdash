# Higgins Tennis — Ops Dashboard

Local-first operations dashboard for Higgins Tennis Amsterdam. Manages class schedules, coach pay, transportation logistics, and finance across seasons.

**Features:**
- **Transportation (GoCAP)** — Bakfiets pickup route planning with schematic map, day-by-day timeline scrubber, and animated playback for quick day overviews
- **Calendar** — Week/day/list views, filter by coach or class type
- **Coaches** — Pay calculator, rate sheet, per-class breakdown
- **Finance** — P&L table, revenue by location/type
- **Seasons** — Winter vs Spring comparison across all metrics

Runs on Node.js 18+ with minimal dependencies.

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

## Google Calendar Sync (optional)

Create, update, and delete classes in Google Calendar automatically. Coaches with emails in `data/coaches.json` receive calendar invites as attendees. Class details (program, location, participants) are added to the event description. Add or update the `email` field for each coach in `data/coaches.json` to enable invites.

### One-time setup (~10 min)

1. Go to [console.cloud.google.com](https://console.cloud.google.com), create a project
2. Enable **Google Calendar API** (APIs & Services → Library → search "Calendar")
3. Create a **Service Account**: APIs & Services → Credentials → Create Credentials → Service Account. Download the JSON key
4. Create a Google Calendar (e.g. "Higgins Tennis") in your Google account
5. Share that calendar with the service account email (`…@…iam.gserviceaccount.com`) — **Make changes to events**
6. Save the JSON key as `data/google-credentials.json`
7. Set the calendar ID: `export GOOGLE_CALENDAR_ID="your-calendar-id@group.calendar.google.com"`

Calendar ID: Open the calendar in Google Calendar → Settings → Integrate calendar → Calendar ID.

### API endpoints

| Endpoint | Description |
|----------|-------------|
| `GET /api/gcal/status` | `{ configured: true/false }` |
| `POST /api/gcal/sync` | Bulk sync: create Google events for instances that don't have one yet |

### Behaviour

- **Create** class/event → Google Calendar event created, coaches added as attendees
- **Update** class/event → Google Calendar event updated
- **Delete** class/event → Google Calendar event deleted
- Sync runs in the background; if Google is unreachable, the instance is still saved locally. Use `POST /api/gcal/sync` to retry.

## Updating the Schedule

1. Export your Google Sheet as CSV
2. Replace `data/schedule.csv`
3. Run `curl -X POST http://localhost:3000/api/reload` — no restart needed

## Pages

- **Home** `/` — Command center with stats, week-at-a-glance, fill rates
- **Calendar** `/calendar` — Week/day/list views, filter by coach or type
- **Transportation** `/gocap` — Bakfiets dispatch board, day timeline scrubber (11:00–18:00), fullscreen schematic route map with animated playback and combined-bike indicators
- **Coaches** `/coaches` — Pay calculator, rate sheet, per-class breakdown
- **Finance** `/finance` — P&L table, revenue by location/type, sortable
- **Seasons** `/seasons` — Winter vs Spring comparison across all metrics

## Requirements

- Node.js 18 or later (uses `--watch` flag for dev mode)
- No npm install needed
