export interface Invoice {
  id?: number;
  token_id: number;
  supplier: string;
  buyer_name: string;
  amount: number;
  due_date: string;
  ipfs_hash: string;
  status: "Pending" | "Funded" | "Repaid" | "Defaulted";
  credit_score?: number;
  currency: "mAED" | "mUSDC";
}

export interface LCData {
  id: number;
  lc_id: number;
  importer: string;
  exporter: string;
  amount: number;
  due_date: string;
  document_hash: string;
  shipment_proof: string;
  status: "Created" | "Funded" | "Accepted" | "Shipped" | "Released" | "Defaulted";
  credit_score?: number;
}

export interface SMEProfile {
  wallet_address: string;
  payment_history_length: number;
  on_time_payment_percentage: number;
  average_invoice_size: number;
  wallet_age: number;
  transaction_count: number;
  credit_score: number;
}

// Global variables on globalThis to persist across hot reloads in Next.js development
const globalForDb = globalThis as unknown as {
  invoices: Invoice[];
  lcs: LCData[];
  smeProfiles: Record<string, SMEProfile>;
};

if (!globalForDb.invoices) {
  globalForDb.invoices = [];
}
if (!globalForDb.lcs) {
  globalForDb.lcs = [];
}
if (!globalForDb.smeProfiles) {
  globalForDb.smeProfiles = {};
}

export const db = {
  getInvoices: () => globalForDb.invoices,
  addInvoice: (invoice: Invoice) => {
    // Check for duplicate to prevent double-factoring
    if (globalForDb.invoices.some(inv => inv.token_id === invoice.token_id)) {
      return false;
    }
    const id = globalForDb.invoices.length + 1;
    globalForDb.invoices.unshift({ ...invoice, id });
    return true;
  },
  updateInvoiceStatus: (tokenId: number, status: Invoice["status"]) => {
    const inv = globalForDb.invoices.find(x => x.token_id === tokenId);
    if (inv) {
      inv.status = status;
      return true;
    }
    return false;
  },
  getLcs: () => globalForDb.lcs,
  addLc: (lc: LCData) => {
    if (globalForDb.lcs.some(x => x.lc_id === lc.lc_id)) {
      return false;
    }
    const id = globalForDb.lcs.length + 1;
    globalForDb.lcs.unshift({ ...lc, id });
    return true;
  },
  updateLcStatus: (lcId: number, status: LCData["status"], shipmentProof?: string) => {
    const lc = globalForDb.lcs.find(x => x.lc_id === lcId);
    if (lc) {
      lc.status = status;
      if (shipmentProof) {
        lc.shipment_proof = shipmentProof;
      }
      return true;
    }
    return false;
  },
  getSmeProfile: (address: string) => globalForDb.smeProfiles[address.toLowerCase()],
  setSmeProfile: (address: string, profile: SMEProfile) => {
    globalForDb.smeProfiles[address.toLowerCase()] = profile;
  }
};
