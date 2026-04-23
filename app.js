const TOTAL_NETWORKS = 27; // We know there are 27 networks
const DATA_DIR = './web_data';
let currentSpreadModel = 'IC'; // Default to IC
const CHART_FONT_FAMILY = "'Source Sans 3', sans-serif";
const CHART_TEXT_COLOR = '#334155';

// Color palette matching the Python script as closely as possible
const BASE_COLORS = [
    'rgb(204, 0, 0)',      // Strong red
    'rgb(0, 102, 204)',    // Strong blue
    'rgb(0, 179, 0)',      // Strong green
    'rgb(230, 179, 0)',    // Strong yellow/orange
    'rgb(204, 0, 204)',    // Strong magenta
    'rgb(0, 204, 204)',    // Strong cyan
    'rgb(230, 102, 0)',    // Strong orange
    'rgb(128, 0, 204)',    // Strong purple
    'rgb(204, 128, 0)',    // Strong brown/orange
    'rgb(230, 0, 128)',    // Strong pink
    'rgb(77, 179, 230)',   // Strong light blue
];

let currentChart = null;
let currentData = null;
let annotationMode = false;
let noteCounter = 0;
let activeDrag = null;
let selectedNote = null;

const displaySettings = {
    tickFontSize: 14,
    axisTitleFontSize: 18,
    lineWidth: 1.6
};

Chart.defaults.font.family = CHART_FONT_FAMILY;
Chart.defaults.font.size = 14;
Chart.defaults.color = CHART_TEXT_COLOR;

// Filter state
let activeFilters = {
    k: new Set(),
    prob: new Set(),
    dir: new Set()
};

document.addEventListener('DOMContentLoaded', () => {
    initNetworkSelect();
    initModelSelect();
    initChartControls();

    document.getElementById('networkSelect').addEventListener('change', (e) => {
        const netId = e.target.value;
        if (netId) {
            loadNetwork(netId);
        } else {
            resetChart();
        }
    });

    document.getElementById('resetFilters').addEventListener('click', () => {
        if (!currentData) return;
        // Check all checkboxes
        document.querySelectorAll('#filterPanel input[type="checkbox"]').forEach(cb => cb.checked = true);
        updateActiveFilters();
        applyFilters();
    });

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    document.addEventListener('pointermove', handleNoteDragMove);
    document.addEventListener('pointerup', stopNoteDrag);
});

function initChartControls() {
    document.getElementById('fullscreenBtn').addEventListener('click', toggleFullscreen);
    document.getElementById('exportBtn').addEventListener('click', exportChartAsImage);
    document.getElementById('addNoteBtn').addEventListener('click', toggleAnnotationMode);
    document.getElementById('clearNotesBtn').addEventListener('click', clearAnnotations);
    document.getElementById('deleteSelectedNoteBtn').addEventListener('click', deleteSelectedNote);

    document.getElementById('tickSizeIncrease').addEventListener('click', () => updateDisplaySetting('tickFontSize', 1, 10, 34));
    document.getElementById('tickSizeDecrease').addEventListener('click', () => updateDisplaySetting('tickFontSize', -1, 10, 34));
    document.getElementById('axisTitleIncrease').addEventListener('click', () => updateDisplaySetting('axisTitleFontSize', 1, 12, 40));
    document.getElementById('axisTitleDecrease').addEventListener('click', () => updateDisplaySetting('axisTitleFontSize', -1, 12, 40));
    document.getElementById('lineWidthIncrease').addEventListener('click', () => updateDisplaySetting('lineWidth', 0.2, 0.8, 6, 1));
    document.getElementById('lineWidthDecrease').addEventListener('click', () => updateDisplaySetting('lineWidth', -0.2, 0.8, 6, 1));
    document.getElementById('noteNormalBtn').addEventListener('click', () => updateSelectedNoteStyle({ weight: '400' }));
    document.getElementById('noteBoldBtn').addEventListener('click', () => updateSelectedNoteStyle({ weight: '700' }));
    document.getElementById('noteItalicBtn').addEventListener('click', toggleSelectedNoteItalic);
    document.getElementById('noteFontSizeSelect').addEventListener('change', (event) => {
        updateSelectedNoteStyle({ fontSize: parseInt(event.target.value, 10) });
    });
    document.getElementById('noteBorderToggle').addEventListener('change', (event) => {
        updateSelectedNoteStyle({ exportBorder: event.target.checked });
    });

    document.getElementById('chartViewport').addEventListener('click', handleChartViewportClick);
    document.getElementById('chartAnnotations').addEventListener('click', (event) => {
        const note = event.target.closest('.chart-note');
        if (note) {
            setSelectedNote(note);
            event.stopPropagation();
        }
    });
    syncControlLabels();
    syncNoteStylePanel();
}

function updateDisplaySetting(key, delta, min, max, decimals = 0) {
    const next = clamp(displaySettings[key] + delta, min, max);
    displaySettings[key] = decimals > 0 ? Number(next.toFixed(decimals)) : Math.round(next);
    syncControlLabels();
    applyDisplaySettings();
}

function syncControlLabels() {
    document.getElementById('tickSizeValue').textContent = `${displaySettings.tickFontSize} px`;
    document.getElementById('axisTitleValue').textContent = `${displaySettings.axisTitleFontSize} px`;
    document.getElementById('lineWidthValue').textContent = `${displaySettings.lineWidth.toFixed(1)} px`;
}

function applyDisplaySettings() {
    if (!currentChart) return;

    const options = currentChart.options;
    options.scales.x.ticks.font.size = displaySettings.tickFontSize;
    options.scales.y.ticks.font.size = displaySettings.tickFontSize;
    options.scales.x.title.font.size = displaySettings.axisTitleFontSize;
    options.scales.y.title.font.size = displaySettings.axisTitleFontSize;

    currentChart.data.datasets.forEach(dataset => {
        dataset.borderWidth = displaySettings.lineWidth;
    });

    currentChart.update('none');
}

function initModelSelect() {
    const btnIC = document.getElementById('modelIC');
    const btnLT = document.getElementById('modelLT');

    function updateBtns() {
        if (currentSpreadModel === 'IC') {
            btnIC.classList.add('bg-sky-700', 'text-white', 'shadow-sm');
            btnIC.classList.remove('text-slate-700', 'hover:bg-slate-100');

            btnLT.classList.remove('bg-sky-700', 'text-white', 'shadow-sm');
            btnLT.classList.add('text-slate-700', 'hover:bg-slate-100');
        } else {
            btnLT.classList.add('bg-sky-700', 'text-white', 'shadow-sm');
            btnLT.classList.remove('text-slate-700', 'hover:bg-slate-100');

            btnIC.classList.remove('bg-sky-700', 'text-white', 'shadow-sm');
            btnIC.classList.add('text-slate-700', 'hover:bg-slate-100');
        }
    }

    btnIC.addEventListener('click', () => {
        if (currentSpreadModel === 'IC') return;
        currentSpreadModel = 'IC';
        updateBtns();
        // Reload if a network is selected
        const netId = document.getElementById('networkSelect').value;
        if (netId) loadNetwork(netId);
    });

    btnLT.addEventListener('click', () => {
        if (currentSpreadModel === 'LT') return;
        currentSpreadModel = 'LT';
        updateBtns();
        // Reload if a network is selected
        const netId = document.getElementById('networkSelect').value;
        if (netId) loadNetwork(netId);
    });

    updateBtns();
}

function resetChart() {
    if (currentChart) currentChart.destroy();
    document.getElementById('networkInfo').classList.add('hidden');
    document.getElementById('filterPanel').classList.add('hidden');
    clearAnnotations();
    currentData = null;
}

function initNetworkSelect() {
    const select = document.getElementById('networkSelect');
    // Using a known list of valid IDs based on file existence could be better,
    // but exploring 1..27 is safe enough for this purpose.
    for (let i = 1; i <= TOTAL_NETWORKS; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `Network ${i}`;
        select.appendChild(option);
    }
}

async function loadNetwork(id) {
    try {
        // Fetch from subdirectory logic
        const response = await fetch(`${DATA_DIR}/${currentSpreadModel}/${id}.json`);
        if (!response.ok) throw new Error(`HTTP error! status: ${response.status}`);
        const data = await response.json();
        currentData = data;

        updateInfo(data.params);
        initFilters(data);
        renderChart(data);

    } catch (e) {
        console.error("Failed to load network data:", e);
        // Clear current view
        if (currentChart) currentChart.destroy();
        currentData = null;
        alert(`Failed to load data for Network ${id} (${currentSpreadModel}). Make sure JSON files are generated in web_data/${currentSpreadModel}/.`);
    }
}

function updateInfo(params) {
    document.getElementById('infoNodes').textContent = params.nodes;
    document.getElementById('infoDensity').textContent = Number(params.density).toFixed(4);
    document.getElementById('infoDiameter').textContent = params.diameter;
    document.getElementById('networkInfo').classList.remove('hidden');
}

function initFilters(data) {
    // Extract unique values
    const kValues = new Set();
    const probValues = new Set();
    const dirValues = new Set();

    data.curves.forEach(curve => {
        kValues.add(curve.k);
        probValues.add(curve.prob);
        dirValues.add(curve.dir);
    });

    // Render Filters
    renderFilterSection('filterK', Array.from(kValues).sort((a, b) => a - b), 'k');
    renderFilterSection('filterProb', Array.from(probValues).sort((a, b) => a - b), 'prob');
    renderFilterSection('filterDir', Array.from(dirValues).sort(), 'dir');

    // Show panel
    document.getElementById('filterPanel').classList.remove('hidden');

    // Initialize state
    updateActiveFilters();
}

function renderFilterSection(elementId, values, type) {
    const container = document.getElementById(elementId);
    container.innerHTML = '';

    values.forEach(val => {
        const div = document.createElement('div');
        div.className = 'flex items-center';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = `${type}_${val}`;
        input.value = val;
        input.checked = true; // Default checked
        input.dataset.type = type;
        input.className = 'h-4 w-4 cursor-pointer rounded border-slate-300 text-sky-700 focus:ring-sky-500';

        input.addEventListener('change', () => {
            updateActiveFilters();
            applyFilters();
        });

        const label = document.createElement('label');
        label.htmlFor = `${type}_${val}`;
        label.className = 'ml-2 block cursor-pointer select-none text-sm text-slate-800';
        label.textContent = val;

        div.appendChild(input);
        div.appendChild(label);
        container.appendChild(div);
    });
}

function updateActiveFilters() {
    activeFilters.k.clear();
    activeFilters.prob.clear();
    activeFilters.dir.clear();

    document.querySelectorAll('#filterK input:checked').forEach(cb => activeFilters.k.add(parseInt(cb.value)));
    document.querySelectorAll('#filterProb input:checked').forEach(cb => activeFilters.prob.add(parseFloat(cb.value)));
    document.querySelectorAll('#filterDir input:checked').forEach(cb => activeFilters.dir.add(cb.value));
}

function applyFilters() {
    if (!currentChart || !currentData) return;

    currentChart.data.datasets.forEach((dataset, index) => {
        // We stored the curve meta in the dataset options ideally, or we match by index
        // The datasets are pushed in the same order as data.curves
        const curve = currentData.curves[index];

        const isVisible = activeFilters.k.has(curve.k) &&
            activeFilters.prob.has(curve.prob) &&
            activeFilters.dir.has(curve.dir);

        currentChart.setDatasetVisibility(index, isVisible);
    });

    currentChart.update();
}

function renderChart(data) {
    const ctx = document.getElementById('mainChart').getContext('2d');

    if (currentChart) {
        currentChart.destroy();
    }

    // Prepare datasets
    // Sort curves exactly as python script does for consistent legend key/color
    // The python script sorts by (k, prob, dir).
    // The JSON array 'curves' is already sorted by the python script.

    // We need to replicate the color cycling logic per K-group
    let datasets = [];
    let currentK = null;
    let colorIndex = 0;

    data.curves.forEach((curve, index) => {
        if (currentK === null || currentK !== curve.k) {
            currentK = curve.k;
            colorIndex = 0;
        }

        const color = BASE_COLORS[colorIndex % BASE_COLORS.length];
        colorIndex++;

        // Construct label
        // Python: f"{index}: k={k}, λ={prob}, dir={dir} ..."
        const label = `${index + 1}: ℓ=${curve.k}, λ=${curve.prob}, dir=${curve.dir}`;

        datasets.push({
            label: label,
            data: curve.data.map((y, i) => ({ x: i + 1, y: y })), // Format for scatter/linear
            borderColor: color,
            backgroundColor: color,
            borderWidth: displaySettings.lineWidth,
            pointRadius: 0, // Hide points for clean curves like matplotlib
            pointHoverRadius: 4,
            fill: false,
            tension: 0 // Straight lines between points
        });
    });

    currentChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: datasets
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            animation: false, // Prepare for large datasets
            spanGaps: true,
            normalized: true,
            scales: {
                x: {
                    type: 'linear', // Use linear scale for sorting by index 1..N
                    title: {
                        display: true,
                        text: 'Nodes (sorted by GISR value)',
                        font: {
                            size: displaySettings.axisTitleFontSize,
                            weight: '600'
                        },
                        padding: {
                            top: 16
                        }
                    },
                    min: 1,
                    max: data.params.nodes,
                    ticks: {
                        font: {
                            size: displaySettings.tickFontSize
                        },
                        maxTicksLimit: 12
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.18)'
                    }
                },
                y: {
                    title: {
                        display: true,
                        text: 'GISR value',
                        font: {
                            size: displaySettings.axisTitleFontSize,
                            weight: '600'
                        },
                        padding: {
                            bottom: 10
                        }
                    },
                    min: 1,
                    max: data.curves[0] ? data.curves[0].data.length : undefined, // Approx max
                    ticks: {
                        font: {
                            size: displaySettings.tickFontSize
                        }
                    },
                    grid: {
                        color: 'rgba(148, 163, 184, 0.18)'
                    }
                }
            },
            plugins: {
                legend: {
                    display: false // Hide default legend as we have custom filters now, or keep it? 
                    // Let's keep it but maybe it's too crowded with all 48 curves. 
                    // Dynamic filtering removes the need for a huge clickable legend.
                },
                title: {
                    display: true,
                    text: `Network ${data.network_id} • ${currentSpreadModel} model`,
                    font: {
                        size: 22,
                        weight: '700'
                    },
                    padding: {
                        bottom: 24
                    }
                },
                tooltip: {
                    enabled: true,
                    mode: 'nearest',
                    intersect: false,
                    titleFont: {
                        size: 14,
                        weight: '700'
                    },
                    bodyFont: {
                        size: 13
                    },
                    padding: 12
                }
            },
            interaction: {
                mode: 'nearest',
                axis: 'x',
                intersect: false
            }
        }
    });

    // Apply initial filters (defaults to all checked)
    applyFilters();
    applyDisplaySettings();
}

function toggleFullscreen() {
    const chartCard = document.getElementById('chartPanel');
    if (!document.fullscreenElement) {
        chartCard.requestFullscreen().catch(error => {
            console.error('Unable to enter fullscreen mode:', error);
        });
        return;
    }

    document.exitFullscreen().catch(error => {
        console.error('Unable to exit fullscreen mode:', error);
    });
}

function handleFullscreenChange() {
    const isFullscreen = Boolean(document.fullscreenElement);
    document.getElementById('fullscreenBtn').textContent = isFullscreen ? 'Exit full screen' : 'Full screen';

    window.setTimeout(() => {
        if (currentChart) currentChart.resize();
    }, 120);
}

function toggleAnnotationMode() {
    annotationMode = !annotationMode;
    const viewport = document.getElementById('chartViewport');
    const button = document.getElementById('addNoteBtn');
    const hint = document.getElementById('annotationHint');

    viewport.classList.toggle('annotation-mode', annotationMode);
    hint.classList.toggle('hidden', !annotationMode);
    button.classList.toggle('ring-2', annotationMode);
    button.classList.toggle('ring-amber-300', annotationMode);
    button.textContent = annotationMode ? 'Cancel note' : 'Add note';
}

function setSelectedNote(note) {
    if (selectedNote === note) {
        syncNoteStylePanel();
        return;
    }

    if (selectedNote?.isConnected) {
        selectedNote.classList.remove('selected');
    }

    selectedNote = note && note.isConnected ? note : null;

    if (selectedNote) {
        selectedNote.classList.add('selected');
    }

    syncNoteStylePanel();
}

function syncNoteStylePanel() {
    const panel = document.getElementById('noteStylePanel');
    const normalBtn = document.getElementById('noteNormalBtn');
    const boldBtn = document.getElementById('noteBoldBtn');
    const italicBtn = document.getElementById('noteItalicBtn');
    const sizeSelect = document.getElementById('noteFontSizeSelect');
    const borderToggle = document.getElementById('noteBorderToggle');
    const deleteBtn = document.getElementById('deleteSelectedNoteBtn');

    const hasSelection = Boolean(selectedNote?.isConnected);
    panel.classList.toggle('hidden', !hasSelection);

    if (!hasSelection) {
        normalBtn.classList.remove('active');
        boldBtn.classList.remove('active');
        italicBtn.classList.remove('active');
        deleteBtn.disabled = true;
        deleteBtn.classList.add('opacity-50', 'cursor-not-allowed');
        return;
    }

    const body = selectedNote.querySelector('.chart-note-body');
    const fontSize = parseInt(selectedNote.dataset.fontSize || '20', 10);
    const isBold = (selectedNote.dataset.fontWeight || '400') === '700';
    const isItalic = (selectedNote.dataset.fontStyle || 'normal') === 'italic';
    const hasBorder = selectedNote.dataset.exportBorder === 'true';

    sizeSelect.value = String(fontSize);
    borderToggle.checked = hasBorder;
    body.style.fontSize = `${fontSize}px`;

    normalBtn.classList.toggle('active', !isBold);
    boldBtn.classList.toggle('active', isBold);
    italicBtn.classList.toggle('active', isItalic);
    deleteBtn.disabled = false;
    deleteBtn.classList.remove('opacity-50', 'cursor-not-allowed');
}

function updateSelectedNoteStyle(patch) {
    if (!selectedNote?.isConnected) return;

    if (patch.weight) {
        selectedNote.dataset.fontWeight = patch.weight;
    }
    if (patch.fontStyle) {
        selectedNote.dataset.fontStyle = patch.fontStyle;
    }
    if (patch.fontSize) {
        selectedNote.dataset.fontSize = String(patch.fontSize);
    }
    if (typeof patch.exportBorder === 'boolean') {
        selectedNote.dataset.exportBorder = String(patch.exportBorder);
    }

    applyNoteStyles(selectedNote);
    syncNoteStylePanel();
}

function toggleSelectedNoteItalic() {
    if (!selectedNote?.isConnected) return;
    const currentStyle = selectedNote.dataset.fontStyle || 'normal';
    updateSelectedNoteStyle({ fontStyle: currentStyle === 'italic' ? 'normal' : 'italic' });
}

function applyNoteStyles(note) {
    const body = note.querySelector('.chart-note-body');
    body.style.fontWeight = note.dataset.fontWeight || '400';
    body.style.fontStyle = note.dataset.fontStyle || 'normal';
    body.style.fontSize = `${parseInt(note.dataset.fontSize || '20', 10)}px`;
}

function handleChartViewportClick(event) {
    const noteElement = event.target.closest('.chart-note');
    if (noteElement) return;

    if (!annotationMode) {
        setSelectedNote(null);
        return;
    }

    const viewport = document.getElementById('chartViewport');
    const rect = viewport.getBoundingClientRect();
    const xPercent = clamp(((event.clientX - rect.left) / rect.width) * 100, 1, 92);
    const yPercent = clamp(((event.clientY - rect.top) / rect.height) * 100, 1, 94);

    createAnnotationNote({
        xPercent,
        yPercent,
        text: 'Write here'
    });

    if (annotationMode) toggleAnnotationMode();
}

function createAnnotationNote({ xPercent, yPercent, text = '' }) {
    const annotationsLayer = document.getElementById('chartAnnotations');
    const note = document.createElement('div');
    const noteId = `note-${noteCounter++}`;

    note.className = 'chart-note';
    note.dataset.noteId = noteId;
    note.dataset.xPercent = xPercent.toFixed(2);
    note.dataset.yPercent = yPercent.toFixed(2);
    note.dataset.fontWeight = '400';
    note.dataset.fontStyle = 'normal';
    note.dataset.fontSize = '20';
    note.dataset.exportBorder = 'false';
    note.style.left = `${xPercent}%`;
    note.style.top = `${yPercent}%`;

    note.innerHTML = `
        <div class="chart-note-inner">
            <button type="button" class="chart-note-handle" data-drag-handle="true" title="Drag annotation" aria-label="Drag annotation">::</button>
            <div class="chart-note-body" contenteditable="true" spellcheck="false"></div>
        </div>
    `;

    const dragHandle = note.querySelector('[data-drag-handle="true"]');
    const body = note.querySelector('.chart-note-body');

    dragHandle.addEventListener('pointerdown', (event) => startNoteDrag(event, note));
    body.addEventListener('focus', () => setSelectedNote(note));
    body.addEventListener('input', () => setSelectedNote(note));
    note.addEventListener('pointerdown', (event) => {
        if (event.target === body) return;
        setSelectedNote(note);
    });
    body.textContent = text;

    annotationsLayer.appendChild(note);
    applyNoteStyles(note);
    setSelectedNote(note);
    body.focus();

    const selection = window.getSelection();
    const range = document.createRange();
    range.selectNodeContents(body);
    range.collapse(false);
    selection.removeAllRanges();
    selection.addRange(range);
}

function startNoteDrag(event, note) {
    event.preventDefault();
    event.stopPropagation();

    const viewportRect = document.getElementById('chartViewport').getBoundingClientRect();
    const noteRect = note.getBoundingClientRect();

    activeDrag = {
        note,
        offsetX: event.clientX - noteRect.left,
        offsetY: event.clientY - noteRect.top,
        viewportRect
    };

    note.setPointerCapture?.(event.pointerId);
}

function handleNoteDragMove(event) {
    if (!activeDrag) return;

    const { note, offsetX, offsetY, viewportRect } = activeDrag;
    const noteRect = note.getBoundingClientRect();

    const leftPx = clamp(event.clientX - viewportRect.left - offsetX, 0, viewportRect.width - noteRect.width);
    const topPx = clamp(event.clientY - viewportRect.top - offsetY, 0, viewportRect.height - noteRect.height);

    const xPercent = (leftPx / viewportRect.width) * 100;
    const yPercent = (topPx / viewportRect.height) * 100;

    note.dataset.xPercent = xPercent.toFixed(2);
    note.dataset.yPercent = yPercent.toFixed(2);
    note.style.left = `${xPercent}%`;
    note.style.top = `${yPercent}%`;
}

function stopNoteDrag() {
    activeDrag = null;
}

function clearAnnotations() {
    activeDrag = null;
    document.getElementById('chartAnnotations').replaceChildren();
    setSelectedNote(null);
    if (annotationMode) {
        toggleAnnotationMode();
    }
}

function deleteSelectedNote() {
    if (!selectedNote?.isConnected) return;
    const noteToDelete = selectedNote;
    setSelectedNote(null);
    noteToDelete.remove();
}

function exportChartAsImage() {
    if (!currentChart) return;

    const chartCanvas = document.getElementById('mainChart');
    const exportCanvas = document.createElement('canvas');
    const ctx = exportCanvas.getContext('2d');
    const viewport = document.getElementById('chartViewport');
    const viewportRect = viewport.getBoundingClientRect();

    exportCanvas.width = chartCanvas.width;
    exportCanvas.height = chartCanvas.height;

    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    ctx.drawImage(chartCanvas, 0, 0, exportCanvas.width, exportCanvas.height);

    document.querySelectorAll('#chartAnnotations .chart-note').forEach(note => {
        const x = (parseFloat(note.dataset.xPercent) / 100) * exportCanvas.width;
        const y = (parseFloat(note.dataset.yPercent) / 100) * exportCanvas.height;
        const noteWidth = (note.offsetWidth / viewportRect.width) * exportCanvas.width;
        const body = note.querySelector('.chart-note-body');
        const text = body.innerText.trim();
        const fontSize = Math.max(12, (parseInt(note.dataset.fontSize || '20', 10) / viewportRect.width) * exportCanvas.width);
        const fontWeight = note.dataset.fontWeight || '400';
        const fontStyle = note.dataset.fontStyle || 'normal';
        const exportBorder = note.dataset.exportBorder === 'true';
        const lineHeight = Math.max(16, fontSize * 1.25);
        const paddingX = Math.max(8, fontSize * 0.35);
        const paddingY = Math.max(6, fontSize * 0.28);

        ctx.fillStyle = '#0f172a';
        ctx.font = `${fontStyle} ${fontWeight} ${fontSize}px ${CHART_FONT_FAMILY}`;
        const textBlock = measureWrappedText(ctx, text || ' ', noteWidth);

        if (exportBorder) {
            drawRoundedRect(
                ctx,
                x - paddingX,
                y - paddingY,
                textBlock.maxLineWidth + (paddingX * 2),
                textBlock.height + (paddingY * 2),
                14,
                null,
                '#000000'
            );
        }

        drawWrappedText(ctx, textBlock.lines, x, y + fontSize, lineHeight);
    });

    const link = document.createElement('a');
    link.download = `gisr-network-${currentData.network_id}-${currentSpreadModel.toLowerCase()}.png`;
    link.href = exportCanvas.toDataURL('image/png');
    link.click();
}

function drawRoundedRect(ctx, x, y, width, height, radius, fillStyle, strokeStyle = null) {
    const r = Math.min(radius, width / 2, height / 2);
    ctx.beginPath();
    ctx.moveTo(x + r, y);
    ctx.arcTo(x + width, y, x + width, y + height, r);
    ctx.arcTo(x + width, y + height, x, y + height, r);
    ctx.arcTo(x, y + height, x, y, r);
    ctx.arcTo(x, y, x + width, y, r);
    ctx.closePath();

    if (fillStyle) {
        ctx.fillStyle = fillStyle;
        ctx.fill();
    }

    if (strokeStyle) {
        ctx.strokeStyle = strokeStyle;
        ctx.lineWidth = 1.4;
        ctx.stroke();
    }
}

function measureWrappedText(ctx, text, maxWidth) {
    const lines = [];
    let maxLineWidth = 0;
    const paragraphs = text.split('\n');

    paragraphs.forEach(paragraph => {
        const words = paragraph.split(/\s+/).filter(Boolean);
        let line = '';

        if (words.length === 0) {
            lines.push('');
            return;
        }

        words.forEach(word => {
            const testLine = line ? `${line} ${word}` : word;
            const testWidth = ctx.measureText(testLine).width;
            if (testWidth > maxWidth && line) {
                lines.push(line);
                maxLineWidth = Math.max(maxLineWidth, ctx.measureText(line).width);
                line = word;
            } else {
                line = testLine;
            }
        });

        if (line) {
            lines.push(line);
            maxLineWidth = Math.max(maxLineWidth, ctx.measureText(line).width);
        }
    });

    const fontSize = parseInt((ctx.font.match(/(\d+)px/) || [0, 16])[1], 10);
    const lineHeight = Math.max(16, fontSize * 1.25);
    return {
        lines,
        maxLineWidth,
        height: lines.length * lineHeight,
        lineHeight
    };
}

function drawWrappedText(ctx, lines, x, startY, lineHeight) {
    lines.forEach((line, index) => {
        ctx.fillText(line, x, startY + (index * lineHeight));
    });
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
