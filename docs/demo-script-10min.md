# 10-minute live demo script — William & Heather

**Goal:** Show one parent path, then Heather’s control panel. No code talk.

**Before you start**

- App running: `npm run dev` locally **or** your deployed URL (Render/Vercel).
- Two browser profiles (or normal + incognito): **Member** and **Admin**.
- Database seeded (`npm run db:seed`) so programs and courts exist.
- Demo payments OK: without Mollie keys you’ll see the **demo checkout** page (say: “In production this is real iDEAL/card via Mollie”).

Replace `https://YOUR-HOST` below with `http://localhost:3000` or your public URL.

---

## Part A — Member / parent (≈6 min)

| Min | Say this | Do this |
|-----|----------|---------|
| 0:00 | “Parents and members use one website. They sign in with email — no password to remember if we use magic links.” | Open `https://YOUR-HOST/login` |
| 0:30 | “New families sign up here — parent plus kids in one household.” | Open `https://YOUR-HOST/signup` — show the form fields briefly (don’t submit unless you want a throwaway account) |
| 1:00 | “Existing members land here after login.” | Log in as a **member/parent** test account → `/portal` |
| 1:30 | “First they need club membership — Triaz, Randwijck, or both. Pay once; the system knows they’re a member immediately — no Excel batch for Heather.” | Go to **Membership** (`/portal/membership`) → start buy flow → complete **demo payment** if needed |
| 3:00 | “Then they find a class by program and season — same idea as GoTimmy, but it’s our catalog.” | **Programs** (`/portal/programs`) → pick a series → show enroll panel and price |
| 4:00 | “Enrollment is paid online; the child shows up under My classes. Parents can sync to Apple or Google Calendar once.” | Finish enroll (demo pay) → **My classes** (`/portal/classes`) → mention **Profile → calendar link** |
| 5:00 | “Members book courts like SuperSaaS — one hour, one personal booking per day at Triaz. At Triaz they must pick another real member as partner.” | **Book a court** (`/portal/book`) → pick slot → show partner search |
| 5:45 | “They get confirmations in the inbox inside the app.” | **Inbox** (`/portal/inbox`) — show one notification |

**Heather checkpoint question:** “Does this order match how you talk parents through it today?”

---

## Part B — Heather / admin (≈4 min)

| Min | Say this | Do this |
|-----|----------|---------|
| 6:00 | “Heather’s day starts here — not in five different tabs.” | Log in as **admin** → `https://YOUR-HOST/admin` |
| 6:30 | “The dashboard highlights what needs a human decision.” | Point at **needs attention** strip on dashboard |
| 7:00 | “Everything actionable lands in the inbox and these queues — trials, enrollment reviews, coach subs, transfers, cancellations.” | Open **Inbox** (`/admin/inbox`) → click one item type with a badge (e.g. **Trial requests**, **Sub requests**, **Transfers**) |
| 8:00 | “Court calendar replaces SuperSaaS for the office — and Heather can book **for** a member or **for** a coach, not as herself.” | **Bookings** → court calendar (`/admin/bookings`) → open **book for member** or **book for coach** dialog |
| 9:00 | “Household is the family file — membership, kids, credits after a transfer.” | Open one **Household** (`/admin/households`) — show members + membership |
| 9:30 | “Classes and seasons are where you build the term; coaches see rosters without Heather pasting emails into Google Calendar.” | Quick peek **Classes** (`/admin/classes`) |
| 10:00 | “William — money: Triaz memberships go to Triaz’s Mollie account; everything else to Higgins. We’re not live on real Mollie until you give us the keys.” | Stop — open **Slide 13** launch checklist if questions |

---

## Optional 30-second extras (if they ask)

| Question | Show |
|----------|------|
| “What about coaches?” | `/coach` — my classes, book court, request sub |
| “Trials?” | Public `/trial` form → `/admin/trial-interest` |
| “Ladder?” | `/portal/ladder` (Triaz adult members) |
| “Events / camps?” | `/portal/events` or admin **Events** |

---

## Troubleshooting during demo

| Problem | Quick fix |
|---------|-----------|
| Magic link opens wrong browser | “Use the same browser you requested the link in.” |
| Member can’t book court | Check active **membership** for that club on household |
| No classes listed | Run seed or check season dates in admin |
| Payment page looks fake | Expected in demo — say production uses Mollie hosted checkout |

---

## After the demo

Send them:

- [`stakeholder-guide.md`](./stakeholder-guide.md) — full slide outline
- [`presentation/README.md`](./presentation/README.md) — how to export diagrams for PowerPoint
