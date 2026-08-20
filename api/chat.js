export default async function handler(req, res) {
    if (req.method !== 'POST') return res.status(405).json({ error: 'Method Not Allowed' });
    
    const { prompt, type } = req.body;
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey) return res.status(500).json({ error: 'API key not configured.' });

    let model = 'meta/llama3-8b-instruct';
    let systemPrompt = 'You are a helpful, concise assistant. Keep responses under 3 sentences.';
    let temp = 0.5; let max_tokens = 150;

    if (type === 'math') {
        model = 'nvidia/llama-3.1-nemotron-70b-instruct';
        systemPrompt = `You are an expert math visualizer. The user wants to visualize a concept. Return ONLY valid JSON. Keys: 'text' (a brief 1-2 sentence explanation), 'svg' (a string containing valid SVG inner tags like <circle>, <line>, <path> with strokes and fills, fitting a 200x200 viewBox).`;
        temp = 0.2; max_tokens = 1000;
    }

    try {
        const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: model,
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
                temperature: temp, max_tokens: max_tokens
            })
        });
        const data = await response.json();
        if (!response.ok) return res.status(400).json({ error: data.error?.message || 'API Error' });

        let text = data.choices[0].message.content;
        text = text.replace(/```json/g, '').replace(/```/g, '').trim();
        try { res.status(200).json(JSON.parse(text)); } catch { res.status(200).json({ text: text }); }
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
