# Collateralized ETH Loan Contract

Hardhat project for a simple ETH-collateralized lending contract.

## What It Does

- Borrowers deposit ETH as collateral and request a loan.
- Lenders fund requested loans and receive repayment plus interest.
- Borrowers repay before the due date to recover collateral.
- Lenders can claim collateral after default.
- Borrowers can cancel unfunded loans and recover collateral.

## Local Setup

```shell
npm install
npm test
```

## Sepolia Deployment

Create `.env` from `.env.example`:

```shell
INFURA_API_KEY=your_infura_key
ACCOUNT_PRIVATE_KEY=your_funded_sepolia_wallet_private_key
ETHERSCAN_API_KEY=your_etherscan_api_key
```

The deployer wallet must have Sepolia ETH.

Deploy:

```shell
npm run deploy:sepolia
```

The deploy script prints the deployed address and Sepolia Etherscan URL.

Verify on Etherscan:

```shell
npm run verify:sepolia -- DEPLOYED_CONTRACT_ADDRESS
```

## Submission Link

The current deployed and verified Sepolia contract is:

```text
https://sepolia.etherscan.io/address/0x9CB63f722de088Cb0dB8112973c82E7A48bF92c8#code
```
