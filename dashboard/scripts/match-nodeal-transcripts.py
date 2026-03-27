#!/usr/bin/env python3
"""
Match no_deal transcripts to CRM opportunity records using HIGH CONFIDENCE only.
Both account name AND internal participant name must match.

Account matching uses two signals (either can satisfy the account check):
  1. External email domain  (e.g. fluxxlabs.com → keyword "fluxxlabs")
  2. Company name from call title (e.g. "Fluxx Labs + Anrok | Demo" → keyword "fluxxlabs")

Keyword ↔ CRM-account matching rules:
  - Exact match:  norm(keyword) == norm(crm_account_full)  OR  keyword == any_crm_token
  - Prefix match: non-generic token (≥4 chars) from CRM is a prefix of keyword
      e.g. keyword="fluxxlabs", token="fluxx" (5 chars) → fluxxlabs.startswith("fluxx") ✓
  - Digits in keyword: exact match only (numeric domains are too specific for prefix)
  - Generic tokens ("labs", "global", "group", etc.) are skipped for prefix matching

Owner matching:
  - Last name exact (normalized)
  - First name prefix ≥3 chars  (handles Sam/Samuel, HanYue/Han, etc.)

Multi-match tiebreaker (when one transcript matches multiple CRM records):
  - Use CloseDate column if present in CRM CSV
  - Otherwise fall back to Salesforce ID (higher ID ≈ more recently created)

Usage:
  python3 scripts/match-nodeal-transcripts.py \\
    --transcripts /path/to/transcripts_dir \\
    --crm /path/to/crm.csv \\
    --output /path/to/matches.csv

  TIP: Add a "CloseDate" column to your CRM export for accurate tiebreaking.
"""

import argparse
import csv
import json
import os
import re
import sys
from pathlib import Path


# ── Generic token blocklist (skip these for prefix matching) ─────────────────

GENERIC_TOKENS = {
    'labs', 'lab', 'inc', 'llc', 'ltd', 'corp', 'group', 'global',
    'services', 'service', 'solutions', 'solution', 'systems', 'system',
    'technology', 'technologies', 'tech', 'digital', 'data', 'software',
    'cloud', 'web', 'app', 'enterprise', 'consulting', 'advisors', 'advisor',
    'partners', 'partner', 'associates', 'management', 'holdings',
    'international', 'national', 'american', 'financial', 'capital',
}


# ── Normalization helpers ────────────────────────────────────────────────────

def norm(s: str) -> str:
    """Lowercase, strip non-alphanumeric."""
    return re.sub(r'[^a-z0-9]', '', s.lower()) if s else ''


def norm_words(s: str) -> list[str]:
    """Split into lowercase words."""
    return [w.lower() for w in re.split(r'\s+', s.strip()) if w] if s else []


# ── Name matching ────────────────────────────────────────────────────────────

def names_match(crm_name: str, transcript_name: str) -> bool:
    """
    HIGH CONFIDENCE name match.
    Last name exact + first name prefix ≥3 chars.
    Handles "Sam Baker" == "Samuel Baker", "HanYue Yin" == "HanYue Yin".
    """
    if not crm_name or not transcript_name:
        return False
    cw = norm_words(crm_name)
    tw = norm_words(transcript_name)
    if not cw or not tw:
        return False
    if norm(cw[-1]) != norm(tw[-1]):
        return False
    if len(cw) >= 2 and len(tw) >= 2:
        c_first, t_first = norm(cw[0]), norm(tw[0])
        min_len = min(len(c_first), len(t_first))
        if min_len < 3:
            return c_first == t_first
        if c_first[:3] != t_first[:3]:
            return False
    return True


# ── Account matching ─────────────────────────────────────────────────────────

def crm_account_tokens(crm_account: str) -> list[str]:
    """Normalized word tokens ≥3 chars from CRM account name."""
    words = re.split(r'[\s\-_,./&()\'"!]+', crm_account)
    return [norm(w) for w in words if len(norm(w)) >= 3]


def keyword_matches_account(keyword: str, crm_account: str) -> bool:
    """
    HIGH CONFIDENCE keyword ↔ CRM account match.

    Rules (in order):
    1. Exact match: keyword == norm(full crm_account)
    2. Exact token: keyword == any individual CRM token
    3. Numeric keyword → exact only (digits make it too specific for prefix)
    4. Prefix: any non-generic CRM token (≥4 chars) is a prefix of keyword
       e.g. keyword="fluxxlabs", token="fluxx" → ✓
    """
    if not keyword or len(keyword) < 4 or not crm_account:
        return False

    crm_full = norm(crm_account)
    tokens = crm_account_tokens(crm_account)

    # Rule 1: full account exact match
    if keyword == crm_full:
        return True

    # Rule 2: exact token match
    if keyword in tokens:
        return True

    # Rule 3: numeric keywords require exact match
    if any(c.isdigit() for c in keyword):
        return False

    # Rule 4: non-generic token as prefix of keyword
    for tok in tokens:
        if tok in GENERIC_TOKENS:
            continue
        if len(tok) >= 4 and keyword.startswith(tok):
            return True

    return False


def extract_domain_keyword(email_domain: str) -> str:
    """'fluxxlabs.com' → 'fluxxlabs'; 'rhinohealth.com' → 'rhinohealth'."""
    skip = {'com', 'io', 'net', 'org', 'co', 'ai', 'us', 'uk', 'ca', 'app', 'gov', 'edu'}
    parts = email_domain.lower().split('.')
    keywords = [p for p in parts if p not in skip and len(p) >= 3]
    return keywords[0] if keywords else ''


def extract_title_company(title: str) -> str:
    """
    Extract company name from Gong call title.
    Returns the non-Anrok side of the title, with meeting-type suffixes stripped.
    """
    # Remove [Tag] prefixes like [Zoom]
    t = re.sub(r'^\[.*?\]\s*', '', title).strip()

    # "(Company) <...> ... Anrok" — extract from first parens group
    m = re.search(r'\(([^)]+)\)\s*[<>×]+\s*.*?anrok', t, re.IGNORECASE)
    if m:
        return m.group(1).strip()

    # Split on connectors, discard Anrok side
    parts = re.split(
        r'\s*[<>&×|+:]\s*|\s+and\s+|\s+x\s+|\s+with\s+',
        t, flags=re.IGNORECASE
    )
    non_anrok = [p.strip() for p in parts
                 if p.strip() and not re.search(r'\banrok\b', p, re.IGNORECASE)]

    if non_anrok:
        company = non_anrok[0]
        # Strip trailing meeting-type suffixes after a separator
        company = re.sub(
            r'\s*[-–—:|,]\s*(intro|demo|call|sync|meeting|discussion|onboarding|'
            r'discovery|review|technical|validation|pricing|renewal|contract|'
            r'proposal|check.?in|regroup|connect|coaching|kickoff|follow.?up|'
            r'debrief|handoff|handover|alignment|planning|recap|new client|reconnect).*$',
            '', company, flags=re.IGNORECASE
        )
        return company.strip(' -–—:|,.()')

    return ''


def get_account_keywords(t: dict) -> list[tuple[str, str]]:
    """
    Return (keyword, source) pairs for account matching.
    Uses full normalized string only — no per-word breakdown — to avoid
    generic word false positives (e.g. "labs" matching any lab company).
    """
    seen = set()
    keywords = []

    def add(kw: str, src: str):
        if kw and len(kw) >= 4 and kw not in seen:
            seen.add(kw)
            keywords.append((kw, src))

    # Signal 1: external email domain keywords
    for kw in t['domain_keywords']:
        add(kw, 'domain')

    # Signal 2: full normalized title company name
    company = extract_title_company(t['title'])
    if company:
        add(norm(company), 'title')

    return keywords


# ── CRM tiebreaker ───────────────────────────────────────────────────────────

def best_match(matches: list[dict], has_close_date: bool) -> dict:
    """Pick the most recent CRM record from multiple matches."""
    if len(matches) == 1:
        return matches[0]
    if has_close_date:
        return sorted(matches,
                      key=lambda m: (m['close_date'] or '0000-00-00', m['id'].lower()),
                      reverse=True)[0]
    # Fallback: Salesforce ID lexicographic order ≈ creation order
    return sorted(matches, key=lambda m: m['id'].lower(), reverse=True)[0]


# ── Transcript processing ────────────────────────────────────────────────────

def process_transcript(path: str) -> dict | None:
    try:
        with open(path, encoding='utf-8') as f:
            data = json.load(f)
    except Exception:
        return None

    meta = data.get('_metadata') or {}
    if meta.get('crmId'):
        return None

    participants = data.get('_participants') or []
    internal = [p for p in participants if (p.get('affiliation') or '').lower() == 'internal']
    external = [p for p in participants if (p.get('affiliation') or '').lower() == 'external']

    owner_names = [p['name'].strip() for p in internal if p.get('name')]
    ext_domains = list({
        em.split('@')[-1].lower()
        for p in external
        for em in [(p.get('emailAddress') or '')]
        if '@' in em
    })
    domain_keywords = list({
        kw for d in ext_domains
        for kw in [extract_domain_keyword(d)]
        if kw and len(kw) >= 4
    })

    return {
        'call_id':         data.get('callId', ''),
        'title':           meta.get('title', ''),
        'timestamp':       meta.get('timestamp', ''),
        'owner_names':     owner_names,
        'ext_domains':     ext_domains,
        'domain_keywords': domain_keywords,
        'file':            path,
    }


def find_matches(t: dict, crm_records: list[dict]) -> list[dict]:
    """Return all HIGH CONFIDENCE CRM matches for a transcript."""
    account_kws = get_account_keywords(t)
    matches = []

    for rec in crm_records:
        matched_kw = None
        matched_source = None
        for kw, src in account_kws:
            if keyword_matches_account(kw, rec['account']):
                matched_kw = kw
                matched_source = src
                break
        if not matched_kw:
            continue

        matched_owner = next(
            (on for on in t['owner_names'] if names_match(rec['owner'], on)), None
        )
        if not matched_owner:
            continue

        matches.append({
            **rec,
            'matched_kw': matched_kw,
            'matched_source': matched_source,
            'matched_owner_transcript': matched_owner,
        })

    return matches


# ── CRM loading ──────────────────────────────────────────────────────────────

def load_crm(crm_path: str) -> tuple[list[dict], bool]:
    records = []
    with open(crm_path, newline='', encoding='utf-8-sig') as f:
        reader = csv.DictReader(f)
        fieldnames = reader.fieldnames or []
        close_col = next(
            (fn for fn in fieldnames
             if fn.lower().replace(' ', '').replace('_', '') == 'closedate'),
            None
        )
        has_close_date = bool(close_col)
        if has_close_date:
            print(f'  Found close date column: "{close_col}"')
        else:
            print('  Note: no CloseDate column — using Salesforce ID as tiebreaker.')
            print('  Add a CloseDate column to your CRM export for accurate multi-match resolution.')

        for row in reader:
            records.append({
                'id':         row.get('Id', '').strip(),
                'account':    row.get('Account.Name', '').strip(),
                'owner':      row.get('Owner.Name', '').strip(),
                'type':       row.get('RecordType.Name', '').strip(),
                'stage':      row.get('StageName', '').strip(),
                'close_date': row.get(close_col, '').strip() if close_col else '',
            })
    return records, has_close_date


# ── Main ─────────────────────────────────────────────────────────────────────

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--transcripts', required=True)
    parser.add_argument('--crm', required=True)
    parser.add_argument('--output', required=True)
    args = parser.parse_args()

    tdir = Path(args.transcripts)
    if not tdir.is_dir():
        sys.exit(f'ERROR: {tdir} is not a directory')

    print(f'Loading CRM records from {args.crm}...')
    crm_records, has_close_date = load_crm(args.crm)
    print(f'  Loaded {len(crm_records)} CRM records')

    nodeal_files = [
        str(tdir / f) for f in sorted(os.listdir(tdir))
        if f.endswith('.json') and 'no_deal' in f
    ]
    print(f'  Found {len(nodeal_files)} no_deal transcript files')

    rows = []
    matched = multi_resolved = no_match = 0

    for path in nodeal_files:
        t = process_transcript(path)
        if not t:
            continue

        all_matches = find_matches(t, crm_records)
        title_company = extract_title_company(t['title'])

        base = {
            'transcript_file':    os.path.basename(path),
            'call_id':            t['call_id'],
            'call_title':         t['title'],
            'call_timestamp':     t['timestamp'],
            'transcript_owners':  '; '.join(t['owner_names']),
            'transcript_domains': '; '.join(t['ext_domains']),
            'title_company':      title_company,
        }

        if not all_matches:
            no_match += 1
            rows.append({**base,
                'match_status': 'NO_MATCH', 'multi_match_count': '',
                'crm_id': '', 'crm_account': '', 'crm_owner': '',
                'crm_stage': '', 'crm_type': '', 'crm_close_date': '',
                'matched_by': '', 'matched_owner': ''})
        else:
            if len(all_matches) > 1:
                multi_resolved += 1
            matched += 1
            winner = best_match(all_matches, has_close_date)
            rows.append({**base,
                'match_status':      'MATCH',
                'multi_match_count': str(len(all_matches)),
                'crm_id':            winner['id'],
                'crm_account':       winner['account'],
                'crm_owner':         winner['owner'],
                'crm_stage':         winner['stage'],
                'crm_type':          winner['type'],
                'crm_close_date':    winner['close_date'],
                'matched_by':        winner['matched_source'],
                'matched_owner':     winner['matched_owner_transcript'],
            })

    fieldnames = [
        'transcript_file', 'call_id', 'call_title', 'call_timestamp',
        'transcript_owners', 'transcript_domains', 'title_company',
        'match_status', 'multi_match_count',
        'crm_id', 'crm_account', 'crm_owner', 'crm_stage', 'crm_type', 'crm_close_date',
        'matched_by', 'matched_owner',
    ]

    with open(args.output, 'w', newline='', encoding='utf-8') as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames)
        writer.writeheader()
        writer.writerows(rows)

    print(f'\nResults:')
    print(f'  Matched:                      {matched}')
    print(f'    of which multi (resolved):  {multi_resolved}')
    print(f'  No match:                     {no_match}')
    print(f'  Output written to: {args.output}')
    if not has_close_date:
        print(f'\n  For better tiebreaking, re-export CRM CSV with a "CloseDate" column.')


if __name__ == '__main__':
    main()
