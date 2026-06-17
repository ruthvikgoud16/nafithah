from fastapi import FastAPI, UploadFile, File, Form, HTTPException
from fastapi.middleware.cors import CORSMiddleware
import os
import json
import math
import hashlib
import time
from datetime import datetime
from web3 import Web3
from database import init_db, get_db_connection
from ocr import extract_invoice_fields

app = FastAPI(title="Tokenized Invoice Financing Backend")

# Enable CORS for frontend integration
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

UPLOAD_DIR = "uploads"
os.makedirs(UPLOAD_DIR, exist_ok=True)

# Initialize DB on startup
@app.on_event("startup")
def startup_event():
    init_db()

# Helper: Load model weights
def load_model_weights():
    weights_path = "../ml/model_weights.json"
    if not os.path.exists(weights_path):
        weights_path = "model_weights.json"
    if not os.path.exists(weights_path):
        # Default fallback weights if not trained
        return {
            "coefficients": [-0.5, -1.0, 0.2, -0.4, -0.3],
            "intercept": -0.5,
            "feature_names": ["payment_history_length", "on_time_payment_percentage", "average_invoice_size", "wallet_age", "transaction_count"],
            "scaler": {
                "mean": [30.0, 85.0, 25000.0, 500.0, 250.0],
                "scale": [15.0, 10.0, 15000.0, 300.0, 150.0]
            }
        }
    with open(weights_path, "r") as f:
        return json.load(f)

# Helper: Load deployed addresses
def get_contract_config():
    config_path = "../config/addresses.json"
    if os.path.exists(config_path):
        with open(config_path, "r") as f:
            return json.load(f)
    return {}

# Helper: Get CreditRegistry ABI
def get_credit_registry_abi():
    # Attempt to load from Hardhat compilation artifacts
    artifact_path = "../contracts/artifacts/contracts/CreditRegistry.sol/CreditRegistry.json"
    if os.path.exists(artifact_path):
        with open(artifact_path, "r") as f:
            return json.load(f)["abi"]
    # Fallback minimal ABI
    return [
        {
            "inputs": [
                {"internalType": "address", "name": "subject", "type": "address"},
                {"internalType": "uint8", "name": "score", "type": "uint8"}
            ],
            "name": "setScore",
            "outputs": [],
            "stateMutability": "external",
            "type": "function"
        },
        {
            "inputs": [{"internalType": "address", "name": "subject", "type": "address"}],
            "name": "getScore",
            "outputs": [
                {"internalType": "uint8", "name": "score", "type": "uint8"},
                {"internalType": "uint256", "name": "timestamp", "type": "uint256"}
            ],
            "stateMutability": "view",
            "type": "function"
        }
    ]

# Helper: Generate mock IPFS CID v1 (SHA-256 based)
def generate_ipfs_cid(file_bytes):
    h = hashlib.sha256(file_bytes).hexdigest()
    # Simple prefix to simulate a valid v1 CID (bafybeic...)
    return f"bafybeihdjtc4dfb{h[:32]}"

@app.post("/extract-invoice")
async def extract_invoice(file: UploadFile = File(...)):
    try:
        file_bytes = await file.read()
        file_path = os.path.join(UPLOAD_DIR, file.filename)
        with open(file_path, "wb") as f:
            f.write(file_bytes)
        
        # Parse fields
        parsed_fields = extract_invoice_fields(file_path)
        
        # Generate IPFS CID
        ipfs_hash = generate_ipfs_cid(file_bytes)
        parsed_fields["ipfs_hash"] = ipfs_hash
        parsed_fields["filename"] = file.filename
        
        return parsed_fields
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"OCR extraction failed: {str(e)}")

@app.post("/score")
async def calculate_score(wallet_address: str = Form(...)):
    # Clean wallet address
    wallet_address = wallet_address.lower().strip()
    
    # 1. Check if SME profile already exists
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM sme_profiles WHERE wallet_address = ?", (wallet_address,))
    row = cursor.fetchone()
    
    if row:
        # Profile exists, load features
        features = {
            "payment_history_length": row["payment_history_length"],
            "on_time_payment_percentage": row["on_time_payment_percentage"],
            "average_invoice_size": row["average_invoice_size"],
            "wallet_age": row["wallet_age"],
            "transaction_count": row["transaction_count"]
        }
        credit_score = row["credit_score"]
    else:
        # Create a new SME profile with deterministic synthetic features based on wallet hash
        # This makes it feel consistent for the demo
        address_hash = int(hashlib.md5(wallet_address.encode()).hexdigest(), 16)
        
        # Generate features
        payment_history_length = 6 + (address_hash % 55) # 6 to 60 months
        on_time_payment_percentage = 60.0 + ((address_hash >> 8) % 40) # 60% to 100%
        average_invoice_size = 2000.0 + ((address_hash >> 16) % 48000) # 2k to 50k
        wallet_age = 30 + ((address_hash >> 24) % 970) # 30 to 1000 days
        transaction_count = 5 + ((address_hash >> 32) % 495) # 5 to 500
        
        features = {
            "payment_history_length": payment_history_length,
            "on_time_payment_percentage": on_time_payment_percentage,
            "average_invoice_size": average_invoice_size,
            "wallet_age": wallet_age,
            "transaction_count": transaction_count
        }
        
        # Model Inference
        try:
            model = load_model_weights()
            coeffs = model["coefficients"]
            intercept = model["intercept"]
            means = model["scaler"]["mean"]
            scales = model["scaler"]["scale"]
            
            # Scale features
            scaled_features = []
            keys = ["payment_history_length", "on_time_payment_percentage", "average_invoice_size", "wallet_age", "transaction_count"]
            for i, key in enumerate(keys):
                scaled_val = (features[key] - means[i]) / scales[i]
                scaled_features.append(scaled_val)
            
            # Logit
            logit = intercept + sum(c * s for c, s in zip(coeffs, scaled_features))
            # Sigmoid probability of default
            prob_default = 1.0 / (1.0 + math.exp(-logit))
            
            # Score is inverse of default probability
            credit_score = int((1.0 - prob_default) * 100)
            # Clip between 0 and 100
            credit_score = max(0, min(100, credit_score))
        except Exception as e:
            print(f"Inference error: {e}. Defaulting to conservative score.")
            credit_score = 65 # Fallback score
        
        # Save to DB
        cursor.execute("""
            INSERT OR REPLACE INTO sme_profiles 
            (wallet_address, payment_history_length, on_time_payment_percentage, average_invoice_size, wallet_age, transaction_count, credit_score)
            VALUES (?, ?, ?, ?, ?, ?, ?)
        """, (
            wallet_address,
            features["payment_history_length"],
            features["on_time_payment_percentage"],
            features["average_invoice_size"],
            features["wallet_age"],
            features["transaction_count"],
            credit_score
        ))
        conn.commit()
    
    # 2. Submit score on-chain via oracle
    tx_hash = "0xmocktransactionhash1234567890abcdef"
    on_chain_success = False
    
    # Load Environment keys
    rpc_url = os.getenv("AMOY_RPC_URL", "https://rpc-amoy.polygon.technology")
    oracle_key = os.getenv("PRIVATE_KEY", "")
    
    config = get_contract_config()
    registry_address = config.get("CreditRegistry", "")
    
    if oracle_key and registry_address:
        try:
            w3 = Web3(Web3.HTTPProvider(rpc_url))
            if w3.is_connected():
                account = w3.eth.account.from_key(oracle_key)
                abi = get_credit_registry_abi()
                contract = w3.eth.contract(address=registry_address, abi=abi)
                
                # Check current on-chain score
                try:
                    on_chain_score, _ = contract.functions.getScore(w3.to_checksum_address(wallet_address)).call()
                except Exception:
                    on_chain_score = 0
                
                # Only update if score is different to save gas
                if on_chain_score != credit_score:
                    # Build transaction
                    nonce = w3.eth.get_transaction_count(account.address)
                    gas_price = w3.eth.gas_price
                    
                    tx = contract.functions.setScore(
                        w3.to_checksum_address(wallet_address),
                        int(credit_score)
                    ).build_transaction({
                        "chainId": 80002, # Polygon Amoy
                        "gas": 150000,
                        "gasPrice": int(gas_price * 1.2), # Add buffer
                        "nonce": nonce
                    })
                    
                    signed_tx = w3.eth.account.sign_transaction(tx, private_key=oracle_key)
                    raw_tx_hash = w3.eth.send_raw_transaction(signed_tx.rawTransaction)
                    tx_hash = w3.to_hex(raw_tx_hash)
                    on_chain_success = True
                    print(f"On-chain score update transaction submitted: {tx_hash}")
                else:
                    tx_hash = "Already updated on-chain"
                    on_chain_success = True
            else:
                print("Web3 provider not connected. Mocking on-chain transaction.")
        except Exception as e:
            print(f"Failed to submit score on-chain: {e}. Mocking transaction.")
    else:
        print("Oracle credentials or registry address missing. Mocking on-chain transaction.")
        
    conn.close()
    
    return {
        "wallet_address": wallet_address,
        "features": features,
        "credit_score": credit_score,
        "on_chain_success": on_chain_success,
        "tx_hash": tx_hash
    }

@app.post("/cache-invoice")
def cache_invoice(
    token_id: int = Form(...),
    supplier: str = Form(...),
    buyer_name: str = Form(...),
    amount: float = Form(...),
    due_date: int = Form(...),
    ipfs_hash: str = Form(...)
):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO cached_invoices (token_id, supplier, buyer_name, amount, due_date, ipfs_hash)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (token_id, supplier.lower(), buyer_name, amount, due_date, ipfs_hash))
        conn.commit()
        conn.close()
        return {"success": True, "token_id": token_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/invoices")
def list_invoices():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM cached_invoices ORDER BY id DESC")
    rows = cursor.fetchall()
    
    invoices = []
    for row in rows:
        invoices.append({
            "id": row["id"],
            "token_id": row["token_id"],
            "supplier": row["supplier"],
            "buyer_name": row["buyer_name"],
            "amount": row["amount"],
            "due_date": row["due_date"],
            "ipfs_hash": row["ipfs_hash"],
            "status": row["status"]
        })
    conn.close()
    return invoices

@app.post("/update-invoice-status")
def update_invoice_status(token_id: int = Form(...), status: str = Form(...)):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            UPDATE cached_invoices SET status = ? WHERE token_id = ?
        """, (status, token_id))
        conn.commit()
        conn.close()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.post("/cache-lc")
def cache_lc(
    lc_id: int = Form(...),
    importer: str = Form(...),
    exporter: str = Form(...),
    amount: float = Form(...),
    due_date: int = Form(...),
    document_hash: str = Form(...)
):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        cursor.execute("""
            INSERT OR REPLACE INTO cached_lcs (lc_id, importer, exporter, amount, due_date, document_hash)
            VALUES (?, ?, ?, ?, ?, ?)
        """, (lc_id, importer.lower(), exporter.lower(), amount, due_date, document_hash))
        conn.commit()
        conn.close()
        return {"success": True, "lc_id": lc_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))

@app.get("/lcs")
def list_lcs():
    conn = get_db_connection()
    cursor = conn.cursor()
    cursor.execute("SELECT * FROM cached_lcs ORDER BY id DESC")
    rows = cursor.fetchall()
    
    lcs = []
    for row in rows:
        lcs.append({
            "id": row["id"],
            "lc_id": row["lc_id"],
            "importer": row["importer"],
            "exporter": row["exporter"],
            "amount": row["amount"],
            "due_date": row["due_date"],
            "document_hash": row["document_hash"],
            "shipment_proof": row["shipment_proof"],
            "status": row["status"]
        })
    conn.close()
    return lcs

@app.post("/update-lc-status")
def update_lc_status(
    lc_id: int = Form(...),
    status: str = Form(...),
    shipment_proof: str = Form(None)
):
    try:
        conn = get_db_connection()
        cursor = conn.cursor()
        if shipment_proof:
            cursor.execute("""
                UPDATE cached_lcs SET status = ?, shipment_proof = ? WHERE lc_id = ?
            """, (status, shipment_proof, lc_id))
        else:
            cursor.execute("""
                UPDATE cached_lcs SET status = ? WHERE lc_id = ?
            """, (status, lc_id))
        conn.commit()
        conn.close()
        return {"success": True}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))
