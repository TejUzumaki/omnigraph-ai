async function generateSVG() {
    const prompt = document.getElementById('prompt').value;
    const status = document.getElementById('status');
    status.innerText = "Generating...";
    
    try {
        const res = await fetch('/api/generate', {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ prompt })
        });
        const data = await res.json();
        
        if (data.error) {
            status.innerText = "Error: " + data.error;
            console.error(data.raw);
            return;
        }
        
        status.innerText = "Generated successfully!";
        const canvas = document.getElementById('canvas');
        canvas.innerHTML = ''; 
        const layersList = document.getElementById('layers_list');
        layersList.innerHTML = ''; 

        for (const [partName, svgString] of Object.entries(data)) {
            const group = document.createElementNS("http://www.w3.org/2000/svg", "g");
            group.setAttribute("id", `layer-${partName}`);
            group.setAttribute("class", "svg-layer");
            group.innerHTML = svgString; 
            group.style.transformBox = "fill-box";
            group.style.transformOrigin = "center";
            canvas.appendChild(group);

            const layerDiv = document.createElement('div');
            layerDiv.className = 'layer-item';
            layerDiv.innerHTML = `
                <strong>${partName}</strong>
                <label>Fill Color:</label>
                <input type="color" value="#000000" onchange="changeColor('${partName}', this.value)">
                <label>Animation Class/Name:</label>
                <input type="text" id="anim-${partName}" placeholder="e.g. walk 1s infinite">
            `;
            layersList.appendChild(layerDiv);
        }
    } catch (e) {
        status.innerText = "Failed to reach server.";
    }
}

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
            group.style.animation = animInput.value;
        }
    });
}
