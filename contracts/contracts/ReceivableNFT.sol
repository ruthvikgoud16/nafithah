// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC721/ERC721.sol";
import "@openzeppelin/contracts/access/AccessControl.sol";

enum ReceivableStatus { Pending, Funded, Repaid, Defaulted }

struct Receivable {
    address supplier;
    address buyerAddress;
    string buyerName;
    string invoiceNumber;
    bytes32 invoiceHash;
    uint256 amount;          // face value, in mUSDC base units (6 decimals)
    uint256 dueDate;         // unix timestamp
    string invoiceIPFSHash;  // CID of invoice doc + extracted JSON
    ReceivableStatus status;
}

contract ReceivableNFT is ERC721, AccessControl {
    bytes32 public constant CONTROLLER_ROLE = keccak256("CONTROLLER_ROLE");

    event InvoiceMinted(
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

    event InvoiceDefaulted(uint256 indexed tokenId);

    uint256 private _nextTokenId;
    mapping(uint256 => Receivable) private _receivables;

    error NotController();
    error ReceivableDoesNotExist();
    

    

    constructor() ERC721("Receivable NFT", "rINV") {
        _grantRole(DEFAULT_ADMIN_ROLE, msg.sender);
    }

    /// @notice Mints a new receivable NFT to msg.sender (the supplier).
    /// @dev Status initializes to Pending.
    function mintReceivable(
        address buyerAddress,
        string calldata buyerName,
        string calldata invoiceNumber,
        uint256 amount,
        uint256 dueDate,
        string calldata invoiceIPFSHash
    ) external returns (uint256 tokenId) {
        bytes32 invoiceHash = bytes32(0);

        tokenId = _nextTokenId;
        _nextTokenId++;

        _mint(msg.sender, tokenId);

        _receivables[tokenId] = Receivable({
            supplier: msg.sender,
            buyerAddress: buyerAddress,
            buyerName: buyerName,
            invoiceNumber: invoiceNumber,
            invoiceHash: invoiceHash,
            amount: amount,
            dueDate: dueDate,
            invoiceIPFSHash: invoiceIPFSHash,
            status: ReceivableStatus.Pending
        });

        emit InvoiceMinted(tokenId, msg.sender, amount, dueDate);
        return tokenId;
    }

    /// @notice Returns full receivable data for a token.
    function getReceivable(uint256 tokenId) external view returns (Receivable memory) {
        if (_ownerOf(tokenId) == address(0)) {
            revert ReceivableDoesNotExist();
        }
        return _receivables[tokenId];
    }

    /// @notice Restricted to addresses granted CONTROLLER_ROLE (Marketplace, Escrow).
    function updateStatus(uint256 tokenId, ReceivableStatus newStatus) external {
        if (!hasRole(CONTROLLER_ROLE, msg.sender)) {
            revert NotController();
        }
        if (_ownerOf(tokenId) == address(0)) {
            revert ReceivableDoesNotExist();
        }

        ReceivableStatus oldStatus = _receivables[tokenId].status;
        _receivables[tokenId].status = newStatus;

        emit StatusUpdated(tokenId, oldStatus, newStatus);
    }

    /// @notice Restricted to addresses granted CONTROLLER_ROLE. Marks an invoice defaulted.
    function markDefaulted(uint256 tokenId) external {
        if (!hasRole(CONTROLLER_ROLE, msg.sender)) {
            revert NotController();
        }
        if (_ownerOf(tokenId) == address(0)) {
            revert ReceivableDoesNotExist();
        }

        ReceivableStatus oldStatus = _receivables[tokenId].status;
        _receivables[tokenId].status = ReceivableStatus.Defaulted;

        emit StatusUpdated(tokenId, oldStatus, ReceivableStatus.Defaulted);
        emit InvoiceDefaulted(tokenId);
    }

    /// @notice Owner-only (DEFAULT_ADMIN_ROLE). Grants CONTROLLER_ROLE to Marketplace/Escrow after deployment.
    function setController(address controller, bool allowed) external onlyRole(DEFAULT_ADMIN_ROLE) {
        if (allowed) {
            _grantRole(CONTROLLER_ROLE, controller);
        } else {
            _revokeRole(CONTROLLER_ROLE, controller);
        }
    }

    // Overrides required by Solidity
    function supportsInterface(bytes4 interfaceId)
        public
        view
        override(ERC721, AccessControl)
        returns (bool)
    {
        return super.supportsInterface(interfaceId);
    }
}
