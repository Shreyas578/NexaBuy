/**
 * Groq API wrapper — OpenAI-compatible, pointed at Groq's base URL.
 * Model: llama-3.3-70b-versatile (fast, powerful, available on Groq)
 */

const GROQ_BASE_URL = 'https://api.groq.com/openai/v1';
const MODEL = 'llama-3.3-70b-versatile';

interface ChatMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

async function groqChat(messages: ChatMessage[], temperature = 0.3): Promise<string> {
  const apiKey = process.env.GROQ_API_KEY;
  if (!apiKey) throw new Error('GROQ_API_KEY not set');

  const res = await fetch(`${GROQ_BASE_URL}/chat/completions`, {
    method: 'POST',
    headers: {
      'Authorization': `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ model: MODEL, messages, temperature }),
  });

  if (!res.ok) {
    const err = await res.text();
    throw new Error(`Groq API error ${res.status}: ${err}`);
  }

  const data = await res.json();
  return data.choices[0]?.message?.content ?? '';
}

// ─── Price Verdict ───────────────────────────────────────────────────────────

export interface PriceVerdictResult {
  verdict: 'Good Deal' | 'Average' | 'Wait';
  verdictColor: 'green' | 'yellow' | 'red';
  reasoning: string;
  summary: string;
}

export async function generatePriceVerdict(
  anchorProduct: { name: string; price: number; currency: string; retailer: string; normalizedPriceUSD: number },
  comparisons: { retailer: string; price: number; currency: string; available: boolean; normalizedPriceUSD: number; isVariant?: boolean }[]
): Promise<PriceVerdictResult> {
  // Build comparison text using normalized USD so the LLM always sees apples-to-apples numbers.
  // Show the original price + currency for human-readable context, but call out the USD equivalent.
  const compText = comparisons
    .map(c => {
      const variantNote = c.isVariant ? ' ⚠ different storage/color variant' : '';
      const sameAsDisplay = c.currency === 'USD'
        ? `$${c.normalizedPriceUSD.toFixed(2)}`
        : `${c.currency}${c.price} (~$${c.normalizedPriceUSD.toFixed(2)} USD)`;
      return `- ${c.retailer}: ${sameAsDisplay} (${c.available ? 'in stock' : 'unavailable'})${variantNote}`;
    })
    .join('\n');

  const anchorDisplay = anchorProduct.currency === 'USD'
    ? `$${anchorProduct.normalizedPriceUSD.toFixed(2)}`
    : `${anchorProduct.currency}${anchorProduct.price} (~$${anchorProduct.normalizedPriceUSD.toFixed(2)} USD)`;

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a shopping advisor. All prices are shown in USD (or converted to USD equivalent). Compare them directly.
Always respond with valid JSON in this exact shape:
{
  "verdict": "Good Deal" | "Average" | "Wait",
  "verdictColor": "green" | "yellow" | "red",
  "reasoning": "<one sentence explaining the verdict>",
  "summary": "<2-3 sentence consumer-friendly summary>"
}
Rules: "Good Deal" = lowest or within 5% of lowest; "Wait" = significantly overpriced (>15% above avg); "Average" = between.
If a comparison is marked as a different storage/color variant, note that in your summary but still use it for price reference.`,
    },
    {
      role: 'user',
      content: `Product: ${anchorProduct.name}
Your price (${anchorProduct.retailer}): ${anchorDisplay}

Competitor prices (all in USD or USD equivalent):
${compText || '(no comparisons available)'}

Give a verdict.`,
    },
  ];

  const raw = await groqChat(messages, 0.2);
  // Extract JSON from response (may have extra text)
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Groq returned non-JSON for price verdict');
  return JSON.parse(match[0]) as PriceVerdictResult;
}

// ─── Trend Summary ───────────────────────────────────────────────────────────

export interface TrendResult {
  direction: 'Rising' | 'Flat' | 'Falling';
  directionIcon: '↗' | '→' | '↘';
  summary: string;
  buySignal: string;
}

export async function generateTrendSummary(
  productName: string,
  trendsData: unknown
): Promise<TrendResult> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a market trend analyst. Analyze Google Trends data for a product and give a buying signal.
Respond with valid JSON:
{
  "direction": "Rising" | "Flat" | "Falling",
  "directionIcon": "↗" | "→" | "↘",
  "summary": "<2 sentences about the trend>",
  "buySignal": "<1 sentence: should the user buy now or wait based on the trend?>"
}`,
    },
    {
      role: 'user',
      content: `Product: ${productName}
Trends data: ${JSON.stringify(trendsData, null, 2)}

Analyze the trend and generate a buying signal.`,
    },
  ];

  const raw = await groqChat(messages, 0.3);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Groq returned non-JSON for trend summary');
  return JSON.parse(match[0]) as TrendResult;
}

function inferCategoryFromName(productName: string): string {
  const lower = productName.toLowerCase();
  const typeMatch = lower.match(/\b(watch|watches|headphone|earbuds|speaker|laptop|phone|shoe|sneaker|bag|camera|tablet|monitor|keyboard|mouse|chair|sofa|dress|jacket|ring|necklace)\b/);
  if (typeMatch) {
    const word = typeMatch[1];
    if (word.endsWith('s')) return word;
    if (word === 'watch') return 'watches';
    if (word === 'shoe') return 'shoes';
    if (word === 'sneaker') return 'sneakers';
    return `${word}s`;
  }
  const words = productName.split(/\s+/).filter(w => w.length > 2);
  return words.slice(-2).join(' ').toLowerCase() || 'products';
}

// ─── Trend Signal Narrative (dual product + category) ────────────────────────

export interface TrendNarrativePart {
  direction: 'Rising' | 'Flat' | 'Falling';
  directionIcon: '↗' | '→' | '↘';
  summary: string;
  buySignal: string;
}

export interface TrendSignalNarrative {
  primary: TrendNarrativePart;
  secondary?: Omit<TrendNarrativePart, 'buySignal'>;
}

export async function generateTrendSignalNarrative(params: {
  productName: string;
  categoryTerm: string;
  primary: { source: 'product' | 'category'; keyword: string; data: unknown };
  secondary?: { source: 'product' | 'category'; keyword: string; data: unknown } | null;
}): Promise<TrendSignalNarrative> {
  const { productName, categoryTerm, primary, secondary } = params;

  const primaryLabel =
    primary.source === 'product'
      ? `This exact product ("${primary.keyword}")`
      : `Product category ("${primary.keyword}")`;

  const secondaryBlock = secondary
    ? `\nSecondary context — ${secondary.source === 'category' ? 'category' : 'product'} ("${secondary.keyword}"):\n${JSON.stringify(secondary.data, null, 2)}`
    : '';

  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a market trend analyst. You will receive REAL Google Trends time-series data only.
CRITICAL RULES:
- ONLY analyze the numeric trend data provided. Never infer popularity from missing or empty data.
- Never claim a product is "not popular" unless the data explicitly shows declining values.
- If analyzing category data as primary, make clear it reflects the broader category, not this specific product.
Respond with valid JSON:
{
  "primary": {
    "direction": "Rising" | "Flat" | "Falling",
    "directionIcon": "↗" | "→" | "↘",
    "summary": "<2 sentences about the PRIMARY trend data>",
    "buySignal": "<1 sentence buying advice based ONLY on the primary trend>"
  }${secondary ? `,
  "secondary": {
    "direction": "Rising" | "Flat" | "Falling",
    "directionIcon": "↗" | "→" | "↘",
    "summary": "<1-2 sentences about the SECONDARY trend for context>"
  }` : ''}
}`,
    },
    {
      role: 'user',
      content: `Product: ${productName}
Category: ${categoryTerm}

PRIMARY — ${primaryLabel}:
${JSON.stringify(primary.data, null, 2)}${secondaryBlock}

Analyze ONLY the provided data points.`,
    },
  ];

  const raw = await groqChat(messages, 0.2);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Groq returned non-JSON for trend signal narrative');
  return JSON.parse(match[0]) as TrendSignalNarrative;
}

// ─── Return/Cancel Extraction ────────────────────────────────────────────────

export interface ReturnResult {
  steps: string[];
  email: string;
  retailer: string;
  timeframe: string;
}

export async function extractReturnSteps(
  policyText: string,
  intent: 'cancel' | 'return',
  retailer: string,
  productName?: string
): Promise<ReturnResult> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a customer service expert. Extract exact step-by-step instructions for ${intent}ing from a retailer policy page.
Respond with valid JSON:
{
  "steps": ["Step 1: ...", "Step 2: ...", ...],
  "email": "<draft ${intent} email the user can send>",
  "retailer": "<retailer name>",
  "timeframe": "<e.g. '30 days' or 'within 15 days of purchase'>"
}
Keep steps concise and actionable. Draft email should be professional and include [PRODUCT_NAME] and [ORDER_NUMBER] placeholders.`,
    },
    {
      role: 'user',
      content: `Retailer: ${retailer}
Intent: ${intent}
Product: ${productName ?? 'the product'}

Policy page content:
${policyText.slice(0, 6000)}

Extract the exact ${intent} steps and draft the email.`,
    },
  ];

  const raw = await groqChat(messages, 0.2);
  const match = raw.match(/\{[\s\S]*\}/);
  if (!match) throw new Error('Groq returned non-JSON for return steps');
  return JSON.parse(match[0]) as ReturnResult;
}

// ─── Product Info Extraction ──────────────────────────────────────────────────

export interface ProductInfoResult {
  name: string;
  price: number | null;
  currency: string;
  category: string;
}

export async function verifyProductMatch(
  anchorProductName: string,
  competitorProductName: string
): Promise<{ isMatch: boolean; reason: string; isVariant?: boolean }> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are a product matching expert. Determine if two product titles represent the same product or a close storage/color variant of the same model.
Respond with valid JSON:
{
  "isMatch": boolean,
  "isVariant": boolean,
  "reason": "<1 line reason>"
}
Rules:
- "isMatch: true, isVariant: false" — identical or effectively the same (minor wording differences, same model/specs).
- "isMatch: true, isVariant: true" — same model number but different storage tier, color, or minor spec (e.g. 128GB vs 256GB of the same phone). Include these but flag them.
- "isMatch: false" — different model number (e.g. M56 vs A56, S26 vs M56), different product category, or clearly different demographic target (men's vs women's). Reject these.
- Be conservative: if the model strings differ by more than storage/color, return false.`,
    },
    {
      role: 'user',
      content: `Anchor Product: ${anchorProductName}
Competitor Product: ${competitorProductName}

Are these the same product or a close variant?`,
    },
  ];

  try {
    const raw = await groqChat(messages, 0.1);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) return { isMatch: false, reason: 'Non-JSON response' };
    const parsed = JSON.parse(match[0]);
    return {
      isMatch: Boolean(parsed.isMatch),
      isVariant: Boolean(parsed.isVariant),
      reason: String(parsed.reason || 'No reason provided'),
    };
  } catch (e) {
    console.error('[Groq] Product match verification failed:', e);
    // Be conservative on failure
    return { isMatch: false, reason: 'Match verification failed' };
  }
}

export async function extractProductInfo(
  content: string,
  url: string,
  fallbackName: string
): Promise<ProductInfoResult> {
  const messages: ChatMessage[] = [
    {
      role: 'system',
      content: `You are an e-commerce parsing expert. Your job is to extract the product name, price, and general product category from scraped text of a product page.
Respond with valid JSON:
{
  "name": "<Clean, short product name (max 5 words)>",
  "price": <numeric price, or null if not found>,
  "currency": "<USD, INR, EUR, GBP, etc.>",
  "category": "<General Google Trends-friendly category term, 2-4 words, e.g. 'analog watches', 'wireless headphones', 'running shoes'. Derive from the page content — product type/category, NOT the brand or model name.>"
}
Rules:
- The product name MUST be extremely clean and short (e.g. "NIBOSI Analog Watch", "Sony WH-1000XM4"). Strip out SEO fluff like "Buy Online", "For Men", etc.
- The category should be a broad search term someone would use on Google Trends (e.g. for a NIBOSI Analog Watch → "analog watches" or "men's watches").
- Only return the numeric price. Do not include currency symbols in the price field.
- If you absolutely cannot find a price, set it to null.`,
    },
    {
      role: 'user',
      content: `URL: ${url}
Fallback Name: ${fallbackName}

Scraped Content:
${content.slice(0, 8000)}

Extract the clean product name and exact price.`,
    },
  ];

  try {
    const raw = await groqChat(messages, 0.1);
    const match = raw.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Groq returned non-JSON for product info');
    const parsed = JSON.parse(match[0]) as ProductInfoResult;
    return {
      ...parsed,
      category: parsed.category?.trim() || inferCategoryFromName(parsed.name || fallbackName),
    };
  } catch (e) {
    console.warn('[Groq] Product extraction failed, using fallback:', e);
    return { name: fallbackName, price: null, currency: 'USD', category: inferCategoryFromName(fallbackName) };
  }
}
