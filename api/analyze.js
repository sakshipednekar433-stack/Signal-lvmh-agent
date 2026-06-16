// api/analyze.js — Vercel serverless function
export const config = {
  api: { bodyParser: { sizeLimit: '12mb' } },
};

const ANALYSIS_PROMPT = `You are an expert financial analyst. Carefully read this financial document and extract all key data.

Return a JSON object with this exact structure. Use null for any field not found. Never invent numbers.

{
  "company": "Company name or Unknown Company",
  "period": "Reporting period e.g. FY2024 or Q3 FY2025",
  "currency": "Symbol: ₹ $ £ € etc",
  "currency_unit": "Crores / Lakhs / Millions / Billions / Units",
  "report_type": "Profit & Loss Statement / Annual Report / Balance Sheet / Quarterly Results / Cash Flow Statement",
  "summary": "2-3 sentence executive summary with key highlights and numbers",
  "metrics": {
    "revenue":          { "value": null, "yoy_pct": null, "label": "Revenue from Operations / Net Sales / Total Income" },
    "gross_profit":     { "value": null, "margin_pct": null },
    "ebitda":           { "value": null, "margin_pct": null },
    "operating_profit": { "value": null, "margin_pct": null, "label": "EBIT / Operating Profit" },
    "net_profit":       { "value": null, "yoy_pct": null, "margin_pct": null, "label": "PAT / Net Profit" },
    "total_assets":     { "value": null },
    "total_debt":       { "value": null, "label": "Total Borrowings" },
    "equity":           { "value": null, "label": "Shareholders Equity" },
    "cash":             { "value": null, "label": "Cash and Cash Equivalents" }
  },
  "key_ratios": {
    "roe": null,
    "roce": null,
    "debt_equity": null,
    "current_ratio": null,
    "interest_coverage": null,
    "net_margin": null,
    "gross_margin": null
  },
  "historical_revenue": [
    { "period": "FY2022", "revenue": null, "net_profit": null }
  ],
  "segment_breakdown": [
    { "name": "Segment", "value": null, "share_pct": null, "yoy_pct": null }
  ],
  "insights": [
    { "type": "strength", "title": "Short title", "detail": "1-2 sentences with specific numbers." },
    { "type": "strength", "title": "Short title", "detail": "1-2 sentences with specific numbers." },
    { "type": "risk",     "title": "Short title", "detail": "1-2 sentences with specific numbers." },
    { "type": "risk",     "title": "Short title", "detail": "1-2 sentences with specific numbers." },
    { "type": "signal",   "title": "Short title", "detail": "1-2 sentences with specific numbers." }
  ],
  "context_for_chat": "Complete plain-text dump of ALL financial figures, ratios, trends, segment data, and notes from this document. Include every number. Max 5000 characters."
}

Rules:
- historical_revenue: list all periods found, sorted oldest first, max 6 entries
- segment_breakdown: empty array [] if no segment data
- All numbers in the same unit as the document (do not convert)
- Percentages as plain numbers: 15.2 not 15.2%
- yoy_pct positive = growth, negative = decline`;

export default async function handler(req, res) {
  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' });

  const { fileData, mimeType } = req.body || {};
  if (!fileData || !mimeType) return res.status(400).json({ error: 'Missing fileData or mimeType' });

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) return res.status(500).json({ error: 'API key not configured' });

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
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
            responseMimeType: 'application/json'
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
      return res.status(500).json({ error: 'No response from AI model. Check your API key.' });
    }

    // Try parsing — responseMimeType=json should give clean JSON, but strip fences just in case
    let analysis;
    try {
      const clean = rawText.replace(/^```(?:json)?\s*/m, '').replace(/\s*```\s*$/m, '').trim();
      analysis = JSON.parse(clean);
    } catch {
      // Last resort: find the JSON object in the text
      const match = rawText.match(/\{[\s\S]*\}/);
      if (match) {
        try { analysis = JSON.parse(match[0]); }
        catch { return res.status(500).json({ error: 'Could not parse AI response. Please try a clearer document.' }); }
      } else {
        return res.status(500).json({ error: 'AI returned an unexpected format. Please try again.' });
      }
    }

    return res.status(200).json({ analysis });

  } catch (e) {
    return res.status(500).json({ error: 'Analysis engine error', detail: String(e) });
  }
}
