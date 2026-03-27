'use client';

import { useState, useRef } from 'react';
import { Upload, CheckCircle, AlertCircle, FileArchive } from 'lucide-react';

type Status = 'idle' | 'uploading' | 'done' | 'error';

interface ImportResult {
  total: number;
  imported: number;
  skipped: number;
  errors: string[];
}

export default function TranscriptImporter() {
  const inputRef = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<Status>('idle');
  const [fileName, setFileName] = useState('');
  const [result, setResult] = useState<ImportResult | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  const handleFile = async (file: File) => {
    if (!file.name.endsWith('.zip')) {
      setErrorMsg('Please upload a .zip file.');
      setStatus('error');
      return;
    }

    setFileName(file.name);
    setStatus('uploading');
    setErrorMsg('');
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);

    try {
      const res = await fetch('/api/import/transcripts', {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error ?? 'Upload failed');
      }
      setResult(data);
      setStatus('done');
    } catch (e) {
      setErrorMsg(e instanceof Error ? e.message : 'Unknown error');
      setStatus('error');
    }
  };

  const reset = () => {
    setStatus('idle');
    setFileName('');
    setResult(null);
    setErrorMsg('');
    if (inputRef.current) inputRef.current.value = '';
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) handleFile(file);
  };

  if (status === 'done' && result) {
    return (
      <div className="flex flex-col items-center gap-3 py-10 text-center">
        <CheckCircle size={40} className="text-teal-600" />
        <p className="text-lg font-semibold text-gray-800">Import complete</p>
        <div className="text-sm text-gray-500 space-y-1">
          <p>{result.imported} transcripts imported · {result.skipped} skipped (no CRM ID)</p>
          {result.errors.length > 0 && (
            <p className="text-red-500">{result.errors.length} error(s)</p>
          )}
        </div>
        {result.errors.length > 0 && (
          <div className="mt-2 text-left w-full max-w-md bg-red-50 border border-red-200 rounded p-3">
            <p className="text-xs font-semibold text-red-700 mb-1">Errors (first {result.errors.length}):</p>
            <ul className="text-xs text-red-600 space-y-0.5">
              {result.errors.map((e, i) => <li key={i} className="truncate">{e}</li>)}
            </ul>
          </div>
        )}
        <button onClick={reset} className="mt-2 text-sm text-teal-600 hover:underline">
          Import another file
        </button>
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
    <div
      onDrop={handleDrop}
      onDragOver={e => e.preventDefault()}
      onClick={() => status === 'idle' && inputRef.current?.click()}
      className="border-2 border-dashed border-gray-300 rounded-lg p-10 text-center hover:border-teal-400 transition-colors cursor-pointer"
    >
      {status === 'uploading' ? (
        <>
          <FileArchive size={28} className="mx-auto mb-3 text-teal-500 animate-pulse" />
          <p className="text-sm text-gray-600">Uploading <span className="font-medium">{fileName}</span>…</p>
          <p className="text-xs text-gray-400 mt-1">Processing transcripts, this may take a moment</p>
        </>
      ) : (
        <>
          <Upload size={28} className="mx-auto mb-3 text-gray-400" />
          <p className="text-sm text-gray-600">
            Drop a ZIP file here, or <span className="text-teal-600 font-medium">click to browse</span>
          </p>
          <p className="text-xs text-gray-400 mt-1">ZIP of Gong transcript JSON files — each must include <code className="bg-gray-100 px-1 rounded">_metadata.crmId</code></p>
        </>
      )}
      <input
        ref={inputRef}
        type="file"
        accept=".zip"
        className="hidden"
        onChange={e => e.target.files?.[0] && handleFile(e.target.files[0])}
      />
    </div>
  );
}
