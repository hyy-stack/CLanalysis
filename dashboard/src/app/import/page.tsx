import CSVImporter from '@/components/CSVImporter';
import TranscriptImporter from '@/components/TranscriptImporter';

export default function ImportPage() {
  return (
    <div className="p-8 max-w-3xl mx-auto space-y-10">
      {/* Transcript ZIP import */}
      <div className="space-y-4">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Import Transcripts</h1>
          <p className="text-sm text-gray-500 mt-1">
            Upload a ZIP file of Gong transcript JSON files to seed deals and call history.
            Each file must include <code className="font-mono text-xs bg-gray-100 px-1 rounded">_metadata.crmId</code>.
          </p>
        </div>
        <div className="bg-white rounded border border-gray-200 shadow-sm p-6">
          <TranscriptImporter />
        </div>
        <div className="bg-blue-50 border border-blue-200 rounded p-4 text-sm text-blue-800">
          <strong>Note:</strong> Transcripts are matched by <code className="font-mono text-xs bg-blue-100 px-1 rounded">callId</code> — re-uploading the same file is safe and will update existing records without duplication.
        </div>
      </div>

      <hr className="border-gray-200" />

      {/* CSV deal metadata import */}
      <div className="space-y-4">
        <div>
          <h2 className="text-xl font-bold text-gray-900">Import Deal Metadata (CSV)</h2>
          <p className="text-sm text-gray-500 mt-1">
            Upload a CSV to update deal metadata — team, owner, stage — matched by CRM ID.
            Existing analysis results and call history are never overwritten.
          </p>
        </div>
        <div className="bg-white rounded border border-gray-200 shadow-sm p-6">
          <CSVImporter />
        </div>
        <div className="bg-amber-50 border border-amber-200 rounded p-4 text-sm text-amber-800">
          <strong>Note:</strong> This writes directly to the live production database.
          Each row is upserted — matched on <code className="font-mono text-xs bg-amber-100 px-1 rounded">crm_id</code>,
          created if new. Only metadata columns are updated.
        </div>
      </div>
    </div>
  );
}
