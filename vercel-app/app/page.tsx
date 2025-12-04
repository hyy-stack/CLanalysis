export default function Home() {
  return (
    <main style={{ padding: '2rem', fontFamily: 'sans-serif' }}>
      <h1>Anrok Deal Analyzer</h1>
      <p>Production API for automated deal analysis</p>
      
      <h2>API Endpoints</h2>
      <ul>
        <li><code>POST /api/gong-webhook</code> - Receive Gong call webhooks</li>
        <li><code>POST /api/import-emails</code> - Import emails for deals</li>
        <li><code>POST /api/analyze-deal</code> - Trigger deal analysis</li>
        <li><code>POST /api/post-to-slack</code> - Post analysis to Slack</li>
      </ul>
      
      <h2>Status</h2>
      <p>System operational. Webhooks configured. v1.1</p>
    </main>
  );
}

