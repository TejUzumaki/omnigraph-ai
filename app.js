let chats = JSON.parse(localStorage.getItem('chats') || '[]');
let currentChatId = null;
let recognition = null;
let audioContext, analyser, dataArray, visualizerFrame;
let lastSentPrompt = "";
let settings = JSON.parse(localStorage.getItem('settings') || '{"voiceEnabled":true,"voiceURI":""}');

function init() {
    if (localStorage.getItem('tutorialSeen') === 'true') document.getElementById('tutorial').style.display = 'none';
    checkApiStatus(); renderHistory(); loadSettings();
    setInterval(toggleBgPattern, 10000);
}
init();

function toggleBgPattern() { document.querySelector('.app').classList.toggle('dots-active'); }

document.addEventListener('visibilitychange', () => {
    if (document.hidden) { speechSynthesis.cancel(); if (recognition) recognition.stop(); }
});

function loadSettings() { document.getElementById('voice-toggle').checked = settings.voiceEnabled; populateVoices(); }
function populateVoices() {
    const voices = speechSynthesis.getVoices(); const select = document.getElementById('voice-select');
    select.innerHTML = ''; voices.forEach(v => {
        const opt = document.createElement('option'); opt.value = v.uri; opt.innerText = v.name;
        if (v.uri === settings.voiceURI) opt.selected = true; select.appendChild(opt);
    });
}
if (typeof speechSynthesis !== 'undefined') speechSynthesis.onvoiceschanged = populateVoices;
function openSettings() { document.getElementById('settings-modal').classList.remove('hidden'); }
function closeSettings() {
    settings.voiceEnabled = document.getElementById('voice-toggle').checked;
    settings.voiceURI = document.getElementById('voice-select').value;
    localStorage.setItem('settings', JSON.stringify(settings));
    document.getElementById('settings-modal').classList.add('hidden');
}

function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); document.getElementById('sidebar-backdrop').classList.toggle('active'); }
function renderHistory() {
    const historyDiv = document.getElementById('chat-history'); historyDiv.innerHTML = '';
    chats.forEach(chat => {
        const item = document.createElement('div');
        item.className = 'history-item cuts' + (chat.id === currentChatId ? ' active' : '');
        item.innerHTML = `<span class="history-title" onclick="loadChat(${chat.id})">${chat.title}</span>
            <div class="history-actions">
                <button class="icon-btn" onclick="event.stopPropagation(); openModal('rename', ${chat.id})"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button>
                <button class="icon-btn" onclick="event.stopPropagation(); openModal('delete', ${chat.id})"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button>
            </div>`;
        historyDiv.appendChild(item);
    });
}
function startNewChat() { const n = { id: Date.now(), title: 'New Session', messages: [] }; chats.unshift(n); currentChatId = n.id; document.getElementById('chat-log').innerHTML = ''; saveChats(); renderHistory(); toggleSidebar(); }
function loadChat(id) { currentChatId = id; const c = chats.find(x => x.id === id); const log = document.getElementById('chat-log'); log.innerHTML = ''; c.messages.forEach(m => renderMessage(m.sender, m.text, m.svg, m.isError)); renderHistory(); toggleSidebar(); }
function openModal(action, id) {
    const modal = document.getElementById('custom-modal'), title = document.getElementById('modal-title'), input = document.getElementById('modal-input'), btn = document.getElementById('modal-confirm-btn');
    if (action === 'rename') { title.innerText = 'Rename Chat'; const c = chats.find(x => x.id === id); input.value = c.title; input.style.display = 'block'; btn.onclick = () => { if (input.value.trim()) { chats.find(x => x.id === id).title = input.value.trim(); saveChats(); renderHistory(); } closeModal(); }; }
    else { title.innerText = 'Delete Chat?'; input.style.display = 'none'; btn.onclick = () => { chats = chats.filter(x => x.id !== id); if (currentChatId === id) { currentChatId = null; document.getElementById('chat-log').innerHTML = ''; } saveChats(); renderHistory(); closeModal(); }; }
    modal.classList.remove('hidden');
}
function closeModal() { document.getElementById('custom-modal').classList.add('hidden'); }
function saveChats() { localStorage.setItem('chats', JSON.stringify(chats)); }

function renderMessage(sender, text, svgString, isError = false) {
    const log = document.getElementById('chat-log'); const msgDiv = document.createElement('div');
    msgDiv.className = `msg-container cut ${sender} ${isError ? 'error-msg' : ''}`;
    let content = `<div class="text-content">${text}</div>`;
    if (isError) content += `<button class="btn btn-ghost cutxs copy-btn" onclick='copyError(${JSON.stringify(text)})'>Copy</button>`;
    else if (svgString) content += `<div class="whiteboard cuts"><svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">${svgString}</svg></div>`;
    msgDiv.innerHTML = content; log.appendChild(msgDiv); log.scrollTop = log.scrollHeight;
    if (!currentChatId) startNewChat(); const chat = chats.find(c => c.id === currentChatId);
    if (chat) { chat.messages.push({ sender, text, svgString, isError }); if (sender === 'user' && chat.messages.length === 1) { chat.title = text.substring(0, 20) + '...'; renderHistory(); } saveChats(); }
}
function showTyping() { const log = document.getElementById('chat-log'); const msgDiv = document.createElement('div'); msgDiv.className = 'msg-container cut ai'; msgDiv.id = 'typing-bubble'; msgDiv.innerHTML = `<div class="typing-indicator"><div class="resonance-loader"><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>`; log.appendChild(msgDiv); log.scrollTop = log.scrollHeight; }
function removeTyping() { const t = document.getElementById('typing-bubble'); if (t) t.remove(); }
function copyError(text) { navigator.clipboard.writeText(text).then(() => alert("Copied!")); }

// --- Bulletproof Mic Initialization ---
// We instantiate it inside the click to ensure the browser allows it securely
async function toggleMic() {
    const micBtn = document.getElementById('mic-btn');
    const fluidOverlay = document.getElementById('fluid-overlay');
    const transcribedText = document.getElementById('transcribed-text');
    
    // If already listening, stop
    if (micBtn.classList.contains('btn-primary')) {
        if (recognition) recognition.stop();
        stopVisualizer();
        return;
    }

    // Check support securely
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) {
        alert("Speech Recognition is not supported in this browser. Please use Chrome on Android or Safari on iOS.");
        return;
    }

    // Initialize if not already
    if (!recognition) {
        recognition = new SR();
        recognition.continuous = false;
        recognition.interimResults = true;
        recognition.onresult = (e) => {
            let txt = '';
            for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript;
            transcribedText.innerText = txt;
        };
        recognition.onend = () => {
            const finalText = transcribedText.innerText;
            stopVisualizer();
            fluidOverlay.classList.add('hidden');
            micBtn.classList.remove('btn-primary');
            if (finalText && finalText !== 'Listening...') {
                document.getElementById('prompt').value = finalText;
                sendPrompt();
            }
        };
        recognition.onerror = (e) => {
            console.error("Speech Recognition Error:", e.error);
            stopVisualizer();
            fluidOverlay.classList.add('hidden');
            micBtn.classList.remove('btn-primary');
            if (e.error === 'not-allowed') {
                alert("Microphone permission blocked. Please allow it in your browser settings.");
            }
        };
    }

    try {
        // Ask for mic permission visually
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || window.webkitAudioContext());
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 32;
        const micSource = audioContext.createMediaStreamSource(stream);
        micSource.connect(analyser);
        dataArray = new Uint8Array(analyser.frequencyBinCount);
        
        micBtn.classList.add('btn-primary');
        fluidOverlay.classList.remove('hidden');
        transcribedText.innerText = 'Listening...';
        
        updateVisualizer();
        recognition.start();
    } catch (e) {
        console.error("Mic Access Error:", e);
        alert("Microphone permission denied or blocked. Please ensure you are on HTTPS and allow mic access.");
    }
}

function updateVisualizer() {
    if (document.getElementById('fluid-overlay').classList.contains('hidden')) return;
    if (!analyser) return;
    analyser.getByteFrequencyData(dataArray);
    let sum = 0; for(let i=0; i<dataArray.length; i++) sum += dataArray[i];
    let avg = sum / dataArray.length;
    const scale = 1.0 + (avg / 255) * 0.15;
    const opacity = 0.15 + (avg / 255) * 0.35;
    document.getElementById('vignette-fluid').style.transform = `scale(${scale})`;
    document.getElementById('vignette-fluid').style.opacity = opacity;
    visualizerFrame = requestAnimationFrame(updateVisualizer);
}
function stopVisualizer() {
    if (audioContext) { audioContext.close(); audioContext = null; }
    if (visualizerFrame) cancelAnimationFrame(visualizerFrame);
    document.getElementById('mic-btn').classList.remove('btn-primary');
    document.getElementById('fluid-overlay').classList.add('hidden');
}

async function sendPrompt() {
    const input = document.getElementById('prompt'); let prompt = input.value.trim();
    if (!prompt) return; if (prompt === lastSentPrompt) return; lastSentPrompt = prompt;
    if (!currentChatId) startNewChat();
    renderMessage('user', prompt, null); input.value = ''; showTyping();
    
    try {
        const res = await fetch('/api/chat', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ prompt }) });
        removeTyping();
        const log = document.getElementById('chat-log');
        const msgDiv = document.createElement('div'); msgDiv.className = 'msg-container cut ai'; msgDiv.innerHTML = '<div class="text-content"></div>';
        log.appendChild(msgDiv); log.scrollTop = log.scrollHeight;
        
        if (!res.ok) { const errData = await res.json(); msgDiv.classList.add('error-msg'); msgDiv.querySelector('.text-content').innerText = errData.error || "Unknown Error"; return; }
        
        const reader = res.body.getReader(); const decoder = new TextDecoder();
        let fullText = ""; let svgText = ""; let isSvg = false;
        
        while (true) {
            const { done, value } = await reader.read(); if (done) break;
            const chunk = decoder.decode(value); const lines = chunk.split('\n');
            for (let line of lines) {
                if (line.startsWith('data: ') && !line.includes('[DONE]')) {
                    try {
                        const data = JSON.parse(line.substring(6)); const token = data.token || "";
                        if (token.includes('```svg')) { isSvg = true; continue; }
                        if (token.includes('```')) { isSvg = false; continue; }
                        if (isSvg) { svgText += token; } else { fullText += token; msgDiv.querySelector('.text-content').innerHTML += token; }
                        
                        if (isSvg && !msgDiv.querySelector('.whiteboard')) {
                            const wb = document.createElement('div'); wb.className = 'whiteboard cuts'; wb.innerHTML = '<div class="typing-indicator"><div class="resonance-loader"><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>';
                            msgDiv.appendChild(wb);
                        }
                        if (isSvg && svgText) {
                            msgDiv.querySelector('.whiteboard').innerHTML = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">${svgText}</svg>`;
                        }
                        log.scrollTop = log.scrollHeight;
                    } catch (e) {}
                }
            }
        }
        
        const chat = chats.find(c => c.id === currentChatId);
        if (chat) { chat.messages.push({ sender: 'ai', text: fullText, svg: svgText, isError: false }); saveChats(); }
        
        if (settings.voiceEnabled && fullText && !document.hidden) {
            const utterance = new SpeechSynthesisUtterance(fullText);
            if (settings.voiceURI) { const v = speechSynthesis.getVoices().find(v => v.uri === settings.voiceURI); if (v) utterance.voice = v; }
            speechSynthesis.speak(utterance);
        }
    } catch (e) { removeTyping(); renderMessage('ai', `Network Failure: ${e.message}`, null, true); }
}
