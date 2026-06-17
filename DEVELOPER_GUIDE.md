# Nafithah Developer Integration Guide
### Technical specifications, smart contract interfaces, and service configurations for the tokenized invoice financing protocol.

---

## 🏗️ Repository Directory Structure

```
/contracts    Hardhat Solidity smart contracts and unit tests
/backend      FastAPI Python risk-scoring and document OCR parser
/frontend     Next.js Dapp with Wagmi, Viem, and RainbowKit
/config       Shared address configurations read by frontend and backend
```

---

## 📜 Smart Contract Architecture

All Solidity contracts target compiler `^0.8.20`, utilize OpenZeppelin standards, and are written for Hardhat with a Polygon Amoy network configuration.

### Shared Trade Types

```solidity
// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

enum ReceivableStatus { Listed, Funded, Repaid, Defaulted }

struct Receivable {
    address supplier;
    string buyerName;
    uint256 amount;          // face value, in mUSDC base units (6 decimals)
    uint256 dueDate;          // unix timestamp
    string invoiceIPFSHash;   // CID of invoice doc + extracted JSON
    ReceivableStatus status;
}

struct Funding {
    address lender;
    uint256 fundedAmount;     // net amount lender actually paid out (post-discount)
    uint256 discountBps;      // discount rate applied, in basis points, snapshotted at fund time
    uint256 fundedAt;
}
```

---

### 1. `ReceivableNFT.sol`

ERC-721 representing a single invoice. Mint is open to suppliers; status transitions are restricted to the Marketplace and Escrow contracts via an `onlyController` modifier.

```solidity
interface IReceivableNFT {
    event ReceivableMinted(
        uint256 indexed tokenId,
        address indexed supplier,
        uint256 amount,
        uint256 dueDate
    );

    event StatusUpdated(
        uint256 indexed tokenId,
        ReceivableStatus oldStatus,
        ReceivableStatus newStatus
    );

    /// @notice Mints a new receivable NFT to msg.sender (the supplier).
    /// @dev Status initializes to Listed.
    function mintReceivable(
        string calldata buyerName,
        uint256 amount,
        uint256 dueDate,
        string calldata invoiceIPFSHash
    ) external returns (uint256 tokenId);

    /// @notice Returns full receivable data for a token.
    function getReceivable(uint256 tokenId) external view returns (Receivable memory);

    /// @notice Restricted to addresses granted CONTROLLER_ROLE (Marketplace, Escrow).
    function updateStatus(uint256 tokenId, ReceivableStatus newStatus) external;

    /// @notice Owner-only. Grants CONTROLLER_ROLE to Marketplace/Escrow after deployment.
    function setController(address controller, bool allowed) external;
}
```

**Notes for implementation:**
- Use OpenZeppelin `ERC721` + `AccessControl` (role `CONTROLLER_ROLE`) rather than a single hardcoded controller address, so both Marketplace and Escrow can call `updateStatus`.
- `tokenId` should just be an incrementing counter (OpenZeppelin `Counters` or a simple `uint256 private _nextId`).
- Store `Receivable` structs in a `mapping(uint256 => Receivable) private _receivables`.

---

### 2. `CreditRegistry.sol`

Oracle-writable score registry. Only the backend's oracle wallet can write scores.

```solidity
interface ICreditRegistry {
    event ScoreUpdated(address indexed subject, uint8 score, uint256 timestamp);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);

    /// @notice Restricted to the oracle address. Score must be 0-100.
    function setScore(address subject, uint8 score) external;

    /// @notice Returns the latest score and when it was set. Returns (0, 0) if never set.
    function getScore(address subject) external view returns (uint8 score, uint256 timestamp);

    /// @notice Owner-only. Rotates the oracle address (e.g. if backend wallet changes).
    function setOracle(address newOracle) external;
}
```

**Notes for implementation:**
- Use OpenZeppelin `Ownable` for `setOracle`; a simple `onlyOracle` modifier checking `msg.sender == oracle` for `setScore`.
- Revert with a clear custom error (`ScoreOutOfRange()`) if `score > 100`.
- No score history is needed for the sandbox — overwriting is fine.

---

### 3. `InvoiceMarketplace.sol`

Handles invoice financing. Lenders send mUSDC; the contract computes a discount rate based on the supplier's credit score, pays the supplier the discounted amount immediately, and records the lender's claim for repayment.

```solidity
interface IInvoiceMarketplace {
    event ReceivableFunded(
        uint256 indexed tokenId,
        address indexed lender,
        uint256 fundedAmount,
        uint256 discountBps
    );

    /// @notice Lender funds a Listed receivable. Caller must have approved
    /// this contract to pull `amount` mUSDC beforehand (ERC-20 approve).
    /// Reverts if receivable is not Listed.
    /// Effects:
    ///   1. discountBps = calculateDiscountRate(receivable.supplier)
    ///   2. fundedAmount = amount - (amount * discountBps / 10_000)
    ///   3. pulls `amount` mUSDC from lender (full face value), pays
    ///      `fundedAmount` to supplier, retains the discount spread
    ///      in this contract as protocol margin (paid out to lender on repay)
    ///   4. records Funding struct, sets ReceivableNFT status -> Funded
    function fundReceivable(uint256 tokenId) external;

    /// @notice Discount rate in basis points (bps) for a supplier, derived
    /// from their CreditRegistry score. Pure function of score:
    ///   discountBps = max(MIN_DISCOUNT_BPS, BASE_DISCOUNT_BPS - score * BPS_PER_POINT)
    /// Example constants: BASE_DISCOUNT_BPS = 1500 (15%), BPS_PER_POINT = 10,
    /// MIN_DISCOUNT_BPS = 500 (5%) → score 0 = 15% discount, score 100 = 5% discount.
    function calculateDiscountRate(address supplier) public view returns (uint256 discountBps);

    /// @notice Returns the Funding record for a tokenId (lender, amounts, timestamp).
    function getFunding(uint256 tokenId) external view returns (Funding memory);
}
```

**Notes for implementation:**
- Constructor takes addresses of `ReceivableNFT`, `CreditRegistry`, and the `mUSDC` token.
- If a supplier has no score yet (`getScore` returns timestamp `0`), default to the worst-case discount (`BASE_DISCOUNT_BPS`) rather than reverting, so transactions do not break on unscored wallets.
- `mapping(uint256 => Funding) public fundings`.

---

### 4. `RepaymentEscrow.sol`

Escrow that coordinates repayment. Buyer (or admin, simulating the buyer) repays the full face value. The contract splits the payout: the lender receives their funded amount plus the discount spread; any protocol fee logic is extracted from that spread.

```solidity
interface IRepaymentEscrow {
    event RepaymentReceived(uint256 indexed tokenId, address indexed payer, uint256 amount);
    event PayoutSplit(uint256 indexed tokenId, address indexed lender, uint256 lenderPayout);

    /// @notice Caller (buyer or demo admin) repays the full invoice face value
    /// in mUSDC. Caller must have approved this contract for `amount` beforehand.
    /// Reverts if receivable is not Funded.
    /// Effects:
    ///   1. pulls `receivable.amount` mUSDC from caller
    ///   2. lenderPayout = funding.fundedAmount + (receivable.amount * funding.discountBps / 10_000)
    ///   3. transfers lenderPayout to funding.lender
    ///   4. sets ReceivableNFT status -> Repaid
    function repay(uint256 tokenId) external;

    /// @notice View helper so the frontend can display the expected payout
    /// before the buyer/admin calls repay().
    function previewPayout(uint256 tokenId) external view returns (uint256 lenderPayout);
}
```

**Notes for implementation:**
- Constructor takes addresses of `ReceivableNFT`, `InvoiceMarketplace` (to read `Funding` data), and `mUSDC`.
- For simulated defaults: an admin-only `markDefaulted(tokenId)` can be supported, but is not required for the core protocol flow.

---

### 5. `MockUSDC.sol`

Supporting mock stablecoin contract utilized for local and testnet deployments.

```solidity
interface IMockUSDC {
    /// @notice Mints test tokens to any address. Open/unrestricted for testnet faucet convenience.
    function mint(address to, uint256 amount) external;
}
```

**Notes for implementation:**
- Standard OpenZeppelin `ERC20`, name "Mock USDC", symbol "mUSDC", 6 decimals (`decimals()` override).
- `mint` left open (no access control) since this is purely a testnet faucet token — never deploy this pattern to production.

---

### Hardhat Test Coverage Validation

- `ReceivableNFT`: mint sets correct fields and `Listed` status; non-controller cannot call `updateStatus`.
- `CreditRegistry`: oracle can set score 0-100; non-oracle reverts; score >100 reverts.
- `InvoiceMarketplace`: `calculateDiscountRate` matches formula for a few sample scores; `fundReceivable` moves correct token amounts, flips status to `Funded`, records `Funding`.
- `RepaymentEscrow`: `repay` moves correct payout to lender, flips status to `Repaid`; reverts if receivable isn't `Funded`.

---

## 🤖 Off-Chain Machine Learning & OCR Services

### 1. Risk-Scoring Engine (Python, FastAPI)
- **Endpoint**: `POST /score`
- **Payload**: SME wallet address + uploaded financial data (CSV or PDF) → returns score 0-100.
- **Model**: Logistic regression/gradient boosting model trained on historical trade features (features: payment history length, on-time payment %, avg invoice size, wallet transaction proxy).
- **Oracle Write**: Backend calls `CreditRegistry.setScore` on-chain via Web3.py using the authorized oracle wallet key.

### 2. Document OCR Parsing Pipeline
- **Endpoint**: `POST /extract-invoice`
- **Payload**: PDF/image invoice document upload.
- **Pipeline**: Runs OCR engine to extract buyer/supplier names, invoice values, and due dates.
- **IPFS Pinning**: Hashes and pins the structured metadata JSON + original document to IPFS, returning the IPFS CID ready for `mintReceivable`.

---

## 💻 Frontend Dapp (Next.js + Wagmi + RainbowKit)

- **Invoice Minting Dashboard**: SME uploads invoice → displays OCR structured data → triggers Web3 wallet signature to call `mintReceivable`.
- **Marketplace Explorer**: Displays all `Listed` receivables, credit scores, and factoring discount rates. Lenders connect wallets and call `fundReceivable`.
- **Repayment Simulators**: Dedicated admin/buyer controls to trigger repayment, call `repay()`, and distribute payouts to the financing parties.

---

## ⚙️ Deployment Settings

- **Contracts**: Configured for Polygon Amoy testnet deployment and Etherscan/Polygonscan verification.
- **Backend**: Deployed to cloud containers (Railway/Render) with environment variable keys for Web3 RPC provider and oracle wallet.
- **Addresses**: Address JSON maps written to `/config/addresses.json` dynamically read by both the backend services and React components.

---

## 🚫 Explicit Non-Goals

- No production KYC/KYB integration — stubbed for sandbox environment.
- No real banking network integration — synthetic data only.
- No live mainnet deployments.
- No account abstraction/gasless transactions — standard MetaMask/Web3 wallet connection utilized.
- No custom mobile responsive layouts outside general browser adaptability.

---

## 🏗️ Repository Setup Flow

1. **Scaffold Directory Structure**: Setup `contracts/` (Hardhat), `backend/` (FastAPI), and `frontend/` (Next.js).
2. **Implement and Test Core Contracts**: Deploy `ReceivableNFT`, `CreditRegistry`, `MockUSDC`, `InvoiceMarketplace`, and `RepaymentEscrow` and verify them via Hardhat test suites.
3. **Deploy & Register Addresses**: Deploy the contracts to Polygon Amoy, verify on PolygonScan, and write addresses to `config/addresses.json`.
4. **Setup Scoring Engine**: Build the FastAPI scoring service, train the risk model, and setup the oracle wallet.
5. **Setup OCR Pipeline**: Establish the document extraction service to run OCR and pin invoice JSON metadata to IPFS.
6. **Frontend Integration**: Integrate Next.js frontend pages with the deployed contracts via Wagmi/Viem.
7. **Demo & Reference Run**: Execute test transactions using the demo script and refer to the README for system mapping.

---

## 🔮 Roadmap & Future Architecture

For production readiness, the protocol targets the following architectural enhancements:

1. **Accounting integrations**: Pull authentic banking & invoice ledger data directly via QuickBooks, Xero, or Plaid API connections.
2. **Keeper Automations**: Deploys Chainlink Keepers to monitor `dueDate` timestamps and auto-transition unpaid invoices to `Defaulted`.
3. **Risk Mitigation Pools**: Establish supplier staking/liquidity backing models to shield lenders from sovereign default risk.
4. **Fractionalized Receivables**: Implement ERC-1155 or ERC-4626 invoice funding vaults so multiple lenders can purchase fractions of a single high-value receivable.
