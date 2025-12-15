// Quick test to see what the API actually returns
const apiUrl = process.env.API_URL || 'your-api-url';
const apiKey = process.env.API_KEY || 'your-api-key';

async function test() {
  const headers = {
    'Authorization': `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };
  
  // Get documents
  const docsRes = await fetch(`${apiUrl}/documents`, { headers });
  const docs = await docsRes.json();
  console.log('Sample document:', docs.items[0]);
  
  // Get blocks for first doc
  const blocksRes = await fetch(`${apiUrl}/blocks?id=${docs.items[0].id}&maxDepth=-1`, { headers });
  const blocks = await blocksRes.json();
  console.log('Sample block structure:', JSON.stringify(blocks[0], null, 2));
}

test().catch(console.error);
