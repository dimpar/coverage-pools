// SPDX-License-Identifier: MIT

pragma solidity <0.9.0;

contract CollateralPool {
    /// @notice Seize funds from the collateral pool and put them aside for the
    ///         recipient to withdraw.
    /// @dev portionToSeize value was multiplied by FLOATING_POINT_DIVISOR for
    ///      calculation precision purposes. Further calculations in this
    ///      function will need to take this divisor into account.
    /// @param portionToSeize Portion of the pool to seize in the range between
    ///        0.x - 1.0, where 'x' cannot be zero.
    /// @param recipient Address that will receive the pool's seized funds.
    function seizeFunds(uint256 portionToSeize, address recipient) external {
        // todo: implement
    }
}
