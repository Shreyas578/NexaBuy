const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k && v.length) acc[k.trim()] = v.join('=').trim();
  return acc;
}, {});

const WIRE_BASE_URL = env.WIRE_BASE_URL ?? 'https://api.anakin.io/v1/wire';
const apiKey = env.WIRE_API_KEY;

async function runTask(actionId, params) {
  console.log(`\nTesting ${actionId}...`);
  
  const res = await fetch(`${WIRE_BASE_URL}/task`, {
    method: 'POST',
    headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action_id: actionId, params: params })
  });
  
  let data = await res.json();
  
  if (data.status === 'processing' && data.job_id) {
    const pollUrl = `https://api.anakin.io${data.poll_url}`;
    for (let i = 0; i < 15; i++) {
      await new Promise(r => setTimeout(r, 2000));
      const pollRes = await fetch(pollUrl, { headers: { 'X-API-Key': apiKey } });
      const pollData = await pollRes.json();
      if (pollData.status !== 'processing') {
        console.log(`\nFinal Task Result for ${actionId}:`);
        console.log(JSON.stringify(pollData, null, 2));
        break;
      }
      process.stdout.write('.');
    }
  } else {
    console.log(`\nFinal Task Result for ${actionId}:`);
    console.log(JSON.stringify(data, null, 2));
  }
}

async function debugWire() {
  await runTask('gt_interest_over_time', { keyword: 'iPhone 15', timeframe: 'today 12-m' });
  await runTask('gt_related_queries', { keyword: 'iPhone 15', timeframe: 'today 12-m' });
}

debugWire();
