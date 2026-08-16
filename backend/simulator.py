import numpy as np

def generate_collision_data(num_scenarios=500, sat_mass=50.0, sat_radius=0.5, coef_restitution=0.1, noise_level=0.02):
    """
    Generates synthetic collision scenarios using Monte Carlo simulation.
    
    Parameters:
    - num_scenarios: Number of collision events to simulate.
    - sat_mass: Mass of target satellite in kg.
    - sat_radius: Radius of target satellite in meters (assumed spherical).
    - coef_restitution: Coefficient of restitution (0.0 = inelastic, 1.0 = elastic).
    - noise_level: Standard deviation of Gaussian sensor noise added to observations (as fraction of signal).
    
    Returns:
    - X: Array of shape (num_scenarios, 6) containing [dV_x, dV_y, dV_z, dW_x, dW_y, dW_z]
    - y: Array of shape (num_scenarios, 2) containing [debris_mass_g, debris_velocity_kms]
    """
    np.random.seed(42)  # For reproducibility
    
    # 1. Generate randomized debris properties
    # Mass: 0.1g to 500g
    debris_mass_g = np.random.uniform(0.1, 500.0, num_scenarios)
    debris_mass_kg = debris_mass_g / 1000.0
    
    # Relative velocity magnitude: 7 km/s to 14 km/s
    debris_vel_kms = np.random.uniform(7.0, 14.0, num_scenarios)
    debris_vel_ms = debris_vel_kms * 1000.0
    
    # 2. Pre-calculate Satellite properties
    # Moment of inertia for a solid sphere: I = 2/5 * M * R^2
    I_val = 0.4 * sat_mass * (sat_radius ** 2)
    I_tensor = np.diag([I_val, I_val, I_val])
    I_inv = np.linalg.inv(I_tensor)
    
    X = []
    y = []
    
    for i in range(num_scenarios):
        m_d = debris_mass_kg[i]
        v_mag = debris_vel_ms[i]
        
        # Random direction of relative velocity vector (unit vector)
        v_dir = np.random.normal(0, 1, 3)
        v_dir /= np.linalg.norm(v_dir)
        v_rel = v_dir * v_mag
        
        # Delta-v (linear momentum transfer): dV = (1 + e) * (m_d / (M_s + m_d)) * v_rel
        dV = (1.0 + coef_restitution) * (m_d / (sat_mass + m_d)) * v_rel
        
        # Random impact location on satellite surface (assumed sphere)
        r_dir = np.random.normal(0, 1, 3)
        r_dir /= np.linalg.norm(r_dir)
        r_impact = r_dir * sat_radius
        
        # Impulse vector: J = (1 + e) * m_d * v_rel
        impulse = (1.0 + coef_restitution) * m_d * v_rel
        
        # Angular momentum transfer: H = r x J
        dH = np.cross(r_impact, impulse)
        
        # Attitude perturbation (change in angular velocity): dW = I_inv * dH
        dW = I_inv @ dH
        
        # Add realistic sensor measurement noise
        dV_noise = np.random.normal(0, np.std(dV) * noise_level if np.std(dV) > 0 else 1e-6, 3)
        dW_noise = np.random.normal(0, np.std(dW) * noise_level if np.std(dW) > 0 else 1e-6, 3)
        
        dV_obs = dV + dV_noise
        dW_obs = dW + dW_noise
        
        # Features: [dV_x, dV_y, dV_z, dW_x, dW_y, dW_z]
        X.append(np.concatenate([dV_obs, dW_obs]))
        # Labels: [mass_g, velocity_kms]
        y.append([debris_mass_g[i], debris_vel_kms[i]])
        
    return np.array(X, dtype=np.float32), np.array(y, dtype=np.float32)

if __name__ == "__main__":
    X, y = generate_collision_data(5)
    print("Sample Features (dV_x, dV_y, dV_z, dW_x, dW_y, dW_z):")
    print(X)
    print("\nSample Labels (mass_g, vel_kms):")
    print(y)
