# Higgins portal — owner & operations explanation pack

Use this as a **slide deck outline** or a single shared doc. Language is deliberately non-technical: no “API”, “database schema”, or “webhook” unless you add a backup slide for William.

**Audience**

- **William** — strategy, time back, one system instead of GoTimmy + SuperSaaS + spreadsheets + calendar glue.
- **Heather** — daily work: who signed up, who paid, what needs approval, court calendar, coach subs, memberships.

**What you are showing** — the live product in [`src/app`](../src/app): three websites behind one login, one database (Supabase), online payments (Mollie, two bank accounts).

**Export diagrams for slides:** see [`presentation/README.md`](./presentation/README.md) (one `.mmd` file per slide → PNG via [mermaid.live](https://mermaid.live)).

**10-minute live demo:** [`demo-script-10min.md`](./demo-script-10min.md).

---

## Slide 1 — The one sentence

> **One place where members sign up, pay, book courts, and enroll in classes — and where the office runs the club without copying names between five tools.**

---

## Slide 2 — Before vs after (William’s slide)

```mermaid
flowchart TB
  subgraph before [Today — many tools]
    Parent1[Parent or member]
    GT[GoTimmy — classes and signups]
    SS[SuperSaaS — court booking]
    XL[Excel — membership batches]
    OLD[Old Triaz membership DB — manual re-entry]
    GCal[Google Calendar — rosters and parent contacts]
    Email[Email and WhatsApp — everything else]
    Parent1 --> GT
    Parent1 --> SS
    Heather1[Heather] --> GT
    Heather1 --> SS
    Heather1 --> XL
    Heather1 --> OLD
    Heather1 --> GCal
    William1[William] --> Email
  end

  subgraph after [Higgins portal — one system]
    Parent2[Parent or member]
    Portal[Member portal — signup, pay, book, enroll]
    DB[(One database — who everyone is)]
    Admin[Admin — Heather]
    Coach[Coach app]
    Pay[Mollie — card and iDEAL]
    Parent2 --> Portal
    Portal --> DB
    Admin --> DB
    Coach --> DB
    Portal --> Pay
  end
```

**Talking point for William:** Items 1–4 on his time list (comms, scheduling, firefighting, tech glue) shrink because the **same person record** flows from signup → membership → class → court, instead of being retyped.

**Talking point for Heather:** No more “wait a week, batch Excel, re-enter Triaz DB” for every new member (see membership lifecycle notes in internal process docs).

---

## Slide 3 — Three doors, one building

Everyone signs in with **email** (magic link). The system opens the right “door”:

```mermaid
flowchart LR
  Login[Login — email link]
  Login --> Router{Who are you?}
  Router -->|Office staff| Admin["/admin — Heather and William"]
  Router -->|Coach or ZZP| CoachApp["/coach — schedule and courts"]
  Router -->|Member or parent| Portal["/portal — family, classes, booking"]

  Admin --> Tasks[People, classes, calendar, inbox, payments]
  CoachApp --> CoachTasks[My classes, book court, hours, receipts]
  Portal --> MemberTasks[Membership, programs, book court, inbox]
```

| Door | Who | What they do there |
|------|-----|-------------------|
| **Admin** | Heather (+ William) | Households, memberships, class setup, court calendar, approve requests, refunds |
| **Coach** | Staff + external ZZP coaches | See assigned classes, book courts for lessons, submit hours / invoices |
| **Portal** | Parents and adult members | Buy membership, enroll kids, book play, message inbox, ladder |

---

## Slide 4 — The “things” in the system (no jargon)

```mermaid
erDiagram
  Household ||--o{ Person : contains
  Person ||--o| Membership : may_have
  Membership }o--|| Club : at_Triaz_or_Randwijck
  Person ||--o{ Enrollment : takes
  Enrollment }o--|| ClassSeries : for
  ClassSeries ||--o{ ClassSession : meets_weekly
  Person ||--o{ CourtBooking : books
  CourtBooking }o--|| Court : on

  Household {
    string family_billing
  }
  Person {
    string parent_or_player
  }
  Membership {
    string active_or_expired
  }
  Club {
    string Triaz_or_Randwijck
  }
```

**Plain definitions (say out loud)**

| Term | Meaning |
|------|---------|
| **Household** | One family billing unit (parent + kids, or one adult living alone) |
| **Person** | A human in the system — parent, child, or adult player |
| **Membership** | Right to use a club’s courts (Triaz and/or Randwijck); has start/end dates |
| **Program / class** | A season offering (e.g. Youth Spring, BSA at school) |
| **Enrollment** | “This child is in that class for this season” |
| **Court booking** | A one-hour slot on a specific court |

---

## Slide 5 — Two clubs, two money buckets (William)

Higgins runs **two physical clubs**. Money is separated on purpose:

```mermaid
flowchart TB
  subgraph triazMoney [Triaz membership fees]
    M1[Member buys Triaz membership]
    M1 --> MollieT[Mollie — Triaz account]
  end

  subgraph higginsMoney [Everything else at Higgins]
    M2[Randwijck membership]
    M3[Class enrollment]
    M4[Court booking if paid]
    M5[Ladder fee]
    M6[Coach court rental invoices]
    M2 --> MollieH[Mollie — Higgins account]
    M3 --> MollieH
    M4 --> MollieH
    M5 --> MollieH
    M6 --> MollieH
  end
```

**Joint membership** (both clubs): member pays **two checkouts in a row** — Triaz portion first, then Randwijck — so each legal entity gets the correct payout.

**Note for honesty:** Triaz’s *legal* federation database may still need a periodic export until William decides to automate sync-out.

---

## Slide 6 — Member journey A → Z (parent enrolling a child)

This is the **main “happy path”** for Heather to validate:

```mermaid
sequenceDiagram
  participant Parent
  participant Portal
  participant Mollie
  participant Office as Heather inbox

  Parent->>Portal: 1. Sign up — account + children
  Parent->>Portal: 2. Buy club membership — Triaz and/or Randwijck
  Portal->>Mollie: Pay online
  Mollie-->>Portal: Confirmed
  Portal-->>Parent: Membership active — can book courts

  Parent->>Portal: 3. Browse programs — pick class
  Parent->>Portal: 4. Enroll child — pay lesson fee
  Portal->>Mollie: Pay online
  Mollie-->>Portal: Enrollment active
  Portal-->>Parent: Class on My classes + calendar sync

  opt Age or level mismatch
    Portal->>Office: Flag — needs review
    Office->>Portal: Approve or adjust
  end

  Parent->>Portal: 5. Book court for play — pick partner at Triaz
  Portal-->>Parent: Booking confirmed + inbox notification
```

**Triaz rule parents will notice:** when booking for play at Triaz, **partner must be another real member** (not a fake name) — helps the office see who plays together.

---

## Slide 7 — Adult member journey (simpler)

```mermaid
flowchart TD
  A[Sign up — myself only] --> B[Buy membership]
  B --> C{What next?}
  C -->|Play with friends| D[Book court on calendar]
  C -->|Take lessons| E[Enroll in adult class]
  C -->|Compete| F[Join ladder — Triaz adult members]
  D --> G[Show up — reminder in inbox]
  E --> G
  F --> G
```

---

## Slide 8 — Heather’s morning (operations dashboard)

What replaces “check GoTimmy, check email, check SuperSaaS”:

```mermaid
flowchart TB
  Start[Heather logs into Admin]
  Start --> Dash[Dashboard — needs attention]
  Dash --> Inbox[Inbox — unread items]
  Dash --> Pending[Queues with badges]

  Pending --> T1[Trial requests — new leads]
  Pending --> T2[Enrollment reviews — age or level flags]
  Pending --> T3[Coach sub requests — who covers class]
  Pending --> T4[Transfer requests — move kid to another class]
  Pending --> T5[Cancellation requests — coach lesson deletion]
  Pending --> T6[Membership cancellations]

  Start --> Cal[Court calendar — book for member or coach]
  Start --> HH[Households — fix membership, credits, family]
  Start --> Classes[Classes and seasons — setup and rosters]
```

**Heather slide — “your old weekly calendar copy”**

| Old way | New way |
|---------|---------|
| Export roster from GoTimmy, paste parent emails into Google Calendar | Parents/coaches get **calendar feed** from portal (subscribe once) |
| Membership in Excel + manual Triaz DB | **Membership record** created at payment; office edits in Households |
| Court schedule in SuperSaaS | **Same calendar** in portal + admin court view |

---

## Slide 9 — Court booking rules (SuperSaaS replacement)

Matches what SuperSaaS did at Triaz (1 hour slots, one personal booking per day, members only):

```mermaid
flowchart TD
  Q{Active member at this club?}
  Q -->|No| Join[Prompt — get membership first]
  Q -->|Yes| Pick[Pick day, hour, court]
  Pick --> Rules{Rules check}
  Rules -->|Already 1 booking today| Block[Sorry — one play booking per day]
  Rules -->|Slot taken| Block2[Pick another slot]
  Rules -->|Korfball block / class block| Block3[Court blocked — office reserved]
  Rules -->|OK| Book[Confirm booking]
  Book --> Email[Email + inbox notification]

  subgraph whoBooks [Who books]
    Member[Member — personal play]
    Coach[Coach — lesson on calendar]
    Admin[Heather — books on behalf of member or coach]
  end
```

**Randwijck difference:** partner name can be free text (less strict than Triaz).

---

## Slide 10 — Coach workflow

```mermaid
flowchart LR
  Invite[Heather sends coach invite email]
  Invite --> Accept[Coach accepts — account created]
  Accept --> Work[Coach workspace]

  Work --> Classes[See my classes and rosters]
  Work --> Book[Book court — personal or lesson]
  Work --> Sub[Request sub if sick — Heather approves]
  Work --> Hours[Hours and receipts — ZZP invoicing path]

  Book --> Lesson[Lesson booking — max 2 students on court]
  Book --> Personal[Personal play — same rules as members]
```

---

## Slide 11 — Class lifecycle (season operations)

```mermaid
flowchart TB
  Plan[William / Heather plan season] --> Create[Admin — create programs and class series]
  Create --> Publish[Visible on portal — parents enroll]
  Publish --> PayEnroll[Payment at enrollment]
  PayEnroll --> Active[Active enrollment]
  Active --> Run[Weekly sessions — coach attendance]
  Active --> Change[Transfer or withdrawal — office queue]
  Active --> End[Season ends — history kept]
```

**School programs (BSA, IFS, etc.):** same engine; often **pickup at school** and longer school-year dates — already modeled as delivery modes in the product.

---

## Slide 12 — Events, ladder, trials (secondary flows)

```mermaid
mindmap
  root((Other flows))
    Trials
      Public form
      Lands in admin Trial requests
    Events
      One-off paid events
      Tier pricing
    Ladder
      Adult Triaz members
      Pay entry fee
      Challenge and book match court
    Credits
      Transfer leftover lesson money
      Spend on next enrollment
```

---

## Slide 13 — What still needs William’s side (honest close)

Not hidden from owners — frame as **launch checklist**:

| Topic | Status | William / office action |
|-------|--------|-------------------------|
| Live website URL | Deploy Render/Vercel + env vars | Approve domain |
| Login emails | Supabase + email provider | DNS / SMTP |
| Real payments | Mollie test then live keys | Two Mollie accounts + webhooks |
| Historical customers | Import from old exports optional | Decide cutover date |
| Legal Triaz roster sync | Product is source of truth; federation DB may still need export | Process decision |

---

## Slide 14 — Season calendar (context only)

Annual rhythm from real data — helps William see the product matches how Higgins already thinks:

```mermaid
gantt
    title Typical Higgins year
    dateFormat YYYY-MM-DD
    axisFormat %b
    section Youth_and_adult
    WinterSeason :2025-12-01, 2026-03-31
    SpringSeason :2026-04-01, 2026-07-03
    SummerCamps :2026-07-04, 2026-08-31
    FallSeason :2026-09-01, 2026-12-15
    section School_programs
    BSACohort :2025-09-01, 2026-07-31
    IFSCohort :2025-09-01, 2026-06-30
```

---

## Recommended presentation order (45–60 min)

1. Slide 1–2 — problem and vision (William leads)
2. Slide 3–4 — three doors + vocabulary (both)
3. Slide 6–7 — member journeys (Heather: “does this match the desk?”)
4. Slide 8–9 — Heather daily work + courts (Heather leads)
5. Slide 10–11 — coaches and seasons
6. Slide 5 — money (William, short)
7. Slide 12 — extras only if time
8. Slide 13 — what we need from you to go live
9. **Live demo** — follow [`demo-script-10min.md`](./demo-script-10min.md)

---

## Glossary card (handout)

| They say | System says |
|----------|-------------|
| “Triaz member” | Active membership covering Triaz |
| “Signed up for Spring Red” | Enrollment in a class series |
| “Booked court 3 at 10:00” | Court booking, personal purpose |
| “Private with Coach X” | Court booking, coaching purpose |
| “Family membership” | Household membership tier covering multiple people |
| “Office queue” | Admin inbox + badge counts |
