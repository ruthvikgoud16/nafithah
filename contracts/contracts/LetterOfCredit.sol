// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";
import "./CreditRegistry.sol";

contract LetterOfCredit {
    enum LCStatus { Created, Funded, Accepted, Shipped, Released, Defaulted }

    struct LC {
        uint256 id;
        address importer;
        address exporter;
        uint256 amount;          // In AED stablecoin (mAED)
        uint256 dueDate;         // Unix timestamp (deadline for shipment/repayment)
        string documentHash;     // IPFS hash of contract documents
        string shipmentProof;    // IPFS hash of Bill of Lading
        LCStatus status;
    }

    IERC20 public immutable mAED;
    CreditRegistry public immutable creditRegistry;

    uint256 private _nextLcId;
    mapping(uint256 => LC) private _lcs;

    event LetterOfCreditCreated(uint256 indexed lcId, address indexed importer, address indexed exporter, uint256 amount);
    event LCFunded(uint256 indexed lcId, uint256 amount);
    event LCAccepted(uint256 indexed lcId);
    event ShipmentProofSubmitted(uint256 indexed lcId, string shipmentProof);
    event FundsReleased(uint256 indexed lcId, address indexed exporter, uint256 amount);
    event LCDefaulted(uint256 indexed lcId, address indexed defaulter);

    error LCDoesNotExist();
    error InvalidStatus();
    error NotImporter();
    error NotExporter();
    error DueDateNotPassed();
    error DueDateAlreadyPassed();
    error TransferFailed();
    
    

    constructor(address _mAED, address _creditRegistry) {
        mAED = IERC20(_mAED);
        creditRegistry = CreditRegistry(_creditRegistry);
    }

    /// @notice Importer creates a new Letter of Credit.
    function createLC(
        address exporter,
        uint256 amount,
        uint256 dueDate,
        string calldata documentHash
    ) external returns (uint256 lcId) {
        if (dueDate <= block.timestamp) {
            revert DueDateAlreadyPassed();
        }

        lcId = _nextLcId;
        _nextLcId++;

        _lcs[lcId] = LC({
            id: lcId,
            importer: msg.sender,
            exporter: exporter,
            amount: amount,
            dueDate: dueDate,
            documentHash: documentHash,
            shipmentProof: "",
            status: LCStatus.Created
        });

        emit LetterOfCreditCreated(lcId, msg.sender, exporter, amount);
        return lcId;
    }

    /// @notice Importer locks stablecoins into the LC.
    function fundLC(uint256 lcId) external {
        LC storage lc = _lcs[lcId];
        if (lc.importer == address(0)) revert LCDoesNotExist();
        if (lc.status != LCStatus.Created) revert InvalidStatus();
        if (msg.sender != lc.importer) revert NotImporter();
        if (block.timestamp > lc.dueDate) revert DueDateAlreadyPassed();

        lc.status = LCStatus.Funded;

        if (!mAED.transferFrom(msg.sender, address(this), lc.amount)) {
            revert TransferFailed();
        }

        emit LCFunded(lcId, lc.amount);
    }

    /// @notice Exporter accepts the LC terms.
    function acceptLC(uint256 lcId) external {
        LC storage lc = _lcs[lcId];
        if (lc.importer == address(0)) revert LCDoesNotExist();
        if (lc.status != LCStatus.Funded) revert InvalidStatus();
        if (msg.sender != lc.exporter) revert NotExporter();
        if (block.timestamp > lc.dueDate) revert DueDateAlreadyPassed();

        lc.status = LCStatus.Accepted;
        emit LCAccepted(lcId);
    }

    /// @notice Exporter submits Bill of Lading shipment proof to trigger the shipped status.
    function submitShipmentProof(uint256 lcId, string calldata shipmentProof) external {
        LC storage lc = _lcs[lcId];
        if (lc.importer == address(0)) revert LCDoesNotExist();
        if (lc.status != LCStatus.Accepted) revert InvalidStatus();
        if (msg.sender != lc.exporter) revert NotExporter();
        if (block.timestamp > lc.dueDate) revert DueDateAlreadyPassed();
        

        lc.status = LCStatus.Shipped;
        lc.shipmentProof = shipmentProof;

        emit ShipmentProofSubmitted(lcId, shipmentProof);
    }

    /// @notice Releases locked funds to the Exporter. Can be called by importer to confirm.
    function releaseFunds(uint256 lcId) external {
        LC storage lc = _lcs[lcId];
        if (lc.importer == address(0)) revert LCDoesNotExist();
        if (lc.status != LCStatus.Shipped) revert InvalidStatus();
        if (msg.sender != lc.importer) revert NotImporter();

        lc.status = LCStatus.Released;

        if (!mAED.transfer(lc.exporter, lc.amount)) {
            revert TransferFailed();
        }

        emit FundsReleased(lcId, lc.exporter, lc.amount);
    }

    /// @notice Trigger default processing if the due date passes.
    /// @dev Can be called by anyone once block.timestamp > dueDate + 1 days.
    function markDefault(uint256 lcId) external {
        LC storage lc = _lcs[lcId];
        if (lc.importer == address(0)) revert LCDoesNotExist();
        if (lc.status == LCStatus.Released || lc.status == LCStatus.Defaulted) revert InvalidStatus();
        if (block.timestamp <= lc.dueDate) revert DueDateNotPassed();
         else if (originalStatus == LCStatus.Funded || originalStatus == LCStatus.Accepted) {
            // Exporter failed to ship goods on time. Importer is refunded.
            creditRegistry.penalizeDefault(lc.exporter);
            emit LCDefaulted(lcId, lc.exporter);

            if (!mAED.transfer(lc.importer, lc.amount)) {
                revert TransferFailed();
            }
        } else if (originalStatus == LCStatus.Shipped) {
            // Exporter shipped, but Importer defaulted on releasing/settling.
            // Exporter receives their funds, and Importer is penalized on-chain.
            creditRegistry.penalizeDefault(lc.importer);
            emit LCDefaulted(lcId, lc.importer);

            if (!mAED.transfer(lc.exporter, lc.amount)) {
                revert TransferFailed();
            }
        }
    }

    /// @notice Returns the full LC details.
    function getLC(uint256 lcId) external view returns (LC memory) {
        if (_lcs[lcId].importer == address(0)) revert LCDoesNotExist();
        return _lcs[lcId];
    }
}
