// api/analyze.js — Vercel serverless function
// Accepts a base64-encoded financial document, sends to Gemini for structured analysis.

export const config = {
  api: {
    bodyParser: { sizeLimit: '12mb' },
  },
};

const ANALYSIS_PROMPT = `
You are an expert financial analyst. Carefully read this financial document (could be a P&L, Balance Sheet, Annual Report, Quarterly Results, Cash Flow Statement, or any other financial filing).

Extract all key financial data and return ONLY a valid JSON object — no markdown fences, no backticks, no explanation outside the JSON.

Use this exact schema:

{
  "company": "Company or entity name, or 'Unknown Company'",
  "period": "Primary reporting period (e.g. 'FY2024', 'Q3 FY2025', 'Year ended 31 March 2024')",
  "currency": "Symbol — ₹ for INR, $ for USD, £ for GBP, € for EUR",
  "currency_unit": "Scale used — 'Crores', 'Lakhs', 'Millions', 'Billions', 'Thousands', or 'Units'",
  "report_type": "e.g. 'Profit & Loss Statement', 'Annual Report', 'Quarterly Results', 'Balance Sheet', 'Cash Flow Statement'",
  "summary": "2–3 sentence executive summary: financial position, key highlights, notable context.",

  "metrics": {
    "revenue":          { "value": <number|null>, "yoy_pct": <number|null>, "label": "Exact label from doc, e.g. Revenue from Operations / Net Sales / Total Income" },
    "gross_profit":     { "value": <number|null>, "margin_pct": <number|null> },
    "ebitda":           { "value": <number|null>, "margin_pct": <number|null> },
    "operating_profit": { "value": <number|null>, "margin_pct": <number|null>, "label": "EBIT / Operating Profit / PBIT" },
    "net_profit":       { "value": <number|null>, "yoy_pct": <number|null>, "margin_pct": <number|null>, "label": "PAT / Net Profit / Net Income" },
    "total_assets":     { "value": <number|null> },
    "total_debt":       { "value": <number|null>, "label": "Total Borrowings / Total Debt / Long + Short-term Debt" },
    "equity":           { "value": <number|null>, "label": "Shareholders Equity / Net Worth / Total Equity" },
    "cash":             { "value": <number|null>, "label": "Cash and Cash Equivalents / Cash and Bank Balances" }
  },

  "key_ratios": {
    "roe":               <ROE % or null>,
    "roce":              <ROCE % or null>,
    "debt_equity":       <D/E ratio or null>,
    "current_ratio":     <Current Assets / Current Liabilities or null>,
    "interest_coverage": <EBIT / Interest Expense or null>,
    "net_margin":        <Net Profit Margin % or null>,
    "gross_margin":      <Gross Margin % or null>
  },

  "historical_revenue": [
    <Up to 6 periods found, sorted OLDEST first. Include all comparison periods visible in the document.>
    { "period": "FY2022", "revenue": <number|null>, "net_profit": <number|null> }
  ],

  "segment_breakdown": [
    <Revenue or sales by business segment / geography / product if available. Empty array [] if none.>
    { "name": "Segment", "value": <number>, "share_pct": <number|null>, "yoy_pct": <number|null> }
  ],

  "insights": [
    <4–6 insights. Mix types: "strength", "risk", "signal". Lead with 2 strengths.>
    { "type": "strength|risk|signal", "title": "5–7 word title", "detail": "1–2 sentences with specific numbers." }
  ],

  "context_for_chat": "Comprehensive plain-text dump of ALL financial figures, ratios, trends, segment data, management commentary, risk factors, and notes from this document. This will ground a chatbot. Be thorough — every number matters. Max 5000 characters."
}

Rules:
- Use null for any field not present in the document. Never invent or extrapolate numbers.
- All numeric values must be in the same unit as the document (do not convert).
- Percentages as plain numbers: 15.2 not "15.2%".
- If the document has YoY comparison, populate yoy_pct. Positive = growth, negative = decline.
- historical_revenue sorted oldest → newest. Include the primary period too as the last entry.
- segment_breakdown can be [] if no segment data is present.
- context_for_chat must include every number from the document, stated clearly.
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { fileData, mimeType, fileName } = req.body || {};
  if (!fileData || !mimeType) {
    return res.status(400).json({ error: 'Missing fileData or mimeType' });
  }

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            role: 'user',
            parts: [
              { inlineData: { mimeType, data: fileData } },
              { text: ANALYSIS_PROMPT }
            ]
          }],
          generationConfig: {
            temperature: 0.1,
            maxOutputTokens: 4096,
          }
        })
      }
    );

    const data = await r.json();

    if (data.error) {
      return res.status(500).json({ error: data.error.message || 'Gemini API error' });
    }

    const rawText = data?.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!rawText) {
      return res.status(500).json({ error: 'No response from AI model' });
    }

    // Strip markdown fences if Gemini wraps in them
    const clean = rawText.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();

    let analysis;
    try {
      analysis = JSON.parse(clean);
    } catch {
      // Fallback: try to extract a JSON object from the text
      const match = clean.match(/\{[\s\S]*\}/);
      if (match) {
        analysis = JSON.parse(match[0]);
      } else {
        return res.status(500).json({
          error: 'Could not parse AI response as JSON. The document may be unreadable.',
          raw: clean.slice(0, 400)
        });
      }
    }

    return res.status(200).json({ analysis });

  } catch (e) {
    return res.status(500).json({ error: 'Analysis engine error', detail: String(e) });
  }
}
