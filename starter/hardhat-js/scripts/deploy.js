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

  console.log(
    `CollateralizedLoan deployed successfully at ${await contract.getAddress()}`
  );
}

main()
  .then(() => process.exit(0))
  .catch((error) => {
    console.error("An error occurred during deployment:", error);
    process.exit(1);
  });
