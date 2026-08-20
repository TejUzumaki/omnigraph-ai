const rateLimit = {};
const lastPrompts = {};

export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    
    const ip = req.headers['x-forwarded-for'] || 'unknown';
    const now = Date.now();
    if (!rateLimit[ip]) rateLimit[ip] = [];
    rateLimit[ip] = rateLimit[ip].filter(t => now - t < 60000);
    if (rateLimit[ip].length >= 10) return res.status(429).json({ error: 'Rate Limit Exceeded.' });
    rateLimit[ip].push(now);

    const { prompt } = req.body;
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'Configuration Error: Nvidia API key missing.' });

    // Prevent accidental duplicate spam
    if (lastPrompts[ip] && lastPrompts[ip].text === prompt && (now - lastPrompts[ip].time) < 5000) {
        return res.status(429).json({ error: 'Duplicate request blocked.' });
    }
    lastPrompts[ip] = { text: prompt, time: now };

    const systemPrompt = `You are OmniGraph AI, an expert math visualizer. 
    Return ONLY valid JSON. 
    If generating math/SVG, format: {"text": "Brief explanation...", "svg": "<svg tags fitting 200x200 viewBox>"}. 
    If just chatting, format: {"text": "Response...", "svg": ""}.`;

    try {
        const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'meta/llama-3.1-70b-instruct',
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
                temperature: 0.2,
                max_tokens: 800
            })
        });

        const data = await response.json();
        if (!response.ok) {
            const errDetail = data.error?.message || 'Unknown API rejection.';
            return res.status(response.status).json({ error: `Nvidia API Error (${response.status}): ${errDetail}` });
        }

        if (!data.choices || !data.choices[0]) return res.status(500).json({ error: 'Malformed Response.' });

        let text = data.choices[0].message.content;
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        
        try {
            const json = JSON.parse(text);
            res.status(200).json({ text: json.text || "", svg: json.svg || "" });
        } catch (e) {
            res.status(200).json({ text: text, svg: "" });
        }
    } catch (error) {
        res.status(500).json({ error: `Network or Server Error: ${error.message}` });
    }
}
