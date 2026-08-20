export default async function handler(req, res) {
    const apiKey = process.env.AI_API_KEY;
    if (!apiKey || !apiKey.startsWith('nvapi-')) {
        return res.status(200).json({ status: 'error', message: 'Invalid or missing Nvidia API key.' });
    }
    try {
        const response = await fetch('https://integrate.api.nvidia.com/v1/chat/completions', {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ model: 'meta/llama-3.1-8b-instruct', messages: [{role: 'user', content: 'ping'}], max_tokens: 1 })
        });
        if (response.ok) res.status(200).json({ status: 'connected' });
        else res.status(200).json({ status: 'error', message: 'API rejected the key.' });
    } catch (e) {
        res.status(200).json({ status: 'error', message: e.message });
    }
}
