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
let currentCorrData = null;
let activeCorrProb = null;
let corrActiveK = new Set();
let corrActiveDir = new Set();
let modalChart = null;
let cellDetailChart = null;
let selectedCorrCell = null;
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
    initCorrNetworkSelect();
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

    document.getElementById('corrNetworkSelect').addEventListener('change', (e) => {
        const netId = e.target.value;
        if (netId) loadCorrNetwork(netId);
    });

    document.getElementById('corrResetFilters').addEventListener('click', () => {
        document.querySelectorAll('#corrFilterK input, #corrFilterDir input').forEach(cb => cb.checked = true);
        updateCorrActiveFilters();
        applyCorrFilters();
    });

    document.getElementById('openAvgEvolutionBtn').addEventListener('click', openAvgEvolutionModal);
    document.getElementById('openSigMapBtn').addEventListener('click', openSignificanceModal);
    document.getElementById('modalClose').addEventListener('click', closeModal);
    document.getElementById('analysisModal').addEventListener('click', e => { if (e.target === e.currentTarget) closeModal(); });
    document.getElementById('corrCellDetailClose').addEventListener('click', closeCellDetail);

    document.getElementById('resetFilters').addEventListener('click', () => {
        if (!currentData) return;
        // Check all checkboxes
        document.querySelectorAll('#filterPanel input[type="checkbox"]').forEach(cb => cb.checked = true);
        updateActiveFilters();
        applyFilters();
    });

    document.addEventListener('pointermove', handleNoteDragMove);
    document.addEventListener('pointerup', stopNoteDrag);
    window.addEventListener('resize', renderArrows);

    const initialNetworkId = savedUIState.selectedNetworkId || '1';
    document.getElementById('networkSelect').value = initialNetworkId;
    loadNetwork(initialNetworkId);
});

function initChartControls() {
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
        const corrNetId = document.getElementById('corrNetworkSelect').value;
        if (corrNetId && corrNetId !== netId) loadCorrNetwork(corrNetId);
    });

    btnLT.addEventListener('click', () => {
        if (currentSpreadModel === 'LT') return;
        currentSpreadModel = 'LT';
        updateBtns();
        saveUIState();
        const netId = document.getElementById('networkSelect').value;
        if (netId) loadNetwork(netId);
        const corrNetId = document.getElementById('corrNetworkSelect').value;
        if (corrNetId && corrNetId !== netId) loadCorrNetwork(corrNetId);
    });

    updateBtns();
}

function resetChart() {
    if (currentChart) currentChart.destroy();
    document.getElementById('networkInfo').classList.add('hidden');
    document.getElementById('filterPanel').classList.add('hidden');
    document.getElementById('correlationSection').classList.add('hidden');
    clearAnnotations({ persist: false });
    currentData = null;
    currentCorrData = null;
    activeCorrProb = null;
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
        const [curvesResp, corrResp] = await Promise.all([
            fetch(`${DATA_DIR}/${currentSpreadModel}/${id}.json`),
            fetch(`${DATA_DIR}/correlations/${currentSpreadModel}/${id}.json`)
        ]);

        if (!curvesResp.ok) throw new Error(`HTTP error! status: ${curvesResp.status}`);
        const data = await curvesResp.json();
        currentData = data;

        updateInfo(data.params);
        initFilters(data);
        renderChart(data);
        restoreAnnotationsForCurrentChart();

        // Sync corr selector to the same network on first selection
        const corrSelect = document.getElementById('corrNetworkSelect');
        if (!corrSelect.value) corrSelect.value = id;

        if (corrResp.ok) {
            currentCorrData = await corrResp.json();
            initCorrSection(currentCorrData);
        } else {
            currentCorrData = null;
            document.getElementById('correlationSection').classList.add('hidden');
        }

        saveUIState();

    } catch (e) {
        console.error("Failed to load network data:", e);
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

    const viewport = document.getElementById('chartViewport');
    const prevSelected = selectedNote;

    // Hide selection chrome so it doesn't appear in the export
    if (prevSelected) prevSelected.classList.remove('selected');
    document.querySelectorAll('.chart-note-handle, .chart-note-target').forEach(el => {
        el.style.opacity = '0';
    });

    try {
        // Capture the full viewport as rendered (chart + notes + arrows) at 3x resolution
        const canvas = await html2canvas(viewport, {
            backgroundColor: '#ffffff',
            scale: 3,
            useCORS: true,
            logging: false,
            allowTaint: false,
            foreignObjectRendering: false
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

// ── Modal ─────────────────────────────────────────────────────────────────────

function openModal(title, renderFn) {
    if (modalChart) { modalChart.destroy(); modalChart = null; }
    document.getElementById('modalTitle').textContent = title;
    const body = document.getElementById('modalBody');
    body.innerHTML = '';
    renderFn(body);
    const modal = document.getElementById('analysisModal');
    modal.classList.remove('hidden');
    modal.classList.add('flex');
}

function closeModal() {
    document.getElementById('analysisModal').classList.add('hidden');
    document.getElementById('analysisModal').classList.remove('flex');
    if (modalChart) { modalChart.destroy(); modalChart = null; }
}

// ── Feature 1: AVG |ρ| across networks ───────────────────────────────────────

async function openAvgEvolutionModal() {
    if (!currentCorrData) return;
    openModal(`AVG |ρ| across networks — ${currentSpreadModel} model`, body => {
        const desc = document.createElement('div');
        desc.className = 'mb-5 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm leading-6 text-slate-600';
        desc.innerHTML = `<strong class="text-slate-800">Mean |ρ| (off-diagonal)</strong> is the average of the absolute Spearman rank correlation values across all pairs of GISR centrality configurations (excluding the diagonal). A higher value indicates that the 12 configurations produce more similar node rankings within that network — suggesting that the choice of direction or depth level matters less. A lower value reflects greater diversity across configurations.`;
        body.appendChild(desc);
        const loading = document.createElement('p');
        loading.className = 'text-sm text-slate-500';
        loading.textContent = 'Loading all 27 networks…';
        body.appendChild(loading);
        fetchAllCorrNetworks().then(allData => {
            loading.remove();

            const probs = [0.25, 0.5, 0.75, 1.0];
            const colors = { 0.25: 'rgb(14,165,233)', 0.5: 'rgb(16,185,129)', 0.75: 'rgb(245,158,11)', 1.0: 'rgb(239,68,68)' };

            const wrapper = document.createElement('div');
            wrapper.style.height = '420px';
            const canvas = document.createElement('canvas');
            wrapper.appendChild(canvas);
            body.appendChild(wrapper);

            const datasets = probs.map(prob => ({
                label: `λ = ${prob}`,
                data: allData.map((d, idx) => ({
                    x: idx + 1,
                    y: d?.correlations.find(e => e.prob === prob)?.avg ?? null
                })),
                borderColor: colors[prob],
                backgroundColor: colors[prob],
                borderWidth: 2.5,
                pointRadius: 4,
                pointHoverRadius: 6,
                tension: 0.25,
                spanGaps: false
            }));

            modalChart = new Chart(canvas, {
                type: 'line',
                data: { datasets },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    scales: {
                        x: {
                            type: 'linear', min: 1, max: 27,
                            title: { display: true, text: 'Network ID', font: { size: 14, weight: '600' } },
                            ticks: { stepSize: 1 },
                            grid: { color: 'rgba(148,163,184,0.18)' }
                        },
                        y: {
                            title: { display: true, text: 'Mean |ρ| (off-diagonal)', font: { size: 14, weight: '600' } },
                            grid: { color: 'rgba(148,163,184,0.18)' }
                        }
                    },
                    plugins: {
                        legend: { position: 'top' },
                        tooltip: {
                            callbacks: {
                                title: ctx => `Network ${ctx[0].parsed.x}`,
                                label: ctx => `λ = ${ctx.dataset.label.split('= ')[1]}: ${ctx.parsed.y?.toFixed(4) ?? 'N/A'}`
                            }
                        }
                    }
                }
            });
        });
    });
}

async function fetchAllCorrNetworks() {
    return Promise.all(
        Array.from({ length: TOTAL_NETWORKS }, (_, i) =>
            fetch(`${DATA_DIR}/correlations/${currentSpreadModel}/${i + 1}.json`)
                .then(r => r.ok ? r.json() : null).catch(() => null)
        )
    );
}

// ── Feature 2: Cell click → correlation profile panel ─────────────────────────

function closeCellDetail() {
    selectedCorrCell = null;
    document.querySelectorAll('.corr-cell-selected').forEach(el => {
        el.classList.remove('corr-cell-selected');
        el.style.outline = '';
        el.style.outlineOffset = '';
    });
    document.getElementById('corrCellDetail').classList.add('hidden');
    if (cellDetailChart) { cellDetailChart.destroy(); cellDetailChart = null; }
}

function renderCellDetailPanel(rowIdx, colIdx, entry) {
    const { labels, matrix, significant } = entry;
    const rowLabel = shortCorrLabel(labels[rowIdx]);
    const colLabel = shortCorrLabel(labels[colIdx]);
    const rho = matrix[rowIdx][colIdx];
    const sig = significant[rowIdx][colIdx];

    // Get all filtered indices for context bars
    const indices = labels.reduce((acc, label, i) => {
        const m = label.match(/dir=(\w+);k=(\d+)/);
        if (m && corrActiveDir.has(m[1]) && corrActiveK.has(parseInt(m[2]))) acc.push(i);
        return acc;
    }, []);

    const otherIndices = indices.filter(j => j !== rowIdx);
    const barLabels = otherIndices.map(j => shortCorrLabel(labels[j]));
    const barValues = otherIndices.map(j => matrix[rowIdx][j]);
    const barBg = otherIndices.map(j => {
        if (j === colIdx) return 'rgb(14,165,233)';
        const v = matrix[rowIdx][j];
        return v === null ? '#e2e8f0' : corrColor(v).bg;
    });
    const barBorder = otherIndices.map(j => j === colIdx ? 'rgb(7,89,133)' : 'transparent');
    const barBorderWidth = otherIndices.map(j => j === colIdx ? 2 : 0);

    const sigText = rho === null ? 'NaN' : `ρ = ${rho.toFixed(4)}${sig ? '' : ' (p > 0.05)'}`;
    document.getElementById('corrCellDetailTitle').innerHTML =
        `Correlation profile of <strong>${rowLabel}</strong> with all other configurations &nbsp;·&nbsp; selected pair: <strong>${rowLabel} × ${colLabel}</strong> &nbsp; <span class="font-mono text-sky-700">${sigText}</span>`;

    document.getElementById('corrCellDetail').classList.remove('hidden');

    if (cellDetailChart) { cellDetailChart.destroy(); cellDetailChart = null; }

    cellDetailChart = new Chart(document.getElementById('corrCellDetailChart'), {
        type: 'bar',
        data: {
            labels: barLabels,
            datasets: [{
                data: barValues,
                backgroundColor: barBg,
                borderColor: barBorder,
                borderWidth: barBorderWidth
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                y: {
                    min: -1, max: 1,
                    title: { display: true, text: 'Spearman ρ', font: { size: 12 } },
                    grid: { color: 'rgba(148,163,184,0.2)' }
                },
                x: { grid: { display: false } }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    callbacks: {
                        label: ctx => ctx.raw === null ? 'NaN' : `ρ = ${ctx.raw.toFixed(4)}`
                    }
                }
            }
        }
    });
}

// ── Feature 3: Significance map modal ────────────────────────────────────────

function openSignificanceModal() {
    if (!currentCorrData) return;
    const entry = currentCorrData.correlations.find(e => e.prob === activeCorrProb);
    if (!entry) return;

    openModal(`Significance Map — λ = ${activeCorrProb} · ${currentSpreadModel}`, body => {
        const indices = entry.labels.reduce((acc, label, i) => {
            const m = label.match(/dir=(\w+);k=(\d+)/);
            if (m && corrActiveDir.has(m[1]) && corrActiveK.has(parseInt(m[2]))) acc.push(i);
            return acc;
        }, []);

        // Count significant off-diagonal pairs
        let total = 0, sigCount = 0;
        indices.forEach(i => indices.forEach(j => {
            if (i === j) return;
            total++;
            if (entry.significant[i][j] && entry.matrix[i][j] !== null) sigCount++;
        }));
        const pct = total > 0 ? ((sigCount / total) * 100).toFixed(1) : '—';

        const desc = document.createElement('div');
        desc.className = 'mb-4 rounded-2xl border border-slate-200 bg-slate-50 px-5 py-3 text-sm leading-6 text-slate-600';
        desc.innerHTML = `<strong class="text-slate-800">Statistical significance map.</strong> Each cell indicates whether the Spearman correlation between two GISR centrality configurations is statistically significant. A pair is marked <strong>significant</strong> (p ≤ 0.05) when the probability of observing that correlation by chance is below 5%. Non-significant pairs should be interpreted with caution — the observed ρ may be noise rather than a true monotonic relationship.`;
        body.appendChild(desc);

        const summary = document.createElement('div');
        summary.className = 'mb-5 rounded-2xl border border-sky-100 bg-sky-50 px-5 py-3 text-sm text-slate-600';
        summary.innerHTML = `
            <strong class="text-slate-900">${sigCount} / ${total}</strong> off-diagonal pairs are statistically significant (p ≤ 0.05)
            &nbsp;—&nbsp; <strong class="text-slate-900">${pct}%</strong> of all tested pairs.
            <span class="ml-3 text-slate-400">✓ = significant &nbsp; ✗ = not significant &nbsp; — = NaN</span>
        `;
        body.appendChild(summary);

        const table = document.createElement('table');
        table.className = 'corr-heatmap';

        const thead = table.createTHead();
        const headerRow = thead.insertRow();
        const corner = document.createElement('th');
        corner.className = 'corr-corner';
        headerRow.appendChild(corner);
        indices.forEach(i => {
            const th = document.createElement('th');
            th.className = 'corr-col-header';
            th.textContent = shortCorrLabel(entry.labels[i]);
            headerRow.appendChild(th);
        });

        const tbody = table.createTBody();
        indices.forEach(i => {
            const tr = tbody.insertRow();
            const rh = document.createElement('th');
            rh.className = 'corr-row-header';
            rh.textContent = shortCorrLabel(entry.labels[i]);
            tr.appendChild(rh);

            indices.forEach(j => {
                const td = tr.insertCell();
                td.className = 'corr-cell';
                const v = entry.matrix[i][j];
                const sig = entry.significant[i][j];

                if (i === j) {
                    td.style.cssText = 'background:#0f172a;color:#fff;font-size:11px';
                    td.textContent = 'diag';
                } else if (v === null) {
                    td.style.cssText = 'background:#e2e8f0;color:#94a3b8';
                    td.textContent = '\u2014';
                    td.title = 'NaN — zero variance';
                } else if (sig) {
                    td.style.cssText = 'background:rgb(14,165,233);color:#fff';
                    td.textContent = '\u2713';
                    td.title = `ρ = ${v.toFixed(4)} (p ≤ 0.05)`;
                } else {
                    td.style.cssText = 'background:#f8fafc;color:#cbd5e1';
                    td.textContent = '\u2717';
                    td.title = `ρ = ${v.toFixed(4)} (p > 0.05)`;
                }
            });
        });

        const wrapper = document.createElement('div');
        wrapper.className = 'overflow-x-auto';
        wrapper.appendChild(table);
        body.appendChild(wrapper);

        const legend = document.createElement('div');
        legend.className = 'mt-4 flex flex-wrap gap-4 text-sm text-slate-600';
        legend.innerHTML = `
            <span class="flex items-center gap-1.5"><span class="inline-flex h-5 w-5 items-center justify-center rounded bg-sky-500 text-white text-xs">✓</span> Significant (p ≤ 0.05)</span>
            <span class="flex items-center gap-1.5"><span class="inline-flex h-5 w-5 items-center justify-center rounded border border-slate-200 bg-slate-50 text-slate-300 text-xs">✗</span> Not significant</span>
            <span class="flex items-center gap-1.5"><span class="inline-block h-5 w-5 rounded bg-slate-200"></span> NaN (zero variance)</span>
            <span class="flex items-center gap-1.5"><span class="inline-block h-5 w-5 rounded bg-slate-900"></span> Diagonal (self)</span>
        `;
        body.appendChild(legend);
    });
}

// ── Correlation matrices ──────────────────────────────────────────────────────

function initCorrNetworkSelect() {
    const select = document.getElementById('corrNetworkSelect');
    for (let i = 1; i <= TOTAL_NETWORKS; i++) {
        const option = document.createElement('option');
        option.value = i;
        option.textContent = `Network ${i}`;
        select.appendChild(option);
    }
}

async function loadCorrNetwork(id) {
    try {
        const resp = await fetch(`${DATA_DIR}/correlations/${currentSpreadModel}/${id}.json`);
        if (!resp.ok) throw new Error(`HTTP ${resp.status}`);
        currentCorrData = await resp.json();
        initCorrSection(currentCorrData);
    } catch (e) {
        console.error('Failed to load correlation data:', e);
    }
}

function initCorrSection(corrData) {
    // Extract unique k and dir values from labels
    const kValues = new Set();
    const dirValues = new Set();
    corrData.correlations[0]?.labels.forEach(label => {
        const m = label.match(/dir=(\w+);k=(\d+)/);
        if (m) { dirValues.add(m[1]); kValues.add(parseInt(m[2])); }
    });

    // Build filter checkboxes (only on first load or when sets change)
    buildCorrFilterSection('corrFilterK', [...kValues].sort((a, b) => a - b), 'k');
    buildCorrFilterSection('corrFilterDir', [...dirValues].sort(), 'dir');

    // Initialize active filters to all
    corrActiveK = new Set(kValues);
    corrActiveDir = new Set(dirValues);

    // Build prob tabs
    const probs = corrData.correlations.map(e => e.prob);
    const tabsContainer = document.getElementById('corrProbTabs');
    tabsContainer.innerHTML = '';
    probs.forEach(prob => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.dataset.prob = prob;
        btn.textContent = `λ = ${prob}`;
        btn.className = 'corr-prob-tab flex-1 rounded-xl px-4 py-2.5 text-sm font-semibold transition-colors text-slate-700 hover:bg-slate-100';
        btn.addEventListener('click', () => switchCorrProb(prob));
        tabsContainer.appendChild(btn);
    });

    const firstProb = activeCorrProb && probs.includes(activeCorrProb) ? activeCorrProb : probs[0];
    switchCorrProb(firstProb);
    document.getElementById('correlationSection').classList.remove('hidden');
}

function buildCorrFilterSection(containerId, values, type) {
    const container = document.getElementById(containerId);
    container.innerHTML = '';
    values.forEach(val => {
        const div = document.createElement('div');
        div.className = 'flex items-center';

        const input = document.createElement('input');
        input.type = 'checkbox';
        input.id = `corr_${type}_${val}`;
        input.value = val;
        input.checked = true;
        input.dataset.corrType = type;
        input.className = 'h-4 w-4 cursor-pointer rounded border-slate-300 text-sky-700 focus:ring-sky-500';
        input.addEventListener('change', () => { updateCorrActiveFilters(); applyCorrFilters(); });

        const label = document.createElement('label');
        label.htmlFor = `corr_${type}_${val}`;
        label.className = 'ml-2 block cursor-pointer select-none text-sm text-slate-800';
        label.textContent = val;

        div.appendChild(input);
        div.appendChild(label);
        container.appendChild(div);
    });
}

function updateCorrActiveFilters() {
    corrActiveK.clear();
    corrActiveDir.clear();
    document.querySelectorAll('#corrFilterK input:checked').forEach(cb => corrActiveK.add(parseInt(cb.value)));
    document.querySelectorAll('#corrFilterDir input:checked').forEach(cb => corrActiveDir.add(cb.value));
}

function applyCorrFilters() {
    if (!currentCorrData) return;
    closeCellDetail();
    switchCorrProb(activeCorrProb);
}

function switchCorrProb(prob) {
    closeCellDetail();
    activeCorrProb = prob;

    document.querySelectorAll('.corr-prob-tab').forEach(btn => {
        const active = parseFloat(btn.dataset.prob) === prob;
        btn.classList.toggle('bg-sky-700', active);
        btn.classList.toggle('text-white', active);
        btn.classList.toggle('shadow-sm', active);
        btn.classList.toggle('text-slate-700', !active);
    });

    const entry = currentCorrData?.correlations.find(e => e.prob === prob);
    if (!entry) return;

    const container = document.getElementById('corrMatrixContainer');
    container.innerHTML = '';
    container.appendChild(buildCorrHeatmap(entry));

    document.getElementById('corrNRows').textContent = entry.n_rows?.toLocaleString() ?? '—';
    document.getElementById('corrAvg').textContent = entry.avg != null ? entry.avg.toFixed(4) : '—';
    document.getElementById('corrStd').textContent = entry.std != null ? entry.std.toFixed(4) : '—';
    document.getElementById('corrRemoved').textContent = entry.removed ?? '—';
}

function shortCorrLabel(label) {
    const m = label.match(/dir=(\w+);k=(\d+)/);
    return m ? `${m[1]}\u00B7${m[2]}` : label;
}

function corrColor(v) {
    if (v === null) return { bg: '#cbd5e1', text: '#64748b' };
    const t = Math.max(-1, Math.min(1, v));
    let r, g, b;
    if (t >= 0) {
        r = Math.round(247 + t * (178 - 247));
        g = Math.round(247 + t * (24 - 247));
        b = Math.round(247 + t * (43 - 247));
    } else {
        const s = -t;
        r = Math.round(247 + s * (33 - 247));
        g = Math.round(247 + s * (102 - 247));
        b = Math.round(247 + s * (172 - 247));
    }
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255;
    return { bg: `rgb(${r},${g},${b})`, text: luminance > 0.52 ? '#0f172a' : '#ffffff' };
}

function buildCorrHeatmap(entry) {
    const { labels, matrix, significant } = entry;

    // Apply direction + k filters
    const indices = labels.reduce((acc, label, i) => {
        const m = label.match(/dir=(\w+);k=(\d+)/);
        if (m && corrActiveDir.has(m[1]) && corrActiveK.has(parseInt(m[2]))) acc.push(i);
        return acc;
    }, []);

    const filteredLabels = indices.map(i => labels[i]);

    const table = document.createElement('table');
    table.className = 'corr-heatmap';

    // Column header row
    const thead = table.createTHead();
    const headerRow = thead.insertRow();
    const corner = document.createElement('th');
    corner.className = 'corr-corner';
    headerRow.appendChild(corner);

    filteredLabels.forEach(label => {
        const th = document.createElement('th');
        th.className = 'corr-col-header';
        th.textContent = shortCorrLabel(label);
        th.title = label;
        headerRow.appendChild(th);
    });

    // Data rows
    const tbody = table.createTBody();
    indices.forEach(i => {
        const rowLabel = labels[i];
        const tr = tbody.insertRow();

        const rowHeader = document.createElement('th');
        rowHeader.className = 'corr-row-header';
        rowHeader.textContent = shortCorrLabel(rowLabel);
        rowHeader.title = rowLabel;
        tr.appendChild(rowHeader);

        indices.forEach(j => {
            const v = matrix[i][j];
            const sig = significant[i][j];
            const { bg, text } = corrColor(v);

            const td = tr.insertCell();
            td.className = 'corr-cell';
            td.style.backgroundColor = bg;
            td.style.color = text;

            if (v === null) {
                td.textContent = '\u2014';
                td.title = `${shortCorrLabel(rowLabel)} \u00D7 ${shortCorrLabel(labels[j])}: NaN \u2014 zero variance`;
            } else {
                const display = v.toFixed(2);
                td.textContent = sig ? display : `${display}*`;
                if (!sig) td.style.opacity = '0.78';
                td.title = `${shortCorrLabel(rowLabel)} \u00D7 ${shortCorrLabel(labels[j])}: \u03C1\u202F=\u202F${v.toFixed(4)}${sig ? '' : '\u2002(p\u202F>\u202F0.05)'}`;
            }

            // Cell click → detail panel (skip diagonal)
            if (i !== j) {
                td.style.cursor = 'pointer';
                td.addEventListener('click', () => {
                    const isSame = selectedCorrCell?.i === i && selectedCorrCell?.j === j;
                    if (isSame) { closeCellDetail(); return; }
                    // Remove previous highlight
                    document.querySelectorAll('.corr-cell-selected').forEach(el => el.classList.remove('corr-cell-selected'));
                    td.classList.add('corr-cell-selected');
                    td.style.outline = '2px solid rgb(14,165,233)';
                    td.style.outlineOffset = '-2px';
                    selectedCorrCell = { i, j };
                    renderCellDetailPanel(i, j, entry);
                });
            }
        });
    });

    return table;
}
