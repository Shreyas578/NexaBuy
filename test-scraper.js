const fs = require('fs');
const env = fs.readFileSync('.env', 'utf8').split('\n').reduce((acc, line) => {
  const [k, ...v] = line.split('=');
  if (k && v.length) acc[k.trim()] = v.join('=').trim();
  return acc;
}, {});

const SCRAPER_BASE = 'https://api.anakin.io/v1/url-scraper';
const apiKey = env.WIRE_API_KEY;

async function testScraper() {
  const url = "https://www.amazon.in/TIMEX-Multifunction-Analog-Coloured-Quartz/dp/B0C1T16PGW/";
  console.log('Testing scraper for URL:', url);
  
  try {
    const res = await fetch(SCRAPER_BASE, {
      method: 'POST',
      headers: { 'X-API-Key': apiKey, 'Content-Type': 'application/json' },
      body: JSON.stringify({ url, browser: true })
    });
    
    if (!res.ok) {
      console.log('Error status:', res.status);
      console.log('Error text:', await res.text());
      return;
    }
    let data = await res.json();
    console.log('Initial Scraper Status:', data.status);
    
    const jobId = data.jobId || data.job_id;
    const isProcessing = (s) => s === 'processing' || s === 'pending';
    
    if (isProcessing(data.status) && jobId) {
      let attempts = 0;
      while (isProcessing(data.status) && attempts < 15) {
        await new Promise(r => setTimeout(r, 2000));
        const pollRes = await fetch(`${SCRAPER_BASE}/${jobId}`, { headers: { 'X-API-Key': apiKey } });
        data = await pollRes.json();
        process.stdout.write('.');
        attempts++;
      }
      console.log('\nFinal Status:', data.status);
    }
    
    const unwrappedData = data.data?.data ?? data.data ?? data;
    const content = unwrappedData.content ?? unwrappedData.markdown ?? unwrappedData.text ?? JSON.stringify(data);
    
    console.log('\n--- SCRAPED CONTENT EXTRACT (FIRST 1000 CHARS) ---');
    console.log(content.slice(0, 1000));
    console.log('--------------------------------------------------');
    
    // Check for price explicitly
    console.log('\nLooking for Rs., ₹, INR...');
    console.log('Contains ₹:', content.includes('₹'));
    console.log('Contains Rs:', content.includes('Rs'));
  } catch(e) {
    console.error('Error:', e);
  }
}

testScraper();
