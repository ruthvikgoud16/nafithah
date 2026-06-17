const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("LetterOfCredit Contract", function () {
  let mockAED;
  let creditRegistry;
  let lcContract;

  let owner;
  let oracle;
  let importer;
  let exporter;
  let other;

  const amount = ethers.parseUnits("100000", 6); // 100,000 mAED
  let dueDate;

  beforeEach(async function () {
    [owner, oracle, importer, exporter, other] = await ethers.getSigners();

    // 1. Deploy MockAED
    const MockAED = await ethers.getContractFactory("MockAED");
    mockAED = await MockAED.deploy();
    await mockAED.waitForDeployment();

    // 2. Deploy CreditRegistry
    const CreditRegistry = await ethers.getContractFactory("CreditRegistry");
    creditRegistry = await CreditRegistry.deploy(oracle.address);
    await creditRegistry.waitForDeployment();

    // 3. Deploy LetterOfCredit
    const LetterOfCredit = await ethers.getContractFactory("LetterOfCredit");
    lcContract = await LetterOfCredit.deploy(
      await mockAED.getAddress(),
      await creditRegistry.getAddress()
    );
    await lcContract.waitForDeployment();

    // 4. Setup Controller in CreditRegistry for LC
    await creditRegistry.setController(await lcContract.getAddress(), true);

    // 5. Mint mAED to Importer and approve spending
    await mockAED.mint(importer.address, amount);
    await mockAED.connect(importer).approve(await lcContract.getAddress(), amount);

    const block = await ethers.provider.getBlock("latest");
    dueDate = block.timestamp + 86400; // Tomorrow
  });

  describe("LC Lifecycle", function () {
    it("Should create a Letter of Credit successfully", async function () {
      const docHash = "QmTradeAgreementHash";
      
      await expect(
        lcContract.connect(importer).createLC(exporter.address, amount, dueDate, docHash)
      )
        .to.emit(lcContract, "LetterOfCreditCreated")
        .withArgs(0, importer.address, exporter.address, amount);

      const lc = await lcContract.getLC(0);
      expect(lc.importer).to.equal(importer.address);
      expect(lc.exporter).to.equal(exporter.address);
      expect(lc.amount).to.equal(amount);
      expect(lc.dueDate).to.equal(dueDate);
      expect(lc.documentHash).to.equal(docHash);
      expect(lc.status).to.equal(0); // Created
    });

    it("Should fund and accept the Letter of Credit", async function () {
      await lcContract.connect(importer).createLC(exporter.address, amount, dueDate, "QmHash");

      // Fund LC
      await expect(lcContract.connect(importer).fundLC(0))
        .to.emit(lcContract, "LCFunded")
        .withArgs(0, amount);

      expect(await mockAED.balanceOf(await lcContract.getAddress())).to.equal(amount);

      // Exporter accepts LC
      await expect(lcContract.connect(exporter).acceptLC(0))
        .to.emit(lcContract, "LCAccepted")
        .withArgs(0);

      const lc = await lcContract.getLC(0);
      expect(lc.status).to.equal(2); // Accepted
    });

    it("Should submit shipment proof and release funds", async function () {
      await lcContract.connect(importer).createLC(exporter.address, amount, dueDate, "QmHash");
      await lcContract.connect(importer).fundLC(0);
      await lcContract.connect(exporter).acceptLC(0);

      const shipmentProof = "QmBillOfLadingHash";
      await expect(lcContract.connect(exporter).submitShipmentProof(0, shipmentProof))
        .to.emit(lcContract, "ShipmentProofSubmitted")
        .withArgs(0, shipmentProof);

      let lc = await lcContract.getLC(0);
      expect(lc.status).to.equal(3); // Shipped
      expect(lc.shipmentProof).to.equal(shipmentProof);

      // Release funds
      await expect(lcContract.connect(importer).releaseFunds(0))
        .to.emit(lcContract, "FundsReleased")
        .withArgs(0, exporter.address, amount);

      expect(await mockAED.balanceOf(exporter.address)).to.equal(amount);
      expect(await mockAED.balanceOf(await lcContract.getAddress())).to.equal(0);

      lc = await lcContract.getLC(0);
      expect(lc.status).to.equal(4); // Released
    });

    it("Should reject empty shipment proof string", async function () {
      await lcContract.connect(importer).createLC(exporter.address, amount, dueDate, "QmHash");
      await lcContract.connect(importer).fundLC(0);
      await lcContract.connect(exporter).acceptLC(0);

      await expect(
        lcContract.connect(exporter).submitShipmentProof(0, "")
      ).to.be.revertedWithCustomError(lcContract, "InvalidShipmentProof");
    });
  });

  describe("Default Processing & Grace Period", function () {
    it("Should reject default triggers before the 1-day grace period passes", async function () {
      const block = await ethers.provider.getBlock("latest");
      const shortDueDate = block.timestamp + 10;
      await lcContract.connect(importer).createLC(exporter.address, amount, shortDueDate, "QmHash");

      // Wait past due date but before grace period
      await ethers.provider.send("evm_increaseTime", [15]);
      await ethers.provider.send("evm_mine");

      await expect(
        lcContract.markDefault(0)
      ).to.be.revertedWithCustomError(lcContract, "GracePeriodActive");
    });

    it("Should penalize importer if they fail to fund after grace period passes", async function () {
      const block = await ethers.provider.getBlock("latest");
      const shortDueDate = block.timestamp + 10;
      await lcContract.connect(importer).createLC(exporter.address, amount, shortDueDate, "QmHash");

      // Wait past due date + 1 day grace period
      await ethers.provider.send("evm_increaseTime", [86400 + 15]);
      await ethers.provider.send("evm_mine");

      await expect(lcContract.markDefault(0))
        .to.emit(lcContract, "LCDefaulted")
        .withArgs(0, importer.address);

      const [score] = await creditRegistry.getScore(importer.address);
      expect(score).to.equal(50); // penalized from base 70 to 50
    });

    it("Should refund importer and penalize exporter if exporter fails to ship on time after grace period", async function () {
      const block = await ethers.provider.getBlock("latest");
      const shortDueDate = block.timestamp + 10;
      await lcContract.connect(importer).createLC(exporter.address, amount, shortDueDate, "QmHash");
      await lcContract.connect(importer).fundLC(0);
      await lcContract.connect(exporter).acceptLC(0);

      // Wait past due date + 1 day grace period
      await ethers.provider.send("evm_increaseTime", [86400 + 15]);
      await ethers.provider.send("evm_mine");

      const balanceBefore = await mockAED.balanceOf(importer.address);

      await expect(lcContract.markDefault(0))
        .to.emit(lcContract, "LCDefaulted")
        .withArgs(0, exporter.address);

      // Exporter penalized
      const [score] = await creditRegistry.getScore(exporter.address);
      expect(score).to.equal(50);

      // Importer refunded
      const balanceAfter = await mockAED.balanceOf(importer.address);
      expect(balanceAfter - balanceBefore).to.equal(amount);
    });

    it("Should release funds to exporter and penalize importer if importer fails to release funds after shipment post grace period", async function () {
      const block = await ethers.provider.getBlock("latest");
      const shortDueDate = block.timestamp + 10;
      await lcContract.connect(importer).createLC(exporter.address, amount, shortDueDate, "QmHash");
      await lcContract.connect(importer).fundLC(0);
      await lcContract.connect(exporter).acceptLC(0);
      await lcContract.connect(exporter).submitShipmentProof(0, "QmProof");

      // Wait past due date + 1 day grace period
      await ethers.provider.send("evm_increaseTime", [86400 + 15]);
      await ethers.provider.send("evm_mine");

      const balanceBefore = await mockAED.balanceOf(exporter.address);

      await expect(lcContract.markDefault(0))
        .to.emit(lcContract, "LCDefaulted")
        .withArgs(0, importer.address);

      // Importer penalized
      const [score] = await creditRegistry.getScore(importer.address);
      expect(score).to.equal(50);

      // Exporter paid
      const balanceAfter = await mockAED.balanceOf(exporter.address);
      expect(balanceAfter - balanceBefore).to.equal(amount);
    });
  });
});
