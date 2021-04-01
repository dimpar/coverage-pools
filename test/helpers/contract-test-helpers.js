function to1e18(n) {
  const decimalMultiplier = ethers.BigNumber.from(10).pow(18)
  return ethers.BigNumber.from(n).mul(decimalMultiplier)
}

// Retrieves past events. This is a workaround for a known issue described here
// https://github.com/nomiclabs/hardhat/pull/1163
// The preferred way of getting events would be using listners:
// https://docs.ethers.io/v5/api/contract/contract/#Contract--events
function pastEvents(receipt, contract, eventName) {
  const events = []

  for (const log of receipt.logs) {
    if (log.address === contract.address) {
      const parsedLog = contract.interface.parseLog(log)
      if (parsedLog.name === eventName) {
        events.push(parsedLog)
      }
    }
  }

  return events
}

async function increaseTime(time) {
  await ethers.provider.send("evm_increaseTime", [time])
  await ethers.provider.send("evm_mine")
}

module.exports.to1e18 = to1e18
module.exports.pastEvents = pastEvents
module.exports.increaseTime = increaseTime
