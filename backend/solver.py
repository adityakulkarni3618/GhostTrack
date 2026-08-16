import torch
import torch.nn as nn
import torch.optim as optim
import numpy as np
from backend.simulator import generate_collision_data

class SimpleScaler:
    def __init__(self):
        self.mean = None
        self.std = None
        
    def fit(self, data):
        self.mean = np.mean(data, axis=0)
        self.std = np.std(data, axis=0)
        self.std[self.std == 0] = 1.0
        
    def transform(self, data):
        return (data - self.mean) / self.std
        
    def inverse_transform(self, scaled_data):
        return scaled_data * self.std + self.mean

class GhostNetSolver(nn.Module):
    def __init__(self, input_dim=6, output_dim=2):
        super(GhostNetSolver, self).__init__()
        self.network = nn.Sequential(
            nn.Linear(input_dim, 64),
            nn.ReLU(),
            nn.Linear(64, 64),
            nn.ReLU(),
            nn.Linear(64, 32),
            nn.ReLU(),
            nn.Linear(32, output_dim)
        )
        
    def forward(self, x):
        return self.network(x)

# Global variables
model = None
x_scaler = SimpleScaler()
y_scaler = SimpleScaler()

# Target Satellite Constants for PINN loss
SAT_MASS = 50.0        # kg
SAT_RADIUS = 0.5       # m
COEF_REST = 0.1        # Coefficient of Restitution
I_VAL = 0.4 * SAT_MASS * (SAT_RADIUS ** 2) # Moment of Inertia (solid sphere)

def train_solver(epochs=150, batch_size=32, lr=0.003, lambda_physics=0.1):
    global model, x_scaler, y_scaler
    
    # 1. Generate Training Data
    X_raw, y_raw = generate_collision_data(num_scenarios=1000)
    
    # Fit Scalers
    x_scaler.fit(X_raw)
    y_scaler.fit(y_raw)
    
    X_scaled = x_scaler.transform(X_raw)
    y_scaled = y_scaler.transform(y_raw)
    
    # Convert to Tensors
    X_tensor = torch.tensor(X_scaled, dtype=torch.float32)
    y_tensor = torch.tensor(y_scaled, dtype=torch.float32)
    
    # Create PyTorch-level Scaler constants for PINN graph backpropagation
    x_mean = torch.tensor(x_scaler.mean, dtype=torch.float32)
    x_std = torch.tensor(x_scaler.std, dtype=torch.float32)
    y_mean = torch.tensor(y_scaler.mean, dtype=torch.float32)
    y_std = torch.tensor(y_scaler.std, dtype=torch.float32)
    
    # 2. Initialize Model
    model = GhostNetSolver(input_dim=6, output_dim=2)
    optimizer = optim.Adam(model.parameters(), lr=lr)
    criterion_data = nn.MSELoss()
    
    dataset_size = len(X_tensor)
    model.train()
    
    for epoch in range(epochs):
        permutation = torch.randperm(dataset_size)
        epoch_loss = 0.0
        epoch_phys_loss = 0.0
        
        for i in range(0, dataset_size, batch_size):
            indices = permutation[i:i+batch_size]
            batch_x, batch_y = X_tensor[indices], y_tensor[indices]
            
            optimizer.zero_grad()
            
            # Predict Scaled Targets
            predictions_scaled = model(batch_x)
            
            # 1. Data-driven Loss
            loss_data = criterion_data(predictions_scaled, batch_y)
            
            # 2. Physics-Informed (PINN) Loss
            # Unscale inputs to physical values
            batch_x_raw = batch_x * x_std + x_mean
            dV_obs = batch_x_raw[:, :3]
            dW_obs = batch_x_raw[:, 3:]
            
            dV_obs_mag = torch.norm(dV_obs, dim=1)
            dW_obs_mag = torch.norm(dW_obs, dim=1)
            
            # Unscale outputs to physical values
            predictions_raw = predictions_scaled * y_std + y_mean
            pred_mass_g = predictions_raw[:, 0]
            pred_vel_kms = predictions_raw[:, 1]
            
            pred_mass_kg = pred_mass_g / 1000.0
            pred_vel_ms = pred_vel_kms * 1000.0
            
            # Physics law 1: dV ≈ (1 + e) * (m_d / (M_s + m_d)) * v_rel
            expected_dV_mag = (1.0 + COEF_REST) * (pred_mass_kg / (SAT_MASS + pred_mass_kg)) * pred_vel_ms
            loss_physics_linear = torch.mean((dV_obs_mag - expected_dV_mag) ** 2)
            
            # Physics law 2: Max possible angular perturbation: dW <= (1 + e) * m_d * v_rel * R_s / I
            max_expected_dW = (1.0 + COEF_REST) * pred_mass_kg * pred_vel_ms * SAT_RADIUS / I_VAL
            # Penalize only if observed dW exceeds the physical limit of torque transfer
            loss_physics_angular = torch.mean(torch.relu(dW_obs_mag - max_expected_dW) ** 2)
            
            loss_physics = loss_physics_linear + loss_physics_angular
            
            # Total loss combining data & physical constraints
            loss_total = loss_data + lambda_physics * loss_physics
            
            loss_total.backward()
            optimizer.step()
            
            epoch_loss += loss_total.item() * len(indices)
            epoch_phys_loss += loss_physics.item() * len(indices)
            
        epoch_loss /= dataset_size
        epoch_phys_loss /= dataset_size
        if (epoch + 1) % 30 == 0:
            print(f"Epoch {epoch+1}/{epochs} | Total Loss: {epoch_loss:.6f} | Physics Loss: {epoch_phys_loss:.6f}")
            
    model.eval()
    print("GhostNet Physics-Informed Neural Network (PINN) solver initialized.")

def predict_debris_properties(telemetry_array):
    global model, x_scaler, y_scaler
    
    if model is None:
        train_solver()
        
    telemetry_array = np.array(telemetry_array, dtype=np.float32)
    if telemetry_array.ndim == 1:
        telemetry_array = telemetry_array.reshape(1, -1)
        
    scaled_input = x_scaler.transform(telemetry_array)
    input_tensor = torch.tensor(scaled_input, dtype=torch.float32)
    
    with torch.no_grad():
        scaled_output = model(input_tensor).numpy()
        
    predictions = y_scaler.inverse_transform(scaled_output)
    
    # Enforce realistic bounds
    predicted_mass = max(0.1, float(predictions[0, 0]))
    predicted_vel = max(1.0, float(predictions[0, 1]))
    
    return {
        "predicted_mass_g": predicted_mass,
        "predicted_velocity_kms": predicted_vel
    }
