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
});

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
            borderWidth: 1.6,
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
                            size: 18,
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
                            size: 14
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
                            size: 18,
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
                            size: 14
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
}
