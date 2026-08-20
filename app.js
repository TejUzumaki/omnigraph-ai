let chats = JSON.parse(localStorage.getItem('chats') || '[]');
let currentChatId = null;
let recognition = null;
let audioContext, analyser, dataArray, visualizerFrame;

function init() {
    if (localStorage.getItem('tutorialSeen') === 'true') document.getElementById('tutorial').style.display = 'none';
    checkApiStatus();
    renderHistory();
}
init();

function finishTutorial() {
    document.getElementById('tutorial').style.display = 'none';
    localStorage.setItem('tutorialSeen', 'true');
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

// --- Sidebar & Chat Management ---
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
        item.innerHTML = `
            <span class="history-title">${chat.title}</span>
            <div class="history-actions">
                <button class="icon-btn" onclick="event.stopPropagation(); renameChat(${chat.id})">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                </button>
                <button class="icon-btn" onclick="event.stopPropagation(); deleteChat(${chat.id})">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>
        `;
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
function renameChat(id) {
    const chat = chats.find(c => c.id === id);
    const newName = prompt('Enter new chat name:', chat.title);
    if (newName) { chat.title = newName; saveChats(); renderHistory(); }
}
function deleteChat(id) {
    if (!confirm('Delete this chat?')) return;
    chats = chats.filter(c => c.id !== id);
    if (currentChatId === id) {
        currentChatId = null;
        document.getElementById('chat-log').innerHTML = '';
    }
    saveChats(); renderHistory();
}
function saveChats() { localStorage.setItem('chats', JSON.stringify(chats)); }

// --- Rendering & Typing Indicator ---
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

function showTyping() {
    const log = document.getElementById('chat-log');
    const msgDiv = document.createElement('div');
    msgDiv.className = 'msg-container cut ai';
    msgDiv.id = 'typing-bubble';
    msgDiv.innerHTML = `<div class="typing-indicator"><span></span><span></span><span></span></div>`;
    log.appendChild(msgDiv);
    log.scrollTop = log.scrollHeight;
}
function removeTyping() {
    const typing = document.getElementById('typing-bubble');
    if (typing) typing.remove();
}

function copyError(text) {
    navigator.clipboard.writeText(text).then(() => alert("Error copied to clipboard!"));
}

// --- Dynamic Fluid Mic ---
const visualizer = document.getElementById('audio-visualizer');
const bars = document.querySelectorAll('.audio-visualizer .bar');
const fluidOverlay = document.getElementById('fluid-overlay');
const transcribedText = document.getElementById('transcribed-text');

if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.continuous = false; 
    recognition.interimResults = true; // Live transcription
    recognition.onresult = (e) => {
        let txt = '';
        for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
        transcribedText.innerText = txt;
    };
    recognition.onend = () => {
        const finalText = transcribedText.innerText;
        stopVisualizer();
        fluidOverlay.classList.add('hidden');
        document.getElementById('mic-btn').classList.remove('btn-primary');
        if (finalText && finalText !== 'Listening...') {
            document.getElementById('prompt').value = finalText;
            sendPrompt(); // Auto-send when done speaking
        }
    };
    recognition.onerror = () => {
        stopVisualizer();
        fluidOverlay.classList.add('hidden');
    };
}

async function toggleMic() {
    if (!recognition) return alert("Mic not supported in this browser.");
    const micBtn = document.getElementById('mic-btn');
    if (micBtn.classList.contains('btn-primary')) {
        recognition.stop();
    } else {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            audioContext = new (window.AudioContext || window.webkitAudioContext)();
            analyser = audioContext.createAnalyser();
            analyser.fftSize = 32;
            const micSource = audioContext.createMediaStreamSource(stream);
            micSource.connect(analyser);
            dataArray = new Uint8Array(analyser.frequencyBinCount);
            
            micBtn.classList.add('btn-primary');
            visualizer.classList.add('active');
            fluidOverlay.classList.remove('hidden');
            transcribedText.innerText = 'Listening...';
            
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
    
    let sum = 0;
    for(let i=0; i<dataArray.length; i++) sum += dataArray[i];
    let avg = sum / dataArray.length;
    
    // Drive the bar visualizer
    bars.forEach((bar, i) => {
        const value = dataArray[i % dataArray.length] || 0;
        const height = (value / 255) * 35 + 5;
        bar.setAttribute('height', height);
    });
    
    // Drive the fluid turbulence based on voice volume
    const turbulence = document.getElementById('fluid-turbulence');
    const freq = 0.008 + (avg / 255) * 0.03;
    turbulence.setAttribute('baseFrequency', freq);
    
    visualizerFrame = requestAnimationFrame(updateVisualizer);
}

function stopVisualizer() {
    if (audioContext) { audioContext.close(); audioContext = null; }
    if (visualizerFrame) cancelAnimationFrame(visualizerFrame);
    visualizer.classList.remove('active');
    bars.forEach(bar => bar.setAttribute('height', 10));
    document.getElementById('fluid-turbulence').setAttribute('baseFrequency', 0.008);
}

// --- AI Request ---
async function sendPrompt() {
    const input = document.getElementById('prompt');
    let prompt = input.value.trim();
    if (!prompt) return;
    if (!currentChatId) startNewChat();
    
    renderMessage('user', prompt, null);
    input.value = '';
    
    showTyping(); // Show typing indicator
    
    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ prompt })
        });
        const data = await res.json();
        
        removeTyping(); // Remove typing indicator
        
        if (data.error) {
            renderMessage('ai', data.error, null, true);
        } else {
            renderMessage('ai', data.text || "No text response", data.svg || null, false);
            if (data.text) {
                const utterance = new SpeechSynthesisUtterance(data.text);
                visualizer.classList.add('active');
                utterance.onend = () => stopVisualizer();
                speechSynthesis.speak(utterance);
            }
        }
    } catch (e) { 
        removeTyping();
        renderMessage('ai', `Network Failure: ${e.message}`, null, true); 
    }
}
