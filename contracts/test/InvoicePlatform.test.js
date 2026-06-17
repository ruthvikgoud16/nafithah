const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("Tokenized Invoice Financing Platform", function () {
  let mockUSDC;
  let creditRegistry;
  let receivableNFT;
  let marketplace;
  let escrow;

  let owner;
  let oracle;
  let supplier;
  let lender;
  let buyer;

  beforeEach(async function () {
    [owner, oracle, supplier, lender, buyer] = await ethers.getSigners();

    // 1. Deploy MockUSDC
    const MockUSDC = await ethers.getContractFactory("MockUSDC");
    mockUSDC = await MockUSDC.deploy();
    await mockUSDC.waitForDeployment();

    // 2. Deploy CreditRegistry
    const CreditRegistry = await ethers.getContractFactory("CreditRegistry");
    creditRegistry = await CreditRegistry.deploy(oracle.address);
    await creditRegistry.waitForDeployment();

    // 3. Deploy ReceivableNFT
    const ReceivableNFT = await ethers.getContractFactory("ReceivableNFT");
    receivableNFT = await ReceivableNFT.deploy();
    await receivableNFT.waitForDeployment();

    // 4. Deploy InvoiceMarketplace
    const InvoiceMarketplace = await ethers.getContractFactory("InvoiceMarketplace");
    marketplace = await InvoiceMarketplace.deploy(
      await receivableNFT.getAddress(),
      await creditRegistry.getAddress(),
      await mockUSDC.getAddress()
    );
    await marketplace.waitForDeployment();

    // 5. Deploy RepaymentEscrow
    const RepaymentEscrow = await ethers.getContractFactory("RepaymentEscrow");
    escrow = await RepaymentEscrow.deploy(
      await receivableNFT.getAddress(),
      await marketplace.getAddress(),
      await mockUSDC.getAddress()
    );
    await escrow.waitForDeployment();

    // 6. Setup CONTROLLER_ROLE for Marketplace and Escrow in ReceivableNFT
    await receivableNFT.setController(await marketplace.getAddress(), true);
    await receivableNFT.setController(await escrow.getAddress(), true);

    // 7. Setup Escrow address in Marketplace
    await marketplace.setEscrow(await escrow.getAddress());

    // 8. Setup controllers in CreditRegistry
    await creditRegistry.setController(await marketplace.getAddress(), true);

    // 9. Distribute mock USDC to Lender and Buyer (Faucet)
    const mintAmount = ethers.parseUnits("10000", 6); // 10,000 USDC
    await mockUSDC.mint(lender.address, mintAmount);
    await mockUSDC.mint(buyer.address, mintAmount);
  });

  describe("ReceivableNFT", function () {
    it("Should mint a receivable NFT with correct fields and Listed status", async function () {
      const buyerName = "Acme Corp";
      const amount = ethers.parseUnits("1000", 6); // 1,000 USDC
      const dueDate = Math.floor(Date.now() / 1000) + 86400 * 30; // 30 days
      const ipfsHash = "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco";

      await expect(
        receivableNFT.connect(supplier).mintReceivable(buyer.address, buyerName, "INV-001", amount, dueDate, ipfsHash)
      )
        .to.emit(receivableNFT, "InvoiceMinted")
        .withArgs(0, supplier.address, amount, dueDate);

      const receivable = await receivableNFT.getReceivable(0);
      expect(receivable.supplier).to.equal(supplier.address);
      expect(receivable.buyerAddress).to.equal(buyer.address);
      expect(receivable.buyerName).to.equal(buyerName);
      expect(receivable.invoiceNumber).to.equal("INV-001");
      expect(receivable.amount).to.equal(amount);
      expect(receivable.dueDate).to.equal(dueDate);
      expect(receivable.invoiceIPFSHash).to.equal(ipfsHash);
      expect(receivable.status).to.equal(0); // Listed/Pending
    });

    it("Should reject minting with duplicate invoice parameters (same supplier, buyer, number, amount, due date)", async function () {
      const buyerName = "Acme Corp";
      const amount = ethers.parseUnits("1000", 6);
      const dueDate = Math.floor(Date.now() / 1000) + 86400 * 30;
      const ipfsHash = "QmXoypizjW3WknFiJnKLwHCnL72vedxjQkDDP1mXWo6uco";

      await receivableNFT.connect(supplier).mintReceivable(
        buyer.address,
        buyerName,
        "INV-DUP-100",
        amount,
        dueDate,
        ipfsHash
      );

      // Try minting again with exact same fields (duplicate)
      await expect(
        receivableNFT.connect(supplier).mintReceivable(
          buyer.address,
          buyerName,
          "INV-DUP-100",
          amount,
          dueDate,
          ipfsHash
        )
      ).to.be.revertedWithCustomError(receivableNFT, "DuplicateInvoice");
    });

    it("Should reject updateStatus from non-controllers", async function () {
      await receivableNFT.connect(supplier).mintReceivable(
        buyer.address,
        "Acme Corp",
        "INV-002",
        ethers.parseUnits("1000", 6),
        Math.floor(Date.now() / 1000) + 86400,
        "QmHash"
      );

      await expect(
        receivableNFT.connect(supplier).updateStatus(0, 1) // status: Funded
      ).to.be.revertedWithCustomError(receivableNFT, "NotController");
    });
  });

  describe("CreditRegistry", function () {
    it("Should allow the oracle to set a score 0-100", async function () {
      await expect(creditRegistry.connect(oracle).setScore(supplier.address, 85))
        .to.emit(creditRegistry, "ScoreUpdated")
        .withArgs(supplier.address, 85, anyUint);

      const [score, timestamp] = await creditRegistry.getScore(supplier.address);
      expect(score).to.equal(85);
      expect(timestamp).to.be.gt(0);
    });

    it("Should reject setScore from non-oracle", async function () {
      await expect(
        creditRegistry.connect(supplier).setScore(supplier.address, 85)
      ).to.be.revertedWithCustomError(creditRegistry, "OnlyOracleAllowed");
    });

    it("Should reject score > 100", async function () {
      await expect(
        creditRegistry.connect(oracle).setScore(supplier.address, 101)
      ).to.be.revertedWithCustomError(creditRegistry, "ScoreOutOfRange");
    });
  });

  describe("InvoiceMarketplace", function () {
    beforeEach(async function () {
      // Set a score of 80 for the supplier
      await creditRegistry.connect(oracle).setScore(supplier.address, 80);

      // Supplier mints invoice of 1000 USDC
      await receivableNFT.connect(supplier).mintReceivable(
        buyer.address,
        "Acme Corp",
        "INV-003",
        ethers.parseUnits("1000", 6),
        Math.floor(Date.now() / 1000) + 86400,
        "QmHash"
      );
    });

    it("Should calculate the discount rate correctly based on credit score", async function () {
      const rate = await marketplace.calculateDiscountRate(supplier.address);
      expect(rate).to.equal(700); // 15% base - 80 * 10 = 7% (700 bps)

      // Score 100. Min discount = 5% (500 bps)
      await creditRegistry.connect(oracle).setScore(supplier.address, 100);
      const minRate = await marketplace.calculateDiscountRate(supplier.address);
      expect(minRate).to.equal(500);

      // Score 0. Max discount = 15% (1500 bps)
      await creditRegistry.connect(oracle).setScore(supplier.address, 0);
      const maxRate = await marketplace.calculateDiscountRate(supplier.address);
      expect(maxRate).to.equal(1500);
    });

    it("Should fund a receivable, transfer mUSDC, and record funding details", async function () {
      const tokenId = 0;
      const faceValue = ethers.parseUnits("1000", 6);
      const discountBps = 700; // 7%
      const discountAmount = (faceValue * BigInt(discountBps)) / 10000n; // 70 USDC
      const fundedAmount = faceValue - discountAmount; // 930 USDC

      await mockUSDC.connect(lender).approve(await marketplace.getAddress(), faceValue);

      const supplierBalanceBefore = await mockUSDC.balanceOf(supplier.address);
      const lenderBalanceBefore = await mockUSDC.balanceOf(lender.address);
      const marketBalanceBefore = await mockUSDC.balanceOf(await marketplace.getAddress());

      await expect(marketplace.connect(lender).fundReceivable(tokenId))
        .to.emit(marketplace, "ReceivableFunded")
        .withArgs(tokenId, lender.address, fundedAmount, discountBps);

      const supplierBalanceAfter = await mockUSDC.balanceOf(supplier.address);
      const lenderBalanceAfter = await mockUSDC.balanceOf(lender.address);
      const marketBalanceAfter = await mockUSDC.balanceOf(await marketplace.getAddress());

      expect(lenderBalanceBefore - lenderBalanceAfter).to.equal(faceValue);
      expect(supplierBalanceAfter - supplierBalanceBefore).to.equal(fundedAmount);
      expect(marketBalanceAfter - marketBalanceBefore).to.equal(discountAmount);

      const rec = await receivableNFT.getReceivable(tokenId);
      expect(rec.status).to.equal(1); // Funded

      const funding = await marketplace.getFunding(tokenId);
      expect(funding.lender).to.equal(lender.address);
      expect(funding.fundedAmount).to.equal(fundedAmount);
      expect(funding.discountBps).to.equal(discountBps);
    });
  });

  describe("RepaymentEscrow", function () {
    const tokenId = 0;
    const faceValue = ethers.parseUnits("1000", 6);
    let discountBps;
    let fundedAmount;
    let discountAmount;

    beforeEach(async function () {
      await creditRegistry.connect(oracle).setScore(supplier.address, 80);
      await receivableNFT.connect(supplier).mintReceivable(
        buyer.address,
        "Acme Corp",
        "INV-004",
        faceValue,
        Math.floor(Date.now() / 1000) + 86400,
        "QmHash"
      );

      discountBps = await marketplace.calculateDiscountRate(supplier.address);
      discountAmount = (faceValue * BigInt(discountBps)) / 10000n;
      fundedAmount = faceValue - discountAmount;

      await mockUSDC.connect(lender).approve(await marketplace.getAddress(), faceValue);
      await marketplace.connect(lender).fundReceivable(tokenId);
    });

    it("Should execute repayment, distribute payout to lender, and release spread from marketplace", async function () {
      await mockUSDC.connect(buyer).approve(await escrow.getAddress(), faceValue);

      const lenderBalanceBefore = await mockUSDC.balanceOf(lender.address);
      const buyerBalanceBefore = await mockUSDC.balanceOf(buyer.address);
      const marketBalanceBefore = await mockUSDC.balanceOf(await marketplace.getAddress());

      await expect(escrow.connect(buyer).repay(tokenId))
        .to.emit(escrow, "RepaymentReceived")
        .withArgs(tokenId, buyer.address, faceValue)
        .and.to.emit(escrow, "PayoutSplit")
        .withArgs(tokenId, lender.address, faceValue);

      const lenderBalanceAfter = await mockUSDC.balanceOf(lender.address);
      const buyerBalanceAfter = await mockUSDC.balanceOf(buyer.address);
      const marketBalanceAfter = await mockUSDC.balanceOf(await marketplace.getAddress());

      expect(buyerBalanceBefore - buyerBalanceAfter).to.equal(faceValue);
      expect(marketBalanceBefore - marketBalanceAfter).to.equal(discountAmount);
      expect(marketBalanceAfter).to.equal(0);
      expect(lenderBalanceAfter - lenderBalanceBefore).to.equal(faceValue + discountAmount);

      const rec = await receivableNFT.getReceivable(tokenId);
      expect(rec.status).to.equal(2); // Repaid
    });

    it("Should reject repayment if status is not Funded", async function () {
      await receivableNFT.connect(supplier).mintReceivable(
        buyer.address,
        "Acme Corp 2",
        "INV-005",
        faceValue,
        Math.floor(Date.now() / 1000) + 86400,
        "QmHash"
      );

      await mockUSDC.connect(buyer).approve(await escrow.getAddress(), faceValue);

      await expect(
        escrow.connect(buyer).repay(1)
      ).to.be.revertedWithCustomError(escrow, "NotFunded");
    });
  });

  describe("Hardening Validations", function () {
    it("Should reject default triggers before the 1-day grace period passes", async function () {
      const faceValue = ethers.parseUnits("1000", 6);
      const block = await ethers.provider.getBlock("latest");
      const shortDueDate = block.timestamp + 10;
      
      await receivableNFT.connect(supplier).mintReceivable(
        buyer.address,
        "Acme Corp",
        "INV-GRACE-01",
        faceValue,
        shortDueDate,
        "QmHash"
      );

      await mockUSDC.connect(lender).approve(await marketplace.getAddress(), faceValue);
      await marketplace.connect(lender).fundReceivable(0); // token ID is 0

      // Advance time past due date but before grace period
      await ethers.provider.send("evm_increaseTime", [15]);
      await ethers.provider.send("evm_mine");

      await expect(
        marketplace.markDefault(0)
      ).to.be.revertedWithCustomError(marketplace, "GracePeriodActive");
    });

    it("Should penalize buyer instead of supplier and execute default after grace period passes", async function () {
      const faceValue = ethers.parseUnits("1000", 6);
      const block = await ethers.provider.getBlock("latest");
      const shortDueDate = block.timestamp + 10;
      
      await receivableNFT.connect(supplier).mintReceivable(
        buyer.address,
        "Acme Corp",
        "INV-GRACE-02",
        faceValue,
        shortDueDate,
        "QmHash"
      );

      await mockUSDC.connect(lender).approve(await marketplace.getAddress(), faceValue);
      await marketplace.connect(lender).fundReceivable(0); // token ID is 0

      // Setup buyer score
      await creditRegistry.connect(oracle).setScore(buyer.address, 80);
      // Setup supplier score
      await creditRegistry.connect(oracle).setScore(supplier.address, 80);

      // Advance time past due date + 1 day grace period
      await ethers.provider.send("evm_increaseTime", [86400 + 15]);
      await ethers.provider.send("evm_mine");

      await expect(marketplace.markDefault(0))
        .to.emit(receivableNFT, "StatusUpdated")
        .withArgs(0, 1, 3); // status Funded (1) -> Defaulted (3)

      // Buyer score penalized (-20 points from 80 -> 60)
      const [buyerScore] = await creditRegistry.getScore(buyer.address);
      expect(buyerScore).to.equal(60);

      // Supplier score remained untouched (should still be 80)
      const [supplierScore] = await creditRegistry.getScore(supplier.address);
      expect(supplierScore).to.equal(80);
    });
  });
});

const anyUint = () => true;
