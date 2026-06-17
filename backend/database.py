import sqlite3
import os

DB_PATH = "data/invoices.db"

def get_db_connection():
    os.makedirs(os.path.dirname(DB_PATH), exist_ok=True)
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    conn = get_db_connection()
    cursor = conn.cursor()
    
    # Table for cached invoice metadata
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS cached_invoices (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            token_id INTEGER UNIQUE,
            supplier TEXT NOT NULL,
            buyer_name TEXT NOT NULL,
            amount REAL NOT NULL,
            due_date INTEGER NOT NULL,
            ipfs_hash TEXT NOT NULL,
            status TEXT DEFAULT 'Listed'
        )
    """)
    
    # Table for SME profiles (ML features & scores)
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS sme_profiles (
            wallet_address TEXT PRIMARY KEY,
            payment_history_length INTEGER NOT NULL,
            on_time_payment_percentage REAL NOT NULL,
            average_invoice_size REAL NOT NULL,
            wallet_age INTEGER NOT NULL,
            transaction_count INTEGER NOT NULL,
            credit_score INTEGER NOT NULL,
            updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
        )
    """)

    # Table for cached Letter of Credit metadata
    cursor.execute("""
        CREATE TABLE IF NOT EXISTS cached_lcs (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            lc_id INTEGER UNIQUE,
            importer TEXT NOT NULL,
            exporter TEXT NOT NULL,
            amount REAL NOT NULL,
            due_date INTEGER NOT NULL,
            document_hash TEXT NOT NULL,
            shipment_proof TEXT,
            status TEXT DEFAULT 'Created'
        )
    """)
    
    conn.commit()
    conn.close()
    print("Database initialized successfully.")

if __name__ == "__main__":
    init_db()
