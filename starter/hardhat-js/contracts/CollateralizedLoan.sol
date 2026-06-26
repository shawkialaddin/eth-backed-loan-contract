// SPDX-License-Identifier: MIT
pragma solidity ^0.8.19;

/**
 * @title CollateralizedLoan
 * @dev ETH-backed loan marketplace where borrowers escrow collateral and
 * lenders fund matching loans. Loan amount is equal to collateral amount.
 */
contract CollateralizedLoan {
    uint256 public constant BASIS_POINTS = 10_000;
    uint256 public constant MAX_INTEREST_RATE_BPS = 10_000;

    uint256 public nextLoanId;
    bool private locked;

    struct Loan {
        address payable borrower;
        address payable lender;
        uint256 collateralAmount;
        uint256 loanAmount;
        uint256 interestRateBps;
        uint256 repaymentAmount;
        uint256 duration;
        uint256 dueDate;
        bool isFunded;
        bool isRepaid;
        bool isCollateralClaimed;
        bool isCancelled;
    }

    mapping(uint256 => Loan) public loans;

    event LoanRequested(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 collateralAmount,
        uint256 loanAmount,
        uint256 interestRateBps,
        uint256 duration
    );

    event LoanFunded(
        uint256 indexed loanId,
        address indexed lender,
        uint256 loanAmount,
        uint256 dueDate
    );

    event LoanRepaid(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 repaymentAmount,
        uint256 collateralReturned
    );

    event CollateralClaimed(
        uint256 indexed loanId,
        address indexed lender,
        uint256 collateralAmount
    );

    event LoanCancelled(
        uint256 indexed loanId,
        address indexed borrower,
        uint256 collateralReturned
    );

    modifier nonReentrant() {
        require(!locked, "Reentrant call");
        locked = true;
        _;
        locked = false;
    }

    modifier loanExists(uint256 loanId) {
        require(loanId < nextLoanId, "Loan does not exist");
        _;
    }

    modifier onlyBorrower(uint256 loanId) {
        require(loans[loanId].borrower == msg.sender, "Only borrower allowed");
        _;
    }

    modifier onlyLender(uint256 loanId) {
        require(loans[loanId].lender == msg.sender, "Only lender allowed");
        _;
    }

    modifier loanActive(uint256 loanId) {
        Loan storage loan = loans[loanId];
        require(!loan.isCancelled, "Loan is cancelled");
        require(!loan.isRepaid, "Loan already repaid");
        require(!loan.isCollateralClaimed, "Collateral already claimed");
        _;
    }

    function depositCollateralAndRequestLoan(
        uint256 interestRateBps,
        uint256 duration
    ) external payable nonReentrant returns (uint256 loanId) {
        require(msg.value > 0, "Collateral must be greater than zero");
        require(duration > 0, "Duration must be greater than zero");
        require(interestRateBps <= MAX_INTEREST_RATE_BPS, "Interest rate too high");

        loanId = nextLoanId;
        uint256 loanAmount = msg.value;
        uint256 interestAmount = (loanAmount * interestRateBps) / BASIS_POINTS;
        uint256 repaymentAmount = loanAmount + interestAmount;

        loans[loanId] = Loan({
            borrower: payable(msg.sender),
            lender: payable(address(0)),
            collateralAmount: msg.value,
            loanAmount: loanAmount,
            interestRateBps: interestRateBps,
            repaymentAmount: repaymentAmount,
            duration: duration,
            dueDate: 0,
            isFunded: false,
            isRepaid: false,
            isCollateralClaimed: false,
            isCancelled: false
        });

        nextLoanId++;

        emit LoanRequested(
            loanId,
            msg.sender,
            msg.value,
            loanAmount,
            interestRateBps,
            duration
        );
    }

    function fundLoan(
        uint256 loanId
    ) external payable nonReentrant loanExists(loanId) loanActive(loanId) {
        Loan storage loan = loans[loanId];

        require(!loan.isFunded, "Loan already funded");
        require(msg.sender != loan.borrower, "Borrower cannot fund own loan");
        require(msg.value == loan.loanAmount, "Incorrect funding amount");

        loan.lender = payable(msg.sender);
        loan.isFunded = true;
        loan.dueDate = block.timestamp + loan.duration;

        uint256 loanAmount = loan.loanAmount;
        uint256 dueDate = loan.dueDate;
        address payable borrower = loan.borrower;

        (bool sent, ) = borrower.call{value: loanAmount}("");
        require(sent, "Loan transfer failed");

        emit LoanFunded(loanId, msg.sender, loanAmount, dueDate);
    }

    function repayLoan(
        uint256 loanId
    )
        external
        payable
        nonReentrant
        loanExists(loanId)
        onlyBorrower(loanId)
        loanActive(loanId)
    {
        Loan storage loan = loans[loanId];

        require(loan.isFunded, "Loan is not funded");
        require(block.timestamp <= loan.dueDate, "Loan is overdue");
        require(msg.value == loan.repaymentAmount, "Incorrect repayment amount");

        loan.isRepaid = true;

        uint256 repaymentAmount = loan.repaymentAmount;
        uint256 collateralAmount = loan.collateralAmount;
        address payable lender = loan.lender;
        address payable borrower = loan.borrower;

        (bool repaid, ) = lender.call{value: repaymentAmount}("");
        require(repaid, "Repayment transfer failed");

        (bool returned, ) = borrower.call{value: collateralAmount}("");
        require(returned, "Collateral return failed");

        emit LoanRepaid(loanId, msg.sender, repaymentAmount, collateralAmount);
    }

    function claimCollateral(
        uint256 loanId
    )
        external
        nonReentrant
        loanExists(loanId)
        onlyLender(loanId)
        loanActive(loanId)
    {
        Loan storage loan = loans[loanId];

        require(loan.isFunded, "Loan is not funded");
        require(block.timestamp > loan.dueDate, "Loan is not overdue");

        loan.isCollateralClaimed = true;

        uint256 collateralAmount = loan.collateralAmount;
        address payable lender = loan.lender;

        (bool sent, ) = lender.call{value: collateralAmount}("");
        require(sent, "Collateral transfer failed");

        emit CollateralClaimed(loanId, msg.sender, collateralAmount);
    }

    function cancelLoan(
        uint256 loanId
    )
        external
        nonReentrant
        loanExists(loanId)
        onlyBorrower(loanId)
        loanActive(loanId)
    {
        Loan storage loan = loans[loanId];

        require(!loan.isFunded, "Cannot cancel funded loan");

        loan.isCancelled = true;

        uint256 collateralAmount = loan.collateralAmount;
        address payable borrower = loan.borrower;

        (bool returned, ) = borrower.call{value: collateralAmount}("");
        require(returned, "Collateral return failed");

        emit LoanCancelled(loanId, msg.sender, collateralAmount);
    }
}
