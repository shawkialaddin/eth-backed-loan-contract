const { ethers } = require("hardhat");

async function main() {
  console.log("Starting deployment...");

  // Get the contract factory for the CollateralizedLoan contract
  const CollateralizedLoan = await ethers.getContractFactory(
    "CollateralizedLoan"
  );

  // Deploy the contract
  const contract = await CollateralizedLoan.deploy();

  await contract.waitForDeployment();

  const address = await contract.getAddress();

  console.log(`CollateralizedLoan deployed successfully at ${address}`);
  console.log(`Sepolia Etherscan: https://sepolia.etherscan.io/address/${address}`);
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("An error occurred during deployment:", error);
    process.exit(1);
  });
