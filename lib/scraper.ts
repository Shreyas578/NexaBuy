/**
 * Anakin Scraper wrapper — uses the holocron /task endpoint.
 * Gracefully falls back to a direct fetch if the scraper is unavailable.
 */

const SCRAPER_BASE = process.env.ANAKIN_SCRAPER_URL ?? 'https://api.anakin.io/v1/url-scraper';

export interface ScrapeResult {
  success: boolean;
  content?: string;
  metadata?: {
    title?: string;
    description?: string;
    price?: string;
    currency?: string;
    image?: string;
    url?: string;
  };
  error?: string;
}

export async function scrapePage(url: string): Promise<ScrapeResult> {
  const apiKey = process.env.WIRE_API_KEY; // Anakin uses same key

  try {
    const res = await fetch(SCRAPER_BASE, {
      method: 'POST',
      headers: {
        'X-API-Key': apiKey ?? '',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ url, browser: true }), // URL Scraper payload
    });

    if (!res.ok) {
      const errText = await res.text();
      // Try fallback direct fetch
      return await fallbackFetch(url, `Scraper error ${res.status}: ${errText}`);
    }

    let data = await res.json();
    const jobId = data.jobId || data.job_id;
    const isProcessing = (s: string) => s === 'processing' || s === 'pending';

    // Poll if asynchronous task
    if (isProcessing(data.status) && jobId) {
      let attempts = 0;
      while (isProcessing(data.status) && attempts < 20) { // Up to 40 seconds
        await new Promise(r => setTimeout(r, 2000));
        const pollRes = await fetch(`${SCRAPER_BASE}/${jobId}`, {
          headers: { 'X-API-Key': apiKey ?? '' },
        });
        
        if (!pollRes.ok) {
          throw new Error(`Polling failed: ${pollRes.status}`);
        }
        data = await pollRes.json();
        attempts++;
      }
      
      if (isProcessing(data.status)) {
        throw new Error('Scraping task timed out');
      }
    }

    const unwrappedData = data.data?.data ?? data.data ?? data;

    // Extract content from holocron response shape
    const content: string =
      unwrappedData.content ??
      unwrappedData.markdown ??
      unwrappedData.text ??
      unwrappedData.result?.content ??
      unwrappedData.result?.markdown ??
      JSON.stringify(data);

    const metadata = extractMetadata(content, url, unwrappedData);

    return { success: true, content, metadata };
  } catch (e) {
    return await fallbackFetch(url, String(e));
  }
}

async function fallbackFetch(url: string, priorError: string): Promise<ScrapeResult> {
  try {
    const res = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 NexaBuy/1.0 (hackathon)' },
    });
    if (!res.ok) return { success: false, error: `${priorError} | Fallback fetch failed: ${res.status}` };
    const html = await res.text();
    // Simple HTML → text extraction
    const text = html
      .replace(/<script[\s\S]*?<\/script>/gi, '')
      .replace(/<style[\s\S]*?<\/style>/gi, '')
      .replace(/<[^>]+>/g, ' ')
      .replace(/\s+/g, ' ')
      .trim();
    const metadata = extractMetadata(text, url, {});
    return { success: true, content: text, metadata };
  } catch (e2) {
    return { success: false, error: `${priorError} | Fallback also failed: ${e2}` };
  }
}

function extractMetadata(
  content: string,
  url: string,
  raw: Record<string, unknown>
): ScrapeResult['metadata'] {
  // Price patterns: $29.99, USD 29.99, 29.99 USD, £29, €29
  const priceMatch = content.match(/[\$£€¥₹][\s]?[\d,]+\.?\d{0,2}|[\d,]+\.?\d{0,2}[\s]?(?:USD|GBP|EUR|INR)/);

  // Title: try common patterns
  const titleMatch = content.match(/(?:product[:\s]+|title[:\s]+)([^\n|]+)/i) ??
    content.match(/^([^\n]{10,100})/);

  let extractedTitle = (raw.title as string) ?? titleMatch?.[1]?.trim();

  // If we hit a captcha, Amazon might return "Amazon.in" as the title. Fall back to URL path.
  if (extractedTitle && /amazon\.(in|com|co\.uk)/i.test(extractedTitle)) {
    try {
      const urlObj = new URL(url);
      const pathParts = urlObj.pathname.split('/').filter(Boolean);
      if (pathParts.length > 0 && pathParts[0] !== 'dp') {
        extractedTitle = pathParts[0].replace(/-/g, ' ');
      }
    } catch(e) {}
  }

  return {
    title: extractedTitle,
    description: (raw.description as string) ?? content.slice(0, 300),
    price: (raw.price as string) ?? priceMatch?.[0],
    currency: (raw.currency as string) ?? (priceMatch?.[0]?.match(/[£€¥₹]/) ? 'GBP/EUR/JPY/INR' : 'USD'),
    image: (raw.image as string) ?? (raw as Record<string, Record<string, string>>)?.result?.image,
    url,
  };
}
