# Coach portal UX audit checklist

Liquid Glass redesign for `/coach` — review on phone (Safari, `< lg`) and desktop (`≥ lg`).

Design spec: [liquid-glass.md](../design/liquid-glass.md)

## Shell

- [ ] Floating tab bar: Today, Calendar, Book, Inbox, More (feature-gated)
- [ ] More sheet lists full sidebar nav
- [ ] Wordmark links to `/coach` (not `/portal`)
- [ ] Large titles collapse into sticky glass header on scroll
- [ ] Tab bar clears content (`pb-safe-tab`); forms use `.bottom-above-tab-bar` where needed

## Core flows

### Today (`/coach`)

- [ ] Grouped metrics, quick actions, next-up card on mobile
- [ ] Today schedule in grouped inset list
- [ ] Week pager on mini grid; calendar link works

### Book + bookings

- [ ] Club `SegmentedControl` on `/coach/book`
- [ ] Date scrubber + calendar pager transition
- [ ] Bookings: grouped rows on mobile, recurring requests readable
- [ ] Pending deletion banner tappable → bookings

### Calendar

- [ ] Week pager on mobile
- [ ] Grouped day lists (no horizontal scroll)
- [ ] Desktop week grid unchanged

### Classes

- [ ] Series list grouped on mobile
- [ ] Roster grouped with inline level select
- [ ] Roll call uses glass segmented control

### Medals

- [ ] Ladder + lesson tracks as grouped link rows on mobile
- [ ] Desktop card strips preserved

### Workspace

- [ ] Hours date presets grouped on mobile
- [ ] Availability form in grouped panel
- [ ] Receipts list grouped on mobile; detail has ShellPageHeader
- [ ] Inbox uses shared grouped feed

### Profile + onboarding

- [ ] Profile/security/professional forms use grouped FormPanel
- [ ] Accept-invite standalone grouped card layout

## Cross-portal

- [ ] Role switch (coach ↔ member ↔ admin) from More + identity menu
- [ ] Sign-in from phone via LAN IP (not localhost)

## Sign-off

| Phase | Reviewer | Date | OK |
|-------|----------|------|-----|
| 0 Shell | | | |
| 1 Headers | | | |
| 2 Today | | | |
| 3 Bookings | | | |
| 4 Calendar | | | |
| 5 Workspace | | | |
| 6 Classes | | | |
| 7 Medals | | | |
| 8 Profile | | | |
| 9 Polish | | | |

## Mobile Safari (iPhone)

Test at LAN IP (`http://192.168.1.45:3000`), not `localhost`.

### iOS touch pattern (root cause)

On iPhone Safari, **native `<Link>` / `<a>` navigation works reliably**; **client `onClick` / `router.push()` handlers inside glass composited UI often do not**. Symptom: day chevrons and tab bar Home/Book work; More button, segmented pickers, and slot buttons feel dead.

**Standard fix:** use **Link-first** controls on mobile — club picker, court picker, available slots, and **More tab** navigate via URL params (`?club=`, `?court=`, `?slot=`, `?more=1`). Dialog/sheet opens from URL on mount.

Automated regression: `npm run test:e2e:mobile` (Playwright WebKit, iPhone 14 viewport). Requires dev server + seeded example user (`npm run db:seed-examples`).

### Fixes shipped

- **More tab:** Native `<a href="?more=1">` opens a **native fixed sheet** (not Radix Dialog — WebKit portal gap); URL param `?more=1` drives `sheetVisible`; separate `MobileShellChrome` Suspense boundary; `z-40` tab bar; `[data-tab-item]` touch rules.
- **Booking (Link-first):** `LinkSegmentedControl` for club + court; available slots are `<Link href="…&slot=…">`; `?slot=` auto-opens booking dialog.
- **Add to calendar:** Link-first `?addToCalendar=1`; native fixed sheet (no Radix on mobile); prefetch token on open; webcal + HTTPS copy fallback.
- **Member booking sheet:** Native `booking-dialog-sheet` for members; `?slot=` deep link via server `initialSlotIso`.
- **Compositing:** `background-attachment: scroll` on touch; disable backdrop-filter on glass chrome; pager clip off on touch; closed sheet overlay `pointer-events: none`.
- **Zoom / wobble:** Mobile inputs at 16px; pager fade-only on touch.

### Test matrix

| Test | Expected | OK |
|------|----------|-----|
| `/portal/book` — tap Court 2/3/4 | URL updates (`court=`); slots list changes | Playwright ✓ |
| `/portal/book` — tap Randwijck | URL updates (`club=randwijck`) | Playwright ✓ |
| `/portal/book` — tap Available row | Booking sheet opens | Playwright ✓ |
| `/portal/book` — tap date field | No page zoom | Manual |
| `/portal` — More tab | Bottom sheet opens (`?more=1` or More link) | Playwright ✓ |
| `/portal` — Add to calendar → Google/Apple | Calendar app/tab or copy fallback | Playwright ✓ (sheet) |
| `/coach/book` — court + slot tests | Same Link-first UX as member | Coach book loads ✓ |
| Prev/Next week on home + book | No horizontal page drift | Playwright ✓ |
| Scroll with tab bar | No content hidden behind bar | Manual |
