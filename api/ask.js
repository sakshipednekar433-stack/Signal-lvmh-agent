// api/ask.js — Vercel serverless function
// Answers questions about the user's uploaded financial document.

export default async function handler(req, res) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { question, context } = req.body || {};
  if (!question || typeof question !== 'string') {
    return res.status(400).json({ error: 'Missing question' });
  }

  const API_KEY = process.env.GEMINI_API_KEY;
  if (!API_KEY) {
    return res.status(500).json({ error: 'API key not configured' });
  }

  const systemPrompt = context
    ? `You are "Lumière", a financial intelligence analyst. The user has uploaded a financial document which you have already analyzed. Answer their questions using ONLY the data from this document.

Be precise and cite specific numbers. Write like a sharp financial analyst briefing a strategy team. Keep answers to 2–4 short paragraphs. Use **bold** for key figures and metrics.

If the answer is not in the document, say so clearly and point to what you do know. Never invent, estimate, or extrapolate numbers that do not appear in the document.

=== DOCUMENT DATA ===
${context}
=== END ===`
    : `You are "Lumière", a financial intelligence analyst. Help the user understand how to use this tool — they can upload a P&L, Balance Sheet, Annual Report, or any financial statement to get instant AI analysis and ask questions about it. Be helpful and concise.`;

  try {
    const r = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          systemInstruction: { parts: [{ text: systemPrompt }] },
          contents: [{ role: 'user', parts: [{ text: question }] }],
          generationConfig: { temperature: 0.3, maxOutputTokens: 700 }
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
