const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.join(__dirname, '../.env.local') });

const API_KEY = process.env.INTERNAL_API_KEY;
const BASE_URL = process.env.BASE_URL || 'https://anrok-deal-analyzer.vercel.app';

async function main() {
  const args = process.argv.slice(2);
  const format = args.includes('--txt') ? 'txt' : 'json';
  const excludeFiltered = args.includes('--exclude-filtered');
  const statsOnly = args.includes('--stats');

  if (statsOnly) {
    console.log('Fetching transcript statistics...\n');

    const response = await fetch(`${BASE_URL}/api/download-transcripts`, {
      method: 'POST',
      headers: { 'X-API-Key': API_KEY },
    });

    if (!response.ok) {
      console.error(`Error: ${response.status} ${response.statusText}`);
      process.exit(1);
    }

    const stats = await response.json();
    console.log('=== Transcript Statistics ===\n');
    console.log(`Total transcripts: ${stats.total}`);
    console.log(`Excluded (post-sales/onboarding): ${stats.excluded}`);
    console.log(`Orphaned (no deal): ${stats.orphaned}`);
    console.log(`\nTop deals by transcript count:`);
    stats.topDeals.forEach((d, i) => {
      console.log(`  ${i + 1}. ${d.name} (${d.crm_id}): ${d.transcript_count} transcripts`);
    });
    return;
  }

  console.log('Downloading transcripts...');
  console.log(`Format: ${format}`);
  console.log(`Include excluded: ${!excludeFiltered}`);
  console.log('');

  const url = new URL(`${BASE_URL}/api/download-transcripts`);
  url.searchParams.set('format', format);
  if (excludeFiltered) {
    url.searchParams.set('includeExcluded', 'false');
  }

  const response = await fetch(url.toString(), {
    headers: { 'X-API-Key': API_KEY },
  });

  if (!response.ok) {
    const text = await response.text();
    console.error(`Error: ${response.status} ${response.statusText}`);
    console.error(text);
    process.exit(1);
  }

  // Get filename from Content-Disposition header
  const contentDisposition = response.headers.get('content-disposition');
  const filenameMatch = contentDisposition?.match(/filename="(.+)"/);
  const filename = filenameMatch ? filenameMatch[1] : `transcripts_${new Date().toISOString().split('T')[0]}.zip`;

  const outputPath = path.join(__dirname, '..', filename);

  // Stream to file
  const buffer = Buffer.from(await response.arrayBuffer());
  fs.writeFileSync(outputPath, buffer);

  console.log(`✓ Downloaded ${buffer.length} bytes`);
  console.log(`✓ Saved to: ${outputPath}`);
}

console.log(`
Usage: node scripts/download-transcripts.js [options]

Options:
  --stats            Show statistics only, don't download
  --txt              Download as plain text instead of JSON
  --exclude-filtered Exclude post-sales and onboarding manager calls

Examples:
  node scripts/download-transcripts.js --stats
  node scripts/download-transcripts.js
  node scripts/download-transcripts.js --txt
  node scripts/download-transcripts.js --exclude-filtered
`);

main().catch(console.error);
