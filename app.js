let chats = JSON.parse(localStorage.getItem('omnigraph_fresh_chats') || '[]');
let currentChatId = null;
let recognition = null;
let lastSentPrompt = "";
let settings = JSON.parse(localStorage.getItem('omnigraph_fresh_settings') || '{"voiceEnabled":true,"voiceURI":""}');

function init() {
    if (chats.length === 0) startNewChat();
    else loadChat(chats[0].id);
    populateVoices();
    setInterval(() => document.querySelector('.app').classList.toggle('dots-active'), 15000);
}
init();

function haptic() {
    if (navigator.vibrate) navigator.vibrate(10);
}

function toggleSidebar() {
    haptic();
    document.getElementById('sidebar').classList.toggle('open');
    document.getElementById('sidebar-backdrop').classList.toggle('active');
}

function renderHistory() {
    const container = document.getElementById('chat-history');
    container.innerHTML = '';
    chats.forEach(c => {
        const item = document.createElement('div');
        item.className = `history-item cuts ${c.id === currentChatId ? 'active' : ''}`;
        item.innerHTML = `
            <span class="history-title" onclick="loadChat(${c.id})">${escapeHtml(c.title)}</span>
            <div class="history-actions">
                <button class="icon-btn" onclick="event.stopPropagation(); deleteChat(${c.id})">
                    <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>
                </button>
            </div>`;
        container.appendChild(item);
    });
}

function escapeHtml(str) {
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#039;");
}

function startNewChat() {
    const newChat = { id: Date.now(), title: 'New Sector', messages: [] };
    chats.unshift(newChat);
    currentChatId = newChat.id;
    document.getElementById('chat-log').innerHTML = '';
    saveChats();
    renderHistory();
    if (document.getElementById('sidebar').classList.contains('open')) toggleSidebar();
}

function loadChat(id) {
    currentChatId = id;
    const chat = chats.find(x => x.id === id);
    if (!chat) return;
    const log = document.getElementById('chat-log');
    log.innerHTML = '';
    chat.messages.forEach(m => renderMessageDOM(m.sender, m.text, m.svg, m.isError));
    renderHistory();
    if (document.getElementById('sidebar').classList.contains('open')) toggleSidebar();
}

function deleteChat(id) {
    haptic();
    chats = chats.filter(x => x.id !== id);
    if (chats.length === 0) startNewChat();
    else if (currentChatId === id) loadChat(chats[0].id);
    saveChats();
    renderHistory();
}

function saveChats() {
    localStorage.setItem('omnigraph_fresh_chats', JSON.stringify(chats));
}

function populateVoices() {
    if (typeof speechSynthesis === 'undefined') return;
    const voices = speechSynthesis.getVoices();
    const select = document.getElementById('voice-select');
    if (!select) return;
    select.innerHTML = '';
    voices.forEach(v => {
        const opt = document.createElement('option');
        opt.value = v.uri;
        opt.innerText = `${v.name} (${v.lang})`;
        if (v.uri === settings.voiceURI) opt.selected = true;
        select.appendChild(opt);
    });
}
if (typeof speechSynthesis !== 'undefined') speechSynthesis.onvoiceschanged = populateVoices;

function renderMessageDOM(sender, text, svgString, isError = false) {
    const log = document.getElementById('chat-log');
    const msgDiv = document.createElement('div');
    msgDiv.className = `msg-container cut ${sender} ${isError ? 'error-msg' : ''}`;
    
    let content = '';
    if (svgString && svgString.trim().length > 0) {
        content += `<div class="whiteboard cuts"><svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">${svgString}</svg></div>`;
    }
    if (text) {
        const formatted = escapeHtml(text).replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
        content += `<div class="text-content">${formatted}</div>`;
    }
    msgDiv.innerHTML = content;
    log.appendChild(msgDiv);
    log.scrollTop = log.scrollHeight;
}

function appendMessage(sender, text, svgString, isError = false) {
    renderMessageDOM(sender, text, svgString, isError);
    const chat = chats.find(c => c.id === currentChatId);
    if (chat) {
        chat.messages.push({ sender, text, svg: svgString, isError });
        if (chat.messages.length === 1 && sender === 'user') {
            chat.title = text.substring(0, 24) + (text.length > 24 ? '...' : '');
        }
        saveChats();
        renderHistory();
    }
}

function showTyping() {
    const log = document.getElementById('chat-log');
    const div = document.createElement('div');
    div.className = 'msg-container cut ai';
    div.id = 'typing-bubble';
    div.innerHTML = `<div class="typing-indicator"><div class="resonance-loader"><div class="resonance-dot"></div><div class="resonance-dot"></div><div class="resonance-dot"></div></div></div>`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
}

function removeTyping() {
    const t = document.getElementById('typing-bubble');
    if (t) t.remove();
}

function showAudioIsland() {
    document.getElementById('audio-island').classList.remove('hidden');
    document.getElementById('audio-island').classList.add('speaking');
}

function hideAudioIsland() {
    document.getElementById('audio-island').classList.add('hidden');
    document.getElementById('audio-island').classList.remove('speaking');
}

function stopSpeech() {
    if (typeof speechSynthesis !== 'undefined') speechSynthesis.cancel();
    hideAudioIsland();
}

async function sendPrompt() {
    stopSpeech();
    const input = document.getElementById('prompt');
    let prompt = input.value.trim();
    if (!prompt) return;
    if (prompt === lastSentPrompt) return;
    lastSentPrompt = prompt;
    
    haptic();
    appendMessage('user', prompt, null);
    input.value = '';
    showTyping();
    document.getElementById('prompt').disabled = true;
    
    try {
        const res = await fetch('/api/chat', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ prompt })
        });
        
        removeTyping();
        
        if (!res.ok) {
            const err = await res.json();
            appendMessage('ai', err.error || "Neural Link Error", null, true);
            document.getElementById('prompt').disabled = false;
            return;
        }

        const reader = res.body.getReader();
        const decoder = new TextDecoder();
        let rawBuffer = "";
        let explanationText = "";
        let svgCode = "";
        let isSvgMode = false;
        
        const log = document.getElementById('chat-log');
        const msgDiv = document.createElement('div');
        msgDiv.className = 'msg-container cut ai';
        log.appendChild(msgDiv);
        
        let wbDiv = null;
        let textDiv = null;

        while (true) {
            const { done, value } = await reader.read();
            if (done) break;
            rawBuffer += decoder.decode(value, { stream: true });
            
            const lines = rawBuffer.split('\n');
            rawBuffer = lines.pop(); // Keep partial line in buffer
            
            for (let line of lines) {
                if (line.startsWith('data: ')) {
                    const jsonStr = line.substring(6).trim();
                    if (jsonStr === '[DONE]') continue;
                    try {
                        const data = JSON.parse(jsonStr);
                        const token = data.token || "";
                        
                        if (token.includes('```svg')) {
                            isSvgMode = true;
                            svgCode += token.split('```svg')[1] || "";
                            if (!wbDiv) {
                                wbDiv = document.createElement('div');
                                wbDiv.className = 'whiteboard cuts';
                                msgDiv.prepend(wbDiv);
                            }
                            continue;
                        }
                        
                        if (isSvgMode && token.includes('```')) {
                            isSvgMode = false;
                            svgCode += token.split('```')[0] || "";
                            if (wbDiv) {
                                wbDiv.innerHTML = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">${svgCode.trim()}</svg>`;
                            }
                            continue;
                        }
                        
                        if (isSvgMode) {
                            svgCode += token;
                            if (wbDiv) {
                                wbDiv.innerHTML = `<svg viewBox="0 0 200 200" xmlns="http://www.w3.org/2000/svg">${svgCode.trim()}</svg>`;
                            }
                        } else {
                            if (!token.includes('```')) {
                                explanationText += token;
                                if (!textDiv) {
                                    textDiv = document.createElement('div');
                                    textDiv.className = 'text-content';
                                    msgDiv.appendChild(textDiv);
                                }
                                textDiv.innerHTML = escapeHtml(explanationText).replace(/\*\*(.*?)\*\*/g, '<b>$1</b>');
                            }
                        }
                        log.scrollTop = log.scrollHeight;
                    } catch (e) {}
                }
            }
        }

        const cleanText = explanationText.trim();
        const cleanSvg = svgCode.trim();
        const chat = chats.find(c => c.id === currentChatId);
        if (chat) {
            chat.messages.push({ sender: 'ai', text: cleanText, svg: cleanSvg, isError: false });
            saveChats();
        }

        if (settings.voiceEnabled && cleanText.length > 0) {
            startSpeechSynthesis(cleanText);
        }

    } catch (e) {
        removeTyping();
        appendMessage('ai', `Connection Lost: ${e.message}`, null, true);
    }
    
    document.getElementById('prompt').disabled = false;
    document.getElementById('prompt').focus();
}

function startSpeechSynthesis(text) {
    stopSpeech();
    const clean = text.replace(/[*_#`]/g, '').trim();
    if (!clean) return;
    
    const utterance = new SpeechSynthesisUtterance(clean);
    if (settings.voiceURI) {
        const v = speechSynthesis.getVoices().find(x => x.uri === settings.voiceURI);
        if (v) utterance.voice = v;
    }
    
    utterance.onstart = () => showAudioIsland();
    utterance.onend = () => hideAudioIsland();
    utterance.onerror = () => hideAudioIsland();
    
    speechSynthesis.speak(utterance);
}

async function toggleMic() {
    haptic();
    const micBtn = document.getElementById('mic-btn');
    const fluidOverlay = document.getElementById('fluid-overlay');
    const transcribedText = document.getElementById('transcribed-text');
    
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SR) { alert("Speech Recognition not supported in this environment."); return; }
    
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
            const final = transcribedText.innerText;
            fluidOverlay.classList.add('hidden');
            micBtn.classList.remove('btn-primary');
            if (final && final !== 'Listening...') {
                document.getElementById('prompt').value = final;
                sendPrompt();
            }
        };
        recognition.onerror = () => {
            fluidOverlay.classList.add('hidden');
            micBtn.classList.remove('btn-primary');
        };
    }
    
    micBtn.classList.add('btn-primary');
    fluidOverlay.classList.remove('hidden');
    transcribedText.innerText = 'Listening...';
    recognition.start();
}
