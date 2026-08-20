let chats = JSON.parse(localStorage.getItem('chats') || '[]');
let currentChatId = null;
let recognition = null;
let audioContext, analyser, dataArray, visualizerFrame;
let lastSentPrompt = "";
let settings = JSON.parse(localStorage.getItem('settings') || '{"voiceEnabled":true,"voiceURI":""}');
let speechStarted = false;

function init() {
    if (localStorage.getItem('tutorialSeen') === 'true') document.getElementById('landing-page').style.display = 'none';
    checkApiStatus(); renderHistory(); loadSettings();
    setInterval(toggleBgPattern, 10000);
}
init();

function haptic() { if (navigator.vibrate) navigator.vibrate(10); }
function toggleBgPattern() { document.querySelector('.app').classList.toggle('dots-active'); }
document.addEventListener('visibilitychange', () => { if (document.hidden) { stopSpeech(); if (recognition) recognition.stop(); } });

// --- Settings & UI ---
function loadSettings() { document.getElementById('voice-toggle').checked = settings.voiceEnabled; populateVoices(); }
function populateVoices() { const voices = speechSynthesis.getVoices(); const select = document.getElementById('voice-select'); select.innerHTML = ''; voices.forEach(v => { const opt = document.createElement('option'); opt.value = v.uri; opt.innerText = v.name; if (v.uri === settings.voiceURI) opt.selected = true; select.appendChild(opt); }); }
if (typeof speechSynthesis !== 'undefined') speechSynthesis.onvoiceschanged = populateVoices;
function openSettings() { document.getElementById('settings-modal').classList.remove('hidden'); }
function closeSettings() { settings.voiceEnabled = document.getElementById('voice-toggle').checked; settings.voiceURI = document.getElementById('voice-select').value; localStorage.setItem('settings', JSON.stringify(settings)); document.getElementById('settings-modal').classList.add('hidden'); }
function toggleSidebar() { document.getElementById('sidebar').classList.toggle('open'); document.getElementById('sidebar-backdrop').classList.toggle('active'); }
function renderHistory() { const h = document.getElementById('chat-history'); h.innerHTML = ''; chats.forEach(c => { const i = document.createElement('div'); i.className = 'history-item cuts' + (c.id === currentChatId ? ' active' : ''); i.innerHTML = `<span class="history-title" onclick="loadChat(${c.id})">${c.title}</span><div class="history-actions"><button class="icon-btn" onclick="event.stopPropagation(); openModal('rename', ${c.id})"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg></button><button class="icon-btn" onclick="event.stopPropagation(); openModal('delete', ${c.id})"><svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg></button></div>`; h.appendChild(i); }); }
function startNewChat() { const n = { id: Date.now(), title: 'New Session', messages: [] }; chats.unshift(n); currentChatId = n.id; document.getElementById('chat-log').innerHTML = ''; saveChats(); renderHistory(); toggleSidebar(); }
function loadChat(id) { currentChatId = id; const c = chats.find(x => x.id === id); const log = document.getElementById('chat-log'); log.innerHTML = ''; c.messages.forEach(m => renderMessage(m.sender, m.text, m.svg, m.isError)); renderHistory(); toggleSidebar(); }
function openModal(action, id) { const m = document.getElementById('custom-modal'), t = document.getElementById('modal-title'), inp = document.getElementById('modal-input'), b = document.getElementById('modal-confirm-btn'); if (action === 'rename') { t.innerText = 'Rename Chat'; const c = chats.find(x => x.id === id); inp.value = c.title; inp.style.display = 'block'; b.onclick = () => { if (inp.value.trim()) { chats.find(x => x.id === id).title = inp.value.trim(); saveChats(); renderHistory(); } closeModal(); }; } else { t.innerText = 'Delete Chat?'; inp.style.display = 'none'; b.onclick = () => { chats = chats.filter(x => x.id !== id); if (currentChatId === id) { currentChatId = null; document.getElementById('chat-log').innerHTML = ''; } saveChats(); renderHistory(); closeModal(); }; } m.classList.remove('hidden'); }
function closeModal() { document.getElementById('custom-modal').classList.add('hidden'); }
function saveChats() { localStorage.setItem('chats', JSON.stringify(chats)); }
function finishTutorial() { document.getElementById('landing-page').style.display = 'none'; localStorage.setItem('tutorialSeen', 'true'); haptic(); }

// --- Audio Island Logic ---
function showAudioIsland() { document.getElementById('audio-island').classList.remove('hidden'); }
function hideAudioIsland() { document.getElementById('audio-island').classList.add('hidden'); }
function togglePauseSpeech() {
    haptic();
    const icon = document.getElementById('play-pause-icon');
    if (speechSynthesis.paused) {
        speechSynthesis.resume();
        icon.innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
    } else {
        speechSynthesis.pause();
        icon.innerHTML = '<polygon points="5 3 19 12 5 21 5 3"/>';
    }
}
function stopSpeech() {
    haptic();
    speechSynthesis.cancel();
    hideAudioIsland();
    document.getElementById('play-pause-icon').innerHTML = '<rect x="6" y="4" width="4" height="16"/><rect x="14" y="4" width="4" height="16"/>';
}

// --- Rendering ---
function renderMessage(sender, text, svgString, isError = false) {
    const log = document.getElementById('chat-log'); const msgDiv = document.createElement('div');
    msgDiv.className = `msg-container cut ${sender} ${isError ? 'error-msg' : ''}`;
    let content = ``;
    if (svgString) content += `<div class="whiteboard cuts"><svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">${svgString}</svg></div>`;
    content += `<div class="text-content">${text}</div>`;
    if (isError) content += `<button class="btn btn-ghost cutxs copy-btn" onclick='copyError(${JSON.stringify(text)})'>Copy</button>`;
    msgDiv.innerHTML = content; log.appendChild(msgDiv); log.scrollTop = log.scrollHeight;
    if (!currentChatId) startNewChat(); const chat = chats.find(c => c.id === currentChatId);
    if (chat) { chat.messages.push({ sender, text, svgString, isError }); if (sender === 'user' && chat.messages.length === 1) { chat.title = text.substring(0, 20) + '...'; renderHistory(); } saveChats(); }
}
function showTyping() { const log = document.getElementById('chat-log'); const msgDiv = document.createElement('div'); msgDiv.className = 'msg-container cut ai'; msgDiv.id = 'typing-bubble'; msgDiv.innerHTML = `<div class="typing-indicator"><div class="resonance-loader"><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>`; log.appendChild(msgDiv); log.scrollTop = log.scrollHeight; }
function removeTyping() { const t = document.getElementById('typing-bubble'); if (t) t.remove(); }
function copyError(text) { navigator.clipboard.writeText(text).then(() => alert("Copied!")); }

// --- Mic Logic ---
async function toggleMic() {
    const micBtn = document.getElementById('mic-btn'); const fluidOverlay = document.getElementById('fluid-overlay'); const transcribedText = document.getElementById('transcribed-text');
    if (micBtn.classList.contains('btn-primary')) { if (recognition) recognition.stop(); stopVisualizer(); return; }
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Speech Recognition not supported. Use Chrome on Android."); return; }
    if (!recognition) { recognition = new SR(); recognition.continuous = false; recognition.interimResults = true; recognition.onresult = (e) => { let txt = ''; for (let i = 0; i < e.results.length; i++) txt += e.results[i][0].transcript; transcribedText.innerText = txt; }; recognition.onend = () => { const finalText = transcribedText.innerText; stopVisualizer(); fluidOverlay.classList.add('hidden'); micBtn.classList.remove('btn-primary'); if (finalText && finalText !== 'Listening...') { document.getElementById('prompt').value = finalText; sendPrompt(); } }; recognition.onerror = (e) => { stopVisualizer(); fluidOverlay.classList.add('hidden'); micBtn.classList.remove('btn-primary'); }; }
    try {
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        audioContext = new (window.AudioContext || window.webkitAudioContext)(); analyser = audioContext.createAnalyser(); analyser.fftSize = 32;
        const micSource = audioContext.createMediaStreamSource(stream); micSource.connect(analyser); dataArray = new Uint8Array(analyser.frequencyBinCount);
        micBtn.classList.add('btn-primary'); fluidOverlay.classList.remove('hidden'); transcribedText.innerText = 'Listening...';
        updateVisualizer(); recognition.start();
    } catch (e) { alert("Microphone permission denied."); }
}
function updateVisualizer() { if (document.getElementById('fluid-overlay').classList.contains('hidden')) return; if (!analyser) return; analyser.getByteFrequencyData(dataArray); let sum = 0; for(let i=0; i<dataArray.length; i++) sum += dataArray[i]; let avg = sum / dataArray.length; const scale = 1.0 + (avg / 255) * 0.15; const opacity = 0.15 + (avg / 255) * 0.35; document.getElementById('vignette-fluid').style.transform = `scale(${scale})`; document.getElementById('vignette-fluid').style.opacity = opacity; visualizerFrame = requestAnimationFrame(updateVisualizer); }
function stopVisualizer() { if (audioContext) { audioContext.close(); audioContext = null; } if (visualizerFrame) cancelAnimationFrame(visualizerFrame); document.getElementById('mic-btn').classList.remove('btn-primary'); document.getElementById('fluid-overlay').classList.add('hidden'); }

// --- Streaming & Whiteboard-First Logic ---
async function sendPrompt() {
    const input = document.getElementById('prompt'); let prompt = input.value.trim();
    if (!prompt) return; if (prompt === lastSentPrompt) return; lastSentPrompt = prompt;
    if (!currentChatId) startNewChat();
    renderMessage('user', prompt, null); input.value = ''; showTyping();
    
    try {
        const res = await fetch('/api/chat', { method: 'POST', headers: {'Content-Type': 'application/json'}, body: JSON.stringify({ prompt }) });
        removeTyping();
        const log = document.getElementById('chat-log');
        const msgDiv = document.createElement('div'); msgDiv.className = 'msg-container cut ai'; msgDiv.innerHTML = '';
        log.appendChild(msgDiv); log.scrollTop = log.scrollHeight;
        
        if (!res.ok) { const errData = await res.json(); msgDiv.classList.add('error-msg'); msgDiv.innerHTML = `<div class="text-content">${errData.error || "Unknown Error"}</div><button class="btn btn-ghost cutxs copy-btn" onclick='copyError("Error")'>Copy</button>`; return; }
        
        const reader = res.body.getReader(); const decoder = new TextDecoder();
        let fullText = ""; let svgText = ""; let isSvg = false;
        let textDiv = null; let wbDiv = null;
        
        while (true) {
            const { done, value } = await reader.read(); if (done) break;
            const chunk = decoder.decode(value); const lines = chunk.split('\n');
            for (let line of lines) {
                if (line.startsWith('data: ') && !line.includes('[DONE]')) {
                    try {
                        const data = JSON.parse(line.substring(6)); const token = data.token || "";
                        
                        // SVG First Logic
                        if (token.includes('```svg')) { 
                            isSvg = true; 
                            wbDiv = document.createElement('div'); wbDiv.className = 'whiteboard cuts'; 
                            wbDiv.innerHTML = '<div class="typing-indicator"><div class="resonance-loader"><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div><div class="dot"></div></div></div>';
                            msgDiv.appendChild(wbDiv); // Prepend whiteboard
                            continue; 
                        }
                        if (token.includes('```')) { 
                            isSvg = false; 
                            if (!textDiv) { textDiv = document.createElement('div'); textDiv.className = 'text-content'; msgDiv.appendChild(textDiv); } // Create text div after svg
                            continue; 
                        }
                        
                        if (isSvg) { 
                            svgText += token; 
                            if (wbDiv) wbDiv.innerHTML = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">${svgText}</svg>`;
                        } else { 
                            if (!textDiv) { textDiv = document.createElement('div'); textDiv.className = 'text-content'; msgDiv.appendChild(textDiv); } // Fallback if no svg block
                            fullText += token; textDiv.innerHTML += token; 
                        }
                        
                        // Pre-speak at 80% (approx 300 chars)
                        if (settings.voiceEnabled && !speechStarted && fullText.length > 150) {
                            speechStarted = true;
                            startSpeech(fullText);
                        }
                        
                        log.scrollTop = log.scrollHeight;
                    } catch (e) {}
                }
            }
        }
        
        // If speech hasn't started (short response), start now
        if (settings.voiceEnabled && !speechStarted && fullText.length > 0) {
            startSpeech(fullText);
        }
        
        const chat = chats.find(c => c.id === currentChatId);
        if (chat) { chat.messages.push({ sender: 'ai', text: fullText, svg: svgText, isError: false }); saveChats(); }
        
    } catch (e) { removeTyping(); renderMessage('ai', `Network Failure: ${e.message}`, null, true); }
}

function startSpeech(text) {
    stopSpeech(); // Clear any existing
    const utterance = new SpeechSynthesisUtterance(text);
    if (settings.voiceURI) { const v = speechSynthesis.getVoices().find(v => v.uri === settings.voiceURI); if (v) utterance.voice = v; }
    utterance.onend = () => { hideAudioIsland(); speechStarted = false; };
    utterance.onerror = () => { hideAudioIsland(); speechStarted = false; };
    showAudioIsland();
    speechSynthesis.speak(utterance);
}
