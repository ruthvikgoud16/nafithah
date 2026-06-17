import numpy as np
import pandas as pd
import json
import os
from sklearn.linear_model import LogisticRegression
from sklearn.preprocessing import StandardScaler

def generate_synthetic_data(num_samples=1000):
    np.random.seed(42)
    
    # Features:
    # 1. payment_history_length (months): 6 to 60
    payment_history_length = np.random.randint(6, 61, size=num_samples)
    
    # 2. on_time_payment_percentage (%): 50 to 100
    on_time_payment_percentage = np.random.uniform(50.0, 100.0, size=num_samples)
    
    # 3. average_invoice_size (mUSDC): 1,000 to 50,000 (represented in 6 decimals, but features use normal units for scaling)
    average_invoice_size = np.random.uniform(1000.0, 50000.0, size=num_samples)
    
    # 4. wallet_age (days): 30 to 1000
    wallet_age = np.random.randint(30, 1001, size=num_samples)
    
    # 5. transaction_count: 5 to 500
    transaction_count = np.random.randint(5, 501, size=num_samples)
    
    # Synthesize target: default_risk (binary: 0 = Low Risk / Good, 1 = High Risk / Default)
    # We define a logit function to determine default probability based on features
    # Higher on-time %, longer history, higher txn count, higher wallet age -> lower default risk
    # Higher invoice size -> slightly higher default risk (larger amounts are riskier)
    
    # Normalize features roughly for calculations
    x1 = (payment_history_length - 30) / 15.0
    x2 = (on_time_payment_percentage - 85) / 10.0
    x3 = (average_invoice_size - 25000) / 15000.0
    x4 = (wallet_age - 500) / 300.0
    x5 = (transaction_count - 250) / 150.0
    
    # Log-odds (logit)
    logit = -0.5 - 1.2 * x1 - 2.5 * x2 + 0.5 * x3 - 0.8 * x4 - 0.7 * x5
    
    # Probability of default
    prob_default = 1 / (1 + np.exp(-logit))
    
    # Generate binary labels (0 = No Default, 1 = Default)
    default = np.random.binomial(1, prob_default)
    
    df = pd.DataFrame({
        "payment_history_length": payment_history_length,
        "on_time_payment_percentage": on_time_payment_percentage,
        "average_invoice_size": average_invoice_size,
        "wallet_age": wallet_age,
        "transaction_count": transaction_count,
        "default": default
    })
    
    return df

def train_and_export():
    print("Generating synthetic dataset (1000 rows)...")
    df = generate_synthetic_data(1000)
    
    # Save synthetic dataset to CSV
    os.makedirs("data", exist_ok=True)
    df.to_csv("data/synthetic_sme_credit_data.csv", index=False)
    print("Dataset saved to data/synthetic_sme_credit_data.csv")
    
    X = df.drop(columns=["default"])
    y = df["default"]
    
    # We will fit a standard LogisticRegression model
    # Note: For Javascript compatibility and easy manual deployment, we will export:
    # 1. Feature scaling parameters (mean and std)
    # 2. Model coefficients and intercept
    
    scaler = StandardScaler()
    X_scaled = scaler.fit_transform(X)
    
    model = LogisticRegression()
    model.fit(X_scaled, y)
    
    # Model evaluation
    accuracy = model.score(X_scaled, y)
    print(f"Model trained. Training accuracy: {accuracy:.4f}")
    
    # Export parameters for zero-dependency Javascript inference
    export_data = {
        "coefficients": model.coef_[0].tolist(),
        "intercept": model.intercept_[0],
        "feature_names": X.columns.tolist(),
        "scaler": {
            "mean": scaler.mean_.tolist(),
            "scale": scaler.scale_.tolist()
        }
    }
    
    with open("model_weights.json", "w") as f:
        json.dump(export_data, f, indent=4)
    print("Model weights and scaler params exported to model_weights.json")

if __name__ == "__main__":
    train_and_export()
