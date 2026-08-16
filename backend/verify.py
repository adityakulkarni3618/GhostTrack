import sys
import os

# Add root directory to path to support running directly
sys.path.append(os.path.abspath(os.path.join(os.path.dirname(__file__), "..")))

try:
    print("--- STEP 1: Verification of Imports ---")
    from backend.simulator import generate_collision_data
    from backend.solver import train_solver, predict_debris_properties
    from backend.propagator import propagate_trajectory
    print("Success: All modules imported successfully.")
    
    print("\n--- STEP 2: Testing Simulator Output ---")
    X, y = generate_collision_data(num_scenarios=10)
    print(f"Success: Simulator generated shape X={X.shape}, y={y.shape}")
    assert X.shape == (10, 6)
    assert y.shape == (10, 2)
    
    print("\n--- STEP 3: Testing Solver Mini-Train ---")
    train_solver(epochs=5) # Train quickly for 5 epochs to verify model compilation
    test_telemetry = [0.01, -0.01, 0.02, 0.05, 0.05, -0.05]
    pred = predict_debris_properties(test_telemetry)
    print(f"Success: Solver inference returned: {pred}")
    assert "predicted_mass_g" in pred
    assert "predicted_velocity_kms" in pred
    
    print("\n--- STEP 4: Testing Propagator Calculations ---")
    results = propagate_trajectory(v_rel_mag_kms=pred["predicted_velocity_kms"], hours=24, step_hours=1, num_cloud_paths=5)
    print("Success: Propagator returned results.")
    assert "nominal" in results
    assert "cloud" in results
    assert len(results["nominal"]) > 0
    assert len(results["cloud"]) == 5
    
    print("\n=== SYSTEM VERIFICATION SUCCESSFUL ===")
    sys.exit(0)

except Exception as e:
    print(f"\nVerification failed: {e}")
    sys.exit(1)
