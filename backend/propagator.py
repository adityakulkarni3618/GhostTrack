import numpy as np
from sgp4.api import Satrec
from datetime import datetime, timezone

# Constants
MU = 398600.4418          # Earth gravitational parameter (km^3 / s^2)
R_E = 6378.137            # Earth equatorial radius (km)
J2 = 1.08263e-3           # J2 perturbation coefficient
OMEGA_E = 7.2921159e-5    # Earth rotation rate (rad/s)

# Atmospheric Drag Constants
RHO_0 = 1.225e-9          # Reference density at Earth surface (kg/m^3 -> kg/km^3)
H_SCALE = 8.5             # Scale height of atmosphere (km)
C_D = 2.2                 # Debris drag coefficient
DEBRIS_DENSITY = 2700.0   # Aluminum debris density (kg/m^3)

# Sample TLE for BLITS satellite
BLITS_TLE_LINE1 = "1 35871U 09051C   26228.18826725  .00000344  00000-0  11400-3 0  9997"
BLITS_TLE_LINE2 = "2 35871  98.6102 334.8211 0006245 131.0232 229.1364 14.28825838875504"

# Active Satellites Database for Collision Warning checks
ACTIVE_SATELLITES = [
    {
        "name": "ISS (Zarya)",
        "norad_id": 25544,
        "tle1": "1 25544U 98067A   26228.21200231  .00017128  00000-0  30424-3 0  9991",
        "tle2": "2 25544  51.6418 201.3204 0004823 358.1102 112.4491 15.49602314578121"
    },
    {
        "name": "Starlink-3024",
        "norad_id": 48123,
        "tle1": "1 48123U 21024A   26228.15492012  .00001243  00000-0  89124-4 0  9995",
        "tle2": "2 48123  53.0543 124.9812 0001421 289.4121  70.6281 15.06421941234912"
    },
    {
        "name": "Hubble Space Telescope",
        "norad_id": 20580,
        "tle1": "1 20580U 90037B   26228.14029102  .00000214  00000-0  45124-4 0  9992",
        "tle2": "2 20580  28.4691 304.1291 0002812 189.1241 170.9248 14.99281203981249"
    }
]

def get_satellite_state(tle1=BLITS_TLE_LINE1, tle2=BLITS_TLE_LINE2):
    sat = Satrec.twoline2rv(tle1, tle2)
    error_code, r, v = sat.sgp4(sat.jdsatepoch, 0.0)
    if error_code != 0:
        r = [5000.0, 3000.0, 3000.0]
        v = [-3.0, 5.0, 4.0]
    return np.array(r, dtype=np.float64), np.array(v, dtype=np.float64)

def debris_drag_acceleration(state, mass_g):
    """
    Computes drag acceleration vector (km/s^2) on the debris.
    Assumes spherical debris to estimate surface area from mass.
    """
    r_vec = state[:3]
    v_vec = state[3:]
    
    r_mag = np.linalg.norm(r_vec)
    v_mag = np.linalg.norm(v_vec)
    
    altitude = r_mag - R_E
    if altitude < 100.0:  # Re-entry/burned out
        return np.zeros(3)
        
    # Estimate cross-sectional area A (m^2) from mass m (kg)
    mass_kg = mass_g / 1000.0
    volume_m3 = mass_kg / DEBRIS_DENSITY
    radius_m = (0.75 * volume_m3 / np.pi) ** (1.0 / 3.0)
    area_m2 = np.pi * (radius_m ** 2)
    area_km2 = area_m2 / 1e6
    
    # Atmospheric density model (exponential)
    # rho = rho_0 * e^(-alt / H)
    rho = RHO_0 * np.exp(-altitude / H_SCALE)
    
    # Drag force acceleration: a_d = -0.5 * C_d * A/m * rho * v * vec_v
    # Units check: A (km^2), m (kg), rho (kg/km^3), v (km/s) -> km/s^2
    a_drag = -0.5 * C_D * (area_km2 / mass_kg) * rho * v_mag * v_vec
    return a_drag

def total_acceleration(state, mass_g):
    r_vec = state[:3]
    r = np.linalg.norm(r_vec)
    x, y, z = r_vec
    
    # 1. Standard gravity
    a_kepler = - (MU / (r ** 3)) * r_vec
    
    # 2. J2 gravity perturbation
    z2_r2 = (z / r) ** 2
    factor = 1.5 * J2 * MU * (R_E ** 2) / (r ** 5)
    a_j2 = np.array([
        factor * x * (5.0 * z2_r2 - 1.0),
        factor * y * (5.0 * z2_r2 - 1.0),
        factor * z * (5.0 * z2_r2 - 3.0)
    ], dtype=np.float64)
    
    # 3. Atmospheric drag
    a_drag = debris_drag_acceleration(state, mass_g)
    
    return a_kepler + a_j2 + a_drag

def rk4_step(state, dt, mass_g):
    def derivatives(s):
        v = s[3:]
        a = total_acceleration(s, mass_g)
        return np.concatenate([v, a])
        
    k1 = derivatives(state)
    k2 = derivatives(state + 0.5 * dt * k1)
    k3 = derivatives(state + 0.5 * dt * k2)
    k4 = derivatives(state + dt * k3)
    
    return state + (dt / 6.0) * (k1 + 2.0 * k2 + 2.0 * k3 + k4)

def eci_to_lla(r_eci, t_seconds):
    x, y, z = r_eci
    r_xy = np.sqrt(x**2 + y**2)
    lat = np.degrees(np.arctan2(z, r_xy))
    lon = np.degrees(np.arctan2(y, x) - OMEGA_E * t_seconds)
    lon = (lon + 180) % 360 - 180
    alt = np.linalg.norm(r_eci) - R_E
    return float(lat), float(lon), float(alt)

def check_avoidance_intersections(debris_nominal_states, times_seconds):
    """
    Checks if the nominal debris path intersects with any active satellites.
    Returns list of alerts.
    """
    alerts = []
    
    for satellite in ACTIVE_SATELLITES:
        r_sat, v_sat = get_satellite_state(satellite["tle1"], satellite["tle2"])
        
        # Propagate satellite state over same times
        sat_state = np.concatenate([r_sat, v_sat])
        min_dist = float('inf')
        min_time = 0
        min_loc = None
        
        # Integrate satellite using RK4 to compare distances directly
        current_sat = sat_state.copy()
        dt = times_seconds[1] - times_seconds[0] if len(times_seconds) > 1 else 600
        
        for idx, t in enumerate(times_seconds):
            # Debris location at time t
            r_deb = debris_nominal_states[idx][:3]
            r_s = current_sat[:3]
            
            dist = np.linalg.norm(r_deb - r_s)
            if dist < min_dist:
                min_dist = dist
                min_time = t
                min_loc = r_deb
            
            # Step satellite forward
            # Satellites have large mass (e.g. 450,000 kg for ISS), so drag is minimal compared to small debris.
            # We propagate satellite with dummy mass of 1e5 g (not critical for short span)
            current_sat = rk4_step(current_sat, dt, mass_g=1e5)
            
        # Alert if close approach within 150 km
        if min_dist < 150.0:
            lat, lon, alt = eci_to_lla(min_loc, min_time)
            alerts.append({
                "satellite_name": satellite["name"],
                "norad_id": satellite["norad_id"],
                "min_distance_km": float(min_dist),
                "time_hours": float(min_time / 3600.0),
                "coordinates": {"lat": lat, "lon": lon, "alt": alt}
            })
            
    return alerts

def propagate_trajectory(v_rel_mag_kms, mass_g=10.0, hours=720, step_hours=12, num_cloud_paths=20):
    """
    Propagates nominal path and cloud paths up to 30 days (720 hours).
    - nominal: returned in detailed intervals (step_hours)
    - cloud: returned at key intervals to represent expanding threat density
    """
    r_sat, v_sat = get_satellite_state()
    
    # Times in seconds
    dt = step_hours * 3600
    steps = int((hours * 3600) / dt)
    times = [i * dt for i in range(steps)]
    
    # 1. Propagate Nominal Path
    impact_dir = np.random.normal(0, 1, 3)
    impact_dir /= np.linalg.norm(impact_dir)
    v_debris_init = v_sat + impact_dir * v_rel_mag_kms
    
    nominal_state = np.concatenate([r_sat, v_debris_init])
    nominal_path = []
    nominal_states = []
    
    current_state = nominal_state.copy()
    for step in range(steps):
        t = step * dt
        lat, lon, alt = eci_to_lla(current_state[:3], t)
        nominal_path.append({"lat": lat, "lon": lon, "alt": alt, "time_hours": step * step_hours})
        nominal_states.append(current_state.copy())
        current_state = rk4_step(current_state, dt, mass_g)
        
    # Check for active satellite crossings (first 7 days)
    intersection_alerts = check_avoidance_intersections(nominal_states, times)
    
    # 2. Propagate Debris Cloud Paths
    probability_cloud = []
    for p in range(num_cloud_paths):
        p_dir = np.random.normal(0, 1, 3)
        p_dir /= np.linalg.norm(p_dir)
        p_v_mag = v_rel_mag_kms * np.random.uniform(0.96, 1.04)
        
        v_p = v_sat + p_dir * p_v_mag
        p_state = np.concatenate([r_sat, v_p])
        
        path = []
        c_state = p_state.copy()
        for step in range(steps):
            t = step * dt
            # Decimate returned cloud coordinates to optimize payload
            if step % 2 == 0 or step == steps - 1:
                lat, lon, alt = eci_to_lla(c_state[:3], t)
                path.append({"lat": lat, "lon": lon, "alt": alt})
            c_state = rk4_step(c_state, dt, mass_g)
            
        probability_cloud.append(path)
        
    return {
        "nominal": nominal_path,
        "cloud": probability_cloud,
        "alerts": intersection_alerts
    }

if __name__ == "__main__":
    results = propagate_trajectory(v_rel_mag_kms=10.0, mass_g=5.0, hours=24, step_hours=1)
    print("Nominal path coordinates count:", len(results["nominal"]))
    print("Alerts triggered:", len(results["alerts"]))
