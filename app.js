// --- REACTIVE STATE ---
const state = {
    layers: [],
    activeLayer: null,
    zoom: 1,
    panX: 0,
    panY: 0
};

const canvas = document.getElementById('canvas');
const tray = document.getElementById('tray');

function setActiveLayer(layerId) {
    state.activeLayer = layerId;
    document.querySelectorAll('.svg-layer').forEach(l => l.classList.remove('active'));
    document.querySelectorAll('.layer-item').forEach(l => l.classList.remove('active'));
    const svgGroup = document.getElementById(`svg-${layerId}`);
    const listItem = document.getElementById(`item-${layerId}`);
    if (svgGroup) svgGroup.classList.add('active');
    if (listItem) listItem.classList.add('active');
}

// --- TRAY TOGGLE ---
function toggleTray() { tray.classList.toggle('collapsed'); }

// --- AI & MIC LOGIC ---
let recognition = null;
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.continuous = false; recognition.interimResults = false;
    recognition.onresult = (e) => { document.getElementById('prompt').value = e.results[0][0].transcript; };
    recognition.onend = () => { document.getElementById('mic-btn').classList.remove('active'); };
}
function toggleMic() {
    if (!recognition) return alert("Mic not supported.");
    const btn = document.getElementById('mic-btn');
    if (btn.classList.contains('active')) recognition.stop();
    else { recognition.start(); btn.classList.add('active'); }
}

function appendChat(text, sender) {
    const log = document.getElementById('chat_log');
    const div = document.createElement('div');
    div.innerHTML = `<strong>${sender}:</strong> ${text}`;
    log.appendChild(div); log.scrollTop = log.scrollHeight;
}

async function sendPrompt() {
    const promptInput = document.getElementById('prompt');
    let prompt = promptInput.value.trim();
    if (!prompt) return;
    appendChat(prompt, 'You');
    promptInput.value = '';
    
    const isSvg = prompt.toLowerCase().startsWith('/create');
    const cleanPrompt = isSvg ? prompt.replace(/^\/create/i, '').trim() : prompt;
    
    try {
        const res = await fetch('/api/generate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ prompt: cleanPrompt, type: isSvg ? 'svg' : 'chat' })
        });
        const data = await res.json();
        if (data.error) return appendChat("Error: " + data.error, 'AI');
        if (data.text) return appendChat(data.text, 'AI');
        renderSVG(data);
        appendChat("Character generated! Tap layers to animate.", 'AI');
        tray.classList.remove('collapsed'); // Expand tray to show layers
    } catch (e) { appendChat("Failed to reach AI.", 'AI'); }
}

// --- SVG RENDERING & STATE SYNC ---
function renderSVG(data) {
    canvas.innerHTML = ''; 
    const layersList = document.getElementById('layers_list');
    layersList.innerHTML = ''; 
    state.layers = [];

    for (const [partName, svgString] of Object.entries(data)) {
        state.layers.push(partName);
        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        group.setAttribute("id", `svg-${partName}`);
        group.setAttribute("class", "svg-layer");
        group.setAttribute("transform", "translate(0, 0)");
        group.innerHTML = svgString; 
        
        group.addEventListener('pointerdown', (e) => startDrag(e, partName));
        canvas.appendChild(group);

        const layerDiv = document.createElement('div');
        layerDiv.className = 'layer-item';
        layerDiv.id = `item-${partName}`;
        layerDiv.onclick = () => setActiveLayer(partName);
        layerDiv.innerHTML = `
            <strong>${partName}</strong>
            <label>Color:</label>
            <input type="color" value="#000000" onchange="changeColor('${partName}', this.value)" onclick="event.stopPropagation()">
        `;
        layersList.appendChild(layerDiv);
    }
}

// --- DRAG & PINCH LOGIC ---
function getMousePosition(evt) {
    const CTM = canvas.getScreenCTM().inverse();
    return { x: evt.clientX * CTM.a + CTM.e, y: evt.clientY * CTM.d + CTM.f };
}

let activeDrag = null;
let offset = { x: 0, y: 0 };

function startDrag(evt, layerId) {
    setActiveLayer(layerId);
    activeDrag = document.getElementById(`svg-${layerId}`);
    offset = getMousePosition(evt);
    const transforms = activeDrag.transform.baseVal;
    if (transforms.numberOfItems === 0 || transforms.getItem(0).type !== SVGTransform.SVG_TRANSFORM_TRANSLATE) {
        const translate = canvas.createSVGTransform();
        translate.setTranslate(0, 0);
        activeDrag.transform.baseVal.appendItem(translate);
    }
    offset.x -= transforms.getItem(0).matrix.e;
    offset.y -= transforms.getItem(0).matrix.f;
    canvas.addEventListener('pointermove', drag);
    canvas.addEventListener('pointerup', endDrag);
    canvas.addEventListener('pointerleave', endDrag);
}

function drag(evt) {
    if (!activeDrag) return;
    evt.preventDefault();
    const Coord = getMousePosition(evt);
    const transforms = activeDrag.transform.baseVal;
    const translate = transforms.getItem(0);
    translate.setTranslate(Coord.x - offset.x, Coord.y - offset.y);
}

function endDrag() { activeDrag = null; }

// Pinch to Zoom
let pinchDistance = 0;
canvas.addEventListener('touchstart', (e) => {
    if (e.touches.length === 2) { pinchDistance = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY); }
});
canvas.addEventListener('touchmove', (e) => {
    if (e.touches.length === 2) {
        e.preventDefault();
        const dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
        const delta = dist / pinchDistance;
        state.zoom = Math.min(Math.max(0.5, state.zoom * delta), 3);
        canvas.style.transform = `scale(${state.zoom})`;
    }
}, { passive: false });

// --- ANIMATION CHIPS LOGIC ---
const animationKeyframes = {
    'Swing': `@keyframes swing { 0%, 100% { transform: rotate(-15deg); } 50% { transform: rotate(15deg); } }`,
    'Pulse': `@keyframes pulse { 0%, 100% { transform: scale(1); } 50% { transform: scale(1.1); } }`,
    'Levitate': `@keyframes levitate { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-10px); } }`,
    'Rotate': `@keyframes rotate { 0% { transform: rotate(0deg); } 100% { transform: rotate(360deg); } }`
};

function applyAnimation(name, property) {
    if (!state.activeLayer) return alert("Select a layer first!");
    let styleTag = document.getElementById('dynamic-anim-style');
    if (!styleTag) { styleTag = document.createElement('style'); styleTag.id = 'dynamic-anim-style'; document.head.appendChild(styleTag); }
    styleTag.innerHTML = animationKeyframes[name];
    const group = document.getElementById(`svg-${state.activeLayer}`);
    group.style.animation = property;
}

function changeColor(partName, color) {
    const group = document.getElementById(`svg-${partName}`);
    const shapes = group.querySelectorAll('path, rect, circle, ellipse, polygon');
    shapes.forEach(shape => shape.setAttribute('fill', color));
}
