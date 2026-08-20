let chats = JSON.parse(localStorage.getItem('chats') || '[]');
let currentChatId = null;
let recognition = null;
let audioContext, analyser, microphone, dataArray, visualizerFrame;

// --- Startup ---
function init() {
    if (localStorage.getItem('tutorialSeen') === 'true') {
        document.getElementById('tutorial').style.display = 'none';
    }
    checkApiStatus();
    renderHistory();
}
init();

function finishTutorial() {
    document.getElementById('tutorial').style.display = 'none';
    localStorage.setItem('tutorialSeen', 'true');
    // Send initial message to kick off the chat
    document.getElementById('prompt').value = "Hi! How can you help me visualize math today?";
    sendPrompt();
}

async function checkApiStatus() {
    const dot = document.getElementById('status-dot');
    try {
        const res = await fetch('/api/ping');
        const data = await res.json();
        if (data.status === 'connected') dot.className = 'status-dot online';
        else dot.className = 'status-dot error';
    } catch (e) { dot.className = 'status-dot error'; }
}

// --- Sidebar ---
function toggleSidebar() {
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-backdrop').classList.toggle('active');
}
function renderHistory() {
    const historyDiv = document.getElementById('chat-history');
    historyDiv.innerHTML = '';
    chats.forEach(chat => {
        const item = document.createElement('div');
        item.className = 'history-item cuts' + (chat.id === currentChatId ? ' active' : '');
        item.innerText = chat.title;
        item.onclick = () => { loadChat(chat.id); toggleSidebar(); };
        historyDiv.appendChild(item);
    });
}
function startNewChat() {
    const newChat = { id: Date.now(), title: 'New Session', messages: [] };
    chats.unshift(newChat);
    currentChatId = newChat.id;
    document.getElementById('chat-log').innerHTML = '';
    saveChats(); renderHistory();
    toggleSidebar();
}
function loadChat(id) {
    currentChatId = id;
    const chat = chats.find(c => c.id === id);
    const log = document.getElementById('chat-log');
    log.innerHTML = '';
    chat.messages.forEach(msg => renderMessage(msg.sender, msg.text, msg.svg, msg.isError));
    renderHistory();
}
function saveChats() { localStorage.setItem('chats', JSON.stringify(chats)); }

// --- Rendering & Copy Error ---
function renderMessage(sender, text, svgString, isError = false) {
    const log = document.getElementById('chat-log');
    const msgDiv = document.createElement('div');
    msgDiv.className = `msg-container cut ${sender} ${isError ? 'error-msg' : ''}`;
    
    let content = `<div>${text}</div>`;
    if (isError) {
        content += `<button class="btn btn-ghost cutxs copy-btn" onclick='copyError(${JSON.stringify(text)})'>Copy Error</button>`;
    } else if (svgString) {
        content += `<div class="math-board cuts"><svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">${svgString}</svg></div>`;
    }
    msgDiv.innerHTML = content;
    log.appendChild(msgDiv);
    log.scrollTop = log.scrollHeight;

    if (!currentChatId) startNewChat();
    const chat = chats.find(c => c.id === currentChatId);
    if (chat) {
        chat.messages.push({ sender, text, svgString, isError });
        if (sender === 'user' && chat.messages.length === 1) {
            chat.title = text.substring(0, 20) + '...';
            renderHistory();
        }
        saveChats();
    }
}

function copyError(text) {
    navigator.clipboard.writeText(text).then(() => {
        alert("Error copied to clipboard!");
    });
}

// --- Dynamic Web Audio API Visualizer ---
const visualizer = document.getElementById('audio-visualizer');
const bars = document.querySelectorAll('.audio-visualizer .bar');

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.continuous = false; recognition.interimResults = false;
    recognition.onresult = (e) => { document.getElementById('prompt').value = e.results[0][0].transcript; };
    recognition.onend = () => { stopVisualizer(); document.getElementById('mic-btn').classList.remove('btn-primary'); };
    recognition.onerror = () => { stopVisualizer(); document.getElementById('mic-btn').classList.remove('btn-primary'); };
}

async function toggleMic() {
    if (!recognition) return alert("Mic not supported in this browser.");
    const micBtn = document.getElementById('mic-btn');
    if (micBtn.classList.contains('btn-primary')) {
        recognition.stop();
    } else {
        try {
            // Start real audio analysis
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 32;
            const micSource = audioContext.createMediaStreamSource(stream);
            micSource.connect(analyser);
            dataArray = new Uint8Array(analyser.frequencyBinCount);
            
            micBtn.classList.add('btn-primary');
            visualizer.classList.add('active');
            updateVisualizer();
            recognition.start();
        } catch (e) {
            alert("Microphone permission denied.");
        }
    }
}

function updateVisualizer() {
    if (!visualizer.classList.contains('active')) return;
    analyser.getByteFrequencyData(dataArray);
    bars.forEach((bar, i) => {
        // Map data to bars (reverse for left side mirroring)
        const value = dataArray[i % dataArray.length] || 0;
        const height = (value / 255) * 35 + 5; // scale height
        bar.setAttribute('height', height);
    });
    visualizerFrame = requestAnimationFrame(updateVisualizer);
}

function stopVisualizer() {
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    if (visualizerFrame) cancelAnimationFrame(visualizerFrame);
    visualizer.classList.remove('active');
    // Reset bars
    bars.forEach(bar => bar.setAttribute('height', 10));
}

// --- AI Request ---
async function sendPrompt() {
    const input = document.getElementById('prompt');
    let prompt = input.value.trim();
    if (!prompt) return;
    if (!currentChatId) startNewChat();
    
    renderMessage('user', prompt, null);
    input.value = '';
    
    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ prompt })
        });
        const data = await res.json();
        
        if (data.error) {
            renderMessage('ai', data.error, null, true);
        } else {
            renderMessage('ai', data.text || "No text response", data.svg || null, false);
            // AI Voice Output
            if (data.text) {
                const utterance = new SpeechSynthesisUtterance(data.text);
                visualizer.classList.add('active');
                utterance.onend = () => stopVisualizer();
                speechSynthesis.speak(utterance);
            }
        }
    } catch (e) { 
        renderMessage('ai', `Network Failure: ${e.message}`, null, true); 
    }
}
