export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { prompt, type } = req.body;
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API key not configured in Vercel.' });

    let model = '';
    let systemPrompt = '';

    if (type === 'svg') {
        systemPrompt = `You are an expert SVG generator. Create a character based on the prompt. Return ONLY valid JSON. Keys MUST be exactly: 'head', 'torso', 'left_arm', 'right_arm', 'left_leg', 'right_leg'. Values MUST be valid SVG inner tags with fill colors, aligned in a 200x200 viewBox.`;
        if (apiKey.startsWith('AIza')) model = 'gemini-1.5-pro';
        else if (apiKey.startsWith('sk-ant')) model = 'claude-3-5-sonnet-20240620';
        else model = 'gpt-4o';
    } else {
        systemPrompt = `You are a helpful, concise animation assistant. Keep responses under 3 sentences.`;
        if (apiKey.startsWith('AIza')) model = 'gemini-1.5-flash';
        else if (apiKey.startsWith('sk-ant')) model = 'claude-3-haiku-20240307';
        else model = 'gpt-4o-mini';
    }

    let url = "", options = {};
    if (apiKey.startsWith('AIza')) {
        url = `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`;
        options = { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ contents: [{ parts: [{ text: systemPrompt + "\nUser prompt: " + prompt }] }] }) };
    } else if (apiKey.startsWith('sk-ant')) {
        url = "https://api.anthropic.com/v1/messages";
        options = { method: 'POST', headers: { 'x-api-key': apiKey, 'anthropic-version': '2023-06-01', 'content-type': 'application/json' }, body: JSON.stringify({ model, max_tokens: 1024, system: systemPrompt, messages: [{ role: "user", content: prompt }] }) };
    } else {
        url = "https://api.openai.com/v1/chat/completions";
        options = { method: 'POST', headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ model, messages: [{ role: "system", content: systemPrompt }, { role: "user", content: prompt }] }) };
    }

    try {
        const response = await fetch(url, options);
        const data = await response.json();

        if (!response.ok) {
            const errMsg = data.error?.message || data.error?.type || JSON.stringify(data);
            return res.status(response.status).json({ error: `AI Provider Error: ${errMsg}` });
        }

        let text = "";
        if (apiKey.startsWith('AIza')) {
            if (!data.candidates || !data.candidates[0]) return res.status(500).json({ error: "Gemini returned no candidates.", raw: data });
            text = data.candidates[0].content.parts[0].text;
        } else if (apiKey.startsWith('sk-ant')) {
            if (!data.content || !data.content[0]) return res.status(500).json({ error: "Anthropic returned no content.", raw: data });
            text = data.content[0].text;
        } else {
            if (!data.choices || !data.choices[0]) return res.status(500).json({ error: "OpenAI returned no choices.", raw: data });
            text = data.choices[0].message.content;
        }

        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        try { res.status(200).json(JSON.parse(text)); } catch { res.status(200).json({ text: text }); }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
