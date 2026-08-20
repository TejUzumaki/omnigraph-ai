export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });

    const { prompt, type } = req.body;
    const apiKey = process.env.AI_API_KEY;
    
    if (!apiKey) return res.status(500).json({ error: 'API key not configured in Vercel.' });
    if (!apiKey.startsWith('nvapi-')) return res.status(400).json({ error: 'Backend is configured exclusively for Nvidia (nvapi-) keys.' });

    let model = '';
    let systemPrompt = '';

    if (type === 'svg') {
        // Route to Nvidia's heavy 70B model for complex SVG code generation
        model = 'nvidia/llama-3.1-nemotron-70b-instruct';
        systemPrompt = `You are an expert SVG generator. Create a character based on the prompt. Return ONLY valid JSON. Keys MUST be exactly: 'head', 'torso', 'left_arm', 'right_arm', 'left_leg', 'right_leg'. Values MUST be valid SVG inner tags (<path>, <rect>, <circle>) with fill colors, designed to align within a 200x200 viewBox.`;
    } else {
        // Route to fast 8B model for normal chat to save tokens
        model = 'meta/llama3-8b-instruct';
        systemPrompt = `You are a helpful, concise animation assistant. Keep responses under 3 sentences.`;
    }

    try {
        const url = 'https://integrate.api.nvidia.com/v1/chat/completions';
        const options = {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
                'Accept': 'application/json'
            },
            body: JSON.stringify({
                model: model,
                messages: [
                    { role: 'system', content: systemPrompt },
                    { role: 'user', content: prompt }
                ],
                temperature: 0.2,
                max_tokens: type === 'svg' ? 2000 : 150
            })
        };

        const response = await fetch(url, options);
        const data = await response.json();

        if (!response.ok) {
            const errMsg = data.error?.message || data.error?.type || JSON.stringify(data);
            return res.status(response.status).json({ error: `Nvidia API Error: ${errMsg}` });
        }

        if (!data.choices || !data.choices[0]) {
            return res.status(500).json({ error: "Nvidia API returned no choices.", raw: data });
        }

        let text = data.choices[0].message.content;
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();

        // Return as JSON if it's an SVG, otherwise return as text
        try {
            const json = JSON.parse(text);
            res.status(200).json(json);
        } catch (e) {
            res.status(200).json({ text: text });
        }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
