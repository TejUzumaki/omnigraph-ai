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

    if (lastPrompts[ip] && lastPrompts[ip].text === prompt && (now - lastPrompts[ip].time) < 5000) {
        return res.status(429).json({ error: 'Duplicate request blocked.' });
    }
    lastPrompts[ip] = { text: prompt, time: now };

    // Strict Prompt: SVG FIRST, then brief text. No long theories.
    const systemPrompt = `You are OmniGraph AI, an expert math visualizer. 
    If the user asks to explain or show math (parabola, circle, etc.), your FIRST output must be a markdown code block labeled "svg" containing valid SVG inner tags fitting a 200x200 viewBox. 
    AFTER the SVG block, provide a brief 1-2 sentence explanation. Do not give long theories.`;

    try {
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache, no-transform');
        res.setHeader('Connection', 'keep-alive');
        res.setHeader('X-Accel-Buffering', 'no'); // Prevent Vercel proxy buffering

        const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: 'meta/llama-3.1-70b-instruct',
                messages: [{ role: 'system', content: systemPrompt }, { role: 'user', content: prompt }],
                temperature: 0.2,
                max_tokens: 600,
                stream: true
            })
        });

        if (!response.ok) {
            const errData = await response.json();
            return res.status(response.status).json({ error: `Nvidia API Error: ${errData.error?.message}` });
        }

        const reader = response.body.getReader();
        const decoder = new TextDecoder();

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            const chunk = decoder.decode(value);
            const lines = chunk.split('\n');
            for (let line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.substring(6).trim();
                    if (jsonStr === '[DONE]') continue;
                    try {
                        const data = JSON.parse(jsonStr);
                        const token = data.choices[0]?.delta?.content || '';
                        if (token) {
                            res.write(`data: ${JSON.stringify({ token })}\n\n`);
                        }
                    } catch (e) { /* ignore partial */ }
                }
            }
        }
        res.write('data: [DONE]\n\n');
        res.end();
    } catch (error) {
        res.status(500).json({ error: `Network or Server Error: ${error.message}` });
    }
}
