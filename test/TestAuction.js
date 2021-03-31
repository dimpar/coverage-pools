const chai = require("chai")

const expect = chai.expect
const {
  to1e18,
  pastEvents,
  increaseTime,
} = require("./helpers/contract-test-helpers")

const AuctionJSON = require("../artifacts/contracts/Auction.sol/Auction.json")
// const { ethers } = require("ethers")
const { BigNumber } = ethers

const defaultAuctionLength = 86400 // 24h in sec
const defaultAuctionAmountDesired = to1e18(1) // ex. 1 TBTC
// amount of test tokens that an auction (aka spender) is allowed
// to transfer on behalf of a signer (aka token owner) from signer balance
const defaultAuctionTokenAllowance = to1e18(1)
const testTokensToMint = to1e18(1)

describe("Auction", function () {
  before(async () => {
    Auctioneer = await ethers.getContractFactory("Auctioneer")
    TestToken = await ethers.getContractFactory("TestToken")
    Auction = await ethers.getContractFactory("Auction")
    CollateralPool = await ethers.getContractFactory("CollateralPool")

    owner = await ethers.getSigner(0)
    signer1 = await ethers.getSigner(1)
    signer2 = await ethers.getSigner(2)

    auctioneer = await Auctioneer.deploy()
    await auctioneer.deployed()

    const masterAuction = await Auction.deploy()
    await masterAuction.deployed()

    collateralPool = await CollateralPool.deploy()
    await collateralPool.deployed()

    await auctioneer.initialize(collateralPool.address, masterAuction.address)
  })

  beforeEach(async () => {
    testToken = await TestToken.deploy()
    await testToken.deployed()

    await testToken.mint(owner.address, testTokensToMint)
    await testToken.mint(signer1.address, testTokensToMint)
    await testToken.mint(signer2.address, testTokensToMint)
    await testToken.approve(signer1.address, testTokensToMint)
    await testToken.approve(signer2.address, testTokensToMint)
  })

  describe("initialize", () => {
    it("should not initialize already initialized auction", async () => {
      auction = await createAuction(
        defaultAuctionAmountDesired,
        defaultAuctionLength
      )
      await approveTestTokenForAuction(auction.address)

      expect(await auction.isOpen()).to.equal(true)

      await expect(
        auction.initialize(
          auctioneer.address,
          testToken.address,
          defaultAuctionAmountDesired,
          defaultAuctionLength
        )
      ).to.be.revertedWith("Auction already initialized")
    })

    it("should not initialize when desired amount is zero", async () => {
      const auctionAmountDesired = 0
      await expect(
        auctioneer.createAuction(
          testToken.address,
          auctionAmountDesired,
          defaultAuctionLength
        )
      ).to.be.revertedWith("Amount desired must be greater than zero")
    })
  })

  describe("on offer", () => {
    it("should return a portion of a collateral pool which is available for taken when auction length is 100000", async () => {
      const auctionAmountDesired = 10000
      const auctionLength = 100000 // sec -> ~28h
      const auction = await createAuction(auctionAmountDesired, auctionLength)

      expect(await auction.isOpen()).to.be.equal(true)

      await increaseTime(24000)
      const onOffer = await auction.onOffer()

      // auction length: 100000 sec
      // 24000 sec passed, which means 24% of a collateral pool is on offer
      expect(onOffer[0] / onOffer[1]).to.be.closeTo(0.24, 0.01)
    })

    it("should return a portion of a collateral pool which is available for taken when auction length is 50000", async () => {
      const auctionAmountDesired = 10000
      const auctionLength = 50000 // sec -> ~14h
      const auction = await createAuction(auctionAmountDesired, auctionLength)

      expect(await auction.isOpen()).to.be.equal(true)

      await increaseTime(24000)
      const onOffer = await auction.onOffer()

      // auction length: 50000sec
      // 24000 sec passed, which means 48% of a collateral pool is on offer
      expect(onOffer[0] / onOffer[1]).to.be.closeTo(0.48, 0.01)
    })

    it("should return a portion of a collateral pool which is available for taken when requesting a couple of times", async () => {
      const auctionAmountDesired = 10000
      const auctionLength = 100000 // sec -> ~28h
      const auction = await createAuction(auctionAmountDesired, auctionLength)

      expect(await auction.isOpen()).to.be.equal(true)

      await increaseTime(24000)
      let onOffer = await auction.onOffer()

      // auction length: 100000 sec
      // 24000 sec passed, which means 24% of a collateral pool is on offer
      expect(onOffer[0] / onOffer[1]).to.be.closeTo(0.24, 0.01)

      await increaseTime(26000)
      onOffer = await auction.onOffer()

      // auction length: 100000 sec
      // 50000 sec passed, which means 50% of a collateral pool is on offer
      expect(onOffer[0] / onOffer[1]).to.be.closeTo(0.5, 0.01)
    })
  })

  describe("take offer", () => {
    beforeEach(async () => {
      auction = await createAuction(
        defaultAuctionAmountDesired,
        defaultAuctionLength
      )
      await approveTestTokenForAuction(auction.address)
    })

    it("should pay more than 0 tokens", async () => {
      await expect(auction.takeOffer(0)).to.be.revertedWith(
        "Can't pay 0 tokens"
      )
    })

    it("should take the entire auction", async () => {
      expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(0)

      // Increase time 1h -> 3600sec
      await increaseTime(3600)

      await auction.connect(signer1).takeOffer(defaultAuctionAmountDesired)

      // entire amount paid for an auction should be transferred to auctioneer
      expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(
        defaultAuctionAmountDesired
      )

      // when a desired amount is collected, a contract should be destroyed
      expect(await ethers.provider.getCode(auction.address)).to.equal("0x")
    })

    it("should take a partial offer from the same taker", async () => {
      expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(0)

      // For testing calculation purposes assume the auction start time is 0
      // On blockchain we calculate the time diffs

      // Increase time 1h -> 3600sec
      await increaseTime(3600)
      let onOfferObj = await auction.connect(signer1).onOffer()
      // Velocity pool depleating rate: 1
      // Percent on offer after 1h of auction start time: 3,600 * 1 * / 86,400 ~ 0.0416 +/- 0.0002 (evm delays)
      // ~4.16% on offer of a collateral pool after 1h
      expect(onOfferObj[0] / onOfferObj[1]).to.be.closeTo(0.0416, 0.0002)
      // Pay 50% of the desired amount for an auction 0.5 * 10^18
      let partialOfferAmount = defaultAuctionAmountDesired.div(
        BigNumber.from("2")
      )
      const expectedAuctioneerBalance = partialOfferAmount
      await auction.connect(signer1).takeOffer(partialOfferAmount)
      expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(
        expectedAuctioneerBalance
      )

      // Ratio amount paid: 0.5 / 1 = 0.5
      // Updated start time: 0 + (3,600 - 0) * 0.5 = 1,800
      // Velocity pool depleating rate: 86,400 / (86,400 - 1,800) ~ 1.0212
      // Availability of assets in the collateral pool: 100% - (4.16% / 2) = 97.92%

      // Increase time 45min -> 2,700 sec
      // Now: 3,600 + 2,700 = 6,300
      await increaseTime(2700)
      // (6,300 - 1,800) * 1.0212 / 86,400 = 0.0531875 +/- 0.0002
      // ~5.31% on offer of a collateral pool after 1h45min
      onOfferObj = await auction.connect(signer1).onOffer()
      expect(onOfferObj[0] / onOfferObj[1]).to.be.closeTo(0.0531, 0.0002)

      // Pay 20% of the remaining amount for an auction 0.5 * 10^18 / 5 = 0.1 * 10^18
      partialOfferAmount = partialOfferAmount.div(BigNumber.from("5"))
      // Auctioneer balance: (0.5 + 0.1) => 0.6 * 10^18
      auctioneerBalance = expectedAuctioneerBalance.add(partialOfferAmount)
      await auction.connect(signer1).takeOffer(partialOfferAmount)
      expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(
        auctioneerBalance
      )

      // Ratio amount paid: 0.1 / 0.5 = 0.2
      // Updated start time: 1,800 + (6,300 - 1,800) * 0.2 = 2,700
      // Velocity pool depleating rate: 86,400 / (86,400 - 2,700) ~ 1.03225
      // Availability of assets in a collateral pool: 97.92% - (5.31% * 0.2) ~ 96.86%

      // Increase time 20min -> 1,200 sec
      // Now: 6,300 + 1,200 = 7,500
      await increaseTime(1200)
      // 60% of the desired amount was paid. 0.5 + 0.1 out of 1
      onOfferObj = await auction.connect(signer1).onOffer()
      expect(onOfferObj[0] / onOfferObj[1]).to.be.closeTo(0.0573, 0.0002)
      // Buy the rest and close the auction 1 - 0.6 => 0.4 * 10^18
      partialOfferAmount = defaultAuctionAmountDesired.sub(auctioneerBalance)
      await auction.connect(signer1).takeOffer(partialOfferAmount)
      expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(
        defaultAuctionAmountDesired
      )

      // when a desired amount is collected, this auction should be destroyed
      expect(await ethers.provider.getCode(auction.address)).to.equal("0x")
    })

    it("should take a partial offer from multiple takers", async () => {
      // Auction amount desired: 1 * 10^18
      // Increase time 1h -> 3600sec
      await increaseTime(3600)

      let onOfferObj = await auction.connect(signer1).onOffer()
      // Velocity pool depleating rate: 1
      // Percent on offer after 1h of auction start time: 3,600 * 1 * / 86,400 ~ 0.0416 +/- 0.0002 (evm delays)
      // ~4.16% on offer of a collateral pool after 1h
      expect(onOfferObj[0] / onOfferObj[1]).to.be.closeTo(0.0416, 0.0002)
      // Pay 25% of the desired amount for the auction: 0.25 * 10^18
      const partialOfferAmount = defaultAuctionAmountDesired.div(
        BigNumber.from("4")
      )
      await auction.connect(signer1).takeOffer(partialOfferAmount)
      expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(
        partialOfferAmount
      )

      // Ratio amount paid: 0.25 / 1 = 0.25
      // Updated start time: 0 + (3,600 - 0) * 0.25 = 900
      // Velocity pool depleating rate: 86,400 / (86,400 - 900) ~ 1.0105
      // Availability of assets in the collateral pool: 100% - (4.16% / 4) = 98.96%

      // Increase time 15min -> 900 sec
      // Now: 3,600 + 900 = 4,500
      await increaseTime(900)
      // onOffer: (now - updated start time) * velocity rate / auction length
      // (4,500 - 900) * 1.0105 / 86,400 = 0.0421041 +/- 0.0002
      // ~4.21% on offer of a collateral pool after 1h15min
      onOfferObj = await auction.connect(signer2).onOffer()
      expect(onOfferObj[0] / onOfferObj[1]).to.be.closeTo(0.0421, 0.0002)

      // Pay the rest of the remaining auction 0.75 * 10^18
      const amountOutstanding = await auction
        .connect(signer2)
        .amountOutstanding()
      expect(amountOutstanding).to.equal(
        defaultAuctionAmountDesired.sub(partialOfferAmount)
      )
      await auction.connect(signer2).takeOffer(amountOutstanding)
      expect(await testToken.balanceOf(auctioneer.address)).to.be.equal(
        defaultAuctionAmountDesired
      )

      // when a desired amount is collected, this auction should be destroyed
      expect(await ethers.provider.getCode(auction.address)).to.equal("0x")
    })
  })

  async function createAuction(auctionAmountDesired, auctionLength) {
    const createAuctionTx = await auctioneer.createAuction(
      testToken.address,
      auctionAmountDesired,
      auctionLength
    )

    const receipt = await createAuctionTx.wait()
    const events = pastEvents(receipt, auctioneer, "AuctionCreated")
    const auctionAddress = events[0].args["auctionAddress"]

    return new ethers.Contract(auctionAddress, AuctionJSON.abi, owner)
  }

  async function approveTestTokenForAuction(auctionAddress) {
    await testToken
      .connect(signer1)
      .approve(auctionAddress, defaultAuctionTokenAllowance)

    await testToken
      .connect(signer2)
      .approve(auctionAddress, defaultAuctionTokenAllowance)
  }
})
