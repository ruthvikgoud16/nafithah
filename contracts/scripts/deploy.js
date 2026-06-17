const hre = require("hardhat");
const fs = require("fs");
const path = require("path");

async function main() {
  const [deployer] = await hre.ethers.getSigners();
  console.log("Deploying contracts with the account:", deployer.address);

  // 1. Deploy MockUSDC
  const MockUSDC = await hre.ethers.getContractFactory("MockUSDC");
  const mockUSDC = await MockUSDC.deploy();
  await mockUSDC.waitForDeployment();
  const mockUSDCAddress = await mockUSDC.getAddress();
  console.log("MockUSDC deployed to:", mockUSDCAddress);

  // 2. Deploy MockAED (Dirham Stablecoin)
  const MockAED = await hre.ethers.getContractFactory("MockAED");
  const mockAED = await MockAED.deploy();
  await mockAED.waitForDeployment();
  const mockAEDAddress = await mockAED.getAddress();
  console.log("MockAED deployed to:", mockAEDAddress);

  // 3. Deploy CreditRegistry (Oracle set to deployer address for convenience)
  const CreditRegistry = await hre.ethers.getContractFactory("CreditRegistry");
  const creditRegistry = await CreditRegistry.deploy(deployer.address);
  await creditRegistry.waitForDeployment();
  const creditRegistryAddress = await creditRegistry.getAddress();
  console.log("CreditRegistry deployed to:", creditRegistryAddress);

  // 4. Deploy ReceivableNFT
  const ReceivableNFT = await hre.ethers.getContractFactory("ReceivableNFT");
  const receivableNFT = await ReceivableNFT.deploy();
  await receivableNFT.waitForDeployment();
  const receivableNFTAddress = await receivableNFT.getAddress();
  console.log("ReceivableNFT deployed to:", receivableNFTAddress);

  // 5. Deploy InvoiceMarketplace
  const InvoiceMarketplace = await hre.ethers.getContractFactory("InvoiceMarketplace");
  const marketplace = await InvoiceMarketplace.deploy(
    receivableNFTAddress,
    creditRegistryAddress,
    mockUSDCAddress
  );
  await marketplace.waitForDeployment();
  const marketplaceAddress = await marketplace.getAddress();
  console.log("InvoiceMarketplace deployed to:", marketplaceAddress);

  // 6. Deploy RepaymentEscrow
  const RepaymentEscrow = await hre.ethers.getContractFactory("RepaymentEscrow");
  const escrow = await RepaymentEscrow.deploy(
    receivableNFTAddress,
    marketplaceAddress,
    mockUSDCAddress
  );
  await escrow.waitForDeployment();
  const escrowAddress = await escrow.getAddress();
  console.log("RepaymentEscrow deployed to:", escrowAddress);

  // 7. Deploy LetterOfCredit
  const LetterOfCredit = await hre.ethers.getContractFactory("LetterOfCredit");
  const letterOfCredit = await LetterOfCredit.deploy(
    mockAEDAddress,
    creditRegistryAddress
  );
  await letterOfCredit.waitForDeployment();
  const lcAddress = await letterOfCredit.getAddress();
  console.log("LetterOfCredit deployed to:", lcAddress);

  // 8. Configure permissions
  console.log("Configuring contract roles...");
  
  // Grant CONTROLLER_ROLE in NFT to Marketplace and Escrow
  let tx1 = await receivableNFT.setController(marketplaceAddress, true);
  await tx1.wait();
  
  let tx2 = await receivableNFT.setController(escrowAddress, true);
  await tx2.wait();

  // Set Escrow address in Marketplace
  let tx3 = await marketplace.setEscrow(escrowAddress);
  await tx3.wait();

  // Set controllers in CreditRegistry for default penalties
  let tx4 = await creditRegistry.setController(marketplaceAddress, true);
  await tx4.wait();

  let tx5 = await creditRegistry.setController(lcAddress, true);
  await tx5.wait();
  
  console.log("Contract roles configured successfully.");

  // Save addresses to config folder
  const addresses = {
    MockUSDC: mockUSDCAddress,
    MockAED: mockAEDAddress,
    CreditRegistry: creditRegistryAddress,
    ReceivableNFT: receivableNFTAddress,
    InvoiceMarketplace: marketplaceAddress,
    RepaymentEscrow: escrowAddress,
    LetterOfCredit: lcAddress
  };

  // 1. Save to shared config
  const configDir = path.join(__dirname, "../../config");
  if (!fs.existsSync(configDir)) {
    fs.mkdirSync(configDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(configDir, "addresses.json"),
    JSON.stringify(addresses, null, 2)
  );
  console.log("Addresses saved to /config/addresses.json");

  // 2. Save to frontend config
  const frontendConfigDir = path.join(__dirname, "../../frontend/config");
  if (!fs.existsSync(frontendConfigDir)) {
    fs.mkdirSync(frontendConfigDir, { recursive: true });
  }
  fs.writeFileSync(
    path.join(frontendConfigDir, "addresses.json"),
    JSON.stringify(addresses, null, 2)
  );
  console.log("Addresses saved to /frontend/config/addresses.json");
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error(error);
    process.exit(1);
  });
