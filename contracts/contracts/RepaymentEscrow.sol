// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./ReceivableNFT.sol";
import "./InvoiceMarketplace.sol";

contract RepaymentEscrow {
    event RepaymentReceived(uint256 indexed tokenId, address indexed payer, uint256 amount);
    event PayoutSplit(uint256 indexed tokenId, address indexed lender, uint256 lenderPayout);

    ReceivableNFT public immutable receivableNFT;
    InvoiceMarketplace public immutable marketplace;
    IERC20 public immutable mUSDC;

    error NotFunded();
    error TransferFailed();

    constructor(
        address _receivableNFT,
        address _marketplace,
        address _mUSDC
    ) {
        receivableNFT = ReceivableNFT(_receivableNFT);
        marketplace = InvoiceMarketplace(_marketplace);
        mUSDC = IERC20(_mUSDC);
    }

    /// @notice Caller (buyer or demo admin) repays the full invoice face value
    /// in mUSDC. Caller must have approved this contract for `amount` beforehand.
    /// Reverts if receivable is not Funded.
    function repay(uint256 tokenId) external {
        Receivable memory receivable = receivableNFT.getReceivable(tokenId);
        if (receivable.status != ReceivableStatus.Funded) {
            revert NotFunded();
        }

        Funding memory funding = marketplace.getFunding(tokenId);
        uint256 lenderPayout = previewPayout(tokenId);

        // Pull full invoice amount from caller (buyer/admin)
        if (!mUSDC.transferFrom(msg.sender, address(this), receivable.amount)) {
            revert TransferFailed();
        }

        // Pay lender their payout (funded amount + discount spread)
        if (!mUSDC.transfer(funding.lender, lenderPayout)) {
            revert TransferFailed();
        }

        // Release the held spread (yield) from the marketplace contract to the lender
        marketplace.releaseSpread(tokenId);

        // Set status in NFT to Repaid
        receivableNFT.updateStatus(tokenId, ReceivableStatus.Repaid);

        emit RepaymentReceived(tokenId, msg.sender, receivable.amount);
        emit PayoutSplit(tokenId, funding.lender, lenderPayout);
    }

    /// @notice View helper so the frontend can display the expected payout
    /// before the buyer/admin calls repay().
    function previewPayout(uint256 tokenId) public view returns (uint256 lenderPayout) {
        Receivable memory receivable = receivableNFT.getReceivable(tokenId);
        Funding memory funding = marketplace.getFunding(tokenId);
        
        uint256 spread = (receivable.amount * funding.discountBps) / 10_000;
        lenderPayout = funding.fundedAmount + spread;
        return lenderPayout;
    }
}
