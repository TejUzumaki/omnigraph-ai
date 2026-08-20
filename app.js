// --- State ---
let chats = JSON.parse(localStorage.getItem('chats') || '[]');
let currentChatId = null;
let recognition = null;

// --- Startup Ping ---
async function checkApiStatus() {
    const dot = document.getElementById('status-dot');
    const text = document.getElementById('status-text');
    try {
        const res = await fetch('/api/ping');
        const data = await res.json();
        if (data.status === 'connected') {
            dot.className = 'status-dot online';
            text.innerText = 'ONLINE';
            text.style.color = 'var(--accent-success)';
        } else {
            dot.className = 'status-dot error';
            text.innerText = 'ERROR';
            text.style.color = 'var(--accent-danger)';
        }
    } catch (e) {
        dot.className = 'status-dot error';
        text.innerText = 'OFFLINE';
    }
}
checkApiStatus();

// --- Sidebar & Chat History ---
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('hidden'); }
function renderHistory() {
    const historyDiv = document.getElementById('chat-history');
    historyDiv.innerHTML = '';
    chats.forEach(chat => {
        const item = document.createElement('div');
        item.className = 'history-item cuts' + (chat.id === currentChatId ? ' active' : '');
        item.innerText = chat.title;
        item.onclick = () => loadChat(chat.id);
        historyDiv.appendChild(item);
    });
}
function startNewChat() {
    const newChat = { id: Date.now(), title: 'New Session', messages: [] };
    chats.unshift(newChat);
    currentChatId = newChat.id;
    document.getElementById('chat-log').innerHTML = '';
    saveChats();
    renderHistory();
}
function loadChat(id) {
    currentChatId = id;
    const chat = chats.find(c => c.id === id);
    const log = document.getElementById('chat-log');
    log.innerHTML = '';
    chat.messages.forEach(msg => renderMessage(msg.sender, msg.text, msg.svg));
    renderHistory();
}
function saveChats() { localStorage.setItem('chats', JSON.stringify(chats)); }

// --- Rendering Messages ---
function renderMessage(sender, text, svgString) {
    const log = document.getElementById('chat-log');
    const msgDiv = document.createElement('div');
    msgDiv.className = `msg-container cut ${sender}`;
    
    let content = `<div>${text}</div>`;
    if (svgString) {
        content += `<div class="math-board cuts"><svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">${svgString}</svg></div>`;
    }
    msgDiv.innerHTML = content;
    log.appendChild(msgDiv);
    log.scrollTop = log.scrollHeight;

    if (!currentChatId) startNewChat();
    const chat = chats.find(c => c.id === currentChatId);
    if (chat) {
        chat.messages.push({ sender, text, svgString });
        if (sender === 'user' && chat.messages.length === 1) {
            chat.title = text.substring(0, 20) + '...';
            renderHistory();
        }
        saveChats();
    }
}

// --- Mic & Audio Visualizer ---
const visualizer = document.getElementById('audio-visualizer');
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.continuous = false; recognition.interimResults = false;
    recognition.onresult = (e) => { document.getElementById('prompt').value = e.results[0][0].transcript; };
    recognition.onend = () => { document.getElementById('mic-btn').classList.remove('btn-primary'); visualizer.classList.remove('active'); };
}
function toggleMic() {
    if (!recognition) return alert("Mic not supported.");
    const micBtn = document.getElementById('mic-btn');
    if (micBtn.classList.contains('btn-primary')) recognition.stop();
    else { recognition.start(); micBtn.classList.add('btn-primary'); visualizer.classList.add('active'); }
}

// --- AI Request & Speech Synthesis ---
async function sendPrompt() {
    const input = document.getElementById('prompt');
    let prompt = input.value.trim();
    if (!prompt) return;
    if (!currentChatId) startNewChat();
    
    renderMessage('user', prompt, null);
    input.value = '';
    
    // Route to math model if asking to visualize/show/draw/graph
    const isMath = /(visualize|show|draw|graph|how to form|equation)/i.test(prompt);
    
    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ prompt, type: isMath ? 'math' : 'chat' })
        });
        const data = await res.json();
        if (data.error) return renderMessage('ai', `Error: ${data.error}`, null);
        
        renderMessage('ai', data.text || "No text response", data.svg || null);
        
        // AI Voice Output
        if (data.text) {
            const utterance = new SpeechSynthesisUtterance(data.text);
            visualizer.classList.add('active');
            utterance.onend = () => visualizer.classList.remove('active');
            speechSynthesis.speak(utterance);
        }
    } catch (e) { renderMessage('ai', 'Failed to reach AI.', null); }
}
