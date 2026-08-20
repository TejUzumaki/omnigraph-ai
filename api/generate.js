export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { prompt, type } = req.body;
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API key not configured.' });

    let model = '';
    let systemPrompt = '';

    // Route to expensive models only for SVG, cheap models for chat
    if (type === 'svg') {
        systemPrompt = `You are an expert SVG generator. Create a character based on the prompt. Return ONLY valid JSON. Keys must be: 'head', 'torso', 'left_arm', 'right_arm', 'left_leg', 'right_leg'. Values must be valid SVG inner tags aligned in a 200x200 viewBox.`;
        if (apiKey.startsWith('AIza')) model = 'gemini-1.5-pro';
        else if (apiKey.startsWith('sk-ant')) model = 'claude-3-5-sonnet-20240620';
        else model = 'gpt-4o';
    } else {
        systemPrompt = `You are a helpful, concise animation assistant. Keep responses under 3 sentences.`;
        if (apiKey.startsWith('AIza')) model = 'gemini-1.5-flash';
        else if (apiKey.startsWith('sk-ant')) model = 'claude-3-haiku-20240307';
        else model = 'gpt-4o-mini';
    }

    try {
        let text = "";
        if (apiKey.startsWith('AIza')) {
            const url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
            const payload = { contents: [{ parts: [{ text: systemPrompt + "\nUser prompt: " + prompt }] }] };
            const response = await fetch(url, { method: 'POST', body: JSON.stringify(payload), headers: { 'Content-Type': 'application/json' } });
            const data = await response.json();
            text = data.candidates[0].content.parts[0].text;
        } else if (apiKey.startsWith('sk-ant')) {
            const url = "https://api.anthropic.com/v1/messages";
            const payload = { model, max_tokens: 1024, system: systemPrompt, messages: [{ role: "user", content: prompt }] };
            const response = await fetch(url, { method: 'POST', body: JSON.stringify(payload), headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' } });
            const data = await response.json();
            text = data.content[0].text;
        } else {
            const url = "https://api.openai.com/v1/chat/completions";
            const payload = { model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }] };
            const response = await fetch(url, { method: 'POST', body: JSON.stringify(payload), headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' } });
            const data = await response.json();
            text = data.choices[0].message.content;
        }

        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        try { res.status(200).json(JSON.parse(text)); } catch { res.status(200).json({ text: text }); }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
