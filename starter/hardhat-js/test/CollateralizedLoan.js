const {
  loadFixture,
  time,
} = require("@nomicfoundation/hardhat-toolbox/network-helpers");
const { anyValue } = require("@nomicfoundation/hardhat-chai-matchers/withArgs");
const { expect } = require("chai");
const { ethers } = require("hardhat");

describe("CollateralizedLoan", function () {
  const collateralAmount = ethers.parseEther("1");
  const interestRateBps = 1_000;
  const duration = 7 * 24 * 60 * 60;
  const repaymentAmount = ethers.parseEther("1.1");

  async function deployCollateralizedLoanFixture() {
    const [owner, borrower, lender, other] = await ethers.getSigners();
    const CollateralizedLoan = await ethers.getContractFactory(
      "CollateralizedLoan"
    );
    const collateralizedLoan = await CollateralizedLoan.deploy();

    return { collateralizedLoan, owner, borrower, lender, other };
  }

  async function requestedLoanFixture() {
    const fixture = await deployCollateralizedLoanFixture();
    const { collateralizedLoan, borrower } = fixture;

    await collateralizedLoan
      .connect(borrower)
      .depositCollateralAndRequestLoan(interestRateBps, duration, {
        value: collateralAmount,
      });

    return { ...fixture, loanId: 0 };
  }

  async function fundedLoanFixture() {
    const fixture = await requestedLoanFixture();
    const { collateralizedLoan, lender, loanId } = fixture;

    await collateralizedLoan.connect(lender).fundLoan(loanId, {
      value: collateralAmount,
    });

    return fixture;
  }

  it("deploys locally", async function () {
    const { collateralizedLoan } = await loadFixture(
      deployCollateralizedLoanFixture
    );

    expect(await collateralizedLoan.getAddress()).to.properAddress;
    expect(await collateralizedLoan.nextLoanId()).to.equal(0);
  });

  describe("Loan Request", function () {
    it("lets a borrower deposit collateral and request a loan", async function () {
      const { collateralizedLoan, borrower } = await loadFixture(
        deployCollateralizedLoanFixture
      );

      await expect(
        collateralizedLoan
          .connect(borrower)
          .depositCollateralAndRequestLoan(interestRateBps, duration, {
            value: collateralAmount,
          })
      )
        .to.emit(collateralizedLoan, "LoanRequested")
        .withArgs(
          0,
          borrower.address,
          collateralAmount,
          collateralAmount,
          interestRateBps,
          duration
        );

      const loan = await collateralizedLoan.loans(0);
      expect(loan.borrower).to.equal(borrower.address);
      expect(loan.collateralAmount).to.equal(collateralAmount);
      expect(loan.loanAmount).to.equal(collateralAmount);
      expect(loan.interestRateBps).to.equal(interestRateBps);
      expect(loan.repaymentAmount).to.equal(repaymentAmount);
      expect(loan.isFunded).to.equal(false);
      expect(await collateralizedLoan.nextLoanId()).to.equal(1);
    });

    it("rejects invalid loan requests", async function () {
      const { collateralizedLoan, borrower } = await loadFixture(
        deployCollateralizedLoanFixture
      );

      await expect(
        collateralizedLoan
          .connect(borrower)
          .depositCollateralAndRequestLoan(interestRateBps, duration)
      ).to.be.revertedWith("Collateral must be greater than zero");

      await expect(
        collateralizedLoan
          .connect(borrower)
          .depositCollateralAndRequestLoan(10_001, duration, {
            value: collateralAmount,
          })
      ).to.be.revertedWith("Interest rate too high");
    });
  });

  describe("Funding a Loan", function () {
    it("allows a lender to fund a requested loan", async function () {
      const { collateralizedLoan, borrower, lender, loanId } =
        await loadFixture(requestedLoanFixture);

      const fundLoan = collateralizedLoan.connect(lender).fundLoan(loanId, {
        value: collateralAmount,
      });

      await expect(fundLoan).to.changeEtherBalances(
        [lender, borrower, collateralizedLoan],
        [-collateralAmount, collateralAmount, 0]
      );
      await expect(fundLoan)
        .to.emit(collateralizedLoan, "LoanFunded")
        .withArgs(loanId, lender.address, collateralAmount, anyValue);

      const loan = await collateralizedLoan.loans(loanId);
      expect(loan.lender).to.equal(lender.address);
      expect(loan.isFunded).to.equal(true);
      expect(loan.dueDate).to.be.greaterThan(0);
    });

    it("rejects incorrect or nonexistent funding", async function () {
      const { collateralizedLoan, borrower, lender, loanId } =
        await loadFixture(requestedLoanFixture);

      await expect(
        collateralizedLoan.connect(lender).fundLoan(99, {
          value: collateralAmount,
        })
      ).to.be.revertedWith("Loan does not exist");

      await expect(
        collateralizedLoan.connect(borrower).fundLoan(loanId, {
          value: collateralAmount,
        })
      ).to.be.revertedWith("Borrower cannot fund own loan");

      await expect(
        collateralizedLoan.connect(lender).fundLoan(loanId, {
          value: ethers.parseEther("0.5"),
        })
      ).to.be.revertedWith("Incorrect funding amount");
    });
  });

  describe("Repaying a Loan", function () {
    it("enables the borrower to repay the loan fully", async function () {
      const { collateralizedLoan, borrower, lender, loanId } =
        await loadFixture(fundedLoanFixture);

      const repayLoan = collateralizedLoan.connect(borrower).repayLoan(loanId, {
        value: repaymentAmount,
      });

      await expect(repayLoan).to.changeEtherBalances(
        [borrower, lender, collateralizedLoan],
        [collateralAmount - repaymentAmount, repaymentAmount, -collateralAmount]
      );
      await expect(repayLoan)
        .to.emit(collateralizedLoan, "LoanRepaid")
        .withArgs(loanId, borrower.address, repaymentAmount, collateralAmount);

      const loan = await collateralizedLoan.loans(loanId);
      expect(loan.isRepaid).to.equal(true);
    });

    it("rejects incorrect repayment", async function () {
      const { collateralizedLoan, borrower, loanId } =
        await loadFixture(fundedLoanFixture);

      await expect(
        collateralizedLoan.connect(borrower).repayLoan(loanId, {
          value: collateralAmount,
        })
      ).to.be.revertedWith("Incorrect repayment amount");
    });
  });

  describe("Claiming Collateral", function () {
    it("permits the lender to claim collateral after default", async function () {
      const { collateralizedLoan, lender, loanId } =
        await loadFixture(fundedLoanFixture);

      const loan = await collateralizedLoan.loans(loanId);
      await time.increaseTo(loan.dueDate + 1n);

      const claimCollateral = collateralizedLoan
        .connect(lender)
        .claimCollateral(loanId);

      await expect(claimCollateral).to.changeEtherBalances(
        [lender, collateralizedLoan],
        [collateralAmount, -collateralAmount]
      );
      await expect(claimCollateral)
        .to.emit(collateralizedLoan, "CollateralClaimed")
        .withArgs(loanId, lender.address, collateralAmount);

      const updatedLoan = await collateralizedLoan.loans(loanId);
      expect(updatedLoan.isCollateralClaimed).to.equal(true);
    });

    it("rejects premature collateral claims", async function () {
      const { collateralizedLoan, lender, loanId } =
        await loadFixture(fundedLoanFixture);

      await expect(
        collateralizedLoan.connect(lender).claimCollateral(loanId)
      ).to.be.revertedWith("Loan is not overdue");
    });
  });

  describe("Cancelling a Loan", function () {
    it("lets the borrower cancel an unfunded loan and recover collateral", async function () {
      const { collateralizedLoan, borrower, loanId } =
        await loadFixture(requestedLoanFixture);

      const cancelLoan = collateralizedLoan.connect(borrower).cancelLoan(loanId);

      await expect(cancelLoan).to.changeEtherBalances(
        [borrower, collateralizedLoan],
        [collateralAmount, -collateralAmount]
      );
      await expect(cancelLoan)
        .to.emit(collateralizedLoan, "LoanCancelled")
        .withArgs(loanId, borrower.address, collateralAmount);

      const loan = await collateralizedLoan.loans(loanId);
      expect(loan.isCancelled).to.equal(true);
    });
  });
});
