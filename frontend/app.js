// State Management
let trajectoryChart = null;
let shadowCatalog = JSON.parse(localStorage.getItem('ghosttrack_catalog')) || [];
let activeMode = 'monte-carlo'; // 'monte-carlo', 'blits', 'canadarm'
let currentViewMode = '3d'; // '3d', '2d'

// Three.js 3D Globe variables
let scene, camera, renderer, wrapper;
let earthGroup;
let earthBaseMat, earthGridMat, earthRingMat;
let activeGlobeObjects = [];
let isDragging = false;
let previousMousePosition = { x: 0, y: 0 };

document.addEventListener('DOMContentLoaded', () => {
    initThreeGlobe();
    initChart();
    renderCatalog();
    initTheme();
    initStructuralCanvas();
    
    // Smooth scrolling navigation highlights
    document.querySelectorAll('.nav-item').forEach(item => {
        item.addEventListener('click', (e) => {
            document.querySelectorAll('.nav-item').forEach(nav => nav.classList.remove('active'));
            item.classList.add('active');
        });
    });
});

// Initialize Structural canvas placeholder
function initStructuralCanvas() {
    const canvas = document.getElementById('structural-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.08)';
    ctx.lineWidth = 1;
    ctx.setLineDash([4, 4]);
    
    // Draw default scope circles
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 45, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(canvas.width / 2, canvas.height / 2, 20, 0, Math.PI * 2);
    ctx.stroke();
}

// Draw 2D structural impact on canvas
function drawStructuralImpact(coords, punctured, diameter_mm, shockwave_radius_cm) {
    const canvas = document.getElementById('structural-canvas');
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    const centerX = canvas.width / 2;
    const centerY = canvas.height / 2;
    const isLight = document.body.classList.contains('light-theme');
    
    // Theme colors
    const strokeColor = isLight ? 'rgba(79, 70, 229, 0.15)' : 'rgba(0, 242, 254, 0.15)';
    const textColor = isLight ? '#475569' : '#64748b';
    const primaryColor = isLight ? '#4f46e5' : '#00f2fe';
    const accentColor = punctured ? (isLight ? '#e11d48' : '#ff2a5f') : (isLight ? '#d97706' : '#ffb703');
    
    // 1. Draw Satellite shell
    ctx.strokeStyle = strokeColor;
    ctx.lineWidth = 1.5;
    ctx.setLineDash([]);
    ctx.beginPath();
    ctx.arc(centerX, centerY, 40, 0, Math.PI * 2);
    ctx.stroke();
    
    // Draw crosshair axes
    ctx.strokeStyle = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.04)';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(centerX - 50, centerY);
    ctx.lineTo(centerX + 50, centerY);
    ctx.moveTo(centerX, centerY - 50);
    ctx.lineTo(centerX, centerY + 50);
    ctx.stroke();
    
    // 2. Map coordinates (lat, lon) to 2D pixel space inside satellite circle
    // Convert spherical latitude & longitude coordinates to orthographic projection offsets
    const latRad = coords.lat * Math.PI / 180;
    const lonRad = coords.lon * Math.PI / 180;
    
    const radius = 40;
    const impactX = centerX + radius * Math.cos(latRad) * Math.sin(lonRad);
    const impactY = centerY - radius * Math.sin(latRad);
    
    // 3. Draw shockwave ripple animation
    ctx.strokeStyle = accentColor;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(impactX, impactY, Math.min(25, 5 + shockwave_radius_cm / 2), 0, Math.PI * 2);
    ctx.stroke();
    
    // 4. Draw central impact breach hole
    ctx.fillStyle = accentColor;
    ctx.beginPath();
    ctx.arc(impactX, impactY, Math.max(3, diameter_mm / 2), 0, Math.PI * 2);
    ctx.fill();
    
    // 5. Add text tag info
    ctx.fillStyle = textColor;
    ctx.font = '9px monospace';
    ctx.textAlign = 'center';
    ctx.fillText(`LOC: [${coords.lat.toFixed(1)}°, ${coords.lon.toFixed(1)}°]`, centerX, canvas.height - 5);
}

// Theme handling
function initTheme() {
    const themeToggleBtn = document.getElementById('theme-toggle');
    const storedTheme = localStorage.getItem('ghosttrack_theme');
    
    if (storedTheme === 'light') {
        document.body.classList.add('light-theme');
        themeToggleBtn.innerHTML = `<i class="fa-solid fa-sun"></i>`;
        updateGlobeTheme(true);
    } else {
        document.body.classList.remove('light-theme');
        themeToggleBtn.innerHTML = `<i class="fa-solid fa-moon"></i>`;
        updateGlobeTheme(false);
    }
    
    themeToggleBtn.addEventListener('click', () => {
        const isLight = document.body.classList.toggle('light-theme');
        if (isLight) {
            localStorage.setItem('ghosttrack_theme', 'light');
            themeToggleBtn.innerHTML = `<i class="fa-solid fa-sun"></i>`;
            updateGlobeTheme(true);
            updateChartTheme(true);
        } else {
            localStorage.setItem('ghosttrack_theme', 'dark');
            themeToggleBtn.innerHTML = `<i class="fa-solid fa-moon"></i>`;
            updateGlobeTheme(false);
            updateChartTheme(false);
        }
    });
}

// Switch between 3D Globe and 2D Plot view
window.switchView = function(view) {
    currentViewMode = view;
    
    const btn3d = document.getElementById('btn-view-3d');
    const btn2d = document.getElementById('btn-view-2d');
    const container3d = document.getElementById('3d-globe-container');
    const container2d = document.getElementById('2d-chart-container');
    const isLight = document.body.classList.contains('light-theme');
    
    const activeColor = isLight ? '#4f46e5' : '#00f2fe';
    const textColor = isLight ? '#475569' : '#64748b';
    
    if (view === '3d') {
        btn3d.classList.add('active');
        btn3d.style.background = activeColor;
        btn3d.style.color = isLight ? '#fff' : '#000';
        
        btn2d.classList.remove('active');
        btn2d.style.background = 'transparent';
        btn2d.style.color = textColor;
        
        container3d.style.display = 'flex';
        container2d.style.display = 'none';
        container3d.style.opacity = '1';
        container2d.style.opacity = '0';
    } else {
        btn2d.classList.add('active');
        btn2d.style.background = activeColor;
        btn2d.style.color = isLight ? '#fff' : '#000';
        
        btn3d.classList.remove('active');
        btn3d.style.background = 'transparent';
        btn3d.style.color = textColor;
        
        container3d.style.display = 'none';
        container2d.style.display = 'flex';
        container3d.style.opacity = '0';
        container2d.style.opacity = '1';
        
        if (trajectoryChart) {
            trajectoryChart.resize();
        }
    }
};

// Switch Simulation Mode Cards
window.selectSimMode = function(mode) {
    activeMode = mode;
    document.querySelectorAll('.mode-card').forEach(card => card.classList.remove('active'));
    
    if (mode === 'monte-carlo') {
        document.getElementById('mode-monte-carlo').classList.add('active');
    } else if (mode === 'blits') {
        document.getElementById('mode-blits').classList.add('active');
    } else if (mode === 'canadarm') {
        document.getElementById('mode-canadarm').classList.add('active');
    }
};

// Initialize Three.js 3D Globe
// Let's add beacon animation states
let beaconMesh = null;
let beaconPoints = [];
let beaconIndex = 0;
let earthPointsMat = null;

function initThreeGlobe() {
    wrapper = document.getElementById('globe-canvas-wrapper');
    if (!wrapper) return;
    
    const width = wrapper.clientWidth || 500;
    const height = wrapper.clientHeight || 480;
    
    // 1. Scene, Camera, WebGLRenderer Setup
    scene = new THREE.Scene();
    
    camera = new THREE.PerspectiveCamera(45, width / height, 0.1, 100);
    camera.position.z = 6.2;
    
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(width, height);
    renderer.setPixelRatio(window.devicePixelRatio);
    wrapper.appendChild(renderer.domElement);
    
    // 2. Earth Setup (Group contains all globe components)
    earthGroup = new THREE.Group();
    scene.add(earthGroup);
    
    // Solid Earth core (semi-transparent deep void)
    const baseGeom = new THREE.SphereGeometry(1.98, 32, 32);
    earthBaseMat = new THREE.MeshBasicMaterial({ color: 0x040817, transparent: true, opacity: 0.9 });
    const earthBase = new THREE.Mesh(baseGeom, earthBaseMat);
    earthGroup.add(earthBase);
    
    // Tech Wireframe shell
    const gridGeom = new THREE.SphereGeometry(2.0, 24, 24);
    earthGridMat = new THREE.MeshBasicMaterial({ color: 0x00f2fe, wireframe: true, transparent: true, opacity: 0.15 });
    const earthGrid = new THREE.Mesh(gridGeom, earthGridMat);
    earthGroup.add(earthGrid);
    
    // Holographic particle sphere for a glowing matrix look
    const pCount = 1800;
    const pGeom = new THREE.BufferGeometry();
    const pPos = new Float32Array(pCount * 3);
    const radius = 2.01;
    for (let i = 0; i < pCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos((Math.random() * 2) - 1);
        pPos[i * 3] = radius * Math.sin(phi) * Math.cos(theta);
        pPos[i * 3 + 1] = radius * Math.sin(phi) * Math.sin(theta);
        pPos[i * 3 + 2] = radius * Math.cos(phi);
    }
    pGeom.setAttribute('position', new THREE.BufferAttribute(pPos, 3));
    earthPointsMat = new THREE.PointsMaterial({
        color: 0x00f2fe,
        size: 0.04,
        transparent: true,
        opacity: 0.65,
        blending: THREE.AdditiveBlending
    });
    const earthPoints = new THREE.Points(pGeom, earthPointsMat);
    earthGroup.add(earthPoints);
    
    // Multi-angle orbit context rings
    const ringColors = [0xa855f7, 0x00f2fe, 0x0d9488];
    earthRingMat = []; // store for theme switching
    for (let i = 0; i < 3; i++) {
        const rGeom = new THREE.RingGeometry(2.3 + i * 0.2, 2.31 + i * 0.2, 64);
        const rMat = new THREE.LineBasicMaterial({
            color: ringColors[i],
            transparent: true,
            opacity: 0.12,
            side: THREE.DoubleSide
        });
        earthRingMat.push(rMat);
        const loop = new THREE.LineLoop(rGeom, rMat);
        loop.rotation.x = (i * 45) * Math.PI / 180;
        loop.rotation.y = (i * 30) * Math.PI / 180;
        earthGroup.add(loop);
    }
    
    // 3. User interaction drag handler
    wrapper.addEventListener('pointerdown', (e) => {
        isDragging = true;
        previousMousePosition = { x: e.clientX, y: e.clientY };
    });
    
    wrapper.addEventListener('pointermove', (e) => {
        if (!isDragging) return;
        const deltaMove = {
            x: e.clientX - previousMousePosition.x,
            y: e.clientY - previousMousePosition.y
        };
        earthGroup.rotation.y += deltaMove.x * 0.005;
        earthGroup.rotation.x += deltaMove.y * 0.005;
        previousMousePosition = { x: e.clientX, y: e.clientY };
    });
    
    window.addEventListener('pointerup', () => {
        isDragging = false;
    });
    
    // 4. Animation loop
    function animate() {
        requestAnimationFrame(animate);
        
        // Auto-rotation when not dragging
        if (!isDragging) {
            earthGroup.rotation.y += 0.001;
        }
        
        // Tick trajectory tracking beacon
        if (beaconMesh && beaconPoints.length > 0) {
            beaconIndex = (beaconIndex + 1) % beaconPoints.length;
            beaconMesh.position.copy(beaconPoints[beaconIndex]);
        }
        
        renderer.render(scene, camera);
    }
    animate();
    
    // 5. Handle resizing
    window.addEventListener('resize', () => {
        if (!renderer || !camera || !wrapper) return;
        const w = wrapper.clientWidth;
        const h = wrapper.clientHeight;
        renderer.setSize(w, h);
        camera.aspect = w / h;
        camera.updateProjectionMatrix();
    });
}

// Convert latitude, longitude, and altitude to 3D Cartesian coordinates relative to a sphere radius
function llaToCartesian(lat, lon, alt, sphereRadius = 2.0) {
    const phi = (90 - lat) * (Math.PI / 180);
    const theta = (lon + 180) * (Math.PI / 180);
    
    // Scale altitude for display
    const scaleFactor = 1.0 + (alt / 1000.0) * 0.35; 
    const r = sphereRadius * scaleFactor;
    
    const x = -(r * Math.sin(phi) * Math.sin(theta));
    const y = r * Math.cos(phi);
    const z = r * Math.sin(phi) * Math.cos(theta);
    
    return new THREE.Vector3(x, y, z);
}

// Update 3D Globe lines and points
function updateGlobeVisuals(trajectoryData) {
    // Clear old lines
    activeGlobeObjects.forEach(obj => earthGroup.remove(obj));
    activeGlobeObjects = [];
    beaconMesh = null;
    beaconPoints = [];
    
    // 1. Draw uncertainty cloud paths (semi-transparent purple/rose)
    const isLight = document.body.classList.contains('light-theme');
    const cloudColor = isLight ? 0x8b5cf6 : 0xa855f7;
    
    trajectoryData.cloud.forEach(path => {
        const points = path.map(pt => llaToCartesian(pt.lat, pt.lon, pt.alt));
        const geom = new THREE.BufferGeometry().setFromPoints(points);
        const mat = new THREE.LineBasicMaterial({ color: cloudColor, transparent: true, opacity: 0.1 });
        const line = new THREE.Line(geom, mat);
        earthGroup.add(line);
        activeGlobeObjects.push(line);
    });
    
    // 2. Draw nominal path (bright cyan / indigo)
    const nominalColor = isLight ? 0x4f46e5 : 0x00f2fe;
    const nominalPoints = trajectoryData.nominal.map(pt => llaToCartesian(pt.lat, pt.lon, pt.alt));
    const nominalGeom = new THREE.BufferGeometry().setFromPoints(nominalPoints);
    const nominalMat = new THREE.LineBasicMaterial({ color: nominalColor, linewidth: 2.5 });
    const nominalLine = new THREE.Line(nominalGeom, nominalMat);
    earthGroup.add(nominalLine);
    activeGlobeObjects.push(nominalLine);
    
    // Store points for beacon tracker
    beaconPoints = nominalPoints;
    beaconIndex = 0;
    
    // 3. Draw satellite impact dot
    if (nominalPoints.length > 0) {
        const dotGeom = new THREE.SphereGeometry(0.06, 16, 16);
        const dotMat = new THREE.MeshBasicMaterial({ color: isLight ? 0xd97706 : 0xffb703 });
        const dotMesh = new THREE.Mesh(dotGeom, dotMat);
        dotMesh.position.copy(nominalPoints[0]);
        earthGroup.add(dotMesh);
        activeGlobeObjects.push(dotMesh);
        
        // 4. Create pulsing tracking beacon
        const beaconGeom = new THREE.SphereGeometry(0.04, 12, 12);
        const beaconMat = new THREE.MeshBasicMaterial({ color: nominalColor, transparent: true, opacity: 0.95 });
        beaconMesh = new THREE.Mesh(beaconGeom, beaconMat);
        earthGroup.add(beaconMesh);
        activeGlobeObjects.push(beaconMesh);
    }
}

// Dynamically change Globe theme settings
function updateGlobeTheme(isLight) {
    if (!earthBaseMat || !earthGridMat || !earthPointsMat) return;
    if (isLight) {
        earthBaseMat.color.setHex(0xf8fafc);
        earthBaseMat.opacity = 0.95;
        earthGridMat.color.setHex(0x4f46e5);
        earthGridMat.opacity = 0.08;
        earthPointsMat.color.setHex(0x4f46e5);
        earthPointsMat.opacity = 0.45;
        if (Array.isArray(earthRingMat)) {
            earthRingMat.forEach(m => { m.color.setHex(0x8b5cf6); m.opacity = 0.08; });
        }
    } else {
        earthBaseMat.color.setHex(0x040817);
        earthBaseMat.opacity = 0.9;
        earthGridMat.color.setHex(0x00f2fe);
        earthGridMat.opacity = 0.15;
        earthPointsMat.color.setHex(0x00f2fe);
        earthPointsMat.opacity = 0.65;
        if (Array.isArray(earthRingMat)) {
            const ringColors = [0xa855f7, 0x00f2fe, 0x0d9488];
            earthRingMat.forEach((m, idx) => { m.color.setHex(ringColors[idx] || 0xa855f7); m.opacity = 0.12; });
        }
    }
}

// Initialize Chart.js with space control styling
function initChart() {
    const ctx = document.getElementById('trajectory-chart').getContext('2d');
    const isLight = document.body.classList.contains('light-theme');
    
    const gridColor = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.03)';
    const textColor = isLight ? '#475569' : '#64748b';
    
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
                        color: textColor,
                        font: { family: 'Space Grotesk', size: 11, weight: 600 }
                    },
                    grid: { color: gridColor },
                    ticks: { color: textColor },
                    min: -180,
                    max: 180
                },
                y: {
                    title: {
                        display: true,
                        text: 'Latitude (Degrees)',
                        color: textColor,
                        font: { family: 'Space Grotesk', size: 11, weight: 600 }
                    },
                    grid: { color: gridColor },
                    ticks: { color: textColor },
                    min: -90,
                    max: 90
                }
            },
            plugins: {
                legend: { display: false },
                tooltip: {
                    backgroundColor: isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(5, 7, 18, 0.95)',
                    titleColor: isLight ? '#4f46e5' : '#00f2fe',
                    bodyColor: isLight ? '#1e293b' : '#e2e8f0',
                    borderColor: isLight ? 'rgba(79, 70, 229, 0.25)' : 'rgba(0, 242, 254, 0.25)',
                    borderWidth: 1,
                    displayColors: false,
                    titleFont: { family: 'Rajdhani', weight: 'bold' },
                    bodyFont: { family: 'Space Grotesk' }
                }
            }
        }
    });
}

// Dynamically update Chart.js theme variables
function updateChartTheme(isLight) {
    if (!trajectoryChart) return;
    
    const gridColor = isLight ? 'rgba(0, 0, 0, 0.05)' : 'rgba(255, 255, 255, 0.03)';
    const textColor = isLight ? '#475569' : '#64748b';
    
    trajectoryChart.options.scales.x.grid.color = gridColor;
    trajectoryChart.options.scales.y.grid.color = gridColor;
    trajectoryChart.options.scales.x.ticks.color = textColor;
    trajectoryChart.options.scales.y.ticks.color = textColor;
    trajectoryChart.options.scales.x.title.color = textColor;
    trajectoryChart.options.scales.y.title.color = textColor;
    
    trajectoryChart.options.plugins.tooltip.backgroundColor = isLight ? 'rgba(255, 255, 255, 0.95)' : 'rgba(5, 7, 18, 0.95)';
    trajectoryChart.options.plugins.tooltip.titleColor = isLight ? '#4f46e5' : '#00f2fe';
    trajectoryChart.options.plugins.tooltip.bodyColor = isLight ? '#1e293b' : '#e2e8f0';
    trajectoryChart.options.plugins.tooltip.borderColor = isLight ? 'rgba(79, 70, 229, 0.25)' : 'rgba(0, 242, 254, 0.25)';
    
    trajectoryChart.update();
}

// Run Collision Simulation (Random Monte Carlo)
window.runCollisionSimulation = async function(event) {
    if (event) event.stopPropagation(); // prevent card toggles
    
    const btn = document.getElementById('btn-run-sim');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Running...`;
    
    try {
        // 1. Fetch random telemetry
        const simResponse = await fetch('/api/simulate');
        if (!simResponse.ok) throw new Error('Simulation failed to generate data');
        const simData = await simResponse.json();
        
        // Update Telemetry Perturbations panel
        updateTelemetryUI(simData.telemetry);
        
        // 2. Call PINN Solver to get predictions
        const prediction = await callSolver(simData.telemetry);
        updateInferenceUI(prediction, simData.ground_truth);
        
        // Update HUD Satellite target label
        document.getElementById('globe-sat-target').innerText = `MC (Random Satellite)`;
        
        // 3. Propagate predicted orbital path (30 days = 720 hours)
        const trajectoryData = await propagateTrajectory(prediction.predicted_velocity_kms, prediction.predicted_mass_g);
        
        // Update 3D Visuals & 2D Chart
        updateGlobeVisuals(trajectoryData);
        updateChartData(trajectoryData);
        
        // Update Structural Illustration
        if (prediction.diagnostics) {
            updateDiagnosticsUI(prediction.diagnostics);
            drawStructuralImpact(
                prediction.diagnostics.impact_coords,
                prediction.diagnostics.punctured,
                prediction.diagnostics.diameter_mm,
                prediction.diagnostics.shockwave_radius_cm
            );
        }
        
        // Render avoidance warning notifications
        renderAlerts(trajectoryData.alerts);
        
        // 4. Save to Shadow Catalog
        const newDebris = {
            id: `GHOST-${Math.floor(1000 + Math.random() * 9000)}`,
            timestamp: new Date().toISOString().replace('T', ' ').substring(0, 19),
            mass: prediction.predicted_mass_g.toFixed(2),
            velocity: prediction.predicted_velocity_kms.toFixed(2),
            nominalPath: trajectoryData.nominal,
            alerts: trajectoryData.alerts || [],
            diagnostics: prediction.diagnostics
        };
        saveDebrisToCatalog(newDebris);
        
    } catch (err) {
        console.error(err);
        alert('Forensic Reconstruction Error: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
};

// Reconstruct Historical Collisions (BLITS 2013 or Canadarm2 2021)
window.runHistoricalSimulation = async function(eventKey, event) {
    if (event) event.stopPropagation();
    
    // Find the button and show loading state
    const cardEl = document.getElementById(eventKey === 'blits_2013' ? 'mode-blits' : 'mode-canadarm');
    const btn = cardEl.querySelector('.mode-btn');
    const originalText = btn.innerHTML;
    btn.disabled = true;
    btn.innerHTML = `<i class="fa-solid fa-spinner fa-spin"></i> Reconstructing...`;
    
    try {
        // 1. Fetch historical event database
        const eventsResponse = await fetch('/api/historical_events');
        if (!eventsResponse.ok) throw new Error('Could not retrieve historical database');
        const eventsDb = await eventsResponse.json();
        
        const historicalEvent = eventsDb[eventKey];
        if (!historicalEvent) throw new Error(`Event metadata for '${eventKey}' not found`);
        
        // Update Telemetry Panel with historic values
        updateTelemetryUI(historicalEvent.telemetry);
        
        // 2. Call PINN solver to estimate mass and velocity
        const prediction = await callSolver(historicalEvent.telemetry);
        updateInferenceUI(prediction, historicalEvent.ground_truth);
        
        // Update HUD satellite targets
        document.getElementById('globe-sat-target').innerText = historicalEvent.target_name;
        
        // 3. Propagate trajectory
        const trajectoryData = await propagateTrajectory(prediction.predicted_velocity_kms, prediction.predicted_mass_g);
        
        // Update 3D Globe & 2D Chart
        updateGlobeVisuals(trajectoryData);
        updateChartData(trajectoryData);
        
        // Update Structural Illustration
        if (prediction.diagnostics) {
            updateDiagnosticsUI(prediction.diagnostics);
            drawStructuralImpact(
                prediction.diagnostics.impact_coords,
                prediction.diagnostics.punctured,
                prediction.diagnostics.diameter_mm,
                prediction.diagnostics.shockwave_radius_cm
            );
        }
        
        // Display collision notifications
        renderAlerts(trajectoryData.alerts);
        
        // 4. Save to Shadow Catalog
        const newDebris = {
            id: `HIST-${historicalEvent.event_id}`,
            timestamp: historicalEvent.event_date,
            mass: prediction.predicted_mass_g.toFixed(2),
            velocity: prediction.predicted_velocity_kms.toFixed(2),
            nominalPath: trajectoryData.nominal,
            alerts: trajectoryData.alerts || [],
            diagnostics: prediction.diagnostics
        };
        saveDebrisToCatalog(newDebris);
        
    } catch (err) {
        console.error(err);
        alert('Historical Reconstruction Error: ' + err.message);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
};

// Helper: Call PINN Solver
async function callSolver(telemetry) {
    const solveResponse = await fetch('/api/solve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(telemetry)
    });
    if (!solveResponse.ok) throw new Error('PINN solver failed to compute parameters');
    return await solveResponse.json();
}

// Helper: Call Trajectory Propagator
async function propagateTrajectory(velocity_kms, mass_g) {
    const propResponse = await fetch('/api/propagate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ 
            velocity_kms: velocity_kms,
            mass_g: mass_g,
            hours: 720
        })
    });
    if (!propResponse.ok) throw new Error('Trajectory propagation failed');
    return await propResponse.json();
}

// Update Telemetry Vectors
function updateTelemetryUI(telemetry) {
    document.getElementById('val-dvx').innerText = `${telemetry.dV_x.toFixed(5)} m/s`;
    document.getElementById('val-dvy').innerText = `${telemetry.dV_y.toFixed(5)} m/s`;
    document.getElementById('val-dvz').innerText = `${telemetry.dV_z.toFixed(5)} m/s`;
    document.getElementById('val-dwx').innerText = `${telemetry.dW_x.toFixed(5)} rad/s`;
    document.getElementById('val-dwy').innerText = `${telemetry.dW_y.toFixed(5)} rad/s`;
    document.getElementById('val-dwz').innerText = `${telemetry.dW_z.toFixed(5)} rad/s`;
}

// Update Solver metrics
function updateInferenceUI(prediction, groundTruth) {
    document.getElementById('val-mass').innerText = `${prediction.predicted_mass_g.toFixed(2)}g`;
    document.getElementById('val-velocity').innerText = `${prediction.predicted_velocity_kms.toFixed(2)} km/s`;
    
    document.getElementById('truth-mass').innerText = `Ground Truth: ${groundTruth.mass_g.toFixed(2)}g`;
    document.getElementById('truth-velocity').innerText = `Ground Truth: ${groundTruth.velocity_kms.toFixed(2)} km/s`;
    
    // Accuracy calculation
    const massErr = Math.abs(prediction.predicted_mass_g - groundTruth.mass_g) / groundTruth.mass_g;
    const velErr = Math.abs(prediction.predicted_velocity_kms - groundTruth.velocity_kms) / groundTruth.velocity_kms;
    const avgErr = (massErr + velErr) / 2;
    const accuracy = Math.max(0, 100 * (1 - avgErr));
    
    const accuracyEl = document.getElementById('val-accuracy');
    accuracyEl.innerHTML = `Solver Accuracy Level: <span class="pct">${accuracy.toFixed(1)}%</span>`;
}

// Update Structural Diagnostics textual values
function updateDiagnosticsUI(diagnostics) {
    document.getElementById('diag-diameter').innerText = `${diagnostics.diameter_mm.toFixed(2)} mm`;
    document.getElementById('diag-ke').innerText = `${diagnostics.kinetic_energy_kj.toFixed(2)} kJ`;
    document.getElementById('solar-loss-val').innerText = `${diagnostics.solar_damage_pct.toFixed(1)}%`;
    document.getElementById('solar-progress').style.width = `${diagnostics.solar_damage_pct}%`;
    
    const hullStatusEl = document.getElementById('hull-status');
    if (diagnostics.punctured) {
        hullStatusEl.innerText = 'BREACH DETECTED';
        hullStatusEl.style.color = 'var(--color-danger)';
        hullStatusEl.style.borderColor = 'var(--color-danger)';
        hullStatusEl.style.background = 'rgba(255, 42, 95, 0.08)';
    } else {
        hullStatusEl.innerText = 'SURVIVED / INTENT';
        hullStatusEl.style.color = 'var(--color-green)';
        hullStatusEl.style.borderColor = 'var(--color-green)';
        hullStatusEl.style.background = 'rgba(0, 230, 118, 0.08)';
    }
}

// Render Trajectory paths on Chart.js
function updateChartData(trajectoryData) {
    const datasets = [];
    const isLight = document.body.classList.contains('light-theme');
    
    // Add perturbed paths (cloud paths)
    trajectoryData.cloud.forEach((path, idx) => {
        const cloudPoints = path.map(pt => ({ x: pt.lon, y: pt.lat }));
        datasets.push({
            label: `Cloud Vector ${idx}`,
            data: cloudPoints,
            borderColor: isLight ? 'rgba(124, 58, 237, 0.04)' : 'rgba(157, 78, 221, 0.05)',
            borderWidth: 1,
            pointRadius: 0,
            fill: false,
            tension: 0.1
        });
    });
    
    // Add Primary nominal path
    const nominalPoints = trajectoryData.nominal.map(pt => ({ x: pt.lon, y: pt.lat }));
    datasets.push({
        label: 'Nominal Propagated Path',
        data: nominalPoints,
        borderColor: isLight ? '#4f46e5' : '#00f2fe',
        borderWidth: 2.5,
        pointRadius: 0,
        fill: false,
        tension: 0.1
    });
    
    trajectoryChart.data.datasets = datasets;
    trajectoryChart.update();
}

// Render Avoidance Collision Warnings
function renderAlerts(alerts) {
    const container = document.getElementById('alerts-container');
    container.innerHTML = '';
    
    if (!alerts || alerts.length === 0) {
        container.innerHTML = `
            <div class="no-alerts">
                <i class="fa-solid fa-circle-check"></i>
                <p>No immediate close-approach events detected on current trajectories. Target satellites are clear of the debris cone.</p>
            </div>
        `;
        return;
    }
    
    const alertList = document.createElement('div');
    alertList.className = 'alerts-list';
    
    alerts.forEach(alert => {
        const alertItem = document.createElement('div');
        alertItem.className = 'alert-item';
        alertItem.innerHTML = `
            <div class="alert-header">
                <span class="alert-target"><i class="fa-solid fa-satellite-dish"></i> ${alert.satellite_name}</span>
                <span class="alert-distance">${alert.min_distance_km.toFixed(1)} km</span>
            </div>
            <div class="alert-body">
                Debris predicted within minimum separation envelope at hour ${alert.time_hours.toFixed(1)} post-impact.
            </div>
            <div class="alert-coords">
                <span>Lat: ${alert.coordinates.lat.toFixed(2)}°</span>
                <span>Lon: ${alert.coordinates.lon.toFixed(2)}°</span>
                <span>Alt: ${alert.coordinates.alt.toFixed(1)} km</span>
            </div>
        `;
        alertList.appendChild(alertItem);
    });
    
    container.appendChild(alertList);
}

// Catalog operations
function saveDebrisToCatalog(debris) {
    shadowCatalog.unshift(debris);
    localStorage.setItem('ghosttrack_catalog', JSON.stringify(shadowCatalog));
    renderCatalog();
}

function renderCatalog(filteredData = null) {
    const tbody = document.getElementById('catalog-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const dataToRender = filteredData || shadowCatalog;
    
    if (dataToRender.length === 0) {
        tbody.innerHTML = `<tr><td colspan="6" style="text-align: center; color: var(--color-text-muted); padding: 30px;">No debris records found. Run a simulation to catalog orbital items.</td></tr>`;
        return;
    }
    
    dataToRender.forEach((item) => {
        const tr = document.createElement('tr');
        const riskLevel = (item.alerts && item.alerts.length > 0) ? 'THREAT' : 'MONITORED';
        const badgeColor = riskLevel === 'THREAT' ? 'background: rgba(255, 42, 95, 0.08); color: var(--color-danger); border: 1px solid rgba(255, 42, 95, 0.15)' : '';
        
        tr.innerHTML = `
            <td style="font-family: var(--font-display); font-weight: 700; color: var(--color-text-light);">${item.id}</td>
            <td>${item.timestamp}</td>
            <td>${item.mass} g</td>
            <td>${item.velocity} km/s</td>
            <td><span class="badge" style="${badgeColor}">${riskLevel}</span></td>
            <td>
                <button class="table-btn" onclick="focusDebris('${item.id}')">Inspect</button>
                <button class="table-btn btn-delete" onclick="deleteDebris('${item.id}')">Delete</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

// Filter/Search through catalog
window.searchCatalog = function() {
    const q = document.getElementById('catalog-search').value.toLowerCase().trim();
    if (!q) {
        renderCatalog();
        return;
    }
    
    const filtered = shadowCatalog.filter(item => {
        return item.id.toLowerCase().includes(q) || 
               item.timestamp.toLowerCase().includes(q) ||
               item.mass.toString().includes(q) ||
               item.velocity.toString().includes(q);
    });
    
    renderCatalog(filtered);
};

// Export local Catalog as JSON download
window.exportCatalog = function() {
    if (shadowCatalog.length === 0) {
        alert('Catalog is currently empty. Reconstruct events first.');
        return;
    }
    const dataStr = "data:text/json;charset=utf-8," + encodeURIComponent(JSON.stringify(shadowCatalog, null, 2));
    const dlAnchorElem = document.createElement('a');
    dlAnchorElem.setAttribute("href", dataStr);
    dlAnchorElem.setAttribute("download", `GhostTrack_Shadow_Catalog_${new Date().toISOString().substring(0, 10)}.json`);
    dlAnchorElem.click();
};

// Delete a single item
window.deleteDebris = function(id) {
    if (!confirm(`Remove ${id} from catalog database?`)) return;
    shadowCatalog = shadowCatalog.filter(d => d.id !== id);
    localStorage.setItem('ghosttrack_catalog', JSON.stringify(shadowCatalog));
    renderCatalog();
};

// Clear entire catalog
window.clearCatalog = function() {
    if (!confirm('Warning: This will permanently wipe the local Shadow Catalog database. Proceed?')) return;
    shadowCatalog = [];
    localStorage.removeItem('ghosttrack_catalog');
    renderCatalog();
};

// Focus trajectory on both Globe and 2D Chart
window.focusDebris = function(debrisId) {
    const item = shadowCatalog.find(d => d.id === debrisId);
    if (!item) return;
    
    const detailPanel = document.getElementById('detail-panel');
    if (detailPanel) {
        // We are on catalog.html, show inspection details card
        const riskLevel = (item.alerts && item.alerts.length > 0) ? 'THREAT' : 'MONITORED';
        const badgeColor = riskLevel === 'THREAT' ? 'background: rgba(255, 42, 95, 0.08); color: var(--color-danger); border: 1px solid rgba(255, 42, 95, 0.15)' : 'background: rgba(0, 242, 254, 0.08); color: var(--color-primary); border: 1px solid rgba(0, 242, 254, 0.15)';
        
        let alertsHtml = '';
        if (item.alerts && item.alerts.length > 0) {
            item.alerts.forEach(alert => {
                alertsHtml += `
                    <div style="background: rgba(255, 42, 95, 0.03); border: 1px solid rgba(255, 42, 95, 0.1); border-radius: 8px; padding: 12px; margin-bottom: 10px; text-align: left;">
                        <div style="display: flex; justify-content: space-between; font-weight: 700; font-size: 0.85rem; color: var(--color-text-light); margin-bottom: 4px;">
                            <span><i class="fa-solid fa-satellite-dish" style="color: var(--color-danger);"></i> ${alert.satellite_name}</span>
                            <span style="color: var(--color-danger);">${alert.min_distance_km.toFixed(1)} km</span>
                        </div>
                        <div style="font-size: 0.78rem; color: var(--color-text-muted);">Approach hour: ${alert.time_hours.toFixed(1)}h</div>
                        <div style="font-size: 0.72rem; color: var(--color-primary); display: flex; justify-content: space-between; margin-top: 4px; font-family: var(--font-display);">
                            <span>Lat: ${alert.coordinates.lat.toFixed(2)}°</span>
                            <span>Lon: ${alert.coordinates.lon.toFixed(2)}°</span>
                            <span>Alt: ${alert.coordinates.alt.toFixed(1)} km</span>
                        </div>
                    </div>
                `;
            });
        } else {
            alertsHtml = `<div style="font-size: 0.82rem; color: var(--color-text-muted); text-align: center; padding: 10px 0;"><i class="fa-solid fa-circle-check" style="color: var(--color-green); margin-right: 6px;"></i> Clear of active satellites.</div>`;
        }
        
        let diagnosticsHtml = '';
        if (item.diagnostics) {
            const hullColor = item.diagnostics.punctured ? 'var(--color-danger)' : 'var(--color-green)';
            const hullBg = item.diagnostics.punctured ? 'rgba(255, 42, 95, 0.08)' : 'rgba(0, 230, 118, 0.08)';
            const hullBorder = item.diagnostics.punctured ? 'rgba(255, 42, 95, 0.15)' : 'rgba(0, 230, 118, 0.15)';
            diagnosticsHtml = `
                <div style="margin-top: 20px; border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 15px; text-align: left;">
                    <h4 style="font-family: var(--font-display); font-size: 0.9rem; color: var(--color-text-light); margin-bottom: 12px; letter-spacing: 0.5px;"><i class="fa-solid fa-circle-radiation" style="color: var(--color-primary); margin-right: 6px;"></i> Structural Diagnostics</h4>
                    <div style="display: grid; grid-template-columns: 1fr 1fr; gap: 12px; font-size: 0.82rem; margin-bottom: 15px; font-family: var(--font-display);">
                        <div>Debris Dia: <strong style="color: var(--color-primary);">${item.diagnostics.diameter_mm.toFixed(2)} mm</strong></div>
                        <div>Kinetic Energy: <strong style="color: var(--color-secondary);">${item.diagnostics.kinetic_energy_kj.toFixed(2)} kJ</strong></div>
                        <div style="grid-column: span 2; padding: 6px 12px; border-radius: 6px; background: ${hullBg}; border: 1px solid ${hullBorder}; color: ${hullColor}; font-weight: 700; text-align: center; font-size: 0.75rem;">
                            HULL STATUS: ${item.diagnostics.punctured ? 'BREACH DETECTED' : 'SURVIVED / DENTED'}
                        </div>
                    </div>
                    <div style="font-size: 0.75rem; color: var(--color-text-muted); margin-bottom: 6px; display: flex; justify-content: space-between;">
                        <span>Solar panel loss:</span>
                        <span style="color: var(--color-danger); font-weight: 700;">${item.diagnostics.solar_damage_pct.toFixed(1)}%</span>
                    </div>
                    <div style="background: rgba(255,255,255,0.02); border-radius: 4px; height: 6px; overflow: hidden; position: relative;">
                        <div style="width: ${item.diagnostics.solar_damage_pct}%; height: 100%; background: linear-gradient(90deg, var(--color-accent), var(--color-danger));"></div>
                    </div>
                </div>
            `;
        }
        
        detailPanel.style.display = 'block';
        detailPanel.style.textAlign = 'initial';
        detailPanel.innerHTML = `
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 20px; border-bottom: 1px solid rgba(255,255,255,0.06); padding-bottom: 15px;">
                <h3 style="font-family: var(--font-display); font-size: 1.35rem; color: var(--color-text-light); font-weight: 700; letter-spacing: 0.5px;">${item.id}</h3>
                <span class="badge" style="${badgeColor}">${riskLevel}</span>
            </div>
            <div style="font-size: 0.85rem; display: flex; flex-direction: column; gap: 10px; color: var(--color-text); text-align: left;">
                <div><i class="fa-solid fa-clock" style="color: var(--color-text-muted); margin-right: 10px; width: 14px;"></i> Cataloged: <strong style="color: var(--color-text-light);">${item.timestamp}</strong></div>
                <div><i class="fa-solid fa-scale-balanced" style="color: var(--color-text-muted); margin-right: 10px; width: 14px;"></i> Est. Mass: <strong style="color: var(--color-text-light);">${item.mass} g</strong></div>
                <div><i class="fa-solid fa-gauge-high" style="color: var(--color-text-muted); margin-right: 10px; width: 14px;"></i> Rel. Velocity: <strong style="color: var(--color-text-light);">${item.velocity} km/s</strong></div>
            </div>
            
            <div style="margin-top: 20px; border-top: 1px dashed rgba(255,255,255,0.08); padding-top: 15px; text-align: left;">
                <h4 style="font-family: var(--font-display); font-size: 0.9rem; color: var(--color-text-light); margin-bottom: 12px; letter-spacing: 0.5px;"><i class="fa-solid fa-radar" style="color: var(--color-accent); margin-right: 6px;"></i> Conjunction Alerts</h4>
                ${alertsHtml}
            </div>
            
            ${diagnosticsHtml}
        `;
        return;
    }
    
    // 1. Prepare simulated trajectory structure (Control Deck index.html only)
    const trajectoryData = {
        nominal: item.nominalPath,
        cloud: [], 
        alerts: item.alerts
    };
    
    // 2. Update Globe and 2D Plot
    updateGlobeVisuals(trajectoryData);
    updateChartData(trajectoryData);
    
    // 3. Draw structural impact indicator if details exist
    if (item.diagnostics) {
        updateDiagnosticsUI(item.diagnostics);
        drawStructuralImpact(
            item.diagnostics.impact_coords,
            item.diagnostics.punctured,
            item.diagnostics.diameter_mm,
            item.diagnostics.shockwave_radius_cm
        );
    }
    
    // 4. Update HUD target label
    const satTargetEl = document.getElementById('globe-sat-target');
    if (satTargetEl) satTargetEl.innerText = `Focus: ${item.id}`;
    
    // 5. Draw warnings for the focused debris
    renderAlerts(item.alerts);
    
    // 6. Smooth scroll to trajectory visualizer card
    const mapCard = document.querySelector('.card-map');
    if (mapCard) mapCard.scrollIntoView({ behavior: 'smooth' });
};
