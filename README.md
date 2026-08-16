# Project GhostTrack // Space Collision Forensics

Project GhostTrack is an AI forensic system designed to detect and track untrackable sub-10cm space debris. By analyzing the speed changes ($\Delta v$) and attitude perturbations ($\Delta \omega$) of satellites surviving non-destructive collisions, the system reverse-engineers the collision event to determine the mass, velocity, and future orbit of the debris.

---

## Directory Structure

```
GhostTrack/
├── backend/
│   ├── simulator.py     # Monte Carlo collision simulator & structural damage metrics
│   ├── solver.py        # PyTorch PINN (Physics-Informed Neural Network) solver
│   ├── propagator.py    # Keplerian RK4 orbit propagator with J2 perturbations
│   ├── main.py          # FastAPI application & REST API endpoints
│   └── verify.py        # Automated test verification pipeline
├── frontend/
│   ├── index.html       # Control Deck view (Telemetry, WebGL Globe, 2D chart, damage scanner)
│   ├── catalog.html     # Shadow Catalog registry (Search, inspection panel, JSON export)
│   ├── manual.html      # Forensic Operations Manual (math equations & models)
│   ├── style.css        # Cyberpunk stylesheet with theme transitions & animations
│   └── app.js           # Three.js globe loops, Chart.js plotting, and API client
├── .gitignore           # Ignores compiled pycache binaries
├── requirements.txt     # Python dependency list
└── README.md            # Project description & guide
```

---

## Setup & Running the Application

1. **Install Dependencies**:
   Ensure you have Python 3.8+ installed, then run:
   ```bash
   pip install -r requirements.txt
   ```

2. **Run Verification Suite (Optional)**:
   Verify that the backend simulator, PyTorch solver, and orbit propagator are working correctly:
   ```bash
   python backend/verify.py
   ```

3. **Start the API Backend Server**:
   Launch the FastAPI server using `uvicorn`:
   ```bash
   python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
   ```

4. **Start the Frontend Server**:
   Launch the static file server using `http-server` (caching disabled during development):
   ```bash
   npx http-server frontend -p 3001 -c-1
   ```

5. **Access the Dashboard**:
   Open **[http://localhost:3001](http://localhost:3001)** in your web browser.

---

## Core Features

- **Multi-Page Dashboard Workspace**:
  - **Control Deck**: Simulation sandbox, live telemetry stream, 3D WebGL Globe, and 2D structural impact scanner.
  - **Shadow Catalog**: Dynamic database registry of all forensically inferred debris. Click any row to load coordinates, conjunctions, and diagnostics inside the **Debris Inspector** card.
  - **Forensic Manual**: Operations reference displaying PINN loss functions and orbital integration formulas.
  
- **Interactive 3D WebGL Holographic Globe**:
  - Displays particle-based rotating Earth, satellite beacons, nominal debris paths, and uncertainty clouds.
  - Hover over the bottom-left controls to toggle **LEO (Low Earth)**, **MEO (Medium)**, or **GEO (Geostationary)** orbit shells.
  - Double-click or click **Reset Focus** to re-align the Earth rotation, and use the **Mouse Scroll Wheel** to zoom in and out.
  - Toggle the **Auto-Rotate** switch in the HUD to let the globe spin hands-free.

- **Forensic Telemetry Sandbox**:
  - Specify manual observed velocity shifts ($\Delta V$) and attitude spin rate changes ($\Delta \omega$) inside the form deck to simulate custom collision vectors.

- **Target Satellite Profiles**:
  - Switch target hulls between a **CubeSat (4kg)**, **Scientific Micro-Sat (50kg)**, **Communications Sat (2 Tons)**, and a **Space Station (450 Tons)**.
  - The physics model adjusts momentum equations, scaling predicted debris mass output and structural shockwave bounds dynamically.

- **Threat Conjunction Risk Badges**:
  - Close approaches are classified by severity tags:
    - **CRITICAL** (separation $< 30\text{ km}$) — Red badge.
    - **WARNING** (separation $30\text{ km} - 80\text{ km}$) — Amber badge.
    - **MONITORED** (separation $> 80\text{ km}$) — Cyan badge.

- **Live Database Counter**:
  - A dynamic indicator in the sidebar updates as items are added, deleted, or cleared, triggering a cyan pulse scaling animation.
