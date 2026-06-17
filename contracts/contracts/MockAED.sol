// SPDX-License-Identifier: MIT
pragma solidity ^0.8.20;

import "@openzeppelin/contracts/token/ERC20/ERC20.sol";

contract MockAED is ERC20 {
    constructor() ERC20("Mock AED", "mAED") {}

    /// @notice Overrides the default decimals to be 6, matching USDC layout.
    function decimals() public view virtual override returns (uint8) {
        return 6;
    }

    /// @notice Public faucet function to mint tokens for demo/testing.
    /// @dev Open/unrestricted for testnet demo convenience.
    function mint(address to, uint256 amount) external {
        _mint(to, amount);
    }
}
