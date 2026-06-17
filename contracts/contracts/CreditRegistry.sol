// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/access/Ownable.sol";

error ScoreOutOfRange();
error OnlyOracleAllowed();
error OnlyControllerAllowed();

contract CreditRegistry is Ownable {
    event ScoreUpdated(address indexed subject, uint8 score, uint256 timestamp);
    event OracleUpdated(address indexed oldOracle, address indexed newOracle);
    event ControllerSet(address indexed controller, bool allowed);

    struct ScoreData {
        uint8 score;
        uint256 timestamp;
    }

    address public oracle;
    mapping(address => ScoreData) private _scores;
    mapping(address => bool) public controllers;
    mapping(address => uint256) private _defaults;

    modifier onlyOracle() {
        if (msg.sender != oracle) {
            revert OnlyOracleAllowed();
        }
        _;
    }

    modifier onlyController() {
        if (!controllers[msg.sender] && msg.sender != owner()) {
            revert OnlyControllerAllowed();
        }
        _;
    }

    constructor(address initialOracle) Ownable(msg.sender) {
        oracle = initialOracle;
        emit OracleUpdated(address(0), initialOracle);
        controllers[initialOracle] = true;
        emit ControllerSet(initialOracle, true);
    }

    /// @notice Restricted to the oracle address. Score must be 0-100.
    function setScore(address subject, uint8 score) external onlyOracle {
        if (score > 100) {
            revert ScoreOutOfRange();
        }
        _scores[subject] = ScoreData({
            score: score,
            timestamp: block.timestamp
        });
        emit ScoreUpdated(subject, score, block.timestamp);
    }

    /// @notice Applies a credit score penalty of 20 points and registers the default.
    /// @dev Restricted to authorized controllers.
    function penalizeDefault(address subject) external onlyController {
        ScoreData storage data = _scores[subject];
        uint8 currentScore = data.timestamp == 0 ? 70 : data.score;

        if (currentScore > 20) {
            currentScore -= 20;
        } else {
            currentScore = 0;
        }

        data.score = currentScore;
        data.timestamp = block.timestamp;

        _defaults[subject] += 1;

        emit ScoreUpdated(subject, currentScore, block.timestamp);
    }

    /// @notice Returns the latest score and when it was set. Returns (0, 0) if never set.
    function getScore(address subject) external view returns (uint8 score, uint256 timestamp) {
        ScoreData memory data = _scores[subject];
        return (data.score, data.timestamp);
    }

    /// @notice Returns the historical default count for an address.
    function getDefaultCount(address subject) external view returns (uint256) {
        return _defaults[subject];
    }

    /// @notice Owner-only. Rotates the oracle address.
    function setOracle(address newOracle) external onlyOwner {
        address oldOracle = oracle;
        oracle = newOracle;
        emit OracleUpdated(oldOracle, newOracle);
    }

    /// @notice Owner-only. Authorizes or revokes a contract to apply default penalties.
    function setController(address controller, bool allowed) external onlyOwner {
        controllers[controller] = allowed;
        emit ControllerSet(controller, allowed);
    }
}
