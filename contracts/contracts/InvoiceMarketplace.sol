// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ReceivableNFT.sol";
import "./CreditRegistry.sol";

struct Funding {
    address lender;
    uint256 fundedAmount;     // net amount lender actually paid out (post-discount)
    uint256 discountBps;      // discount rate applied, in basis points, snapshotted at fund time
    uint256 fundedAt;
}

contract InvoiceMarketplace {
    event ReceivableFunded(
        uint256 indexed tokenId,
        address indexed lender,
        uint256 fundedAmount,
        uint256 discountBps
    );

    uint256 public constant BASE_DISCOUNT_BPS = 1500; // 15%
    uint256 public constant BPS_PER_POINT = 10;
    uint256 public constant MIN_DISCOUNT_BPS = 500;  // 5%

    ReceivableNFT public immutable receivableNFT;
    CreditRegistry public immutable creditRegistry;
    IERC20 public immutable mUSDC;
    address public escrow;

    mapping(uint256 => Funding) private _fundings;

    error NotPending();
    error TransferFailed();
    error OnlyEscrowAllowed();
    error OnlyAdminAllowed();
    error DueDateNotPassed();
    error InvalidStatus();
    

    constructor(
        address _receivableNFT,
        address _creditRegistry,
        address _mUSDC
    ) {
        receivableNFT = ReceivableNFT(_receivableNFT);
        creditRegistry = CreditRegistry(_creditRegistry);
        mUSDC = IERC20(_mUSDC);
    }

    /// @notice Lender funds a Pending receivable. Caller must have approved
    /// this contract to pull `amount` mUSDC beforehand (ERC-20 approve).
    /// Reverts if receivable is not Pending.
    function fundReceivable(uint256 tokenId) external {
        Receivable memory receivable = receivableNFT.getReceivable(tokenId);
        if (receivable.status != ReceivableStatus.Pending) {
            revert NotPending();
        }

        uint256 discountBps = calculateDiscountRate(receivable.supplier);
        uint256 discountAmount = (receivable.amount * discountBps) / 10_000;
        uint256 fundedAmount = receivable.amount - discountAmount;

        // Pull full amount from lender
        if (!mUSDC.transferFrom(msg.sender, address(this), receivable.amount)) {
            revert TransferFailed();
        }

        // Pay funded amount (discounted amount) to supplier
        if (!mUSDC.transfer(receivable.supplier, fundedAmount)) {
            revert TransferFailed();
        }

        // Record funding
        _fundings[tokenId] = Funding({
            lender: msg.sender,
            fundedAmount: fundedAmount,
            discountBps: discountBps,
            fundedAt: block.timestamp
        });

        // Set status in NFT to Funded
        receivableNFT.updateStatus(tokenId, ReceivableStatus.Funded);

        emit ReceivableFunded(tokenId, msg.sender, fundedAmount, discountBps);
    }

    /// @notice Trigger default processing if the due date passes.
    /// @dev Can be called by anyone once block.timestamp > dueDate + 1 days.
    function markDefault(uint256 tokenId) external {
        Receivable memory receivable = receivableNFT.getReceivable(tokenId);
        if (receivable.status != ReceivableStatus.Funded) {
            revert InvalidStatus();
        }
        if (block.timestamp <= receivable.dueDate) {
            revert DueDateNotPassed();
        }
        

        // Set status in NFT to Defaulted
        receivableNFT.markDefaulted(tokenId);

        // Apply on-chain penalty of 20 points to buyer's credit score
        creditRegistry.penalizeDefault(receivable.supplier);
    }

    /// @notice Discount rate in basis points (bps) for a supplier, derived
    /// from their CreditRegistry score. Pure function of score:
    ///   discountBps = max(MIN_DISCOUNT_BPS, BASE_DISCOUNT_BPS - score * BPS_PER_POINT)
    function calculateDiscountRate(address supplier) public view returns (uint256 discountBps) {
        (uint8 score, uint256 timestamp) = creditRegistry.getScore(supplier);
        if (timestamp == 0) {
            return BASE_DISCOUNT_BPS;
        }

        uint256 reduction = uint256(score) * BPS_PER_POINT;
        if (reduction >= BASE_DISCOUNT_BPS) {
            return MIN_DISCOUNT_BPS;
        }

        uint256 calculated = BASE_DISCOUNT_BPS - reduction;
        if (calculated < MIN_DISCOUNT_BPS) {
            return MIN_DISCOUNT_BPS;
        }
        return calculated;
    }

    /// @notice Restricts configuration of escrow to admin
    function setEscrow(address _escrow) external {
        if (!receivableNFT.hasRole(receivableNFT.DEFAULT_ADMIN_ROLE(), msg.sender)) {
            revert OnlyAdminAllowed();
        }
        escrow = _escrow;
    }

    /// @notice Releases the held discount spread to the lender upon successful repayment
    function releaseSpread(uint256 tokenId) external {
        if (msg.sender != escrow) {
            revert OnlyEscrowAllowed();
        }
        Receivable memory receivable = receivableNFT.getReceivable(tokenId);
        Funding memory funding = _fundings[tokenId];
        uint256 spread = (receivable.amount * funding.discountBps) / 10_000;
        if (spread > 0) {
            if (!mUSDC.transfer(funding.lender, spread)) {
                revert TransferFailed();
            }
        }
    }

    /// @notice Returns the Funding record for a tokenId (lender, amounts, timestamp).
    function getFunding(uint256 tokenId) external view returns (Funding memory) {
        return _fundings[tokenId];
    }
}
