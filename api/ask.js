// /api/ask.js  — Vercel serverless function
// Keeps your Gemini API key secret and answers questions grounded in LVMH earnings data.

const LVMH_CONTEXT = `
You are "Lumière", an earnings-intelligence analyst agent. You answer questions about LVMH
(Moët Hennessy Louis Vuitton) using ONLY the verified data below, drawn from LVMH's published
quarterly results for FY2023 through the first nine months of 2025. Be precise, cite the real
numbers, and write like a sharp business analyst briefing a strategy team. Keep answers to
2-4 short paragraphs. Use **bold** for key figures. If asked something the data does not cover,
say so honestly and point to what you do know. Never invent numbers.

=== VERIFIED LVMH DATA ===

GROUP REVENUE
- FY2024: €84.7B total revenue, −2% reported YoY, +1% organic. Profit from recurring operations €19.6B (−14% YoY); operating margin 23.1%. Net profit €12.6B (−17% YoY).
- 9M 2024: €60.75B revenue.
- 9M 2025: €58.1B revenue, −4% reported / −2% organic vs 9M 2024.
- Quarterly organic growth: Q3 2024 −3%, Q4 2024 +1%, Q1 2025 −3%, Q2 2025 −4%, Q3 2025 +1%.
- Quarterly revenue (€B): Q3 2024 19.1, Q4 2024 23.9, Q3 2025 18.3 (€21.2B). Q3 2025 was the FIRST quarter of organic growth in 2025, recovering from two consecutive declines.
- H1 2025: €39.8B revenue, −4% YoY; profit from recurring operations €9B, margin 22.6%, −15% vs H1 2024.

DIVISIONS (FY2024 revenue; 9M 2025 organic trend)
- Fashion & Leather Goods: €41.1B FY2024 (≈48% of group, the profit engine). 9M 2025 organic −6%, but decline SLOWED in Q3 2025 to about −2% (better than the −4% analysts feared). Louis Vuitton and Dior both improved with local Chinese customers. Loro Piana, Loewe, Rimowa cited as strong in 2024.
- Selective Retailing (Sephora, DFS): €18.3B FY2024. 9M 2025 organic +3%, Q3 +7% — the STRONGEST performer. Sephora "remarkable performance"; DFS recovering in Macao/Hong Kong. Rhode (Hailey Bieber beauty line) had a record launch.
- Watches & Jewelry: €10.6B FY2024 (−3% in 2024). 9M 2025 organic +1%, driven by Tiffany & Co. and Bvlgari (Serpenti, Polychroma high jewelry).
- Perfumes & Cosmetics: €8.4B FY2024 (+4% organic in 2024). 9M 2025 broadly stable; Dior (Miss Dior Essence, Dior Homme Parfum) and Guerlain launches.
- Wines & Spirits (Moët Hennessy): €5.9B FY2024. 9M 2025 organic −4%, the MOST challenged division (weak cognac demand in US and China); ticked +1% in Q3.

REGIONS
- China / Asia ex-Japan: The key swing region. Weak through 2024 (Asia ex-Japan −16% organic in Q3 2024) due to soft real estate and cautious consumers. Improved meaningfully in 2025; Q3 2025 showed better local-customer demand for Louis Vuitton and Dior.
- Europe & US: Broadly stable in 2025 on solid local demand; Europe hit in Q3 2025 by lower tourist spending and currency.
- Japan: Strong in 2024 (weak yen drove inbound tourism), softer in 2025 against tough comparisons.

KEY STRATEGIC THEMES
- CURRENCY: A strong euro in 2025 cut ~5 points off Q3 organic growth and ~2 points off 9M growth. Reported revenue looks worse than underlying local-currency demand.
- PRICE-HIKE FATIGUE: Repeated luxury price increases + US trade tension caused consumer pushback on high-priced handbags, especially Asia & US. A genuine risk to pricing power.
- PORTFOLIO RESILIENCE: When Fashion & Leather stalls, Selective Retailing and Beauty cushion the group — the conglomerate model working as designed.
- MANAGEMENT TONE: Bernard Arnault framed 2024 as "resilient." 2025 language emphasises "continuously enhancing the desirability of brands," retail excellence, and agility — i.e. defending pricing power and brand heat rather than chasing volume.
- 2024 one-offs: Olympic Games sponsorship costs weighed on recurring operating income. DFS challenged by weak Hong Kong/Macao tourist flows.
- Investor view: Stock down ~14% YTD in 2025; Bernstein named LVMH its "best idea" for Q4 2025; shares jumped ~12% after the Q3 2025 growth surprise.

=== END DATA ===
`;

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { question } = req.body || {};
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Missing question' });
  }

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: LVMH_CONTEXT }] },
          contents: [{ role: 'user', parts: [{ text: question }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 600 }
        })
      }
    );

    const data = await r.json();
    const answer =
      data?.candidates?.[0]?.content?.parts?.[0]?.text ||
      "I couldn't generate an answer just now. Please try rephrasing.";

    return res.status(200).json({ answer });
  } catch (e) {
    return res.status(500).json({ error: 'Engine error', detail: String(e) });
  }
}
