// ▓▓▌ ▓▓ ▐▓▓ ▓▓▓▓▓▓▓▓▓▓▌▐▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▄
// ▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▌▐▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
//   ▓▓▓▓▓▓    ▓▓▓▓▓▓▓▀    ▐▓▓▓▓▓▓    ▐▓▓▓▓▓   ▓▓▓▓▓▓     ▓▓▓▓▓   ▐▓▓▓▓▓▌   ▐▓▓▓▓▓▓
//   ▓▓▓▓▓▓▄▄▓▓▓▓▓▓▓▀      ▐▓▓▓▓▓▓▄▄▄▄         ▓▓▓▓▓▓▄▄▄▄         ▐▓▓▓▓▓▌   ▐▓▓▓▓▓▓
//   ▓▓▓▓▓▓▓▓▓▓▓▓▓▀        ▐▓▓▓▓▓▓▓▓▓▓         ▓▓▓▓▓▓▓▓▓▓         ▐▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓
//   ▓▓▓▓▓▓▀▀▓▓▓▓▓▓▄       ▐▓▓▓▓▓▓▀▀▀▀         ▓▓▓▓▓▓▀▀▀▀         ▐▓▓▓▓▓▓▓▓▓▓▓▓▓▓▀
//   ▓▓▓▓▓▓   ▀▓▓▓▓▓▓▄     ▐▓▓▓▓▓▓     ▓▓▓▓▓   ▓▓▓▓▓▓     ▓▓▓▓▓   ▐▓▓▓▓▓▌
// ▓▓▓▓▓▓▓▓▓▓ █▓▓▓▓▓▓▓▓▓ ▐▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  ▓▓▓▓▓▓▓▓▓▓
// ▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓ ▐▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓ ▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓  ▓▓▓▓▓▓▓▓▓▓
//
//                           Trust math, not hardware.

// SPDX-License-Identifier: MIT

pragma solidity 0.8.5;

import "./Auction.sol";
import "./CoveragePool.sol";

import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

contract CloneFactory {

  function createClone(address target) internal returns (address result) {
    bytes20 targetBytes = bytes20(target);
    assembly {
      let clone := mload(0x40)
      mstore(clone, 0x3d602d80600a3d3981f3363d3d373d3d3d363d73000000000000000000000000)
      mstore(add(clone, 0x14), targetBytes)
      mstore(add(clone, 0x28), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)
      result := create(0, clone, 0x37)
    }
  }

  function isClone(address target, address query) internal view returns (bool result) {
    bytes20 targetBytes = bytes20(target);
    assembly {
      let clone := mload(0x40)
      mstore(clone, 0x363d3d373d3d3d363d7300000000000000000000000000000000000000000000)
      mstore(add(clone, 0xa), targetBytes)
      mstore(add(clone, 0x1e), 0x5af43d82803e903d91602b57fd5bf30000000000000000000000000000000000)

      let other := add(clone, 0x40)
      extcodecopy(query, other, 0, 0x2d)
      result := and(
        eq(mload(clone), mload(other)),
        eq(mload(add(clone, 0xd)), mload(add(other, 0xd)))
      )
    }
  }
}

/// @title Auctioneer
/// @notice Factory for the creation of new auction clones and receiving proceeds.
/// @dev  We avoid redeployment of auction contracts by using the clone factory.
///       Proxy delegates calls to Auction and therefore does not affect auction state.
///       This means that we only need to deploy the auction contracts once.
///       The auctioneer provides clean state for every new auction clone.
contract Auctioneer is CloneFactory {
    // Holds the address of the auction contract
    // which will be used as a master contract for cloning.
    address public immutable masterAuction;
    mapping(address => bool) public openAuctions;
    uint256 public openAuctionsCount;

    CoveragePool public immutable coveragePool;

    event AuctionCreated(
        address indexed tokenAccepted,
        uint256 amount,
        address auctionAddress
    );
    event AuctionOfferTaken(
        address indexed auction,
        address indexed auctionTaker,
        address tokenAccepted,
        uint256 amount,
        uint256 portionToSeize // This amount should be divided by FLOATING_POINT_DIVISOR
    );
    event AuctionClosed(address indexed auction);

    constructor(CoveragePool _coveragePool, address _masterAuction) {
        coveragePool = _coveragePool;
        // slither-disable-next-line missing-zero-check
        masterAuction = _masterAuction;
    }

    /// @notice Informs the auctioneer to seize funds and log appropriate events
    /// @dev This function is meant to be called from a cloned auction. It logs
    ///      "offer taken" and "auction closed" events, seizes funds, and cleans
    ///      up closed auctions.
    /// @param auctionTaker    The address of the taker of the auction, who will
    ///                        receive the pool's seized funds
    /// @param tokenPaid       The token this auction is denominated in
    /// @param tokenAmountPaid The amount of the token the taker paid
    /// @param portionToSeize   The portion of the pool the taker won at auction.
    ///                        This amount should be divided by FLOATING_POINT_DIVISOR
    ///                        to calculate how much of the pool should be set
    ///                        aside as the taker's winnings.
    function offerTaken(
        address auctionTaker,
        IERC20 tokenPaid,
        uint256 tokenAmountPaid,
        uint256 portionToSeize
    ) external {
        require(openAuctions[msg.sender], "Sender isn't an auction");

        emit AuctionOfferTaken(
            msg.sender,
            auctionTaker,
            address(tokenPaid),
            tokenAmountPaid,
            portionToSeize
        );

        Auction auction = Auction(msg.sender);

        // actually seize funds, setting them aside for the taker to withdraw
        // from the coverage pool.
        // `portionToSeize` will be divided by FLOATING_POINT_DIVISOR which is
        // defined in Auction.sol
        //
        //slither-disable-next-line reentrancy-no-eth,reentrancy-events,reentrancy-benign
        coveragePool.seizeFunds(auctionTaker, portionToSeize);

        if (auction.isOpen()) {
            onAuctionPartiallyFilled(auction);
        } else {
            onAuctionFullyFilled(auction);

            emit AuctionClosed(msg.sender);
            delete openAuctions[msg.sender];
            openAuctionsCount -= 1;
        }
    }

    /// @notice Opens a new auction against the coverage pool. The auction
    ///         will remain open until filled.
    /// @dev Calls `Auction.initialize` to initialize the instance.
    /// @param tokenAccepted The token with which the auction can be taken
    /// @param amountDesired The amount denominated in _tokenAccepted. After
    ///                      this amount is received, the auction can close.
    /// @param auctionLength The amount of time it takes for the auction to get
    ///                      to 100% of all collateral on offer, in seconds.
    function createAuction(
        IERC20 tokenAccepted,
        uint256 amountDesired,
        uint256 auctionLength
    ) internal returns (address) {
        address cloneAddress = createClone(masterAuction);
        require(cloneAddress != address(0), "Cloned auction address is 0");

        Auction auction = Auction(cloneAddress);
        //slither-disable-next-line reentrancy-benign,reentrancy-events
        auction.initialize(this, tokenAccepted, amountDesired, auctionLength);

        openAuctions[cloneAddress] = true;
        openAuctionsCount += 1;

        emit AuctionCreated(
            address(tokenAccepted),
            amountDesired,
            cloneAddress
        );

        return cloneAddress;
    }

    /// @notice Tears down an open auction with given address immediately.
    /// @dev Can be called by contract owner to early close an auction if it
    ///      is no longer needed. Bear in mind that funds from the early closed
    ///      auction last on the auctioneer contract. Calling code should take
    ///      care of them.
    /// @return Amount of funds transferred to this contract by the Auction
    ///         being early closed.
    function earlyCloseAuction(Auction auction) internal returns (uint256) {
        address auctionAddress = address(auction);

        require(openAuctions[auctionAddress], "Address is not an open auction");

        uint256 amountTransferred = auction.amountTransferred();

        //slither-disable-next-line reentrancy-no-eth,reentrancy-events,reentrancy-benign
        auction.earlyClose();

        emit AuctionClosed(auctionAddress);
        delete openAuctions[auctionAddress];
        openAuctionsCount -= 1;

        return amountTransferred;
    }

    /// @notice Auction lifecycle hook allowing to act on auction closed
    ///         as fully filled. This function is not executed when an auction
    ///         was partially filled. When this function is executed auction is
    ///         already closed and funds from the coverage pool are seized.
    /// @dev Override this function to act on auction closed as fully filled.
    function onAuctionFullyFilled(Auction auction) internal virtual {}

    /// @notice Auction lifecycle hook allowing to act on auction partially
    ///         filled. This function is not executed when an auction
    ///         was fully filled.
    /// @dev Override this function to act on auction partially filled.
    function onAuctionPartiallyFilled(Auction auction) internal view virtual {}
}
