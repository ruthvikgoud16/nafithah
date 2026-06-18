import { NextRequest, NextResponse } from "next/server";
import { db } from "../db";
import { ethers } from "ethers";
import addressConfig from "../../../config/addresses.json";

function getSimpleHash(str: string): number {
  let hash = 0;
  for (let i = 0; i < str.length; i++) {
    const char = str.charCodeAt(i);
    hash = (hash << 5) - hash + char;
    hash = hash & hash; // Convert to 32bit integer
  }
  return Math.abs(hash);
}

const CreditRegistry_ABI = [
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
];

export async function POST(req: NextRequest) {
  try {
    let walletAddress: string;

    const contentType = req.headers.get("content-type") || "";
    if (contentType.includes("multipart/form-data") || contentType.includes("application/x-www-form-urlencoded")) {
      const formData = await req.formData();
      walletAddress = (formData.get("wallet_address") as string) || "";
    } else {
      const body = await req.json();
      walletAddress = body.wallet_address || "";
    }

    walletAddress = walletAddress.toLowerCase().trim();
    if (!walletAddress) {
      return NextResponse.json({ error: "Missing wallet_address" }, { status: 400 });
    }

    // Deterministically generate credit features based on the wallet address
    const hash = getSimpleHash(walletAddress);
    const payment_history_length = 6 + (hash % 55); // 6 to 60 months
    const on_time_payment_percentage = 60.0 + (Math.floor(hash / 256) % 40); // 60% to 100%
    const average_invoice_size = 2000.0 + (Math.floor(hash / 65536) % 48000); // 2k to 50k
    const wallet_age = 30 + (Math.floor(hash / 16777216) % 970); // 30 to 1000 days
    const transaction_count = 5 + (hash % 495); // 5 to 500

    const features = {
      payment_history_length,
      on_time_payment_percentage,
      average_invoice_size,
      wallet_age,
      transaction_count
    };

    // ML Model Weights
    const coeffs = [-0.5, -1.0, 0.2, -0.4, -0.3];
    const intercept = -0.5;
    const means = [30.0, 85.0, 25000.0, 500.0, 250.0];
    const scales = [15.0, 10.0, 15000.0, 300.0, 150.0];

    // Scale features
    const scaled_features = [
      (features.payment_history_length - means[0]) / scales[0],
      (features.on_time_payment_percentage - means[1]) / scales[1],
      (features.average_invoice_size - means[2]) / scales[2],
      (features.wallet_age - means[3]) / scales[3],
      (features.transaction_count - means[4]) / scales[4]
    ];

    // Compute logit
    let logit = intercept;
    for (let i = 0; i < 5; i++) {
      logit += coeffs[i] * scaled_features[i];
    }

    // Sigmoid probability of default
    const prob_default = 1.0 / (1.0 + Math.exp(-logit));

    // Score is inverse of default probability
    let credit_score = Math.round((1.0 - prob_default) * 100);
    credit_score = Math.max(0, Math.min(100, credit_score));

    // Store in DB cache
    db.setSmeProfile(walletAddress, {
      wallet_address: walletAddress,
      ...features,
      credit_score
    });

    // Write on-chain if environment variables are provided
    let txHash = "0xmocktransactionhash1234567890abcdef";
    let onChainSuccess = false;

    const rpcUrl = process.env.AMOY_RPC_URL || "https://rpc-amoy.polygon.technology";
    const privateKey = process.env.PRIVATE_KEY;
    const registryAddress = addressConfig.CreditRegistry;

    if (privateKey && registryAddress) {
      try {
        const provider = new ethers.JsonRpcProvider(rpcUrl);
        const wallet = new ethers.Wallet(privateKey, provider);
        const contract = new ethers.Contract(registryAddress, CreditRegistry_ABI, wallet);

        // Check if current score matches
        let currentScore = 0;
        try {
          const res = await contract.getScore(walletAddress);
          currentScore = Number(res[0]);
        } catch (e) {}

        if (currentScore !== credit_score) {
          const tx = await contract.setScore(walletAddress, credit_score);
          const receipt = await tx.wait();
          txHash = receipt.hash;
          onChainSuccess = true;
        } else {
          txHash = "Already updated on-chain";
          onChainSuccess = true;
        }
      } catch (e) {
        console.error("On-chain submission error:", e);
      }
    }

    return NextResponse.json({
      wallet_address: walletAddress,
      features,
      credit_score,
      on_chain_success: onChainSuccess,
      tx_hash: txHash
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 });
  }
}
