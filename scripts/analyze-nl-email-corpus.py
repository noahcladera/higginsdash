#!/usr/bin/env python3
"""
Scan the Higgins NL office Gmail takeout (higginstennisnloffice@gmail.com)
and emit theme counts, a deflection scorecard, and a quote bank for portal UX.

Usage:
  python3 scripts/analyze-nl-email-corpus.py [--mbox PATH] [--zip PATH]

Defaults:
  --zip  ~/Downloads/takeout-20260617T214036Z-3-001.zip
  extracts mbox to ~/Downloads/Takeout-NL/ on first run if --mbox omitted
"""

from __future__ import annotations

import argparse
import json
import mailbox
import os
import re
import sys
import zipfile
from collections import Counter, defaultdict
from datetime import datetime, timezone
from email.header import decode_header
from pathlib import Path

SCRIPT_DIR = Path(__file__).resolve().parent
OUT_DIR = SCRIPT_DIR.parent / "docs" / "audit"

ZIP_DEFAULT = Path.home() / "Downloads" / "takeout-20260617T214036Z-3-001.zip"
MBOX_IN_ZIP = "Takeout/Mail/All mail Including Spam and Trash.mbox"
EXTRACT_DIR = Path.home() / "Downloads" / "Takeout-NL" / "Mail"
EXTRACT_MBOX = EXTRACT_DIR / "All mail Including Spam and Trash.mbox"

THEMES = {
    "membership_renewal": {
        "label": "Membership renewals & status",
        "patterns": r"membership renew|renew.*membership|membership status|combi membership|lid worden|club.*closed|refund.*closed|credit.*closed",
        "portal_route": "/portal/membership#buy",
        "readiness": "high",
        "effort": "low",
    },
    "registration_waitlist": {
        "label": "Registration, waitlist & camp spots",
        "patterns": r"register|sign up|signup|waitlist|camp registration|system error|spot|enroll|prorated",
        "portal_route": "/portal/programs",
        "readiness": "high",
        "effort": "medium",
    },
    "rain_cancel_makeup": {
        "label": "Rain, cancellations & makeups",
        "patterns": r"rain|cancel|weather|makeup|make-up|geen les|no class|dismiss|cancelled tonight",
        "portal_route": "/portal/inbox",
        "readiness": "medium",
        "effort": "medium",
    },
    "payment_invoice_refund": {
        "label": "Payments, invoices & refunds",
        "patterns": r"invoice|payment|pay|refund|receipt|factuur|bank transfer|mollie|moneybird",
        "portal_route": "/portal/payments",
        "readiness": "high",
        "effort": "medium",
    },
    "lesson_availability": {
        "label": "Lesson availability & what to join",
        "patterns": r"lesson availability|tennis lessons|interested in|private lesson|1-1|121 lesson|inquiry about tennis|contact form|website contact",
        "portal_route": "/get-started",
        "readiness": "high",
        "effort": "low",
    },
    "schedule_holidays": {
        "label": "Schedule, holidays & timing",
        "patterns": r"schedule|holiday|school holiday|what time|start time|sunday|next week|september|starts this week",
        "portal_route": "/portal/classes",
        "readiness": "medium",
        "effort": "medium",
    },
    "medals_progress": {
        "label": "Medals & progress",
        "patterns": r"medal|level|progress|track for medal|orange ball|green ball|feedback",
        "portal_route": "/portal/classes",
        "readiness": "medium",
        "effort": "low",
    },
    "court_access_ladder": {
        "label": "Court access, gate & ladder",
        "patterns": r"gate|key fob|book a court|ladder|rent.*court|supersaas|login.*book",
        "portal_route": "/portal/book",
        "readiness": "medium",
        "effort": "medium",
    },
    "whatsapp_comms": {
        "label": "WhatsApp / missed group messages",
        "patterns": r"whatsapp|group message|didn.t receive|group chat|group for tennis",
        "portal_route": "/portal/inbox",
        "readiness": "medium",
        "effort": "low",
    },
}

AUTO_SUBJECTS = [
    "payment receipt",
    "invoice for activities",
    "look who just registered",
    "security alert",
    "updated invitation",
    "invitation:",
    "cancelled event:",
    "magic link",
    "waitlist booking confirmation",
    "refund confirmation",
    "event payment receipt",
    "camp payment receipt",
    "class payment receipt",
    "booked classes are starting",
    "tournament time",
    "delivery status notification",
    "daily digest higgins tennis nl",
]

INTERNAL_SENDERS = [
    "gotimmy",
    "noreply",
    "no-reply",
    "google.com",
    "mollie",
    "supabase",
    "github",
    "vercel",
    "decathlon",
    "amazon",
    "datumprikker",
    "oneaccountants",
    "moneybird",
    "williamt@higginstennis.com",
]

STAFF_SENDERS = [
    "heathergcourt",
    "noah@higginstennis",
    "play@higginstennis",
    "higginstennisnloffice",
    "higginstennisnl@gmail",
]


def decode_subj(raw) -> str:
    if not raw:
        return "(no subject)"
    parts = decode_header(raw)
    out: list[str] = []
    for chunk, enc in parts:
        if isinstance(chunk, bytes):
            try:
                out.append(chunk.decode(enc or "utf-8", errors="replace"))
            except LookupError:
                out.append(chunk.decode("utf-8", errors="replace"))
        else:
            out.append(str(chunk))
    return " ".join(out).strip()


def hdr(msg, name: str) -> str:
    return str(msg.get(name) or "")


def get_text(msg, limit: int = 2500) -> str:
    body = ""
    if msg.is_multipart():
        for part in msg.walk():
            if part.get_content_type() in ("text/plain", "text/html"):
                try:
                    payload = part.get_payload(decode=True)
                    if payload:
                        body += payload.decode(
                            part.get_content_charset() or "utf-8", errors="replace"
                        ) + "\n"
                except Exception:
                    pass
    else:
        try:
            payload = msg.get_payload(decode=True)
            if payload:
                body = payload.decode(
                    msg.get_content_charset() or "utf-8", errors="replace"
                )
        except Exception:
            pass
    text = re.sub(r"<[^>]+>", " ", body)
    text = re.sub(r"\s+", " ", text).strip()
    return text[:limit]


def extract_quote(text: str) -> str:
    for pat in (
        r"hi heather[^.!?\n]{0,220}",
        r"hello heather[^.!?\n]{0,220}",
        r"quick question[^.!?\n]{0,220}",
        r"could you please[^.!?\n]{0,220}",
        r"can you please[^.!?\n]{0,220}",
        r"i registered[^.!?\n]{0,220}",
        r"i.m interested[^.!?\n]{0,220}",
        r"message\s*:\s*[^.!?\n]{0,220}",
    ):
        m = re.search(pat, text, re.I)
        if m:
            return m.group(0).strip()[:220]
    return text[:220]


def ensure_mbox(zip_path: Path, mbox_path: Path | None) -> Path:
    if mbox_path and mbox_path.exists():
        return mbox_path
    if EXTRACT_MBOX.exists():
        return EXTRACT_MBOX
    if not zip_path.exists():
        raise FileNotFoundError(f"Takeout zip not found: {zip_path}")
    print(f"Extracting NL office mbox from {zip_path} …", file=sys.stderr)
    EXTRACT_DIR.mkdir(parents=True, exist_ok=True)
    with zipfile.ZipFile(zip_path) as zf:
        zf.extract(MBOX_IN_ZIP, EXTRACT_DIR.parent)
    extracted = EXTRACT_DIR.parent / MBOX_IN_ZIP
    if extracted.exists() and not EXTRACT_MBOX.exists():
        extracted.rename(EXTRACT_MBOX)
    return EXTRACT_MBOX


def analyze(mbox_path: Path) -> dict:
    mbox = mailbox.mbox(str(mbox_path))

    theme_counts: Counter[str] = Counter()
    theme_quotes: dict[str, list[dict]] = defaultdict(list)
    parent_subjects: Counter[str] = Counter()
    heather_replies: Counter[str] = Counter()
    gotimmy_subjects: Counter[str] = Counter()
    contact_form_count = 0

    msg_count = 0
    parent_inbound = 0

    for msg in mbox:
        msg_count += 1
        if msg_count % 5000 == 0:
            print(f"  … {msg_count} messages", file=sys.stderr)

        subj = decode_subj(msg.get("Subject"))
        sl = subj.lower()
        frm = hdr(msg, "From").lower()
        date = hdr(msg, "Date")[:40]

        if "gotimmy" in frm or "notification@gotimmy" in frm:
            gotimmy_subjects[subj[:90]] += 1

        if "website contact form" in sl or (
            "contact form" in sl and "higginstennis.nl" in get_text(msg, 500).lower()
        ):
            contact_form_count += 1

        if any(a in sl for a in AUTO_SUBJECTS):
            continue

        is_staff = any(x in frm for x in STAFF_SENDERS)
        is_internal = any(x in frm for x in INTERNAL_SENDERS)

        text = (subj + " " + get_text(msg)).lower()

        if is_staff and ("heather" in frm or "play@higginstennis.nl" in frm):
            if sl.startswith("re:"):
                heather_replies[subj[:100]] += 1

        if is_internal or is_staff:
            continue

        parent_inbound += 1
        parent_subjects[subj[:110]] += 1

        for key, meta in THEMES.items():
            if re.search(meta["patterns"], text, re.I):
                theme_counts[key] += 1
                if len(theme_quotes[key]) < 20:
                    theme_quotes[key].append(
                        {
                            "date": date,
                            "from": hdr(msg, "From")[:80],
                            "subject": subj[:120],
                            "quote": extract_quote(text),
                            "region": "NL",
                        }
                    )

    # Build scorecard sorted by frequency
    scorecard = []
    for rank, (key, count) in enumerate(theme_counts.most_common(), start=1):
        meta = THEMES[key]
        scorecard.append(
            {
                "rank": rank,
                "themeKey": key,
                "label": meta["label"],
                "frequency": count,
                "portalReadiness": meta["readiness"],
                "effort": meta["effort"],
                "portalRoute": meta["portal_route"],
                "parentInboundShare": round(count / max(parent_inbound, 1), 4),
            }
        )

    nl_themes = {THEMES[k]["label"]: v for k, v in theme_counts.items()}

    return {
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "source": "higginstennisnloffice@gmail.com (Google Takeout)",
        "mboxPath": str(mbox_path),
        "messagesScanned": msg_count,
        "parentInboundMessages": parent_inbound,
        "gotimmyAutomatedMessages": sum(gotimmy_subjects.values()),
        "websiteContactFormAlerts": contact_form_count,
        "nlThemes": nl_themes,
        "themeCounts": dict(theme_counts),
        "topParentSubjects": [
            {"subject": s, "count": c}
            for s, c in parent_subjects.most_common(40)
        ],
        "topHeatherReplySubjects": [
            {"subject": s, "count": c}
            for s, c in heather_replies.most_common(25)
        ],
        "topGotimmySubjects": [
            {"subject": s, "count": c}
            for s, c in gotimmy_subjects.most_common(20)
        ],
        "scorecard": scorecard,
        "quotesByTheme": dict(theme_quotes),
    }


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--mbox", type=Path, default=None)
    parser.add_argument("--zip", type=Path, default=ZIP_DEFAULT)
    args = parser.parse_args()

    mbox_path = ensure_mbox(args.zip, args.mbox)
    print(f"Analyzing {mbox_path} …", file=sys.stderr)
    result = analyze(mbox_path)

    OUT_DIR.mkdir(parents=True, exist_ok=True)

    themes_path = OUT_DIR / "_nl-email-themes.json"
    scorecard_path = OUT_DIR / "_nl-deflection-scorecard.json"
    quotes_path = OUT_DIR / "_nl-quote-bank.json"

    with open(themes_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "generatedAt": result["generatedAt"],
                "source": result["source"],
                "messagesScanned": result["messagesScanned"],
                "nlThemes": result["nlThemes"],
                "themeCounts": result["themeCounts"],
                "topParentSubjects": result["topParentSubjects"],
                "topHeatherReplySubjects": result["topHeatherReplySubjects"],
                "gotimmyAutomatedMessages": result["gotimmyAutomatedMessages"],
                "websiteContactFormAlerts": result["websiteContactFormAlerts"],
            },
            f,
            indent=2,
            ensure_ascii=False,
        )

    with open(scorecard_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "generatedAt": result["generatedAt"],
                "source": result["source"],
                "messagesScanned": result["messagesScanned"],
                "parentInboundMessages": result["parentInboundMessages"],
                "scorecard": result["scorecard"],
            },
            f,
            indent=2,
            ensure_ascii=False,
        )

    with open(quotes_path, "w", encoding="utf-8") as f:
        json.dump(
            {
                "generatedAt": result["generatedAt"],
                "source": result["source"],
                "quotesByTheme": result["quotesByTheme"],
            },
            f,
            indent=2,
            ensure_ascii=False,
        )

    print(f"Wrote {themes_path}", file=sys.stderr)
    print(f"Wrote {scorecard_path}", file=sys.stderr)
    print(f"Wrote {quotes_path}", file=sys.stderr)
    print(json.dumps({"messagesScanned": result["messagesScanned"], "themes": result["nlThemes"]}, indent=2))


if __name__ == "__main__":
    main()
