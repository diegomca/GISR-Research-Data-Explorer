const TOTAL_NETWORKS = 27; // We know there are 27 networks
const DATA_DIR = './web_data';
const CHART_FONT_FAMILY = "'Source Sans 3', sans-serif";
const CHART_TEXT_COLOR = '#334155';
const STORAGE_KEYS = {
    ui: 'gisr_dashboard_ui_v1',
    notes: 'gisr_dashboard_notes_v1'
};

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
const savedUIState = loadSavedState(STORAGE_KEYS.ui, {});
let currentSpreadModel = savedUIState.spreadModel || 'IC';

const displaySettings = {
    tickFontSize: 14,
    axisTitleFontSize: 18,
    lineWidth: 1.6,
    showTitle: true,
    ...(savedUIState.displaySettings || {})
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
        saveUIState();
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
    window.addEventListener('resize', renderArrows);

    const initialNetworkId = savedUIState.selectedNetworkId || '';
    if (initialNetworkId) {
        document.getElementById('networkSelect').value = initialNetworkId;
        loadNetwork(initialNetworkId);
    }
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
    document.getElementById('chartTitleToggle').addEventListener('change', (event) => {
        displaySettings.showTitle = event.target.checked;
        applyDisplaySettings();
        saveUIState();
    });
    // Prevent blur-before-click ordering issue: when the user clicks any style
    // button while the note body (contenteditable) has focus, mousedown fires
    // first and can blur the note before the click/change handler runs.
    // preventDefault() on mousedown stops the focus transfer without breaking
    // the click event itself.
    ['noteNormalBtn', 'noteBoldBtn', 'noteItalicBtn'].forEach(id => {
        document.getElementById(id).addEventListener('mousedown', e => e.preventDefault());
    });
    document.getElementById('noteNormalBtn').addEventListener('click', () => updateSelectedNoteStyle({ weight: '400' }));
    document.getElementById('noteBoldBtn').addEventListener('click', () => {
        const isBold = selectedNote?.dataset.fontWeight === '700';
        updateSelectedNoteStyle({ weight: isBold ? '400' : '700' });
    });
    document.getElementById('noteItalicBtn').addEventListener('click', toggleSelectedNoteItalic);
    document.getElementById('noteFontSizeSelect').addEventListener('change', (event) => {
        updateSelectedNoteStyle({ fontSize: parseInt(event.target.value, 10) });
    });
    document.getElementById('noteArrowModeSelect').addEventListener('change', (event) => {
        updateSelectedNoteStyle({ arrowMode: event.target.value });
    });
    document.getElementById('noteArrowColorInput').addEventListener('input', (event) => {
        updateSelectedNoteStyle({ arrowColor: event.target.value });
    });
    document.getElementById('noteArrowWidthSelect').addEventListener('change', (event) => {
        updateSelectedNoteStyle({ arrowWidth: parseInt(event.target.value, 10) });
    });
    document.getElementById('noteArrowStyleSelect').addEventListener('change', (event) => {
        updateSelectedNoteStyle({ arrowStyle: event.target.value });
    });
    document.getElementById('noteBorderToggle').addEventListener('change', (event) => {
        updateSelectedNoteStyle({ exportBorder: event.target.checked });
    });

    document.getElementById('chartViewport').addEventListener('click', handleChartViewportClick);
    document.getElementById('chartNotesLayer').addEventListener('click', (event) => {
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
    saveUIState();
}

function syncControlLabels() {
    document.getElementById('tickSizeValue').textContent = `${displaySettings.tickFontSize} px`;
    document.getElementById('axisTitleValue').textContent = `${displaySettings.axisTitleFontSize} px`;
    document.getElementById('lineWidthValue').textContent = `${displaySettings.lineWidth.toFixed(1)} px`;
    document.getElementById('chartTitleToggle').checked = displaySettings.showTitle;
}

function loadSavedState(key, fallback) {
    try {
        const raw = localStorage.getItem(key);
        return raw ? JSON.parse(raw) : fallback;
    } catch (error) {
        console.error(`Unable to load localStorage key ${key}:`, error);
        return fallback;
    }
}

function saveSavedState(key, value) {
    try {
        localStorage.setItem(key, JSON.stringify(value));
    } catch (error) {
        console.error(`Unable to save localStorage key ${key}:`, error);
    }
}

function saveUIState() {
    const selectedNetworkId = document.getElementById('networkSelect')?.value || '';
    saveSavedState(STORAGE_KEYS.ui, {
        spreadModel: currentSpreadModel,
        selectedNetworkId,
        displaySettings
    });
}

function getChartStorageKey(networkId = currentData?.network_id, spreadModel = currentSpreadModel) {
    return networkId ? `${spreadModel}:${networkId}` : null;
}

function loadNotesStore() {
    return loadSavedState(STORAGE_KEYS.notes, {});
}

function saveNotesStore(store) {
    saveSavedState(STORAGE_KEYS.notes, store);
}

function serializeAnnotations() {
    return Array.from(document.querySelectorAll('#chartNotesLayer .chart-note')).map(note => {
        const body = note.querySelector('.chart-note-body');
        return {
            noteId: note.dataset.noteId,
            xPercent: parseFloat(note.dataset.xPercent),
            yPercent: parseFloat(note.dataset.yPercent),
            text: body.innerText,
            fontWeight: note.dataset.fontWeight || '400',
            fontStyle: note.dataset.fontStyle || 'normal',
            fontSize: parseInt(note.dataset.fontSize || '20', 10),
            arrowMode: note.dataset.arrowMode || 'arrow',
            arrowColor: note.dataset.arrowColor || '#111111',
            arrowWidth: parseInt(note.dataset.arrowWidth || '3', 10),
            arrowStyle: note.dataset.arrowStyle || 'straight',
            arrowXPercent: parseFloat(note.dataset.arrowXPercent || note.dataset.xPercent),
            arrowYPercent: parseFloat(note.dataset.arrowYPercent || note.dataset.yPercent),
            exportBorder: note.dataset.exportBorder === 'true'
        };
    });
}

function persistAnnotationsForCurrentChart() {
    const storageKey = getChartStorageKey();
    if (!storageKey) return;

    const store = loadNotesStore();
    const serialized = serializeAnnotations();

    if (serialized.length > 0) {
        store[storageKey] = serialized;
    } else {
        delete store[storageKey];
    }

    saveNotesStore(store);
}

function restoreAnnotationsForCurrentChart() {
    removeAnnotationsFromDom();
    const storageKey = getChartStorageKey();
    if (!storageKey) return;

    const store = loadNotesStore();
    const annotations = store[storageKey] || [];

    annotations.forEach(annotation => {
        createAnnotationNote(annotation, { focus: false, persist: false });
    });

    setSelectedNote(null);
    renderArrows();
}

function applyDisplaySettings() {
    if (!currentChart) return;

    const options = currentChart.options;
    options.scales.x.ticks.font.size = displaySettings.tickFontSize;
    options.scales.y.ticks.font.size = displaySettings.tickFontSize;
    options.scales.x.title.font.size = displaySettings.axisTitleFontSize;
    options.scales.y.title.font.size = displaySettings.axisTitleFontSize;
    options.plugins.title.display = displaySettings.showTitle;

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
        saveUIState();
        // Reload if a network is selected
        const netId = document.getElementById('networkSelect').value;
        if (netId) loadNetwork(netId);
    });

    btnLT.addEventListener('click', () => {
        if (currentSpreadModel === 'LT') return;
        currentSpreadModel = 'LT';
        updateBtns();
        saveUIState();
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
    clearAnnotations({ persist: false });
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
        restoreAnnotationsForCurrentChart();
        saveUIState();

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
                    display: displaySettings.showTitle,
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
        renderArrows();
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
        updateArrowTargetsVisibility();
        renderArrows();
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
    updateArrowTargetsVisibility();
    renderArrows();
}

function syncNoteStylePanel() {
    const panel = document.getElementById('noteStylePanel');
    const normalBtn = document.getElementById('noteNormalBtn');
    const boldBtn = document.getElementById('noteBoldBtn');
    const italicBtn = document.getElementById('noteItalicBtn');
    const sizeSelect = document.getElementById('noteFontSizeSelect');
    const arrowModeSelect = document.getElementById('noteArrowModeSelect');
    const arrowColorInput = document.getElementById('noteArrowColorInput');
    const arrowWidthSelect = document.getElementById('noteArrowWidthSelect');
    const arrowStyleSelect = document.getElementById('noteArrowStyleSelect');
    const borderToggle = document.getElementById('noteBorderToggle');
    const deleteBtn = document.getElementById('deleteSelectedNoteBtn');

    const hasSelection = Boolean(selectedNote?.isConnected);
    panel.classList.toggle('hidden', !hasSelection);

    if (!hasSelection) {
        normalBtn.classList.remove('active');
        boldBtn.classList.remove('active');
        italicBtn.classList.remove('active');
        arrowModeSelect.value = 'none';
        arrowColorInput.value = '#111111';
        arrowWidthSelect.value = '3';
        arrowStyleSelect.value = 'straight';
        borderToggle.checked = false;
        deleteBtn.disabled = true;
        deleteBtn.classList.add('opacity-50', 'cursor-not-allowed');
        return;
    }

    const body = selectedNote.querySelector('.chart-note-body');
    const fontSize = parseInt(selectedNote.dataset.fontSize || '20', 10);
    const isBold = (selectedNote.dataset.fontWeight || '400') === '700';
    const isItalic = (selectedNote.dataset.fontStyle || 'normal') === 'italic';
    const arrowMode = selectedNote.dataset.arrowMode || 'arrow';
    const arrowColor = selectedNote.dataset.arrowColor || '#111111';
    const arrowWidth = selectedNote.dataset.arrowWidth || '3';
    const arrowStyle = selectedNote.dataset.arrowStyle || 'straight';
    const hasBorder = selectedNote.dataset.exportBorder === 'true';

    sizeSelect.value = String(fontSize);
    arrowModeSelect.value = arrowMode;
    arrowColorInput.value = arrowColor;
    arrowWidthSelect.value = arrowWidth;
    arrowStyleSelect.value = arrowStyle;
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
    if (patch.arrowMode) {
        selectedNote.dataset.arrowMode = patch.arrowMode;
    }
    if (patch.arrowColor) {
        selectedNote.dataset.arrowColor = patch.arrowColor;
    }
    if (patch.arrowWidth) {
        selectedNote.dataset.arrowWidth = String(patch.arrowWidth);
    }
    if (patch.arrowStyle) {
        selectedNote.dataset.arrowStyle = patch.arrowStyle;
    }

    applyNoteStyles(selectedNote);
    syncNoteStylePanel();
    updateArrowTargetsVisibility();
    renderArrows();
    persistAnnotationsForCurrentChart();
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
    updateArrowTargetPosition(note);
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

function createAnnotationNote({
    noteId = null,
    xPercent,
    yPercent,
    text = '',
    fontWeight = '400',
    fontStyle = 'normal',
    fontSize = 20,
    arrowMode = null,
    arrowEnabled = true,
    arrowColor = '#111111',
    arrowWidth = 3,
    arrowStyle = 'straight',
    arrowXPercent = null,
    arrowYPercent = null,
    exportBorder = false
}, options = {}) {
    const { focus = true, persist = true } = options;
    const notesLayer = document.getElementById('chartNotesLayer');
    const note = document.createElement('div');
    const resolvedNoteId = noteId || `note-${noteCounter++}`;
    const resolvedArrowMode = arrowMode || (arrowEnabled ? 'arrow' : 'none');
    noteCounter = Math.max(noteCounter, extractNoteCounter(resolvedNoteId) + 1);

    note.className = 'chart-note';
    note.dataset.noteId = resolvedNoteId;
    note.dataset.xPercent = xPercent.toFixed(2);
    note.dataset.yPercent = yPercent.toFixed(2);
    note.dataset.fontWeight = fontWeight;
    note.dataset.fontStyle = fontStyle;
    note.dataset.fontSize = String(fontSize);
    note.dataset.arrowMode = resolvedArrowMode;
    note.dataset.arrowColor = arrowColor;
    note.dataset.arrowWidth = String(arrowWidth);
    note.dataset.arrowStyle = arrowStyle;
    note.dataset.arrowXPercent = String(clamp(arrowXPercent ?? (xPercent + 10), 2, 98).toFixed(2));
    note.dataset.arrowYPercent = String(clamp(arrowYPercent ?? (yPercent + 10), 2, 98).toFixed(2));
    note.dataset.exportBorder = String(exportBorder);
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
    const arrowTarget = document.createElement('button');
    arrowTarget.type = 'button';
    arrowTarget.className = 'chart-note-target';
    arrowTarget.dataset.noteId = resolvedNoteId;
    arrowTarget.title = 'Drag arrow target';
    arrowTarget.setAttribute('aria-label', 'Drag arrow target');

    dragHandle.addEventListener('pointerdown', (event) => startNoteDrag(event, note));
    arrowTarget.addEventListener('pointerdown', (event) => startArrowTargetDrag(event, note));
    arrowTarget.addEventListener('click', (event) => {
        event.preventDefault();
        event.stopPropagation();
        setSelectedNote(note);
    });
    body.addEventListener('focus', () => setSelectedNote(note));
    body.addEventListener('input', () => {
        setSelectedNote(note);
        persistAnnotationsForCurrentChart();
    });
    note.addEventListener('pointerdown', (event) => {
        if (event.target === body) return;
        setSelectedNote(note);
    });
    body.textContent = text;

    notesLayer.appendChild(note);
    notesLayer.appendChild(arrowTarget);
    applyNoteStyles(note);
    setSelectedNote(note);

    if (focus) {
        body.focus();

        const selection = window.getSelection();
        const range = document.createRange();
        range.selectNodeContents(body);
        range.collapse(false);
        selection.removeAllRanges();
        selection.addRange(range);
    }

    if (persist) {
        persistAnnotationsForCurrentChart();
    }
    renderArrows();
}

function startNoteDrag(event, note) {
    event.preventDefault();
    event.stopPropagation();

    const viewportRect = document.getElementById('chartViewport').getBoundingClientRect();
    const noteRect = note.getBoundingClientRect();

    activeDrag = {
        type: 'note',
        note,
        offsetX: event.clientX - noteRect.left,
        offsetY: event.clientY - noteRect.top,
        viewportRect
    };

    note.setPointerCapture?.(event.pointerId);
}

function startArrowTargetDrag(event, note) {
    event.preventDefault();
    event.stopPropagation();
    setSelectedNote(note);

    const viewportRect = document.getElementById('chartViewport').getBoundingClientRect();
    activeDrag = {
        type: 'target',
        note,
        viewportRect
    };
}

function handleNoteDragMove(event) {
    if (!activeDrag) return;

    const { type, note, offsetX, offsetY, viewportRect } = activeDrag;

    if (type === 'note') {
        const noteRect = note.getBoundingClientRect();
        const leftPx = clamp(event.clientX - viewportRect.left - offsetX, 0, viewportRect.width - noteRect.width);
        const topPx = clamp(event.clientY - viewportRect.top - offsetY, 0, viewportRect.height - noteRect.height);

        const xPercent = (leftPx / viewportRect.width) * 100;
        const yPercent = (topPx / viewportRect.height) * 100;

        note.dataset.xPercent = xPercent.toFixed(2);
        note.dataset.yPercent = yPercent.toFixed(2);
        note.style.left = `${xPercent}%`;
        note.style.top = `${yPercent}%`;
    } else if (type === 'target') {
        const xPercent = clamp(((event.clientX - viewportRect.left) / viewportRect.width) * 100, 0, 100);
        const yPercent = clamp(((event.clientY - viewportRect.top) / viewportRect.height) * 100, 0, 100);

        note.dataset.arrowXPercent = xPercent.toFixed(2);
        note.dataset.arrowYPercent = yPercent.toFixed(2);
        updateArrowTargetPosition(note);
    }

    renderArrows();
}

function stopNoteDrag() {
    if (activeDrag?.note) {
        persistAnnotationsForCurrentChart();
    }
    activeDrag = null;
}

function removeAnnotationsFromDom() {
    activeDrag = null;
    document.getElementById('chartNotesLayer').replaceChildren();
    clearArrowLayer();
    setSelectedNote(null);
}

function clearAnnotations({ persist = true } = {}) {
    removeAnnotationsFromDom();
    if (persist) {
        persistAnnotationsForCurrentChart();
    }
    if (annotationMode) {
        toggleAnnotationMode();
    }
}

function deleteSelectedNote({ persist = true } = {}) {
    if (!selectedNote?.isConnected) return;
    const noteToDelete = selectedNote;
    const target = getArrowTargetElement(noteToDelete);
    setSelectedNote(null);
    noteToDelete.remove();
    target?.remove();
    renderArrows();
    if (persist) {
        persistAnnotationsForCurrentChart();
    }
}

function getArrowTargetElement(note) {
    return document.querySelector(`.chart-note-target[data-note-id="${note.dataset.noteId}"]`);
}

function updateArrowTargetPosition(note) {
    const target = getArrowTargetElement(note);
    if (!target) return;
    target.style.left = `${note.dataset.arrowXPercent}%`;
    target.style.top = `${note.dataset.arrowYPercent}%`;
}

function updateArrowTargetsVisibility() {
    document.querySelectorAll('.chart-note-target').forEach(target => {
        const note = document.querySelector(`.chart-note[data-note-id="${target.dataset.noteId}"]`);
        const isVisible = Boolean(
            note &&
            note.isConnected &&
            selectedNote === note &&
            note.dataset.arrowMode !== 'none'
        );
        target.classList.toggle('visible', isVisible);
        if (note) updateArrowTargetPosition(note);
    });
}

function clearArrowLayer() {
    const arrowLayer = document.getElementById('chartArrowLayer');
    arrowLayer.querySelectorAll('.rendered-arrow').forEach(element => element.remove());
}

function renderArrows() {
    clearArrowLayer();

    const arrowLayer = document.getElementById('chartArrowLayer');
    document.querySelectorAll('#chartNotesLayer .chart-note').forEach(note => {
        if ((note.dataset.arrowMode || 'arrow') === 'none') return;

        const positions = getNoteAndArrowPositions(note);
        if (!positions) return;

        const geometry = getArrowGeometry(
            positions.startX,
            positions.startY,
            positions.endX,
            positions.endY,
            note.dataset.arrowStyle || 'straight',
            note.dataset.arrowMode || 'arrow'
        );

        const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
        path.setAttribute('d', geometry.pathData);
        path.setAttribute('fill', 'none');
        path.setAttribute('stroke', note.dataset.arrowColor || '#111111');
        path.setAttribute('stroke-width', note.dataset.arrowWidth || '3');
        path.setAttribute('stroke-linecap', 'round');
        path.setAttribute('stroke-linejoin', 'round');
        path.classList.add('rendered-arrow');
        arrowLayer.appendChild(path);

        if (geometry.headPoints) {
            const arrowHead = document.createElementNS('http://www.w3.org/2000/svg', 'polygon');
            arrowHead.setAttribute('points', geometry.headPoints);
            arrowHead.setAttribute('fill', note.dataset.arrowColor || '#111111');
            arrowHead.classList.add('rendered-arrow');
            arrowLayer.appendChild(arrowHead);
        }
    });

    updateArrowTargetsVisibility();
}

function getNoteAndArrowPositions(note) {
    const viewportRect = document.getElementById('chartViewport').getBoundingClientRect();
    const noteRect = note.getBoundingClientRect();

    if (!viewportRect.width || !viewportRect.height || !noteRect.width || !noteRect.height) {
        return null;
    }

    const noteLeft = noteRect.left - viewportRect.left;
    const noteTop = noteRect.top - viewportRect.top;
    const noteWidth = noteRect.width;
    const noteHeight = noteRect.height;
    const centerX = noteLeft + (noteWidth / 2);
    const centerY = noteTop + (noteHeight / 2);
    const endX = (parseFloat(note.dataset.arrowXPercent) / 100) * viewportRect.width;
    const endY = (parseFloat(note.dataset.arrowYPercent) / 100) * viewportRect.height;
    const anchor = getRectAnchorPoint(centerX, centerY, noteWidth, noteHeight, endX, endY);

    return {
        startX: anchor.x,
        startY: anchor.y,
        endX,
        endY
    };
}

function getRectAnchorPoint(centerX, centerY, width, height, targetX, targetY) {
    const dx = targetX - centerX;
    const dy = targetY - centerY;
    const halfWidth = width / 2;
    const halfHeight = height / 2;

    if (dx === 0 && dy === 0) {
        return { x: centerX + halfWidth, y: centerY };
    }

    const scale = 1 / Math.max(Math.abs(dx) / halfWidth, Math.abs(dy) / halfHeight);
    return {
        x: centerX + (dx * scale),
        y: centerY + (dy * scale)
    };
}

function getArrowGeometry(startX, startY, endX, endY, style = 'straight', mode = 'arrow', headLength = 20) {
    const sanitizedStyle = style === 'elbow' ? 'elbow' : 'straight';
    const sanitizedMode = mode === 'line' ? 'line' : 'arrow';
    const hl = sanitizedMode === 'arrow' ? headLength : 0;

    if (sanitizedStyle === 'elbow' && Math.abs(endX - startX) > 18 && Math.abs(endY - startY) > 18) {
        const bendX = startX + ((endX - startX) * 0.58);
        const shaftEnd = getShaftEndPoint(bendX, endY, endX, endY, hl);
        const pathData = `M ${startX} ${startY} L ${bendX} ${startY} L ${bendX} ${shaftEnd.y} L ${shaftEnd.x} ${shaftEnd.y}`;
        const headPoints = sanitizedMode === 'arrow'
            ? getArrowHeadPoints(bendX, endY, endX, endY, hl)
            : null;
        return { pathData, headPoints };
    }

    const shaftEnd = getShaftEndPoint(startX, startY, endX, endY, hl);
    const pathData = `M ${startX} ${startY} L ${shaftEnd.x} ${shaftEnd.y}`;
    const headPoints = sanitizedMode === 'arrow'
        ? getArrowHeadPoints(startX, startY, endX, endY, hl)
        : null;
    return { pathData, headPoints };
}

function getArrowHeadPoints(fromX, fromY, toX, toY, headLength = 14) {
    const angle = Math.atan2(toY - fromY, toX - fromX);
    const spread = Math.PI / 6;
    const leftX = toX - (headLength * Math.cos(angle - spread));
    const leftY = toY - (headLength * Math.sin(angle - spread));
    const rightX = toX - (headLength * Math.cos(angle + spread));
    const rightY = toY - (headLength * Math.sin(angle + spread));
    return `${toX},${toY} ${leftX},${leftY} ${rightX},${rightY}`;
}

function getShaftEndPoint(fromX, fromY, toX, toY, headLength = 0) {
    if (headLength <= 0) {
        return { x: toX, y: toY };
    }

    const angle = Math.atan2(toY - fromY, toX - fromX);
    return {
        x: toX - (headLength * Math.cos(angle)),
        y: toY - (headLength * Math.sin(angle))
    };
}

async function exportChartAsImage() {
    if (!currentChart) return;

    const EXPORT_SCALE = 3; // 3x for crisp high-resolution output
    const viewport = document.getElementById('chartViewport');
    const viewportRect = viewport.getBoundingClientRect();
    const arrowLayer = document.getElementById('chartArrowLayer');
    const prevSelected = selectedNote;

    // Hide UI chrome: selection outline, drag handles, arrow targets, and the
    // SVG arrow layer (we'll redraw arrows manually at the correct export scale)
    if (prevSelected) prevSelected.classList.remove('selected');
    document.querySelectorAll('.chart-note-handle, .chart-note-target').forEach(el => {
        el.style.opacity = '0';
    });
    arrowLayer.style.visibility = 'hidden';

    try {
        // Capture viewport (chart + note text boxes) at 3x resolution
        const canvas = await html2canvas(viewport, {
            backgroundColor: '#ffffff',
            scale: EXPORT_SCALE,
            useCORS: true,
            logging: false,
            allowTaint: false,
            foreignObjectRendering: false
        });

        // Draw arrows manually over the captured canvas.
        // Anchoring to `.chart-note-inner` (which has padding 2px 4px) instead of
        // the outer `.chart-note` div gives the same visual gap as in the editor.
        const ctx = canvas.getContext('2d');
        const scaledHeadLength = 20 * EXPORT_SCALE;

        document.querySelectorAll('#chartNotesLayer .chart-note').forEach(note => {
            if ((note.dataset.arrowMode || 'arrow') === 'none') return;

            const inner = note.querySelector('.chart-note-inner');
            const innerRect = inner ? inner.getBoundingClientRect() : note.getBoundingClientRect();

            const noteLeft   = (innerRect.left   - viewportRect.left)   * EXPORT_SCALE;
            const noteTop    = (innerRect.top    - viewportRect.top)    * EXPORT_SCALE;
            const noteWidth  = innerRect.width  * EXPORT_SCALE;
            const noteHeight = innerRect.height * EXPORT_SCALE;
            const centerX    = noteLeft + noteWidth  / 2;
            const centerY    = noteTop  + noteHeight / 2;

            const endX = (parseFloat(note.dataset.arrowXPercent) / 100) * canvas.width;
            const endY = (parseFloat(note.dataset.arrowYPercent) / 100) * canvas.height;

            const anchor   = getRectAnchorPoint(centerX, centerY, noteWidth, noteHeight, endX, endY);
            const geometry = getArrowGeometry(
                anchor.x, anchor.y, endX, endY,
                note.dataset.arrowStyle || 'straight',
                note.dataset.arrowMode  || 'arrow',
                scaledHeadLength
            );

            const arrowWidth = parseFloat(note.dataset.arrowWidth || '3') * EXPORT_SCALE;
            drawArrow(ctx, geometry, note.dataset.arrowColor || '#111111', arrowWidth);
        });

        const link = document.createElement('a');
        link.download = `gisr-network-${currentData.network_id}-${currentSpreadModel.toLowerCase()}.png`;
        link.href = canvas.toDataURL('image/png');
        link.click();

    } catch (err) {
        console.error('Export failed, falling back to canvas-only export:', err);
        const chartCanvas = document.getElementById('mainChart');
        const link = document.createElement('a');
        link.download = `gisr-network-${currentData.network_id}-${currentSpreadModel.toLowerCase()}.png`;
        link.href = chartCanvas.toDataURL('image/png');
        link.click();

    } finally {
        // Restore everything
        arrowLayer.style.visibility = '';
        if (prevSelected?.isConnected) {
            prevSelected.classList.add('selected');
        }
        document.querySelectorAll('.chart-note-handle, .chart-note-target').forEach(el => {
            el.style.opacity = '';
        });
    }
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

function getNoteExportPositions(note, viewportRect, exportCanvas) {
    if (!note?.isConnected) return null;

    const noteRect = note.getBoundingClientRect();
    const noteLeft = ((noteRect.left - viewportRect.left) / viewportRect.width) * exportCanvas.width;
    const noteTop = ((noteRect.top - viewportRect.top) / viewportRect.height) * exportCanvas.height;
    const noteWidth = (noteRect.width / viewportRect.width) * exportCanvas.width;
    const noteHeight = (noteRect.height / viewportRect.height) * exportCanvas.height;
    const centerX = noteLeft + (noteWidth / 2);
    const centerY = noteTop + (noteHeight / 2);
    const endX = (parseFloat(note.dataset.arrowXPercent) / 100) * exportCanvas.width;
    const endY = (parseFloat(note.dataset.arrowYPercent) / 100) * exportCanvas.height;
    const anchor = getRectAnchorPoint(centerX, centerY, noteWidth, noteHeight, endX, endY);

    return {
        startX: anchor.x,
        startY: anchor.y,
        endX,
        endY
    };
}

function drawArrow(ctx, geometry, color, width) {
    ctx.save();
    ctx.strokeStyle = color;
    ctx.fillStyle = color;
    ctx.lineWidth = width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    ctx.beginPath();
    const path = new Path2D(geometry.pathData);
    ctx.stroke(path);

    if (geometry.headPoints) {
        const points = geometry.headPoints.split(' ').map(point => point.split(',').map(Number));
        ctx.beginPath();
        ctx.moveTo(points[0][0], points[0][1]);
        ctx.lineTo(points[1][0], points[1][1]);
        ctx.lineTo(points[2][0], points[2][1]);
        ctx.closePath();
        ctx.fill();
    }

    ctx.restore();
}

function extractNoteCounter(noteId) {
    const match = String(noteId).match(/note-(\d+)/);
    return match ? parseInt(match[1], 10) : 0;
}

function clamp(value, min, max) {
    return Math.min(Math.max(value, min), max);
}
