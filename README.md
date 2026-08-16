# Project GhostTrack // Space Collision Forensics

Project GhostTrack is an AI forensic system designed to detect and track untrackable sub-10cm space debris. By analyzing the speed changes (&Delta;v) and attitude perturbations (&Delta;&omega;) of satellites surviving non-destructive collisions, the system reverse-engineers the collision event to determine the mass, velocity, and future orbit of the debris.

## Directory Structure

```
GhostTrack/
├── backend/
│   ├── __init__.py
│   ├── simulator.py     # Monte Carlo collision simulator (momentum & torque physics)
│   ├── solver.py        # PyTorch multi-layer perceptron (predicts mass & velocity)
│   ├── propagator.py    # SGP4 & Keplerian RK4 orbit propagator with J2 perturbations
│   ├── main.py          # FastAPI application & REST routing
│   └── verify.py        # Automation verification test pipeline
├── frontend/
│   ├── index.html       # Glassmorphism dark-themed dashboard UI
│   ├── style.css        # Premium custom stylesheet with glows & micro-animations
│   └── app.js           # Live API client, Chart.js plotting, Shadow Catalog manager
├── requirements.txt     # Python dependency list
└── README.md            # Project description & guide
```

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

3. **Start the API & Dashboard Server**:
   Launch the FastAPI server using `uvicorn`:
   ```bash
   python -m uvicorn backend.main:app --reload --host 127.0.0.1 --port 8000
   ```

4. **Access the Dashboard**:
   Open [http://127.0.0.1:8000](http://127.0.0.1:8000) in your web browser.

## Features

- **Live Telemetry Simulation**: Click the **Simulate Collision Event** button to trigger a random Monte Carlo collision.
- **GhostNet Inference**: View the PyTorch network's predictions for the debris mass and impact velocity compared to the hidden Ground Truth.
- **Probabilistic Orbit Map**: View the predicted debris path and its expanding uncertainty cloud propagated 24 hours into the future using numerical RK4 integration with J2 gravity corrections.
- **Shadow Catalog**: Look at the catalog table logging all successfully identified debris, and click **Inspect Path** to render any logged debris' orbit.
