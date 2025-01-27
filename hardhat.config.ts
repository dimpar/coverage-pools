import { HardhatUserConfig } from "hardhat/config"

import "@keep-network/hardhat-helpers"
import "@keep-network/hardhat-local-networks-config"
import "@nomiclabs/hardhat-waffle"
import "@nomiclabs/hardhat-ethers"
import "hardhat-gas-reporter"
import "hardhat-deploy"
import "solidity-coverage"
import '@tenderly/hardhat-tenderly'

const config: HardhatUserConfig = {
  solidity: {
    compilers: [
      {
        version: "0.8.5",
      },
    ],
  },
  paths: {
    artifacts: "./build",
  },
  networks: {
    hardhat: {
      forking: {
        // forking is enabled only if FORKING_URL env is provided
        enabled: !!process.env.FORKING_URL,
        // URL should point to a node with archival data (Alchemy recommended)
        url: process.env.FORKING_URL || "",
        // latest block is taken if FORKING_BLOCK env is not provided
        blockNumber: process.env.FORKING_BLOCK
          ? parseInt(process.env.FORKING_BLOCK)
          : undefined,
      },
      tags: ["local"],
    },
    development: {
      url: "http://localhost:8545",
      chainId: 1101,
      tags: ["local"],
    },
    ropsten: {
      url: "https://ropsten.infura.io/v3/9556716fcc164f2a8a7e5f3a5f7d4a54",
      chainId: 3,
      accounts: ['0x65d8823327f50a169f4c4430f427586038cd059c2f2a168e35be465be0e6a764'],
    },
  },
  tenderly: {
		username: "dimpar",
		project: "hardhat-coverage-pool-1"
	},
  // // Define local networks configuration file path to load networks from the file.
  // localNetworksConfig: "./.hardhat/networks.ts",
  external: {
    contracts: [
      {
        artifacts: "node_modules/@keep-network/keep-core/artifacts",
        // Example if we want to use deployment scripts from external package:
        // deploy: "node_modules/@keep-network/keep-core/deploy",
      },
      {
        artifacts: "node_modules/@keep-network/tbtc/artifacts",
      },
    ],
    deployments: {
      // For development environment we expect the local dependencies to be linked
      // with `yarn link` command.
      development: [
        "node_modules/@keep-network/keep-core/artifacts",
        "node_modules/@keep-network/tbtc/artifacts",
      ],
      ropsten: [
        "node_modules/@keep-network/keep-core/artifacts",
        "node_modules/@keep-network/tbtc/artifacts",
        "./external/ropsten",
      ],
      mainnet: ["./external/mainnet"],
    },
  },
  namedAccounts: {
    deployer: {
      default: 0, // take the first account as deployer
    },
    rewardManager: {
      default: 1,
      ropsten: 0, // use deployer account
      mainnet: 0, // use deployer account
    },
    keepCommunityMultiSig: {
      mainnet: "0x19FcB32347ff4656E4E6746b4584192D185d640d",
    },
  },
  mocha: {
    timeout: 30000,
  },
}

export default config
