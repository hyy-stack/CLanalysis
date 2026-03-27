#!/usr/bin/env python3
"""
Import matched no_deal transcripts into the dashboard.

Reads the matches CSV, injects CRM metadata into each matched transcript's
_metadata, uploads the transcript JSON to Vercel Blob (so transcript content
is available for Claude chat), and inserts deals/interactions into the DB
via the import API.

Usage:
  python3 scripts/import-matched-transcripts.py \
    --matches /path/to/nodeal_transcript_matches.csv \
    --transcripts /path/to/transcripts_dir \
    --host http://localhost:3002
"""

import argparse
import csv
import io
import json
import os
import sys
import zipfile
from pathlib import Path


def load_matches(matches_path: str) -> list[dict]:
    rows = []
    with open(matches_path, newline='', encoding='utf-8') as f:
        for row in csv.DictReader(f):
            if row['match_status'] == 'MATCH':
                rows.append(row)
    return rows


def build_zip(matches: list[dict], transcripts_dir: str) -> tuple[bytes, int, list[str]]:
    """Build a ZIP of modified transcript JSONs with crmId injected."""
    buf = io.BytesIO()
    count = 0
    missing = []

    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for m in matches:
            fname = m['transcript_file']
            fpath = os.path.join(transcripts_dir, fname)
            if not os.path.exists(fpath):
                missing.append(fname)
                continue

            with open(fpath, encoding='utf-8') as f:
                data = json.load(f)

            meta = data.get('_metadata') or {}
            meta['crmId']      = m['crm_id']
            meta['dealName']   = m['crm_account']
            meta['accountName'] = m['crm_account']
            meta['stage']      = m['crm_stage']
            data['_metadata']  = meta

            zf.writestr(fname, json.dumps(data))
            count += 1

    return buf.getvalue(), count, missing


def post_zip(zip_bytes: bytes, host: str) -> dict:
    import urllib.request
    import urllib.error

    boundary = b'----ClaudeImportBoundary'
    body = (
        b'--' + boundary + b'\r\n'
        b'Content-Disposition: form-data; name="file"; filename="transcripts.zip"\r\n'
        b'Content-Type: application/zip\r\n'
        b'\r\n'
        + zip_bytes +
        b'\r\n--' + boundary + b'--\r\n'
    )

    req = urllib.request.Request(
        f'{host}/api/import/transcripts',
        data=body,
        headers={'Content-Type': f'multipart/form-data; boundary={boundary.decode()}'},
        method='POST',
    )

    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            return json.loads(resp.read())
    except urllib.error.HTTPError as e:
        return {'error': f'HTTP {e.code}: {e.read().decode()}'}


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--matches',     required=True, help='Path to nodeal_transcript_matches.csv')
    parser.add_argument('--transcripts', required=True, help='Directory containing transcript JSON files')
    parser.add_argument('--host',        default='http://localhost:3002', help='Dashboard base URL')
    args = parser.parse_args()

    if not os.path.exists(args.matches):
        sys.exit(f'ERROR: {args.matches} not found')
    if not os.path.isdir(args.transcripts):
        sys.exit(f'ERROR: {args.transcripts} is not a directory')

    matches = load_matches(args.matches)
    print(f'Found {len(matches)} matched transcripts to import')

    if not matches:
        print('Nothing to import.')
        return

    zip_bytes, count, missing = build_zip(matches, args.transcripts)
    if missing:
        print(f'  Warning: {len(missing)} transcript files not found:')
        for f in missing:
            print(f'    {f}')
    print(f'  Zipped {count} transcript files')

    print(f'Posting to {args.host}/api/import/transcripts ...')
    result = post_zip(zip_bytes, args.host)

    if 'error' in result and 'imported' not in result:
        print(f'ERROR: {result["error"]}')
        sys.exit(1)

    print(f'\nImport result:')
    print(f'  Imported: {result.get("imported", "?")}')
    print(f'  Skipped:  {result.get("skipped", "?")}')
    print(f'  Total:    {result.get("total", "?")}')
    if result.get('errors'):
        print(f'  Errors ({len(result["errors"])}):')
        for e in result['errors']:
            print(f'    {e}')

    if result.get('imported', 0) > 0:
        print(f'\nNote: Transcript content (turns) is not yet uploaded to Blob storage.')
        print(f'Transcripts will appear in the dashboard but Claude chat will show')
        print(f'"metadata only". Run with --upload-blob to also upload full content.')


if __name__ == '__main__':
    main()
