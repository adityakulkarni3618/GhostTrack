// State Management
let trajectoryChart = null;
let shadowCatalog = JSON.parse(localStorage.getItem('ghosttrack_catalog')) || [];

document.addEventListener('DOMContentLoaded', () => {
    initChart();
    renderCatalog();
    
    // Bind Event Listeners
    document.getElementById('btn-simulate').addEventListener('click', runCollisionSimulation);
});

// Initialize Chart.js with dark-mode styling
function initChart() {
    const ctx = document.getElementById('trajectory-chart').getContext('2d');
    
    trajectoryChart = new Chart(ctx, {
        type: 'line',
        data: {
            datasets: []
        },
        options: {
            responsive: true,
            maintainAspectRatio: false,
            scales: {
                x: {
                    type: 'linear',
                    position: 'bottom',
                    title: {
                        display: true,
                        text: 'Longitude (Degrees)',
                        color: '#64748b',
                        font: { family: 'Inter', size: 12, weight: 600 }
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: { color: '#64748b' },
                    min: -180,
                    max: 180
                },
                y: {
                    title: {
                        display: true,
                        text: 'Latitude (Degrees)',
                        color: '#64748b',
                        font: { family: 'Inter', size: 12, weight: 600 }
                    },
                    grid: { color: 'rgba(255, 255, 255, 0.04)' },
                    ticks: { color: '#64748b' },
                    min: -90,
                    max: 90
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: 'rgba(10, 12, 26, 0.95)',
                    titleColor: '#00f2fe',
                    bodyColor: '#fff',
                    borderColor: 'rgba(0, 242, 254, 0.2)',
                    borderWidth: 1,
                    displayColors: false
                }
            }
        }
    });
}

// Simulated Collision Trigger
async function runCollisionSimulation() {
    const btn = document.getElementById('btn-simulate');
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> Processing...`;
    
    try {
        // 1. Fetch simulation telemetry
        const simResponse = await fetch('/api/simulate');
        if (!simResponse.ok) throw new Error('Simulation failed');
        const simData = await simResponse.json();
        
        // Update Telemetry UI Panel
        updateTelemetryUI(simData.telemetry);
        
        // 2. Call solver to get AI predictions
        const solveResponse = await fetch('/api/solve', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(simData.telemetry)
        });
        if (!solveResponse.ok) throw new Error('Inference failed');
        const prediction = await solveResponse.json();
        
        // Update AI Inference UI panel
        updateInferenceUI(prediction, simData.ground_truth);
        
        // 3. Propagate predicted orbital path
        const propResponse = await fetch('/api/propagate', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ velocity_kms: prediction.predicted_velocity_kms })
        });
        if (!propResponse.ok) throw new Error('Trajectory propagation failed');
        const trajectoryData = await propResponse.json();
        
        // Update Chart
        updateChartData(trajectoryData);
        
        // 4. Save to Shadow Catalog
        const newDebris = {
            id: `GHOST-${Math.floor(1000 + Math.random() * 9000)}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            mass: prediction.predicted_mass_g.toFixed(2),
            velocity: prediction.predicted_velocity_kms.toFixed(2),
            nominalPath: trajectoryData.nominal
        };
        shadowCatalog.unshift(newDebris);
        localStorage.setItem('ghosttrack_catalog', JSON.stringify(shadowCatalog));
        renderCatalog();
        
    } catch (err) {
        console.error(err);
        alert('Error during forensic simulation: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = `<i class="fa-solid fa-bolt"></i> Simulate Collision Event`;
    }
}

function updateTelemetryUI(telemetry) {
    document.getElementById('val-dvx').innerText = `${telemetry.dV_x.toFixed(4)} m/s`;
    document.getElementById('val-dvy').innerText = `${telemetry.dV_y.toFixed(4)} m/s`;
    document.getElementById('val-dvz').innerText = `${telemetry.dV_z.toFixed(4)} m/s`;
    document.getElementById('val-dwx').innerText = `${telemetry.dW_x.toFixed(4)} rad/s`;
    document.getElementById('val-dwy').innerText = `${telemetry.dW_y.toFixed(4)} rad/s`;
    document.getElementById('val-dwz').innerText = `${telemetry.dW_z.toFixed(4)} rad/s`;
}

function updateInferenceUI(prediction, groundTruth) {
    // Predicted values
    document.getElementById('val-mass').innerText = `${prediction.predicted_mass_g.toFixed(2)}g`;
    document.getElementById('val-velocity').innerText = `${prediction.predicted_velocity_kms.toFixed(2)} km/s`;
    
    // Ground Truth
    document.getElementById('truth-mass').innerText = `Ground Truth: ${groundTruth.mass_g.toFixed(2)}g`;
    document.getElementById('truth-velocity').innerText = `Ground Truth: ${groundTruth.velocity_kms.toFixed(2)} km/s`;
    
    // Compute confidence / accuracy
    const massErr = Math.abs(prediction.predicted_mass_g - groundTruth.mass_g) / groundTruth.mass_g;
    const velErr = Math.abs(prediction.predicted_velocity_kms - groundTruth.velocity_kms) / groundTruth.velocity_kms;
    const avgErr = (massErr + velErr) / 2;
    const accuracy = Math.max(0, 100 * (1 - avgErr));
    
    const accuracyEl = document.getElementById('val-accuracy');
    accuracyEl.innerHTML = `Solver Accuracy Level: <span class="pct">${accuracy.toFixed(1)}%</span>`;
}

function updateChartData(trajectoryData) {
    const datasets = [];
    
    // Add cloud/perturbed paths
    trajectoryData.cloud.forEach((path, idx) => {
        const cloudDataPoints = path.map(pt => ({ x: pt.lon, y: pt.lat }));
        datasets.push({
            label: `Cloud Path ${idx}`,
            data: cloudDataPoints,
            borderColor: 'rgba(127, 0, 255, 0.08)',
            borderWidth: 1,
            pointRadius: 0,
            fill: false,
            tension: 0.1
        });
    });
    
    // Add primary nominal path (draw on top)
    const nominalDataPoints = trajectoryData.nominal.map(pt => ({ x: pt.lon, y: pt.lat }));
    datasets.push({
        label: 'Nominal Propagated Path',
        data: nominalDataPoints,
        borderColor: '#00f2fe',
        borderWidth: 2,
        pointRadius: 0,
        fill: false,
        tension: 0.1
    });
    
    trajectoryChart.data.datasets = datasets;
    trajectoryChart.update();
}

function renderCatalog() {
    const tbody = document.getElementById('catalog-body');
    tbody.innerHTML = '';
    
    if (shadowCatalog.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-text-muted);">No debris cataloged. Run a simulation to identify objects.</td></tr>`;
        return;
    }
    
    shadowCatalog.forEach((item, index) => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-family: var(--font-display); font-weight: 700; color: #fff;">${item.id}</td>
            <td>${item.timestamp}</td>
            <td>${item.mass} g</td>
            <td>${item.velocity} km/s</td>
            <td><span class="badge badge-cataloged">Cataloged</span></td>
            <td><button class="table-btn" onclick="focusDebris('${item.id}')">Inspect Path</button></td>
        `;
        tbody.appendChild(tr);
    });
}

// Window globally scoped function for inspecting paths in the chart
window.focusDebris = function(debrisId) {
    const item = shadowCatalog.find(d => d.id === debrisId);
    if (!item) return;
    
    // Re-draw chart with only the selected nominal trajectory
    const dataPoints = item.nominalPath.map(pt => ({ x: pt.lon, y: pt.lat }));
    trajectoryChart.data.datasets = [{
        label: `${item.id} Nominal Path`,
        data: dataPoints,
        borderColor: '#00f2fe',
        borderWidth: 3,
        pointRadius: 1,
        pointBackgroundColor: '#00f2fe',
        fill: false,
        tension: 0.1
    }];
    trajectoryChart.update();
    
    // Smooth scroll to chart container
    document.querySelector('.card-map').scrollIntoView({ behavior: 'smooth' });
};
