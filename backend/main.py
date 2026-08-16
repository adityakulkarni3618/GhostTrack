import os
import numpy as np
from fastapi import FastAPI, HTTPException
from fastapi.staticfiles import StaticFiles
from fastapi.middleware.cors import CORSMiddleware
from pydantic import BaseModel
from typing import List

from backend.simulator import generate_collision_data, compute_collision_diagnostics
from backend.solver import train_solver, predict_debris_properties
from backend.propagator import propagate_trajectory

app = FastAPI(title="GhostTrack API", description="AI Space Forensic Collision Tracker Backend")

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

# Request and Response Schemas
class TelemetryData(BaseModel):
    dV_x: float
    dV_y: float
    dV_z: float
    dW_x: float
    dW_y: float
    dW_z: float

class PropagationRequest(BaseModel):
    velocity_kms: float
    mass_g: float = 10.0
    hours: int = 720  # Default to 30 days (720 hours)

# Historical Collision Database
HISTORICAL_EVENTS = {
    "blits_2013": {
        "event_id": "EVT-2013-BLITS",
        "target_name": "BLITS (NORAD 35871)",
        "event_date": "2013-01-22 07:57 UTC",
        "telemetry": {
            "dV_x": 0.0014,
            "dV_y": -0.0009,
            "dV_z": 0.0025,
            "dW_x": 0.4210,
            "dW_y": 0.7950,
            "dW_z": -0.2840
        },
        "ground_truth": {
            "mass_g": 0.08,
            "velocity_kms": 9.8
        },
        "description": "Russian nanosatellite BLITS collided with a piece of Fengyun-1C debris, shifting its orbital period and spinning it off its coordinate axes."
    },
    "iss_canadarm2_2021": {
        "event_id": "EVT-2021-CANADARM2",
        "target_name": "ISS Canadarm2 (NORAD 25544)",
        "event_date": "2021-05-12 14:22 UTC",
        "telemetry": {
            "dV_x": 0.00018,
            "dV_y": 0.00009,
            "dV_z": -0.00024,
            "dW_x": 0.0017,
            "dW_y": -0.0035,
            "dW_z": 0.0009
        },
        "ground_truth": {
            "mass_g": 2.5,
            "velocity_kms": 11.2
        },
        "description": "A piece of sub-10cm space debris hit the ISS Canadarm2 robotic arm, puncturing the thermal blanket. Telemetry shows tiny perturbations due to ISS's enormous mass."
    }
}

@app.on_event("startup")
def startup_event():
    print("Training Physics-Informed (PINN) Solver on startup...")
    train_solver(epochs=150)

@app.get("/api/simulate")
def get_simulate():
    try:
        # Generate 1 collision event
        X, y = generate_collision_data(num_scenarios=1, noise_level=0.02)
        telemetry = X[0]
        ground_truth = y[0]
        
        return {
            "telemetry": {
                "dV_x": float(telemetry[0]),
                "dV_y": float(telemetry[1]),
                "dV_z": float(telemetry[2]),
                "dW_x": float(telemetry[3]),
                "dW_y": float(telemetry[4]),
                "dW_z": float(telemetry[5])
            },
            "ground_truth": {
                "mass_g": float(ground_truth[0]),
                "velocity_kms": float(ground_truth[1])
            }
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/solve")
def post_solve(data: TelemetryData):
    try:
        telemetry_list = [data.dV_x, data.dV_y, data.dV_z, data.dW_x, data.dW_y, data.dW_z]
        predictions = predict_debris_properties(telemetry_list)
        
        # Calculate structural/solar diagnostics
        dV = np.array([data.dV_x, data.dV_y, data.dV_z])
        dW = np.array([data.dW_x, data.dW_y, data.dW_z])
        diagnostics = compute_collision_diagnostics(
            dV, dW, 
            mass_g=predictions["predicted_mass_g"], 
            velocity_kms=predictions["predicted_velocity_kms"]
        )
        
        return {
            **predictions,
            "diagnostics": diagnostics
        }
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/api/propagate")
def post_propagate(request: PropagationRequest):
    try:
        # Determine propagation settings based on request hours (e.g. 24h vs 720h)
        step_hours = 1 if request.hours <= 24 else 12
        results = propagate_trajectory(
            v_rel_mag_kms=request.velocity_kms,
            mass_g=request.mass_g,
            hours=request.hours,
            step_hours=step_hours,
            num_cloud_paths=25
        )
        return results
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/api/historical_events")
def get_historical_events():
    return HISTORICAL_EVENTS

from fastapi.responses import FileResponse

# Serve index.html directly at the root URL
frontend_path = os.path.abspath(os.path.join(os.path.dirname(__file__), "..", "frontend"))

@app.get("/")
def read_index():
    index_file = os.path.join(frontend_path, "index.html")
    if os.path.exists(index_file):
        return FileResponse(index_file)
    raise HTTPException(status_code=404, detail="index.html not found")

# Mount Frontend Static Files for other assets (style.css, app.js)
if os.path.exists(frontend_path):
    app.mount("/", StaticFiles(directory=frontend_path, html=True), name="frontend")
else:
    print(f"Warning: Frontend static directory not found at {frontend_path}")
