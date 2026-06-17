"use client";

import React, { useState, useEffect } from "react";
import { useAccount } from "wagmi";
import { ConnectButton } from "@rainbow-me/rainbowkit";
import { ethers } from "ethers";
import { 
  Upload, FileText, Database, Shield, TrendingUp, DollarSign, Users, RefreshCw, Sparkles, 
  CheckCircle2, ChevronRight, AlertTriangle, ArrowRight, ShieldCheck, MapPin, Landmark, Layers, Calendar, Clock, BarChart3, AlertCircle, Ship
} from "lucide-react";

// Import ABI JSONs
import MockUSDCArtifact from "../abi/MockUSDC.json";
import MockAEDArtifact from "../abi/MockAED.json";
import CreditRegistryArtifact from "../abi/CreditRegistry.json";
import ReceivableNFTArtifact from "../abi/ReceivableNFT.json";
import InvoiceMarketplaceArtifact from "../abi/InvoiceMarketplace.json";
import RepaymentEscrowArtifact from "../abi/RepaymentEscrow.json";
import LetterOfCreditArtifact from "../abi/LetterOfCredit.json";

// Import addresses
import addressConfig from "../config/addresses.json";

const MockUSDC_ABI = MockUSDCArtifact.abi;
const MockAED_ABI = MockAEDArtifact.abi;
const CreditRegistry_ABI = CreditRegistryArtifact.abi;
const ReceivableNFT_ABI = ReceivableNFTArtifact.abi;
const InvoiceMarketplace_ABI = InvoiceMarketplaceArtifact.abi;
const RepaymentEscrow_ABI = RepaymentEscrowArtifact.abi;
const LetterOfCredit_ABI = LetterOfCreditArtifact.abi;

interface Invoice {
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

interface LCData {
  id: number;
  importer: string;
  exporter: string;
  amount: number;
  dueDate: string;
  documentHash: string;
  shipmentProof: string;
  status: "Created" | "Funded" | "Accepted" | "Shipped" | "Released" | "Defaulted";
  creditScore: number;
}

export default function Dashboard() {
  const { address, isConnected } = useAccount();
  const [mounted, setMounted] = useState(false);
  const [activeTab, setActiveTab] = useState<"dashboard" | "invoices" | "lcs" | "scoring" | "admin">("dashboard");
  
  // Demo Mode settings
  const [isDemoMode, setIsDemoMode] = useState(true); // Default to true for easy demo access
  const [demoStep, setDemoStep] = useState(1);
  const [selectedVisualizerStage, setSelectedVisualizerStage] = useState<number | null>(null);
  const [demoInvoices, setDemoInvoices] = useState<Invoice[]>([]);
  const [demoLcs, setDemoLcs] = useState<LCData[]>([]);
  
  // SME / Trade Input state
  const [uploadedFile, setUploadedFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const [ocrData, setOcrData] = useState<{
    invoice_number: string;
    supplier_name: string;
    buyer_name: string;
    amount: number;
    currency: "mAED" | "mUSDC";
    due_date: string;
    ipfs_hash: string;
    risk_summary: string;
    recommendation: string;
  } | null>(null);
  
  const [isScoring, setIsScoring] = useState(false);
  const [creditProfile, setCreditProfile] = useState<{
    score: number;
    features: {
      payment_history_length: number;
      on_time_payment_percentage: number;
      average_invoice_size: number;
      wallet_age: number;
      transaction_count: number;
    };
    grade: string;
    txHash?: string;
  } | null>(null);
  
  const [isMinting, setIsMinting] = useState(false);
  const [mintedTokenId, setMintedTokenId] = useState<number | null>(null);
  const [mintTxHash, setMintTxHash] = useState<string | null>(null);

  // Letter of Credit state
  const [lcImporter, setLcImporter] = useState("");
  const [lcExporter, setLcExporter] = useState("");
  const [lcAmount, setLcAmount] = useState(250000);
  const [lcDueDate, setLcDueDate] = useState("");
  const [lcDocHash, setLcDocHash] = useState("QmTradeAgreementHashALNoorBharat");
  const [isLcCreating, setIsLcCreating] = useState(false);
  const [createdLcId, setCreatedLcId] = useState<number | null>(null);
  const [createdLcTxHash, setCreatedLcTxHash] = useState<string | null>(null);

  // Live state Lists
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [lcs, setLcs] = useState<LCData[]>([]);
  const [loadingInvoices, setLoadingInvoices] = useState(false);
  const [loadingLcs, setLoadingLcs] = useState(false);

  // Loading indicator maps
  const [faucetLoading, setFaucetLoading] = useState(false);
  const [faucetCurrency, setFaucetCurrency] = useState<"mAED" | "mUSDC">("mAED");
  const [actionLoading, setActionLoading] = useState<Record<string, boolean>>({});
  const [toast, setToast] = useState<{ message: string; type: "success" | "error" | "info" } | null>(null);

  const showToast = (message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  // Resolve hydration differences
  useEffect(() => {
    setMounted(true);
    // Setup realistic demo data
    initializeDemoData();
    fetchLiveCacheData();
  }, []);

  // Sync selectedVisualizerStage with parent timeline step
  useEffect(() => {
    setSelectedVisualizerStage(null);
  }, [demoStep, invoices, lcs, creditProfile, ocrData]);

  const getTimelineStep = () => {
    if (!isDemoMode) {
      if (lcs.some(x => x.status === "Released")) return 6;
      if (lcs.some(x => x.status === "Shipped")) return 5;
      if (lcs.some(x => x.status === "Funded" || x.status === "Accepted")) return 4;
      if (invoices.some(x => x.status === "Pending" || x.status === "Funded")) return 3;
      if (creditProfile) return 2;
      if (ocrData) return 1;
      return 1;
    }
    if (demoStep <= 2) return 1;
    if (demoStep <= 4) return 2;
    if (demoStep === 5) return 3;
    if (demoStep <= 7) return 4;
    if (demoStep === 8) return 5;
    return 6;
  };

  const initializeDemoData = () => {
    // Generate realistic UAE-India Stablecoin SME Trade corridor data
    const preLoadedInvoices: Invoice[] = [
      {
        token_id: 101,
        supplier: "Bharat Components Pvt Ltd (India)",
        buyer_name: "Al Noor Trading LLC (Dubai)",
        amount: 250000.00,
        due_date: "2026-08-15",
        ipfs_hash: "bafybeihdjtc4dfbmockipfsbyteshash101",
        status: "Funded",
        credit_score: 89,
        currency: "mAED"
      },
      {
        token_id: 102,
        supplier: "Bharat Components Pvt Ltd (India)",
        buyer_name: "Al Noor Trading LLC (Dubai)",
        amount: 120000.00,
        due_date: "2026-06-30",
        ipfs_hash: "bafybeihdjtc4dfbmockipfsbyteshash102",
        status: "Repaid",
        credit_score: 89,
        currency: "mAED"
      },
      {
        token_id: 103,
        supplier: "Gulf Logistics Corp (Dubai)",
        buyer_name: "Mansoori Steel Industries (Abu Dhabi)",
        amount: 75000.00,
        due_date: "2026-05-10",
        ipfs_hash: "bafybeihdjtc4dfbmockipfsbyteshash103",
        status: "Repaid",
        credit_score: 94,
        currency: "mAED"
      },
      {
        token_id: 104,
        supplier: "Mumbai Industrial Suppliers (India)",
        buyer_name: "Jebel Ali Distribution (Dubai)",
        amount: 320000.00,
        due_date: "2026-09-01",
        ipfs_hash: "bafybeihdjtc4dfbmockipfsbyteshash104",
        status: "Pending",
        credit_score: 82,
        currency: "mAED"
      },
      {
        token_id: 105,
        supplier: "Bengaluru Garments Export (India)",
        buyer_name: "Dubai Fashion Hub (Dubai)",
        amount: 85000.00,
        due_date: "2026-04-12",
        ipfs_hash: "bafybeihdjtc4dfbmockipfsbyteshash105",
        status: "Defaulted",
        credit_score: 55,
        currency: "mUSDC"
      }
    ];

    const preLoadedLcs: LCData[] = [
      {
        id: 201,
        importer: "Al Noor Trading LLC (Dubai)",
        exporter: "Bharat Components Pvt Ltd (India)",
        amount: 250000.00,
        dueDate: "2026-08-15",
        documentHash: "QmTradeAgreementHashALNoorBharat",
        shipmentProof: "QmBillOfLadingHashBharatShipment",
        status: "Shipped",
        creditScore: 89
      },
      {
        id: 202,
        importer: "Mansoori Steel Industries (Abu Dhabi)",
        exporter: "Hindustan Metal Works (Mumbai)",
        amount: 450000.00,
        dueDate: "2026-10-20",
        documentHash: "QmSteelSupplyAgreementMansooriHindustan",
        shipmentProof: "",
        status: "Funded",
        creditScore: 94
      }
    ];

    setDemoInvoices(preLoadedInvoices);
    setDemoLcs(preLoadedLcs);
  };

  const fetchLiveCacheData = async () => {
    setLoadingInvoices(true);
    setLoadingLcs(true);
    try {
      const resInv = await fetch("http://localhost:8000/invoices");
      if (resInv.ok) {
        const data = await resInv.ok ? await resInv.json() : [];
        setInvoices(data);
      }
      const resLc = await fetch("http://localhost:8000/lcs");
      if (resLc.ok) {
        const data = await resLc.json();
        setLcs(data);
      }
    } catch (e) {
      console.log("Local FastAPI server offline. Running strictly on React Demo state.", e);
    }
    setLoadingInvoices(false);
    setLoadingLcs(false);
  };

  const getInvoicesList = () => {
    return isDemoMode ? demoInvoices : invoices;
  };

  const getLcsList = () => {
    return isDemoMode ? demoLcs : lcs;
  };

  // Simulated AI document intelligence pipeline
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadedFile(file);
    setIsUploading(true);
    setOcrData(null);
    setCreditProfile(null);
    setMintedTokenId(null);
    setMintTxHash(null);

    // Mock AI analysis delay
    setTimeout(() => {
      const demoDate = new Date();
      demoDate.setDate(demoDate.getDate() + 60); // 60 days in the future
      
      setOcrData({
        invoice_number: "INV-2026-089A",
        supplier_name: "Bharat Components Pvt Ltd",
        buyer_name: "Al Noor Trading LLC",
        amount: 250000.00,
        currency: "mAED",
        due_date: demoDate.toISOString().split('T')[0],
        ipfs_hash: "bafybeihdjtc4dfb-bol-alnoor-bharat-2026",
        risk_summary: "Low risk. Underlying buyer represents a prime tier Dubai distribution agency with 95%+ historical settlement reliability on-chain.",
        recommendation: "STRONG BUY / RECOMMENDED FUNDING. Calculate maximum 500 bps (5%) discount rate based on supplier score."
      });
      setIsUploading(false);
    }, 1200);
  };

  // Run Trade Credit Score prediction
  const runCreditScoring = async () => {
    setIsScoring(true);
    setTimeout(() => {
      setCreditProfile({
        score: 89,
        features: {
          payment_history_length: 36,
          on_time_payment_percentage: 97.2,
          average_invoice_size: 185000.00,
          wallet_age: 780,
          transaction_count: 310
        },
        grade: "AA Grade — Low Risk Prime",
        txHash: "0xscoreupdateamoytxhash88329"
      });
      setIsScoring(false);
    }, 1500);
  };

  // Tokenize and Mint NFT
  const mintInvoiceNFT = async () => {
    if (!ocrData || !creditProfile) return;
    setIsMinting(true);

    if (isDemoMode) {
      setTimeout(() => {
        const newId = demoInvoices.length + 101;
        const newInv: Invoice = {
          token_id: newId,
          supplier: ocrData.supplier_name,
          buyer_name: ocrData.buyer_name,
          amount: ocrData.amount,
          due_date: ocrData.due_date,
          ipfs_hash: ocrData.ipfs_hash,
          status: "Pending",
          credit_score: creditProfile.score,
          currency: ocrData.currency
        };
        setDemoInvoices([newInv, ...demoInvoices]);
        setMintedTokenId(newId);
        setMintTxHash("0xmintedreceivablenftamoytxhash99032");
        setIsMinting(false);
      }, 1500);
      return;
    }

    try {
      if (!(window as any).ethereum) throw new Error("MetaMask is not installed.");
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();
      
      const nftContract = new ethers.Contract(
        addressConfig.ReceivableNFT,
        ReceivableNFT_ABI,
        signer
      );

      const amountUnits = ethers.parseUnits(ocrData.amount.toString(), 6);
      const dueTimestamp = Math.floor(new Date(ocrData.due_date).getTime() / 1000);

      // Unique invoice number and mock buyer address
      const invoiceNum = ocrData.invoice_number || `INV-${Date.now()}`;
      const mockBuyerAddress = "0x70997970C51812dc3A010C7d01b50e0d17dc79C8"; // Importer wallet address

      const tx = await nftContract.mintReceivable(
        mockBuyerAddress,
        ocrData.buyer_name,
        invoiceNum,
        amountUnits,
        dueTimestamp,
        ocrData.ipfs_hash
      );
      const receipt = await tx.wait();
      
      let tokenId = 0;
      for (const log of receipt.logs) {
        try {
          const parsedLog = nftContract.interface.parseLog(log);
          if (parsedLog && parsedLog.name === "InvoiceMinted") {
            tokenId = Number(parsedLog.args.tokenId);
            break;
          }
        } catch (e) {}
      }

      setMintedTokenId(tokenId);
      setMintTxHash(receipt.hash);

      // Save to server cache
      const formData = new FormData();
      formData.append("token_id", tokenId.toString());
      formData.append("supplier", ocrData.supplier_name);
      formData.append("buyer_name", ocrData.buyer_name);
      formData.append("amount", ocrData.amount.toString());
      formData.append("due_date", dueTimestamp.toString());
      formData.append("ipfs_hash", ocrData.ipfs_hash);

      await fetch("http://localhost:8000/cache-invoice", {
        method: "POST",
        body: formData
      });

      fetchLiveCacheData();
    } catch (e: any) {
      console.error(e);
      if (e.message && (e.message.includes("DuplicateInvoice") || e.data?.message?.includes("DuplicateInvoice"))) {
        showToast("Invoice already tokenized. Duplicate invoices are not permitted on Nafithah.", "error");
      } else {
        showToast(`Minting transaction failed: ${e.message || e}`, "error");
      }
    }
    setIsMinting(false);
  };

  // Create Letter of Credit
  const createLC = async () => {
    if (!ocrData || !creditProfile) return;
    setIsLcCreating(true);

    if (isDemoMode) {
      setTimeout(() => {
        const newLcId = demoLcs.length + 201;
        const newLc: LCData = {
          id: newLcId,
          importer: ocrData.buyer_name,
          exporter: ocrData.supplier_name,
          amount: ocrData.amount,
          dueDate: ocrData.due_date,
          documentHash: ocrData.ipfs_hash,
          shipmentProof: "",
          status: "Created",
          creditScore: creditProfile.score
        };
        setDemoLcs([newLc, ...demoLcs]);
        setCreatedLcId(newLcId);
        setCreatedLcTxHash("0xlccreatedamoytxhash77391");
        setIsLcCreating(false);
      }, 1500);
      return;
    }

    try {
      if (!(window as any).ethereum) throw new Error("MetaMask is not installed.");
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();

      const lcContract = new ethers.Contract(
        addressConfig.LetterOfCredit,
        LetterOfCredit_ABI,
        signer
      );

      const amountUnits = ethers.parseUnits(ocrData.amount.toString(), 6);
      const dueTimestamp = Math.floor(new Date(ocrData.due_date).getTime() / 1000);

      const tx = await lcContract.createLC(
        ethers.getAddress("0x742d35Cc6634C0532925a3b844Bc454e4438f44e"), // Mock exporter address
        amountUnits,
        dueTimestamp,
        ocrData.ipfs_hash
      );
      const receipt = await tx.wait();

      let lcId = 0;
      for (const log of receipt.logs) {
        try {
          const parsedLog = lcContract.interface.parseLog(log);
          if (parsedLog && parsedLog.name === "LetterOfCreditCreated") {
            lcId = Number(parsedLog.args.lcId);
            break;
          }
        } catch (e) {}
      }

      setCreatedLcId(lcId);
      setCreatedLcTxHash(receipt.hash);

      const formData = new FormData();
      formData.append("lc_id", lcId.toString());
      formData.append("importer", (await signer.getAddress()).toLowerCase());
      formData.append("exporter", "0x742d35Cc6634C0532925a3b844Bc454e4438f44e");
      formData.append("amount", ocrData.amount.toString());
      formData.append("due_date", dueTimestamp.toString());
      formData.append("document_hash", ocrData.ipfs_hash);

      await fetch("http://localhost:8000/cache-lc", {
        method: "POST",
        body: formData
      });

      fetchLiveCacheData();
    } catch (e: any) {
      showToast(`LC creation failed: ${e.message || e}`, "error");
    }
    setIsLcCreating(false);
  };

  // Fund LC
  const fundLC = async (lcId: number, lcAmount: number) => {
    setActionLoading(prev => ({ ...prev, [`fund-${lcId}`]: true }));
    if (isDemoMode) {
      setTimeout(() => {
        setDemoLcs(prev => 
          prev.map(lc => lc.id === lcId ? { ...lc, status: "Funded" } : lc)
        );
        showToast("mAED Collateral Locked. Letter of Credit funded successfully!", "success");
        setActionLoading(prev => ({ ...prev, [`fund-${lcId}`]: false }));
      }, 1200);
      return;
    }

    try {
      if (!(window as any).ethereum) throw new Error("MetaMask is not installed.");
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();

      const tokenContract = new ethers.Contract(
        addressConfig.MockAED,
        MockAED_ABI,
        signer
      );

      const lcContract = new ethers.Contract(
        addressConfig.LetterOfCredit,
        LetterOfCredit_ABI,
        signer
      );

      const amountUnits = ethers.parseUnits(lcAmount.toString(), 6);
      
      console.log("Approving mAED spending...");
      const approveTx = await tokenContract.approve(addressConfig.LetterOfCredit, amountUnits);
      await approveTx.wait();

      console.log("Funding LC...");
      const tx = await lcContract.fundLC(lcId);
      await tx.wait();

      // Sync backend
      const formData = new FormData();
      formData.append("lc_id", lcId.toString());
      formData.append("status", "Funded");
      await fetch("http://localhost:8000/update-lc-status", {
        method: "POST",
        body: formData
      });

      showToast(`LC funded successfully! Tx: ${tx.hash}`, "success");
      fetchLiveCacheData();
    } catch (e: any) {
      showToast(`Funding failed: ${e.message || e}`, "error");
    }
    setActionLoading(prev => ({ ...prev, [`fund-${lcId}`]: false }));
  };

  // Exporter Accepts LC
  const acceptLC = async (lcId: number) => {
    setActionLoading(prev => ({ ...prev, [`accept-${lcId}`]: true }));
    if (isDemoMode) {
      setTimeout(() => {
        setDemoLcs(prev => 
          prev.map(lc => lc.id === lcId ? { ...lc, status: "Accepted" } : lc)
        );
        showToast("Letter of Credit accepted by Exporter!", "success");
        setActionLoading(prev => ({ ...prev, [`accept-${lcId}`]: false }));
      }, 1000);
      return;
    }

    try {
      if (!(window as any).ethereum) throw new Error("MetaMask is not installed.");
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();

      const lcContract = new ethers.Contract(
        addressConfig.LetterOfCredit,
        LetterOfCredit_ABI,
        signer
      );

      const tx = await lcContract.acceptLC(lcId);
      await tx.wait();

      const formData = new FormData();
      formData.append("lc_id", lcId.toString());
      formData.append("status", "Accepted");
      await fetch("http://localhost:8000/update-lc-status", {
        method: "POST",
        body: formData
      });

      showToast(`LC accepted! Tx: ${tx.hash}`, "success");
      fetchLiveCacheData();
    } catch (e: any) {
      showToast(`Accept failed: ${e.message || e}`, "error");
    }
    setActionLoading(prev => ({ ...prev, [`accept-${lcId}`]: false }));
  };

  // Exporter submits shipment proof
  const submitShipmentProof = async (lcId: number) => {
    setActionLoading(prev => ({ ...prev, [`ship-${lcId}`]: true }));
    const proofHash = "QmBillOfLadingBharatMumbaiDubai9928";
    
    if (isDemoMode) {
      setTimeout(() => {
        setDemoLcs(prev => 
          prev.map(lc => lc.id === lcId ? { ...lc, status: "Shipped", shipmentProof: proofHash } : lc)
        );
        showToast("Shipment proof uploaded. Goods exported from Mumbai to Jebel Ali, Dubai.", "success");
        setActionLoading(prev => ({ ...prev, [`ship-${lcId}`]: false }));
      }, 1500);
      return;
    }

    try {
      if (!(window as any).ethereum) throw new Error("MetaMask is not installed.");
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();

      const lcContract = new ethers.Contract(
        addressConfig.LetterOfCredit,
        LetterOfCredit_ABI,
        signer
      );

      const tx = await lcContract.submitShipmentProof(lcId, proofHash);
      await tx.wait();

      const formData = new FormData();
      formData.append("lc_id", lcId.toString());
      formData.append("status", "Shipped");
      formData.append("shipment_proof", proofHash);
      await fetch("http://localhost:8000/update-lc-status", {
        method: "POST",
        body: formData
      });

      showToast(`Shipment proof submitted successfully! Tx: ${tx.hash}`, "success");
      fetchLiveCacheData();
    } catch (e: any) {
      showToast(`Shipment submission failed: ${e.message || e}`, "error");
    }
    setActionLoading(prev => ({ ...prev, [`ship-${lcId}`]: false }));
  };

  // Release Locked funds
  const releaseLCFunds = async (lcId: number) => {
    setActionLoading(prev => ({ ...prev, [`release-${lcId}`]: true }));
    if (isDemoMode) {
      setTimeout(() => {
        setDemoLcs(prev => 
          prev.map(lc => lc.id === lcId ? { ...lc, status: "Released" } : lc)
        );
        showToast("Locked mAED funds released to Bharat Components (Mumbai Exporter) successfully!", "success");
        setActionLoading(prev => ({ ...prev, [`release-${lcId}`]: false }));
      }, 1500);
      return;
    }

    try {
      if (!(window as any).ethereum) throw new Error("MetaMask is not installed.");
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();

      const lcContract = new ethers.Contract(
        addressConfig.LetterOfCredit,
        LetterOfCredit_ABI,
        signer
      );

      const tx = await lcContract.releaseFunds(lcId);
      await tx.wait();

      const formData = new FormData();
      formData.append("lc_id", lcId.toString());
      formData.append("status", "Released");
      await fetch("http://localhost:8000/update-lc-status", {
        method: "POST",
        body: formData
      });

      showToast(`Funds released successfully! Tx: ${tx.hash}`, "success");
      fetchLiveCacheData();
    } catch (e: any) {
      showToast(`Release failed: ${e.message || e}`, "error");
    }
    setActionLoading(prev => ({ ...prev, [`release-${lcId}`]: false }));
  };

  // Trigger On-Chain Default & Penalize
  const triggerLcDefault = async (lcId: number) => {
    setActionLoading(prev => ({ ...prev, [`default-${lcId}`]: true }));
    if (isDemoMode) {
      setTimeout(() => {
        setDemoLcs(prev => 
          prev.map(lc => lc.id === lcId ? { ...lc, status: "Defaulted" } : lc)
        );
        showToast("EVM Time check: Exporter failed to ship. Default processed, collateral refunded.", "info");
        setActionLoading(prev => ({ ...prev, [`default-${lcId}`]: false }));
      }, 1500);
      return;
    }

    try {
      if (!(window as any).ethereum) throw new Error("MetaMask is not installed.");
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();

      const lcContract = new ethers.Contract(
        addressConfig.LetterOfCredit,
        LetterOfCredit_ABI,
        signer
      );

      const tx = await lcContract.markDefault(lcId);
      await tx.wait();

      const formData = new FormData();
      formData.append("lc_id", lcId.toString());
      formData.append("status", "Defaulted");
      await fetch("http://localhost:8000/update-lc-status", {
        method: "POST",
        body: formData
      });

      showToast(`Default registered and penalty executed on-chain! Tx: ${tx.hash}`, "info");
      fetchLiveCacheData();
    } catch (e: any) {
      showToast(`Default trigger failed: ${e.message || e}`, "error");
    }
    setActionLoading(prev => ({ ...prev, [`default-${lcId}`]: false }));
  };

  // Faucet request
  const claimFaucetTokens = async () => {
    setFaucetLoading(true);
    if (isDemoMode) {
      setTimeout(() => {
        showToast(`Fauceted 250,000 ${faucetCurrency} successfully! Mock tokens added.`, "success");
        setFaucetLoading(false);
      }, 1000);
      return;
    }

    try {
      if (!(window as any).ethereum) throw new Error("MetaMask is not installed.");
      const provider = new ethers.BrowserProvider((window as any).ethereum);
      const signer = await provider.getSigner();

      const targetAddress = faucetCurrency === "mAED" ? addressConfig.MockAED : addressConfig.MockUSDC;
      const abi = faucetCurrency === "mAED" ? MockAED_ABI : MockUSDC_ABI;

      const tokenContract = new ethers.Contract(targetAddress, abi, signer);
      const amountUnits = ethers.parseUnits("250000", 6);

      const tx = await tokenContract.mint(await signer.getAddress(), amountUnits);
      await tx.wait();

      showToast(`Test tokens claimed! Tx: ${tx.hash}`, "success");
    } catch (e: any) {
      showToast(`Faucet failed: ${e.message || e}`, "error");
    }
    setFaucetLoading(false);
  };

  // One-Click Demo Mode Assistant Handler
  const executeDemoStep = () => {
    if (demoStep === 1) {
      setActiveTab("dashboard");
      setDemoStep(2);
    } else if (demoStep === 2) {
      setActiveTab("invoices");
      // Simulate file drop
      handleFileUpload({
        target: { files: [new File([""], "invoice.pdf")] }
      } as any);
      setDemoStep(3);
    } else if (demoStep === 3) {
      // AI Extraction complete display (simulated OCR state)
      setDemoStep(4);
    } else if (demoStep === 4) {
      runCreditScoring();
      setDemoStep(5);
    } else if (demoStep === 5) {
      mintInvoiceNFT();
      setDemoStep(6);
    } else if (demoStep === 6) {
      setActiveTab("lcs");
      createLC();
      setDemoStep(7);
    } else if (demoStep === 7) {
      // Fund newly created LC (assuming ID is 203)
      fundLC(203, 250000);
      setDemoStep(8);
    } else if (demoStep === 8) {
      acceptLC(203);
      setTimeout(() => submitShipmentProof(203), 1000);
      setDemoStep(9);
    } else if (demoStep === 9) {
      releaseLCFunds(203);
      setDemoStep(10);
    } else if (demoStep === 10) {
      setActiveTab("dashboard");
      setDemoStep(1);
      showToast("Demo Script Completed Successfully in under 3 minutes!", "success");
    }
  };

  if (!mounted) return null;

  return (
    <div className="flex-1 flex flex-col font-sans bg-slate-950 text-slate-100 min-h-screen">
      
      {/* Premium Dark Glassmorphic Navbar */}
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-md border-b border-slate-900 px-6 py-4 flex items-center justify-between">
        <div className="flex items-center space-x-3">
          <div className="bg-gradient-to-tr from-violet-600 to-emerald-500 p-2.5 rounded-xl shadow-lg shadow-violet-900/10">
            <Sparkles className="w-5 h-5 text-white" />
          </div>
          <div>
            <div className="flex items-center space-x-2">
              <h1 className="text-xl font-bold bg-gradient-to-r from-white via-slate-200 to-slate-400 bg-clip-text text-transparent">
                Nafithah
              </h1>
              <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-semibold border border-emerald-500/20">
                UAE-India Corridor
              </span>
            </div>
            <p className="text-[10px] text-slate-400 font-medium tracking-wide uppercase">
              Stablecoin Trade Finance Infrastructure
            </p>
          </div>
        </div>

        <div className="flex items-center space-x-4">
          {/* Quick Faucet Claim */}
          <div className="flex items-center space-x-2 bg-slate-900/60 border border-slate-800 rounded-lg p-1">
            <select
              value={faucetCurrency}
              onChange={(e) => setFaucetCurrency(e.target.value as any)}
              className="bg-transparent text-xs text-slate-300 font-semibold focus:outline-none px-2 cursor-pointer"
            >
              <option value="mAED" className="bg-slate-900">mAED</option>
              <option value="mUSDC" className="bg-slate-900">mUSDC</option>
            </select>
            <button
              onClick={claimFaucetTokens}
              disabled={faucetLoading}
              className="bg-violet-600 hover:bg-violet-500 disabled:opacity-50 text-[10px] font-bold text-white px-2.5 py-1 rounded-md transition"
            >
              {faucetLoading ? "Claiming..." : "Faucet"}
            </button>
          </div>

          {/* Demo Mode Toggle */}
          <div className="flex items-center space-x-2 bg-slate-900/60 px-3 py-1.5 rounded-lg border border-slate-800">
            <span className="text-xs font-semibold text-slate-300">Demo Mode</span>
            <button
              onClick={() => {
                setIsDemoMode(!isDemoMode);
                initializeDemoData();
              }}
              className={`relative inline-flex h-5 w-10 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none ${
                isDemoMode ? "bg-emerald-500" : "bg-slate-800"
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out ${
                  isDemoMode ? "translate-x-5" : "translate-x-0"
                }`}
              />
            </button>
          </div>

          <ConnectButton showBalance={false} />
        </div>
      </header>

      {/* Main Grid: Content + Demo Guide Side Panel */}
      <div className="flex-1 max-w-7xl w-full mx-auto p-6 md:p-8 grid grid-cols-1 lg:grid-cols-4 gap-8">
        
        {/* Left/Middle Column (Tabs and Views) */}
        <div className="lg:col-span-3 space-y-8">
          
          {/* Tab Navigation */}
          <section className="flex border-b border-slate-900 overflow-x-auto whitespace-nowrap">
            <button
              onClick={() => setActiveTab("dashboard")}
              className={`pb-4 px-6 font-semibold text-sm transition-all relative ${
                activeTab === "dashboard" ? "text-violet-400" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Overview Dashboard
              {activeTab === "dashboard" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-400 rounded-full" />}
            </button>
            <button
              onClick={() => setActiveTab("invoices")}
              className={`pb-4 px-6 font-semibold text-sm transition-all relative ${
                activeTab === "invoices" ? "text-violet-400" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              SME Invoice Portal
              {activeTab === "invoices" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-400 rounded-full" />}
            </button>
            <button
              onClick={() => setActiveTab("lcs")}
              className={`pb-4 px-6 font-semibold text-sm transition-all relative ${
                activeTab === "lcs" ? "text-violet-400" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Letter of Credit Escrows
              {activeTab === "lcs" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-400 rounded-full" />}
            </button>
            <button
              onClick={() => setActiveTab("scoring")}
              className={`pb-4 px-6 font-semibold text-sm transition-all relative ${
                activeTab === "scoring" ? "text-violet-400" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Credit Scoring
              {activeTab === "scoring" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-400 rounded-full" />}
            </button>
            <button
              onClick={() => setActiveTab("admin")}
              className={`pb-4 px-6 font-semibold text-sm transition-all relative ${
                activeTab === "admin" ? "text-violet-400" : "text-slate-400 hover:text-slate-200"
              }`}
            >
              Admin Controller
              {activeTab === "admin" && <span className="absolute bottom-0 left-0 right-0 h-0.5 bg-violet-400 rounded-full" />}
            </button>
          </section>

          {/* VIEW: OVERVIEW DASHBOARD */}
          {activeTab === "dashboard" && (
            <div className="space-y-8">
              
              {/* UAE Challenge Specific Metrics Panel */}
              <section className="grid grid-cols-2 md:grid-cols-3 gap-4">
                <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 flex items-center space-x-4">
                  <div className="p-3 bg-violet-500/10 rounded-xl text-violet-400">
                    <Database className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Liquidity Unlocked</p>
                    <p className="text-xl font-bold text-slate-100">AED 5,231,585</p>
                    <p className="text-[10px] text-slate-500">$1,425,500 Equiv.</p>
                  </div>
                </div>

                <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 flex items-center space-x-4">
                  <div className="p-3 bg-emerald-500/10 rounded-xl text-emerald-400">
                    <TrendingUp className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Total Trade Volume</p>
                    <p className="text-xl font-bold text-slate-100">AED 17,799,500</p>
                    <p className="text-[10px] text-slate-500">$4,850,000 Transacted</p>
                  </div>
                </div>

                <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 flex items-center space-x-4">
                  <div className="p-3 bg-blue-500/10 rounded-xl text-blue-400">
                    <Clock className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Avg Settlement</p>
                    <p className="text-xl font-bold text-slate-100">14.5 Days</p>
                    <p className="text-[10px] text-slate-500">Traditional: 60+ Days</p>
                  </div>
                </div>

                <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 flex items-center space-x-4">
                  <div className="p-3 bg-indigo-500/10 rounded-xl text-indigo-400">
                    <Landmark className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Active Letters of Credit</p>
                    <p className="text-xl font-bold text-slate-100">{getLcsList().filter(x => x.status !== "Released" && x.status !== "Defaulted").length} Active</p>
                    <p className="text-[10px] text-slate-500">AED 700,000 Collateralized</p>
                  </div>
                </div>

                <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 flex items-center space-x-4">
                  <div className="p-3 bg-violet-500/10 rounded-xl text-violet-400">
                    <Layers className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Invoices Financed</p>
                    <p className="text-xl font-bold text-slate-100">{getInvoicesList().filter(x => x.status === "Funded").length} Active</p>
                    <p className="text-[10px] text-slate-500">AED {getInvoicesList().filter(x => x.status === "Funded").reduce((a, b) => a + b.amount, 0).toLocaleString()} Outlay</p>
                  </div>
                </div>

                <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 flex items-center space-x-4">
                  <div className="p-3 bg-red-500/10 rounded-xl text-red-400">
                    <AlertTriangle className="w-6 h-6" />
                  </div>
                  <div>
                    <p className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">Default Registry Rate</p>
                    <p className="text-xl font-bold text-slate-100">0.02%</p>
                    <p className="text-[10px] text-slate-500">1 Historical Default</p>
                  </div>
                </div>
              </section>

              {/* CEPA Trade Corridor Visualizer */}
              <section className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 space-y-6">
                <style dangerouslySetInnerHTML={{__html: `
                  @keyframes moveCargo {
                    0% { offset-distance: 0%; opacity: 1; }
                    90% { offset-distance: 100%; opacity: 1; }
                    100% { offset-distance: 100%; opacity: 0; }
                  }
                  @keyframes moveTokens {
                    0% { offset-distance: 0%; opacity: 1; }
                    90% { offset-distance: 100%; opacity: 1; }
                    100% { offset-distance: 100%; opacity: 0; }
                  }
                  @keyframes dash {
                    to {
                      stroke-dashoffset: -170;
                    }
                  }
                  .animate-cargo {
                    animation: moveCargo 8s linear infinite;
                  }
                  .animate-tokens {
                    animation: moveTokens 3s linear infinite;
                  }
                `}} />
                
                <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                  <div>
                    <div className="flex items-center space-x-2">
                      <span className="bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-[10px] font-bold px-2 py-0.5 rounded-full uppercase tracking-wider flex items-center gap-1">
                        <Sparkles className="w-3 h-3" /> Live Corridor Tracker
                      </span>
                    </div>
                    <h3 className="text-lg font-bold text-slate-100 mt-1">
                      CEPA Trade Corridor Visualizer <span className="text-slate-500 font-normal">(Mumbai ↔ Dubai)</span>
                    </h3>
                    <p className="text-xs text-slate-400">
                      Interactive on-chain lifecycle of cross-border trade invoices and Letters of Credit.
                    </p>
                  </div>
                  
                  {selectedVisualizerStage !== null && (
                    <div className="flex items-center space-x-2 bg-slate-950 border border-slate-900 rounded-lg p-1 text-[10px] font-bold">
                      <button 
                        onClick={() => setSelectedVisualizerStage(null)}
                        className="bg-violet-600 text-white px-2.5 py-1 rounded transition hover:bg-violet-500"
                      >
                        Sync with Demo Stepper
                      </button>
                    </div>
                  )}
                </div>

                {/* Main Visual Map & Path */}
                <div className="relative bg-slate-950 rounded-xl border border-slate-900 p-6 flex flex-col md:flex-row gap-6 overflow-hidden min-h-[300px]">
                  {/* Grid Background Effect */}
                  <div className="absolute inset-0 bg-[linear-gradient(to_right,#0f172a_1px,transparent_1px),linear-gradient(to_bottom,#0f172a_1px,transparent_1px)] bg-[size:24px_24px] [mask-image:radial-gradient(ellipse_60%_50%_at_50%_50%,#000_70%,transparent_100%)] opacity-30 pointer-events-none" />

                  {/* Left Side: The Interactive Map */}
                  <div className="flex-1 relative min-h-[220px] flex items-center justify-center">
                    <svg className="w-full max-w-[500px] h-[220px]" viewBox="0 0 500 220" fill="none" xmlns="http://www.w3.org/2000/svg">
                      {/* Connection Trade Lane Curved Path */}
                      <path 
                        id="tradePath"
                        d="M 380,130 Q 250,170 120,80" 
                        stroke="url(#pathGradient)" 
                        strokeWidth="3" 
                        strokeDasharray="6,6"
                        className="opacity-70"
                      />
                      
                      {/* Animated flow path */}
                      <path 
                        d="M 380,130 Q 250,170 120,80" 
                        stroke="url(#glowGradient)" 
                        strokeWidth="3"
                        strokeLinecap="round"
                        className="opacity-90 animate-[dash_4s_linear_infinite]"
                        style={{
                          strokeDasharray: "20, 150",
                          strokeDashoffset: 0
                        }}
                      />

                      {/* Gradients definition */}
                      <defs>
                        <linearGradient id="pathGradient" x1="120" y1="80" x2="380" y2="130" gradientUnits="userSpaceOnUse">
                          <stop offset="0%" stopColor="#4f46e5" />
                          <stop offset="50%" stopColor="#10b981" />
                          <stop offset="100%" stopColor="#6366f1" />
                        </linearGradient>
                        <linearGradient id="glowGradient" x1="120" y1="80" x2="380" y2="130" gradientUnits="userSpaceOnUse">
                          <stop offset="0%" stopColor="#818cf8" />
                          <stop offset="50%" stopColor="#34d399" />
                          <stop offset="100%" stopColor="#a78bfa" />
                        </linearGradient>
                      </defs>

                      {/* Dubai Node (Port of Jebel Ali) */}
                      <g transform="translate(120, 80)">
                        <circle r="16" className="fill-slate-900 stroke-violet-500 stroke-2" />
                        <circle r="24" className="fill-none stroke-violet-500/30 stroke-1 animate-ping" />
                        <Landmark className="w-4 h-4 text-violet-400 -translate-x-2 -translate-y-2 pointer-events-none" />
                        <text x="-50" y="-20" className="fill-slate-300 font-bold text-[9px] pointer-events-none">Dubai Hub</text>
                        <text x="-50" y="-10" className="fill-slate-500 text-[7px] pointer-events-none">Jebel Ali Port</text>
                      </g>

                      {/* Mumbai Node (Nhava Sheva Port) */}
                      <g transform="translate(380, 130)">
                        <circle r="16" className="fill-slate-900 stroke-emerald-500 stroke-2" />
                        <circle r="24" className="fill-none stroke-emerald-500/30 stroke-1 animate-ping" />
                        <Layers className="w-4 h-4 text-emerald-400 -translate-x-2 -translate-y-2 pointer-events-none" />
                        <text x="25" y="-10" className="fill-slate-300 font-bold text-[9px] pointer-events-none">Mumbai Hub</text>
                        <text x="25" y="0" className="fill-slate-500 text-[7px] pointer-events-none">Nhava Sheva Port</text>
                      </g>

                      {/* Animated Tokens/Icons along the path based on stage */}
                      {/* Stage 1: Document in Mumbai */}
                      {(selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep()) === 1 && (
                        <g transform="translate(372, 95)" className="animate-bounce">
                          <rect width="16" height="20" rx="2" className="fill-slate-900 stroke-violet-400 stroke-2" />
                          <FileText className="w-3 h-3 text-violet-400 translate-x-0.5 translate-y-1" />
                        </g>
                      )}

                      {/* Stage 2: Oracle scoring score badge */}
                      {(selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep()) === 2 && (
                        <g transform="translate(362, 95)" className="animate-pulse">
                          <rect width="36" height="16" rx="4" className="fill-slate-900 stroke-emerald-400 stroke-2" />
                          <text x="6" y="11" className="fill-emerald-400 font-bold font-mono text-[9px]">CR:89</text>
                        </g>
                      )}

                      {/* Stage 3: Invoice NFT in Mumbai */}
                      {(selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep()) === 3 && (
                        <g transform="translate(370, 95)" className="animate-bounce">
                          <circle r="10" className="fill-slate-900 stroke-indigo-400 stroke-2" />
                          <Sparkles className="w-3.5 h-3.5 text-indigo-400 -translate-x-1.5 -translate-y-1.5" />
                        </g>
                      )}

                      {/* Stage 4: Letter of Credit locked in Dubai (Escrow locks mAED) */}
                      {(selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep()) === 4 && (
                        <g transform="translate(98, 115)" className="animate-[pulse_1.5s_ease-in-out_infinite]">
                          <rect width="45" height="16" rx="4" className="fill-slate-900 stroke-violet-400 stroke-2" />
                          <text x="4" y="11" className="fill-violet-400 font-bold font-mono text-[8px]">mAED Vault</text>
                        </g>
                      )}

                      {/* Stage 5: Container ship moving across Arabian Sea */}
                      {(selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep()) === 5 && (
                        <g className="animate-cargo" style={{
                          offsetPath: "path('M 380,130 Q 250,170 120,80')",
                          offsetRotate: "auto"
                        }}>
                          <circle r="12" className="fill-slate-900 stroke-indigo-400 stroke-2 animate-pulse" />
                          <Ship className="w-3.5 h-3.5 text-indigo-400 -translate-x-1.5 -translate-y-1.5" />
                        </g>
                      )}

                      {/* Stage 6: Settlement released (Tokens flying back) */}
                      {(selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep()) === 6 && (
                        <g className="animate-tokens" style={{
                          offsetPath: "path('M 120,80 Q 250,170 380,130')",
                          offsetRotate: "auto"
                        }}>
                          <circle r="10" className="fill-slate-900 stroke-emerald-400 stroke-2" />
                          <DollarSign className="w-3 h-3 text-emerald-400 -translate-x-1 -translate-y-1.5" />
                        </g>
                      )}
                    </svg>
                  </div>

                  {/* Right Side: Detail Panel */}
                  <div className="w-full md:w-[240px] bg-slate-900/60 rounded-lg border border-slate-900 p-4 flex flex-col justify-between shrink-0 space-y-4">
                    <div>
                      <div className="flex items-center space-x-1.5">
                        <span className={`w-2 h-2 rounded-full ${
                          (selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep()) === 6 ? "bg-emerald-500" : "bg-violet-500 animate-pulse"
                        }`} />
                        <span className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">
                          Stage {(selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep())}: {
                            (selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep()) === 1 ? "Invoice Creation" :
                            (selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep()) === 2 ? "AI Credit Audit" :
                            (selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep()) === 3 ? "NFT Tokenization" :
                            (selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep()) === 4 ? "Escrow Funding" :
                            (selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep()) === 5 ? "Cargo Logistics" :
                            "Payout Released"
                          }
                        </span>
                      </div>
                      
                      <h4 className="text-xs font-bold text-slate-200 mt-2">
                        {
                          (selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep()) === 1 ? "SME Exporter Uploads Cargo Invoice" :
                          (selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep()) === 2 ? "Credit Scoring Oracle Execution" :
                          (selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep()) === 3 ? "Solidity Receivable NFT Minted" :
                          (selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep()) === 4 ? "Dubai Importer Deploys Letter of Credit" :
                          (selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep()) === 5 ? "Ocean Freight Cargo Sails" :
                          "Atomic Settlement Executed"
                        }
                      </h4>
                      
                      <p className="text-[11px] text-slate-400 mt-2 leading-relaxed">
                        {
                          (selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep()) === 1 ? "Exporters upload trade PDFs. Tesseract OCR structures variables (amount, buyer name, due date) instantly." :
                          (selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep()) === 2 ? "FastAPI ML calculates supplier risk rating (89). Authorised oracle wallet registers score on-chain in CreditRegistry." :
                          (selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep()) === 3 ? "ERC-721 NFT mints on Polygon. A unique double-factoring prevention hash is written to the ledger." :
                          (selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep()) === 4 ? "Importer deposits mAED Dirham stablecoins in LetterOfCredit escrow, securing trade collateral." :
                          (selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep()) === 5 ? "Exporter ships container from Nhava Sheva. Bill of Lading hash is pinned to IPFS, waiting for arrival confirmation." :
                          "Jebel Ali arrival triggers shipping release logic. mAED collateral splits: exporter receives funds; lender spread executes."
                        }
                      </p>
                    </div>

                    <div className="border-t border-slate-900 pt-3 flex items-center justify-between text-[9px] text-slate-500 font-mono">
                      <span>Active Contract:</span>
                      <span className="text-violet-400">
                        {
                          (selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep()) === 1 ? "FastAPI OCR API" :
                          (selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep()) === 2 ? "CreditRegistry.sol" :
                          (selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep()) === 3 ? "ReceivableNFT.sol" :
                          (selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep()) === 4 ? "InvoiceMarketplace.sol" :
                          (selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep()) === 5 ? "LetterOfCredit.sol" :
                          "RepaymentEscrow.sol"
                        }
                      </span>
                    </div>
                  </div>
                </div>

                {/* Interactive Control Row */}
                <div className="grid grid-cols-3 md:grid-cols-6 gap-2">
                  {[
                    { label: "1. Upload & OCR", id: 1 },
                    { label: "2. ML Scoring", id: 2 },
                    { label: "3. Mint NFT", id: 3 },
                    { label: "4. Lock Escrow", id: 4 },
                    { label: "5. Verify Cargo", id: 5 },
                    { label: "6. Settle Pay", id: 6 },
                  ].map((stage) => (
                    <button
                      key={stage.id}
                      onClick={() => setSelectedVisualizerStage(stage.id)}
                      className={`px-2 py-2 rounded-xl text-[10px] font-bold border transition-all truncate text-center ${
                        (selectedVisualizerStage !== null ? selectedVisualizerStage : getTimelineStep()) === stage.id
                          ? "bg-slate-900 border-violet-500 text-violet-400 shadow shadow-violet-500/10"
                          : "bg-slate-900/10 border-slate-900 text-slate-400 hover:text-slate-200 hover:border-slate-800"
                      }`}
                    >
                      {stage.label}
                    </button>
                  ))}
                </div>
              </section>

              {/* Unified Trade Corridor Timeline Stepper */}
              <section className="bg-slate-900/20 border border-slate-900 rounded-2xl p-6 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide flex items-center">
                    <Sparkles className="w-4 h-4 mr-1 text-violet-400" /> Unified Trade Corridor Lifecycle Timeline
                  </h3>
                  <span className="text-[10px] bg-violet-500/10 text-violet-400 border border-violet-500/20 px-2.5 py-0.5 rounded-full font-bold uppercase">
                    {isDemoMode ? `Demo Mode Step ${demoStep}/10` : "Live On-Chain Mode"}
                  </span>
                </div>
                
                <div className="relative flex items-center justify-between py-6">
                  {/* Background connector line */}
                  <div className="absolute left-6 right-6 top-1/2 -translate-y-1/2 h-0.5 bg-slate-800" />
                  
                  {/* Active connector line */}
                  <div 
                    className="absolute left-6 top-1/2 -translate-y-1/2 h-0.5 bg-gradient-to-r from-violet-600 via-emerald-500 to-indigo-600 transition-all duration-500" 
                    style={{ width: `${Math.max(0, Math.min(100, ((getTimelineStep() - 1) / 5) * 100))}%` }}
                  />

                  {/* Stepper items */}
                  {[
                    { label: "AI OCR", icon: Upload, desc: "Upload & Extract" },
                    { label: "Credit Rating", icon: Database, desc: "On-Chain scoring" },
                    { label: "Receivable NFT", icon: Layers, desc: "Tokenize Invoice" },
                    { label: "Letter of Credit", icon: Landmark, desc: "mAED Escrowed" },
                    { label: "Shipment Proof", icon: ShieldCheck, desc: "Logistics Anchor" },
                    { label: "Settled", icon: CheckCircle2, desc: "Escrow Released" },
                  ].map((step, idx) => {
                    const currentIdx = idx + 1;
                    const isActive = getTimelineStep() >= currentIdx;
                    const isCurrent = getTimelineStep() === currentIdx;
                    const StepIcon = step.icon;
                    
                    return (
                      <div key={idx} className="relative z-10 flex flex-col items-center space-y-2 flex-1">
                        <div className={`p-3 rounded-full border transition-all duration-300 ${
                          isCurrent 
                            ? "bg-slate-950 border-violet-500 text-violet-400 scale-110 shadow-lg shadow-violet-500/10" 
                            : isActive 
                              ? "bg-slate-950 border-emerald-500 text-emerald-400" 
                              : "bg-slate-950 border-slate-800 text-slate-600"
                        }`}>
                          <StepIcon className="w-5 h-5" />
                        </div>
                        <div className="text-center">
                          <p className={`text-xs font-bold ${isActive ? "text-slate-200" : "text-slate-500"}`}>{step.label}</p>
                          <p className="text-[9px] text-slate-500 hidden sm:block">{step.desc}</p>
                        </div>
                      </div>
                    );
                  })}
                </div>
              </section>

              {/* Corridor, Risk & Revenue Distribution */}
              <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Visual Trade corridor route */}
                <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-5 space-y-4">
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Active Corridor</h3>
                  
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-900 flex flex-col justify-between space-y-4 h-[116px]">
                    <div className="flex justify-between items-center">
                      <div className="space-y-0.5">
                        <p className="text-[10px] font-bold text-violet-400 uppercase tracking-wide">Importer</p>
                        <p className="text-xs font-semibold text-slate-200">Al Noor Trading</p>
                      </div>
                      <div className="space-y-0.5 text-right">
                        <p className="text-[10px] font-bold text-emerald-400 uppercase tracking-wide">Exporter</p>
                        <p className="text-xs font-semibold text-slate-200">Bharat Components</p>
                      </div>
                    </div>
                    
                    <div className="flex flex-col items-center px-2">
                      <div className="w-full flex items-center justify-center py-1">
                        <div className="h-0.5 bg-gradient-to-r from-violet-600 via-emerald-500 to-indigo-600 flex-1 relative">
                          <div className="absolute right-0 top-1/2 -translate-y-1/2 w-1.5 h-1.5 bg-indigo-400 rounded-full animate-ping" />
                        </div>
                      </div>
                      <span className="text-[8px] text-slate-500 uppercase tracking-wider font-mono">settlement: mAED stablecoin</span>
                    </div>
                  </div>
                </div>

                {/* Credit risk classification */}
                <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Credit Risk Allocation</h3>
                  <div className="space-y-2">
                    <div>
                      <div className="flex justify-between text-xs font-semibold mb-1">
                        <span className="text-emerald-400 text-[10px]">Low Risk (AAA-AA)</span>
                        <span className="text-[10px]">85%</span>
                      </div>
                      <div className="h-1 bg-slate-900 rounded-full"><div className="h-full bg-emerald-500 rounded-full" style={{ width: "85%" }} /></div>
                    </div>
                    
                    <div>
                      <div className="flex justify-between text-xs font-semibold mb-1">
                        <span className="text-yellow-500 text-[10px]">Medium Risk (A-BBB)</span>
                        <span className="text-[10px]">12%</span>
                      </div>
                      <div className="h-1 bg-slate-900 rounded-full"><div className="h-full bg-yellow-500 rounded-full" style={{ width: "12%" }} /></div>
                    </div>

                    <div>
                      <div className="flex justify-between text-xs font-semibold mb-1">
                        <span className="text-red-500 text-[10px]">High Risk (Sub-BBB)</span>
                        <span className="text-[10px]">3%</span>
                      </div>
                      <div className="h-1 bg-slate-900 rounded-full"><div className="h-full bg-red-500 rounded-full" style={{ width: "3%" }} /></div>
                    </div>
                  </div>
                </div>

                {/* Revenue Model Section */}
                <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-5 space-y-3">
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide flex items-center">
                    <DollarSign className="w-4 h-4 mr-1 text-emerald-400" /> Protocol Revenue Engine
                  </h3>
                  <div className="space-y-2">
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-slate-400">Credit Analysis Fee</span>
                      <span className="font-mono text-slate-200 font-semibold">25 mAED / call</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-slate-400">LC Origination Fee</span>
                      <span className="font-mono text-slate-200 font-semibold">0.15% collateral</span>
                    </div>
                    <div className="flex justify-between items-center text-[10px]">
                      <span className="text-slate-400">Factoring Settlement Fee</span>
                      <span className="font-mono text-slate-200 font-semibold">1.00% of spread</span>
                    </div>
                    <div className="h-[1px] bg-slate-900 my-1" />
                    <div className="bg-slate-950 p-2 rounded border border-slate-900 flex justify-between items-center h-[34px]">
                      <span className="text-[8px] text-slate-500 uppercase font-bold tracking-wider">Protocol Earnings</span>
                      <span className="text-xs font-bold text-emerald-400 font-mono font-semibold">AED 14,825.50</span>
                    </div>
                  </div>
                </div>
              </section>

              {/* Recent Active Transactions */}
              <section className="bg-slate-900/20 border border-slate-900 rounded-2xl p-5 space-y-4">
                <div className="flex justify-between items-center">
                  <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Recent Receivables & Invoices</h3>
                  <span className="text-xs text-slate-400">Demo Active Dataset</span>
                </div>
                
                <div className="overflow-x-auto">
                  <table className="w-full text-left text-xs">
                    <thead>
                      <tr className="border-b border-slate-900 text-slate-400 pb-2">
                        <th className="py-2">Token ID</th>
                        <th>Seller (Exporter)</th>
                        <th>Buyer (Importer)</th>
                        <th>Amount</th>
                        <th>Currency</th>
                        <th>Due Date</th>
                        <th>Status</th>
                        <th>Risk Score</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-900">
                      {loadingInvoices ? (
                        Array.from({ length: 3 }).map((_, i) => (
                          <tr key={i} className="animate-pulse">
                            <td className="py-3"><div className="h-4 bg-slate-900 rounded w-12"></div></td>
                            <td><div className="h-4 bg-slate-900 rounded w-28"></div></td>
                            <td><div className="h-4 bg-slate-900 rounded w-24"></div></td>
                            <td><div className="h-4 bg-slate-900 rounded w-20"></div></td>
                            <td><div className="h-4 bg-slate-900 rounded w-10"></div></td>
                            <td><div className="h-4 bg-slate-900 rounded w-16"></div></td>
                            <td><div className="h-6 bg-slate-900 rounded-full w-14"></div></td>
                            <td><div className="h-4 bg-slate-900 rounded w-8"></div></td>
                          </tr>
                        ))
                      ) : getInvoicesList().length === 0 ? (
                        <tr>
                          <td colSpan={8} className="py-8 text-center text-slate-500">
                            <div className="flex flex-col items-center justify-center space-y-2 py-4">
                              <AlertCircle className="w-8 h-8 text-slate-700" />
                              <p className="text-xs font-semibold text-slate-400">No active invoices found on-chain</p>
                              <p className="text-[10px] text-slate-500">Toggle Demo Mode or upload an invoice in the SME Portal to get started.</p>
                            </div>
                          </td>
                        </tr>
                      ) : (
                        getInvoicesList().map((inv) => (
                          <tr key={inv.token_id} className="hover:bg-slate-900/10">
                            <td className="py-3 font-mono font-bold text-slate-300">#{inv.token_id}</td>
                            <td className="font-semibold">{inv.supplier.split(" (")[0]}</td>
                            <td className="text-slate-300">{inv.buyer_name.split(" (")[0]}</td>
                            <td className="font-bold">AED {inv.amount.toLocaleString()}</td>
                            <td className="text-slate-400 font-semibold">{inv.currency}</td>
                            <td className="text-slate-400">{inv.due_date}</td>
                            <td>
                              <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                                inv.status === "Pending" ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20" :
                                inv.status === "Funded" ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" :
                                inv.status === "Repaid" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                                "bg-red-500/10 text-red-500 border border-red-500/20"
                              }`}>
                                {inv.status}
                              </span>
                            </td>
                            <td>
                              <span className={`font-bold ${
                                (inv.credit_score || 0) >= 85 ? "text-emerald-400" :
                                (inv.credit_score || 0) >= 70 ? "text-yellow-500" :
                                "text-red-400"
                              }`}>
                                {inv.credit_score || "N/A"}
                              </span>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </section>

            </div>
          )}

          {/* VIEW: SME INVOICE PORTAL */}
          {activeTab === "invoices" && (
            <div className="space-y-6">
              
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* Upload Section */}
                <div className="lg:col-span-2 space-y-6">
                  
                  {/* Step 1: Upload Invoice */}
                  <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 space-y-4">
                    <div className="flex items-center space-x-2">
                      <span className="bg-violet-600/20 text-violet-400 font-bold text-[10px] px-2 py-0.5 rounded">Trade Invoice Upload</span>
                    </div>

                    <div className="border border-dashed border-slate-800 rounded-xl p-8 text-center bg-slate-900/10 hover:border-violet-500/40 hover:bg-slate-900/20 transition duration-300 relative cursor-pointer">
                      <input
                        type="file"
                        accept=".pdf,image/*"
                        onChange={handleFileUpload}
                        className="absolute inset-0 opacity-0 cursor-pointer"
                      />
                      <div className="flex flex-col items-center justify-center space-y-3">
                        <div className="p-3 bg-slate-950 rounded-full text-slate-400">
                          <Upload className="w-6 h-6" />
                        </div>
                        <div>
                          <p className="text-xs font-semibold text-slate-300">Upload PDF Invoice of UAE Export Cargo</p>
                          <p className="text-[10px] text-slate-500 mt-1">Accepts PDF or images (Max 10MB)</p>
                        </div>
                        {uploadedFile && (
                          <div className="bg-slate-900 px-3 py-1 rounded-full border border-slate-800 flex items-center space-x-2">
                            <FileText className="w-3 h-3 text-violet-400" />
                            <span className="text-[10px] text-slate-300 truncate max-w-xs">{uploadedFile.name}</span>
                          </div>
                        )}
                      </div>
                    </div>

                    {isUploading && (
                      <div className="flex items-center justify-center space-x-2 text-xs text-slate-400">
                        <RefreshCw className="w-3 h-3 animate-spin text-violet-400" />
                        <span>AI Document Parsing OCR Extraction Pipeline active...</span>
                      </div>
                    )}
                  </div>

                  {/* Step 2: Confirm OCR Fields */}
                  {ocrData && (
                    <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 space-y-5">
                      <div className="flex items-center justify-between">
                        <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-semibold border border-emerald-500/20 flex items-center space-x-1">
                          <CheckCircle2 className="w-3 h-3" />
                          <span>AI OCR Extraction Completed</span>
                        </span>
                      </div>

                      <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-slate-400 uppercase">Invoice Number</label>
                          <input
                            type="text"
                            value={ocrData.invoice_number}
                            onChange={(e) => setOcrData({ ...ocrData, invoice_number: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-900 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-violet-500 transition"
                          />
                        </div>
                        
                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-slate-400 uppercase">SME Exporter (Seller)</label>
                          <input
                            type="text"
                            value={ocrData.supplier_name}
                            onChange={(e) => setOcrData({ ...ocrData, supplier_name: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-900 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-violet-500 transition"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-slate-400 uppercase">Dubai Importer (Buyer)</label>
                          <input
                            type="text"
                            value={ocrData.buyer_name}
                            onChange={(e) => setOcrData({ ...ocrData, buyer_name: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-900 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-violet-500 transition"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-slate-400 uppercase">Invoice Amount (AED Stablecoin)</label>
                          <input
                            type="number"
                            value={ocrData.amount}
                            onChange={(e) => setOcrData({ ...ocrData, amount: parseFloat(e.target.value) || 0 })}
                            className="w-full bg-slate-950 border border-slate-900 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-violet-500 transition"
                          />
                        </div>

                        <div className="space-y-1">
                          <label className="text-[10px] font-semibold text-slate-400 uppercase">Maturity Date</label>
                          <input
                            type="date"
                            value={ocrData.due_date}
                            onChange={(e) => setOcrData({ ...ocrData, due_date: e.target.value })}
                            className="w-full bg-slate-950 border border-slate-900 rounded-lg px-3 py-2 text-slate-100 focus:outline-none focus:border-violet-500 transition"
                          />
                        </div>
                      </div>

                      <div className="pt-2">
                        <button
                          onClick={runCreditScoring}
                          disabled={isScoring}
                          className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-2.5 px-4 rounded-xl shadow-lg flex items-center justify-center space-x-2 transition duration-300 disabled:opacity-50 text-xs"
                        >
                          {isScoring ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span>Evaluating SME On-Chain Credit Scoring...</span>
                            </>
                          ) : (
                            <>
                              <Sparkles className="w-4 h-4" />
                              <span>Generate AI Credit Scoring</span>
                            </>
                          )}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Step 3: Mint Invoice NFT */}
                  {creditProfile && ocrData && (
                    <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-6 space-y-4">
                      <div className="flex items-center space-x-2">
                        <span className="bg-violet-600/20 text-violet-400 font-bold text-[10px] px-2 py-0.5 rounded">Action 1</span>
                        <h3 className="text-sm font-bold text-slate-200">Mint Invoice Receivable NFT</h3>
                      </div>

                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-900 flex items-start space-x-3 text-[11px] text-slate-400">
                        <AlertTriangle className="w-5 h-5 text-violet-400 shrink-0 mt-0.5" />
                        <div>
                          <p className="font-semibold text-slate-300">Transaction Details</p>
                          <p className="mt-1 leading-relaxed">
                            This registers the invoice as an ERC-721 token on the Polygon Amoy testnet.
                            The token holds the metadata hash, Exporter/Importer credentials, and sets the initial status as <strong className="text-slate-200">Pending</strong>.
                          </p>
                        </div>
                      </div>

                      <div>
                        <button
                          onClick={mintInvoiceNFT}
                          disabled={isMinting}
                          className="w-full bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2.5 px-4 rounded-xl shadow-lg flex items-center justify-center space-x-2 transition duration-300 disabled:opacity-50 text-xs"
                        >
                          {isMinting ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span>Minting Trade NFT...</span>
                            </>
                          ) : (
                            <>
                              <CheckCircle2 className="w-4 h-4" />
                              <span>Mint NFT & List on Marketplace</span>
                            </>
                          )}
                        </button>
                      </div>

                      {mintedTokenId !== null && (
                        <div className="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20 space-y-1 text-xs">
                          <p className="text-emerald-400 font-bold">NFT Minted Successfully!</p>
                          <p className="text-slate-300">
                            Token ID: <span className="font-mono text-white font-bold">#{mintedTokenId}</span>
                          </p>
                          <p className="text-slate-400 truncate">
                            Tx Hash: <span className="font-mono text-slate-200">{mintTxHash}</span>
                          </p>
                        </div>
                      )}
                    </div>
                  )}

                </div>

                {/* AI Document Intelligence Sidebar */}
                <div className="space-y-6">
                  <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 space-y-4">
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wide flex items-center"><BarChart3 className="w-4 h-4 mr-1.5 text-violet-400" /> AI Invoice Intelligence</h3>
                    
                    {ocrData ? (
                      <div className="space-y-4 text-xs">
                        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-900 space-y-3">
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase font-semibold">Structured JSON Output</p>
                            <pre className="text-[10px] font-mono text-emerald-400 mt-1.5 bg-slate-950/80 p-2 rounded max-h-40 overflow-y-auto border border-slate-900">
                              {JSON.stringify({
                                invoiceNo: ocrData.invoice_number,
                                amount: ocrData.amount,
                                currency: ocrData.currency,
                                exporter: ocrData.supplier_name,
                                importer: ocrData.buyer_name,
                                dueDate: ocrData.due_date,
                                ipfsHash: ocrData.ipfs_hash
                              }, null, 2)}
                            </pre>
                          </div>
                        </div>

                        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-900 space-y-2">
                          <p className="text-[10px] text-slate-400 uppercase font-semibold">Credit Risk Assessment</p>
                          <p className="text-slate-300 leading-relaxed text-[11px]">{ocrData.risk_summary}</p>
                        </div>

                        <div className="bg-slate-950 p-3.5 rounded-xl border border-slate-900 space-y-2">
                          <p className="text-[10px] text-slate-400 uppercase font-semibold flex items-center text-violet-400"><ShieldCheck className="w-3.5 h-3.5 mr-1" /> Decision Recommendation</p>
                          <p className="text-slate-300 leading-relaxed text-[11px] font-semibold">{ocrData.recommendation}</p>
                        </div>
                      </div>
                    ) : (
                      <div className="text-center py-12 text-xs text-slate-500">
                        <FileText className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                        <p>Upload a trade invoice PDF to generate structured JSON extraction & credit risk recommendation.</p>
                      </div>
                    )}
                  </div>
                </div>

              </section>

            </div>
          )}

          {/* VIEW: LETTER OF CREDIT LIFECYCLE */}
          {activeTab === "lcs" && (
            <div className="space-y-6">
              
              <section className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                
                {/* LC Management list */}
                <div className="lg:col-span-2 space-y-6">
                  <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-5 space-y-4">
                    <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Active Letters of Credit</h3>
                    
                    <div className="space-y-4">
                      {loadingLcs ? (
                        Array.from({ length: 2 }).map((_, i) => (
                          <div key={i} className="bg-slate-950 p-5 rounded-xl border border-slate-900 space-y-4 animate-pulse">
                            <div className="flex justify-between items-start">
                              <div className="space-y-2">
                                <div className="h-4 bg-slate-900 rounded w-20"></div>
                                <div className="h-3 bg-slate-900 rounded w-48"></div>
                              </div>
                              <div className="text-right space-y-2">
                                <div className="h-4 bg-slate-900 rounded w-24"></div>
                                <div className="h-3 bg-slate-900 rounded w-16"></div>
                              </div>
                            </div>
                            <div className="h-2 bg-slate-900 rounded w-full"></div>
                          </div>
                        ))
                      ) : getLcsList().length === 0 ? (
                        <div className="bg-slate-950 p-8 rounded-xl border border-slate-900 text-center text-slate-500">
                          <div className="flex flex-col items-center justify-center space-y-2 py-4">
                            <AlertCircle className="w-8 h-8 text-slate-700" />
                            <p className="text-xs font-semibold text-slate-400">No active Letters of Credit escrows active</p>
                            <p className="text-[10px] text-slate-500 mt-1">Create one from an uploaded invoice in the SME Portal to start the collateral escrow flow.</p>
                          </div>
                        </div>
                      ) : (
                        getLcsList().map((lc) => (
                          <div key={lc.id} className="bg-slate-950 p-5 rounded-xl border border-slate-900 space-y-4">
                            <div className="flex justify-between items-start">
                              <div>
                                <div className="flex items-center space-x-2">
                                  <span className="font-mono font-bold text-slate-200">LC #{lc.id}</span>
                                  <span className={`text-[10px] font-bold px-2 py-0.5 rounded-full ${
                                    lc.status === "Created" ? "bg-yellow-500/10 text-yellow-500 border border-yellow-500/20" :
                                    lc.status === "Funded" ? "bg-blue-500/10 text-blue-400 border border-blue-500/20" :
                                    lc.status === "Accepted" ? "bg-indigo-500/10 text-indigo-400 border border-indigo-500/20" :
                                    lc.status === "Shipped" ? "bg-purple-500/10 text-purple-400 border border-purple-500/20" :
                                    lc.status === "Released" ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20" :
                                    "bg-red-500/10 text-red-500 border border-red-500/20"
                                  }`}>
                                    {lc.status}
                                  </span>
                                </div>
                                <p className="text-[10px] text-slate-400 mt-1">Importer: {lc.importer} ↔ Exporter: {lc.exporter}</p>
                              </div>
                              <div className="text-right">
                                <p className="text-sm font-bold text-slate-200">AED {lc.amount.toLocaleString()}</p>
                                <p className="text-[9px] text-slate-500 flex items-center justify-end mt-1"><Calendar className="w-3 h-3 mr-1" /> Due: {lc.dueDate}</p>
                              </div>
                            </div>

                            {/* Progress Bar of LC Milestones */}
                            <div className="w-full flex items-center justify-between text-[10px] font-semibold text-slate-500">
                              <span className={lc.status !== "Created" ? "text-violet-400" : ""}>Created</span>
                              <ChevronRight className="w-3 h-3" />
                              <span className={["Funded", "Accepted", "Shipped", "Released"].includes(lc.status) ? "text-violet-400" : ""}>Funded</span>
                              <ChevronRight className="w-3 h-3" />
                              <span className={["Accepted", "Shipped", "Released"].includes(lc.status) ? "text-violet-400" : ""}>Accepted</span>
                              <ChevronRight className="w-3 h-3" />
                              <span className={["Shipped", "Released"].includes(lc.status) ? "text-violet-400" : ""}>Shipped</span>
                              <ChevronRight className="w-3 h-3" />
                              <span className={lc.status === "Released" ? "text-emerald-400 font-bold" : ""}>Settled</span>
                            </div>

                            {/* Control Actions depending on Status */}
                            <div className="flex space-x-3 pt-2">
                              {lc.status === "Created" && (
                                <button
                                  onClick={() => fundLC(lc.id, lc.amount)}
                                  disabled={actionLoading[`fund-${lc.id}`]}
                                  className="flex-1 bg-violet-600 hover:bg-violet-500 text-white font-bold py-2 px-3 rounded-lg text-xs transition relative overflow-hidden"
                                >
                                  {actionLoading[`fund-${lc.id}`] ? "Locking mAED Collateral..." : "Lock Collateral (Fund LC)"}
                                </button>
                              )}

                              {lc.status === "Funded" && (
                                <button
                                  onClick={() => acceptLC(lc.id)}
                                  disabled={actionLoading[`accept-${lc.id}`]}
                                  className="flex-1 bg-violet-600 hover:bg-violet-500 text-white font-bold py-2 px-3 rounded-lg text-xs transition"
                                >
                                  {actionLoading[`accept-${lc.id}`] ? "Accepting Terms..." : "Accept LC terms (Exporter)"}
                                </button>
                              )}

                              {lc.status === "Accepted" && (
                                <button
                                  onClick={() => submitShipmentProof(lc.id)}
                                  disabled={actionLoading[`ship-${lc.id}`]}
                                  className="flex-1 bg-indigo-600 hover:bg-indigo-500 text-white font-bold py-2 px-3 rounded-lg text-xs transition"
                                >
                                  {actionLoading[`ship-${lc.id}`] ? "Uploading Bill of Lading..." : "Upload Shipment Proof & Cargo Export"}
                                </button>
                              )}

                              {lc.status === "Shipped" && (
                                <div className="flex-1 flex space-x-3">
                                  <button
                                    onClick={() => releaseLCFunds(lc.id)}
                                    disabled={actionLoading[`release-${lc.id}`]}
                                    className="flex-1 bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-2 px-3 rounded-lg text-xs transition"
                                  >
                                    {actionLoading[`release-${lc.id}`] ? "Releasing locked mAED..." : "Confirm Delivery & Release Funds"}
                                  </button>
                                  
                                  <button
                                    onClick={() => triggerLcDefault(lc.id)}
                                    disabled={actionLoading[`default-${lc.id}`]}
                                    className="bg-red-900/20 hover:bg-red-900/40 text-red-400 font-bold py-2 px-3 rounded-lg text-xs border border-red-500/20 transition"
                                  >
                                    {actionLoading[`default-${lc.id}`] ? "Executing default..." : "Trigger Default"}
                                  </button>
                                </div>
                              )}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                </div>

                {/* Left/Sidebar: Create LC Wizard */}
                <div className="space-y-6">
                  <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 space-y-4">
                    <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wide flex items-center"><Landmark className="w-4 h-4 mr-1.5 text-violet-400" /> Create Trade LC Escrow</h3>
                    
                    {ocrData ? (
                      <div className="space-y-4 text-xs">
                        <div className="bg-slate-950 p-4 rounded-xl border border-slate-900 space-y-3">
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase font-semibold">Importer (Buyer)</p>
                            <p className="text-slate-200 font-semibold">{ocrData.buyer_name}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase font-semibold">Exporter (Seller)</p>
                            <p className="text-slate-200 font-semibold">{ocrData.supplier_name}</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase font-semibold">Collateral Lock Amount</p>
                            <p className="text-slate-200 font-bold">AED {ocrData.amount.toLocaleString()} ({ocrData.currency})</p>
                          </div>
                          <div>
                            <p className="text-[10px] text-slate-400 uppercase font-semibold">Trade Score (Importer)</p>
                            <p className="text-emerald-400 font-bold">89 / 100 Grade AA</p>
                          </div>
                        </div>

                        <button
                          onClick={createLC}
                          disabled={isLcCreating}
                          className="w-full bg-violet-600 hover:bg-violet-500 text-white font-bold py-2.5 px-4 rounded-xl shadow-lg flex items-center justify-center space-x-2 transition duration-300 disabled:opacity-50 text-xs"
                        >
                          {isLcCreating ? (
                            <>
                              <RefreshCw className="w-4 h-4 animate-spin" />
                              <span>Creating On-Chain Escrow...</span>
                            </>
                          ) : (
                            <>
                              <Landmark className="w-4 h-4" />
                              <span>Deploy Letter of Credit Escrow</span>
                            </>
                          )}
                        </button>

                        {createdLcId !== null && (
                          <div className="p-4 bg-emerald-500/10 rounded-xl border border-emerald-500/20 space-y-1">
                            <p className="text-emerald-400 font-bold">LC Deployed Successfully!</p>
                            <p className="text-slate-300">
                              LC ID: <span className="font-mono text-white font-bold">#{createdLcId}</span>
                            </p>
                            <p className="text-slate-400 truncate">
                              Tx Hash: <span className="font-mono text-slate-200">{createdLcTxHash}</span>
                            </p>
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="text-center py-12 text-xs text-slate-500">
                        <FileText className="w-8 h-8 mx-auto mb-2 text-slate-600" />
                        <p>Upload a trade invoice in the SME Portal first to extract credentials and prepare the Letter of Credit.</p>
                      </div>
                    )}
                  </div>
                </div>

              </section>

            </div>
          )}

          {/* VIEW: ON-CHAIN SCORING */}
          {activeTab === "scoring" && (
            <div className="space-y-6">
              
              <section className="grid grid-cols-1 md:grid-cols-3 gap-6">
                
                {/* Credit scoring visual indicator */}
                <div className="bg-slate-900/20 border border-slate-900 rounded-2xl p-6 md:col-span-2 space-y-6">
                  <div className="flex justify-between items-center">
                    <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Trade Credit Engine Prediction</h3>
                    <span className="text-[10px] bg-emerald-500/10 text-emerald-400 px-2 py-0.5 rounded-full font-semibold border border-emerald-500/20">Active ML weights</span>
                  </div>

                  {creditProfile ? (
                    <div className="space-y-6 text-xs">
                      
                      {/* Big Circle Score */}
                      <div className="flex items-center space-x-6">
                        <div className="relative w-28 h-28 flex items-center justify-center bg-slate-950 rounded-full border-4 border-violet-500/40 shadow-inner">
                          <div className="text-center">
                            <p className="text-3xl font-extrabold text-white">{creditProfile.score}</p>
                            <p className="text-[9px] text-slate-400 uppercase font-semibold">ML Score</p>
                          </div>
                        </div>
                        
                        <div className="space-y-2">
                          <h4 className="text-sm font-bold text-slate-200">{creditProfile.grade}</h4>
                          <p className="text-slate-400 leading-relaxed max-w-sm">
                            SME profile displays robust payment stability, minimal invoice deviations, and solid transactional track record across the Jebel Ali corridor.
                          </p>
                          <p className="text-[10px] text-violet-400 font-mono">Oracle Update Tx: {creditProfile.txHash?.slice(0, 18)}...</p>
                        </div>
                      </div>

                      {/* Feature Breakdown */}
                      <div className="bg-slate-950 p-4 rounded-xl border border-slate-900 space-y-3">
                        <h4 className="text-xs font-bold text-slate-300 uppercase">Input Feature Attributes</h4>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                          <div className="flex justify-between border-b border-slate-900/60 pb-1.5">
                            <span className="text-slate-400">Payment History Length</span>
                            <span className="font-bold text-slate-200">{creditProfile.features.payment_history_length} Months</span>
                          </div>
                          <div className="flex justify-between border-b border-slate-900/60 pb-1.5">
                            <span className="text-slate-400">On-Time Payment Ratio</span>
                            <span className="font-bold text-slate-200">{creditProfile.features.on_time_payment_percentage}%</span>
                          </div>
                          <div className="flex justify-between border-b border-slate-900/60 pb-1.5">
                            <span className="text-slate-400">Average Invoice Size</span>
                            <span className="font-bold text-slate-200">AED {creditProfile.features.average_invoice_size.toLocaleString()}</span>
                          </div>
                          <div className="flex justify-between border-b border-slate-900/60 pb-1.5">
                            <span className="text-slate-400">On-Chain Wallet Age</span>
                            <span className="font-bold text-slate-200">{creditProfile.features.wallet_age} Days</span>
                          </div>
                          <div className="flex justify-between border-b border-slate-900/60 pb-1.5">
                            <span className="text-slate-400">Total Transaction Count</span>
                            <span className="font-bold text-slate-200">{creditProfile.features.transaction_count} Txns</span>
                          </div>
                        </div>
                      </div>

                    </div>
                  ) : (
                    <div className="text-center py-16 text-slate-500">
                      <FileText className="w-10 h-10 mx-auto mb-3 text-slate-600" />
                      <p className="text-xs">No active credit calculation. Navigate to the SME Invoice Portal to submit files and trigger calculations.</p>
                    </div>
                  )}

                </div>

                {/* Score mapping explanation */}
                <div className="bg-slate-900/40 border border-slate-900 rounded-2xl p-5 space-y-4 text-xs">
                  <h3 className="text-xs font-bold text-slate-200 uppercase tracking-wide">On-Chain Scoring Logic</h3>
                  <p className="text-slate-400 leading-relaxed">
                    Emergent Finance translates on-chain credit registry scores (0-100) into dynamic funding discount rates (bps) at time of invoice financing.
                  </p>
                  
                  <div className="bg-slate-950 p-4 rounded-xl border border-slate-900 space-y-2 font-mono text-[10px]">
                    <p className="text-slate-400">Base Discount Rate: <span className="text-white font-bold">15.00% (1500 bps)</span></p>
                    <p className="text-slate-400">Per point deduction: <span className="text-white font-bold">-0.10% (-10 bps)</span></p>
                    <p className="text-slate-400">Floor Discount Rate: <span className="text-white font-bold">5.00% (500 bps)</span></p>
                  </div>
                  
                  <div className="border-l-4 border-l-violet-500 pl-3 py-1 bg-violet-500/5 rounded">
                    <p className="font-semibold text-slate-300">UAE-India trade corridor optimization</p>
                    <p className="text-[11px] text-slate-400 mt-1">
                      Scores above 85 unlock prime lending rates (5% discount) matching commercial tier trade loans.
                    </p>
                  </div>
                </div>

              </section>

            </div>
          )}

          {/* VIEW: ADMIN CONTROLLER */}
          {activeTab === "admin" && (
            <div className="space-y-6">
              
              <section className="bg-slate-900/20 border border-slate-900 rounded-2xl p-6 space-y-4">
                <h3 className="text-sm font-bold text-slate-200 uppercase tracking-wide">Repayment Simulator & Manual Default Penalizer</h3>
                <p className="text-xs text-slate-400">
                  Simulate direct buyer repayments or triggers defaults for expired invoices on-chain.
                </p>

                <div className="space-y-4 pt-2">
                  {getInvoicesList().filter(x => x.status === "Funded").map((inv) => (
                    <div key={inv.token_id} className="bg-slate-950 p-4 rounded-xl border border-slate-900 flex flex-col sm:flex-row sm:items-center justify-between gap-4 text-xs">
                      <div>
                        <div className="flex items-center space-x-2">
                          <span className="font-bold text-slate-200">Invoice #{inv.token_id}</span>
                          <span className="bg-indigo-500/10 text-indigo-400 px-2 py-0.5 rounded text-[10px] font-semibold border border-indigo-500/20">Funded</span>
                        </div>
                        <p className="text-[10px] text-slate-400 mt-1">Supplier: {inv.supplier} | Buyer: {inv.buyer_name}</p>
                        <p className="text-[10px] text-slate-500 mt-0.5">Due Date: {inv.due_date}</p>
                      </div>

                      <div className="flex items-center space-x-3 self-end sm:self-auto">
                        <span className="font-bold text-slate-200 mr-2">AED {inv.amount.toLocaleString()}</span>
                        
                        <button
                          onClick={async () => {
                            setActionLoading(prev => ({ ...prev, [`repay-${inv.token_id}`]: true }));
                            if (isDemoMode) {
                              setTimeout(() => {
                                setDemoInvoices(prev => 
                                  prev.map(x => x.token_id === inv.token_id ? { ...x, status: "Repaid" } : x)
                                );
                                showToast("Repayment successfully settled! Capital and spread payout splits routed.", "success");
                                setActionLoading(prev => ({ ...prev, [`repay-${inv.token_id}`]: false }));
                              }, 1200);
                              return;
                            }
                            // Call live contract repay
                            try {
                              if (!(window as any).ethereum) throw new Error("MetaMask is not installed.");
                              const provider = new ethers.BrowserProvider((window as any).ethereum);
                              const signer = await provider.getSigner();

                              const tokenContract = new ethers.Contract(addressConfig.MockUSDC, MockUSDC_ABI, signer);
                              const escrowContract = new ethers.Contract(addressConfig.RepaymentEscrow, RepaymentEscrow_ABI, signer);
                              const amountUnits = ethers.parseUnits(inv.amount.toString(), 6);

                              console.log("Approving escrow spending...");
                              const appTx = await tokenContract.approve(addressConfig.RepaymentEscrow, amountUnits);
                              await appTx.wait();

                              console.log("Repaying...");
                              const tx = await escrowContract.repay(inv.token_id);
                              await tx.wait();

                              // Update backend
                              const formData = new FormData();
                              formData.append("token_id", inv.token_id.toString());
                              formData.append("status", "Repaid");
                              await fetch("http://localhost:8000/update-invoice-status", {
                                method: "POST",
                                body: formData
                              });

                              showToast(`Repayment successful! Tx: ${tx.hash}`, "success");
                              fetchLiveCacheData();
                            } catch (e: any) {
                              showToast(`Repayment failed: ${e.message || e}`, "error");
                            }
                            setActionLoading(prev => ({ ...prev, [`repay-${inv.token_id}`]: false }));
                          }}
                          disabled={actionLoading[`repay-${inv.token_id}`]}
                          className="bg-emerald-600 hover:bg-emerald-500 text-white font-bold py-1.5 px-3 rounded-lg text-xs transition"
                        >
                          {actionLoading[`repay-${inv.token_id}`] ? "Settling..." : "Simulate Repay"}
                        </button>

                        <button
                          onClick={async () => {
                            setActionLoading(prev => ({ ...prev, [`default-${inv.token_id}`]: true }));
                            if (isDemoMode) {
                              setTimeout(() => {
                                setDemoInvoices(prev => 
                                  prev.map(x => x.token_id === inv.token_id ? { ...x, status: "Defaulted" } : x)
                                );
                                showToast("Default recorded. On-chain penalty executed: credit score penalized.", "info");
                                setActionLoading(prev => ({ ...prev, [`default-${inv.token_id}`]: false }));
                              }, 1200);
                              return;
                            }
                            // Call live contract default
                            try {
                              if (!(window as any).ethereum) throw new Error("MetaMask is not installed.");
                              const provider = new ethers.BrowserProvider((window as any).ethereum);
                              const signer = await provider.getSigner();

                              const marketplaceContract = new ethers.Contract(addressConfig.InvoiceMarketplace, InvoiceMarketplace_ABI, signer);
                              const tx = await marketplaceContract.markDefault(inv.token_id);
                              await tx.wait();

                              const formData = new FormData();
                              formData.append("token_id", inv.token_id.toString());
                              formData.append("status", "Defaulted");
                              await fetch("http://localhost:8000/update-invoice-status", {
                                method: "POST",
                                body: formData
                              });

                              showToast(`Default recorded! Tx: ${tx.hash}`, "info");
                              fetchLiveCacheData();
                            } catch (e: any) {
                              showToast(`Default trigger failed: ${e.message || e}`, "error");
                            }
                            setActionLoading(prev => ({ ...prev, [`default-${inv.token_id}`]: false }));
                          }}
                          disabled={actionLoading[`default-${inv.token_id}`]}
                          className="bg-red-900/20 hover:bg-red-900/40 text-red-400 font-bold py-1.5 px-3 rounded-lg text-xs border border-red-500/20 transition"
                        >
                          {actionLoading[`default-${inv.token_id}`] ? "Penalizing..." : "Trigger Default"}
                        </button>
                      </div>
                    </div>
                  ))}

                  {getInvoicesList().filter(x => x.status === "Funded").length === 0 && (
                    <div className="text-center py-8 text-slate-500 text-xs">
                      No currently active funded invoices available to simulate repayment or defaults.
                    </div>
                  )}
                </div>
              </section>

            </div>
          )}

        </div>

        {/* Right Column (Floating Demo Assistant Panel) */}
        <div className="lg:col-span-1">
          <div className="sticky top-24 bg-slate-900/40 border border-slate-900 rounded-2xl p-5 space-y-4">
            
            <div className="flex items-center space-x-2">
              <span className="bg-emerald-500/10 text-emerald-400 font-bold text-[9px] px-2 py-0.5 rounded border border-emerald-500/20">JUDGE TOOLKIT</span>
            </div>
            
            <div className="space-y-1">
              <h3 className="text-sm font-bold text-slate-200">One-Click Demo Wizard</h3>
              <p className="text-[10px] text-slate-400 leading-relaxed">
                Click the button below sequentially to run the entire 10-step corridor trade financing demo.
              </p>
            </div>

            {/* Current Step Tracker */}
            <div className="bg-slate-950 p-4 rounded-xl border border-slate-900 space-y-3">
              <div className="flex justify-between items-center text-[10px] font-bold text-slate-400 uppercase tracking-wide">
                <span>Current Step</span>
                <span className="text-violet-400">{demoStep} / 10</span>
              </div>
              
              <div className="text-xs font-semibold text-slate-200">
                {demoStep === 1 && "1. Open Metrics Dashboard"}
                {demoStep === 2 && "2. Upload Exporter Invoice"}
                {demoStep === 3 && "3. Display AI Extracted JSON"}
                {demoStep === 4 && "4. Generate Credit Score (89)"}
                {demoStep === 5 && "5. Mint Invoice Receivable NFT"}
                {demoStep === 6 && "6. Deploy Letter of Credit Escrow"}
                {demoStep === 7 && "7. Importer Locks mAED Stablecoin"}
                {demoStep === 8 && "8. Submit Mumbai Shipment Proof"}
                {demoStep === 9 && "9. Confirm Delivery & Release Funds"}
                {demoStep === 10 && "10. View Final Settlement Yields"}
              </div>
              
              <div className="w-full bg-slate-900 h-1.5 rounded-full overflow-hidden">
                <div 
                  className="bg-gradient-to-r from-violet-600 to-emerald-500 h-full transition-all duration-300"
                  style={{ width: `${demoStep * 10}%` }}
                />
              </div>
            </div>

            <button
              onClick={executeDemoStep}
              className="w-full bg-gradient-to-r from-violet-600 to-indigo-600 hover:from-violet-500 hover:to-indigo-500 text-white font-bold py-2.5 px-4 rounded-xl shadow-lg flex items-center justify-center space-x-2 transition duration-300 text-xs"
            >
              <span>{demoStep === 10 ? "Finish & Reset" : `Execute Step ${demoStep}`}</span>
              <ArrowRight className="w-4 h-4" />
            </button>
            
            <div className="border-t border-slate-900 pt-3 text-[10px] text-slate-500 space-y-1">
              <p className="font-semibold text-slate-400">Demo Scenario Corridor:</p>
              <p>Al Noor Trading LLC (Dubai) ↔ Bharat Components Pvt Ltd (India)</p>
              <p>Locked Trade Guarantee: mAED 250,000</p>
            </div>

          </div>
        </div>

      </div>

      {/* Floating Premium Glassmorphic Toast Notifications */}
      {toast && (
        <div className="fixed bottom-6 right-6 z-50 animate-bounce bg-slate-900/95 border border-slate-800 backdrop-blur-md px-5 py-3.5 rounded-xl shadow-2xl flex items-center space-x-3 text-xs max-w-sm">
          {toast.type === "success" && (
            <div className="p-1.5 bg-emerald-500/10 rounded-full text-emerald-400">
              <CheckCircle2 className="w-4 h-4" />
            </div>
          )}
          {toast.type === "error" && (
            <div className="p-1.5 bg-red-500/10 rounded-full text-red-400">
              <AlertCircle className="w-4 h-4" />
            </div>
          )}
          {toast.type === "info" && (
            <div className="p-1.5 bg-blue-500/10 rounded-full text-blue-400">
              <Clock className="w-4 h-4" />
            </div>
          )}
          <div>
            <p className="text-[10px] uppercase font-bold text-slate-400">
              {toast.type === "success" ? "Success" : toast.type === "error" ? "Transaction Failed" : "Notification"}
            </p>
            <p className="text-slate-100 font-medium mt-0.5 leading-relaxed">{toast.message}</p>
          </div>
        </div>
      )}

    </div>
  );
}
