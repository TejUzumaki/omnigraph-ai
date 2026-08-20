export default async function handler(req, res) {
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method Not Allowed' });
    }

    const { prompt } = req.body;
    const apiKey = process.env.AI_API_KEY;

    if (!apiKey) {
        return res.status(500).json({ error: 'API key not set in Vercel environment variables.' });
    }

    const systemPrompt = `You are an expert SVG generator. Create a character based on the user's prompt. 
    Return ONLY valid JSON. The JSON keys must be body parts: 'head', 'torso', 'left_arm', 'right_arm', 'left_leg', 'right_leg'. 
    The values must be valid SVG inner tags (like <path>, <rect>, <circle> with fill colors) designed to align within a 200x200 viewBox to form a complete character when stacked.`;

    try {
        let text = "";

        if (apiKey.startsWith('AIza')) {
            // Google Gemini
            const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${apiKey}`;
            const payload = { contents: [{ parts: [{ text: systemPrompt + "\nUser prompt: " + prompt }] }] };
            const response = await fetch(url, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
            const data = await response.json();
            text = data.candidates[0].content.parts[0].text;
        } else if (apiKey.startsWith('sk-ant')) {
            // Anthropic Claude
            const url = "https://api.anthropic.com/v1/messages";
            const payload = { model: "claude-3-haiku-20240307", max_tokens: 1024, system: systemPrompt, messages: [{ role: "user", content: prompt }] };
            const response = await fetch(url, { method: 'POST', body: JSON.stringify(payload), headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' } });
            const data = await response.json();
            text = data.content[0].text;
        } else {
            // OpenAI
            const url = "https://api.openai.com/v1/chat/completions";
            const payload = { model: "gpt-4o-mini", messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }] };
            const response = await fetch(url, { method: 'POST', body: JSON.stringify(payload), headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' } });
            const data = await response.json();
            text = data.choices[0].message.content;
        }

        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        res.status(200).json(JSON.parse(text));
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
