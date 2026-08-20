const canvas = document.getElementById('canvas');
let selectedLayer = null;
let offset = { x: 0, y: 0 };

// --- Mic & AI Logic ---
let recognition = null;
if ('webkitSpeechRecognition' in window || 'SpeechRecognition' in window) {
    const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
    recognition = new SR();
    recognition.continuous = false;
    recognition.interimResults = false;
    recognition.onresult = (e) => { document.getElementById('prompt').value = e.results[0][0].transcript; };
    recognition.onend = () => { document.getElementById('mic-btn').classList.remove('active'); };
}

function toggleMic() {
    if (!recognition) return alert("Mic not supported.");
    const micBtn = document.getElementById('mic-btn');
    if (micBtn.classList.contains('active')) recognition.stop();
    else { recognition.start(); micBtn.classList.add('active'); }
}

function appendChat(text, sender) {
    const log = document.getElementById('chat_log');
    const div = document.createElement('div');
    div.className = 'msg';
    div.innerHTML = `<strong>${sender}:</strong> ${text}`;
    log.appendChild(div);
    log.scrollTop = log.scrollHeight;
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
        appendChat("Character generated! Check the editor.", 'AI');
    } catch (e) { appendChat("Failed to reach AI.", 'AI'); }
}

// --- SVG Rendering & Drag Logic ---
function renderSVG(data) {
    canvas.innerHTML = ''; 
    const layersList = document.getElementById('layers_list');
    layersList.innerHTML = ''; 

    for (const [partName, svgString] of Object.entries(data)) {
        const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
        group.setAttribute("id", `layer-${partName}`);
        group.setAttribute("class", "svg-layer");
        group.setAttribute("transform", "translate(0, 0)");
        group.innerHTML = svgString; 
        
        // Drag Events
        group.addEventListener('pointerdown', startDrag);
        group.addEventListener('pointermove', drag);
        group.addEventListener('pointerup', endDrag);
        group.addEventListener('pointerleave', endDrag);
        
        canvas.appendChild(group);

        const layerDiv = document.createElement('div');
        layerDiv.className = 'layer-item';
        layerDiv.innerHTML = `
            <strong>${partName}</strong>
            <label>Fill Color:</label>
            <input type="color" value="#000000" onchange="changeColor('${partName}', this.value)">
            <label>Animation Name:</label>
            <input type="text" id="anim-${partName}" placeholder="walk 1s infinite" style="width: 100%; margin-top: 2px; background: #333; color: #fff; border: 1px solid #555; border-radius: 4px; padding: 4px;">
        `;
        layersList.appendChild(layerDiv);
    }
}

function getMousePosition(evt) {
    const CTM = canvas.getScreenCTM().inverse();
    return { x: evt.clientX * CTM.a + CTM.e, y: evt.clientY * CTM.d + CTM.f };
}

function startDrag(evt) {
    selectedLayer = evt.target.closest('g');
    offset = getMousePosition(evt);
    const transforms = selectedLayer.transform.baseVal;
    if (transforms.numberOfItems === 0 || transforms.getItem(0).type !== SVGTransform.SVG_TRANSFORM_TRANSLATE) {
        const translate = canvas.createSVGTransform();
        translate.setTranslate(0, 0);
        selectedLayer.transform.baseVal.appendItem(translate);
    }
    offset.x -= transforms.getItem(0).matrix.e;
    offset.y -= transforms.getItem(0).matrix.f;
}

function drag(evt) {
    if (!selectedLayer) return;
    evt.preventDefault();
    const Coord = getMousePosition(evt);
    const transforms = selectedLayer.transform.baseVal;
    const translate = transforms.getItem(0);
    translate.setTranslate(Coord.x - offset.x, Coord.y - offset.y);
}

function endDrag() { selectedLayer = null; }

function changeColor(partName, color) {
    const group = document.getElementById(`layer-${partName}`);
    const shapes = group.querySelectorAll('path, rect, circle, ellipse, polygon');
    shapes.forEach(shape => shape.setAttribute('fill', color));
}

function applyAnimation() {
    const cssCode = document.getElementById('css_code').value;
    let styleTag = document.getElementById('dynamic-anim-style');
    if (!styleTag) {
        styleTag = document.createElement('style');
        styleTag.id = 'dynamic-anim-style';
        document.head.appendChild(styleTag);
    }
    styleTag.innerHTML = cssCode;

    document.querySelectorAll('.svg-layer').forEach(group => {
        const partName = group.id.replace('layer-', '');
        const animInput = document.getElementById(`anim-${partName}`);
        if (animInput && animInput.value) {
            group.style.transformBox = "fill-box";
            group.style.transformOrigin = "center";
            group.style.animation = animInput.value;
        }
    });
}
