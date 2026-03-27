'use client';

import { useState, useRef } from 'react';
import Papa from 'papaparse';
import { Upload, CheckCircle, AlertCircle } from 'lucide-react';
import type { CsvRow } from '@/lib/types';

const REQUIRED_FIELDS = ['crm_id'] as const;
const OPTIONAL_FIELDS = ['deal_name', 'company_name', 'deal_stage', 'team', 'owner_name', 'owner_email'] as const;
const ALL_FIELDS = [...REQUIRED_FIELDS, ...OPTIONAL_FIELDS] as const;

type FieldKey = (typeof ALL_FIELDS)[number];

export default function CSVImporter() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [rawHeaders, setRawHeaders] = useState<string[]>([]);
  const [rawRows, setRawRows] = useState<Record<string, string>[]>([]);
  const [mapping, setMapping] = useState<Partial<Record<FieldKey, string>>>({});
  const [status, setStatus] = useState<'idle' | 'preview' | 'importing' | 'done' | 'error'>('idle');
  const isImporting = status === 'importing';
  const [result, setResult] = useState<{ updated: number; created: number } | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleFile = (file: File) => {
    Papa.parse<Record<string, string>>(file, {
      header: true,
      skipEmptyLines: true,
      complete: ({ data, meta }) => {
        setRawHeaders(meta.fields ?? []);
        setRawRows(data);
        // Auto-map by matching header names
        const auto: Partial<Record<FieldKey, string>> = {};
        for (const field of ALL_FIELDS) {
          const match = (meta.fields ?? []).find(
            h => h.toLowerCase().replace(/[\s_-]/g, '') === field.replace(/_/g, '')
          );
          if (match) auto[field] = match;
        }
        setMapping(auto);
        setStatus('preview');
      },
    });
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  const mappedRows = (): CsvRow[] =>
    rawRows.map(row => {
      const out: CsvRow = { crm_id: '' };
      for (const field of ALL_FIELDS) {
        const col = mapping[field];
        if (col) out[field] = row[col] ?? '';
      }
      return out;
    }).filter(r => r.crm_id);

  const handleImport = async () => {
    setStatus('importing');
    try {
      const res = await fetch('/api/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ rows: mappedRows() }),
      });
      if (!res.ok) throw new Error(await res.text());
      const data = await res.json();
      setResult(data);
      setStatus('done');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Unknown error');
      setStatus('error');
    }
  };

  const reset = () => {
    setStatus('idle');
    setRawHeaders([]);
    setRawRows([]);
    setMapping({});
    setResult(null);
    setErrorMsg('');
    if (inputRef.current) inputRef.current.value = '';
  };

  if (status === 'done') {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <CheckCircle size={40} className="text-teal-600" />
        <p className="text-lg font-semibold text-gray-800">Import complete</p>
        <p className="text-sm text-gray-500">{result?.created} created · {result?.updated} updated</p>
        <button onClick={reset} className="mt-2 text-sm text-teal-600 hover:underline">Import another file</button>
      </div>
    );
  }

  if (status === 'error') {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <AlertCircle size={40} className="text-red-500" />
        <p className="text-lg font-semibold text-gray-800">Import failed</p>
        <p className="text-sm text-gray-500">{errorMsg}</p>
        <button onClick={reset} className="mt-2 text-sm text-teal-600 hover:underline">Try again</button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Drop zone */}
      <div
        onDrop={handleDrop}
        onDragOver={e => e.preventDefault()}
        className="border-2 border-dashed border-gray-300 rounded-lg p-10 text-center hover:border-teal-400 transition-colors cursor-pointer"
        onClick={() => inputRef.current?.click()}
      >
        <Upload size={28} className="mx-auto mb-3 text-gray-400" />
        <p className="text-sm text-gray-600">Drop a CSV file here, or <span className="text-teal-600 font-medium">click to browse</span></p>
        <p className="text-xs text-gray-400 mt-1">Must include a crm_id column</p>
        <input
          ref={inputRef}
          type="file"
          accept=".csv"
          className="hidden"
          onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
        />
      </div>

      {status === 'preview' && (
        <>
          {/* Column mapping */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-3">Map CSV columns to deal fields</h3>
            <div className="grid grid-cols-2 gap-3">
              {ALL_FIELDS.map(field => (
                <div key={field} className="flex items-center gap-2">
                  <label className="text-xs text-gray-500 w-28 shrink-0">
                    {field.replace(/_/g, ' ')}
                    {REQUIRED_FIELDS.includes(field as typeof REQUIRED_FIELDS[number]) && (
                      <span className="text-red-500 ml-0.5">*</span>
                    )}
                  </label>
                  <select
                    value={mapping[field] ?? ''}
                    onChange={e => setMapping(m => ({ ...m, [field]: e.target.value || undefined }))}
                    className="flex-1 text-xs border border-gray-300 rounded px-2 py-1 bg-white focus:outline-none focus:ring-1 focus:ring-teal-500"
                  >
                    <option value="">(skip)</option>
                    {rawHeaders.map(h => <option key={h} value={h}>{h}</option>)}
                  </select>
                </div>
              ))}
            </div>
          </div>

          {/* Preview table */}
          <div>
            <h3 className="text-sm font-semibold text-gray-700 mb-2">
              Preview — {rawRows.length} rows
            </h3>
            <div className="overflow-x-auto border border-gray-200 rounded max-h-64">
              <table className="min-w-full text-xs divide-y divide-gray-100">
                <thead className="bg-gray-50 sticky top-0">
                  <tr>
                    {ALL_FIELDS.filter(f => mapping[f]).map(f => (
                      <th key={f} className="px-3 py-2 text-left text-gray-500 font-medium uppercase tracking-wide whitespace-nowrap">
                        {f.replace(/_/g, ' ')}
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody className="bg-white divide-y divide-gray-50">
                  {mappedRows().slice(0, 10).map((row, i) => (
                    <tr key={i}>
                      {ALL_FIELDS.filter(f => mapping[f]).map(f => (
                        <td key={f} className="px-3 py-1.5 text-gray-700 max-w-[180px] truncate">{row[f] ?? ''}</td>
                      ))}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {rawRows.length > 10 && (
              <p className="text-xs text-gray-400 mt-1">Showing first 10 of {rawRows.length} rows</p>
            )}
          </div>

          <div className="flex gap-3">
            <button
              onClick={handleImport}
              disabled={!mapping.crm_id || isImporting}
              className="px-5 py-2 bg-teal-600 text-white text-sm font-medium rounded hover:bg-teal-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isImporting ? 'Importing...' : `Import ${mappedRows().length} deals`}
            </button>
            <button onClick={reset} className="px-4 py-2 text-sm text-gray-500 hover:text-gray-700">
              Cancel
            </button>
          </div>
        </>
      )}
    </div>
  );
}
