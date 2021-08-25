import { HardhatRuntimeEnvironment } from "hardhat/types"
import { DeployFunction } from "hardhat-deploy/types"

const func: DeployFunction = async function (hre: HardhatRuntimeEnvironment) {
  const { getNamedAccounts, deployments } = hre
  const { deployer } = await getNamedAccounts()

  const keepToken = await deployments.deploy("KeepToken", {
    from: deployer,
    args: ["covKEEP underwriter token", "covKEEP"],
    log: true,
  })

  await hre.tenderly.persistArtifacts({
    name: "KeepToken",
    address: keepToken.address
  });
  
  await hre.tenderly.verify({
    name: "KeepToken",
    address: keepToken.address,
  })


}

export default func

func.tags = ["KeepToken"]
