// SPDX-License-Identifier: MIT

pragma solidity 0.8.19;

import "@openzeppelin/contracts/access/Ownable.sol";
import "@openzeppelin/contracts/utils/Address.sol";
import "@openzeppelin/contracts/token/ERC20/IERC20.sol";

import "@openzeppelin/contracts/security/Pausable.sol";
import "@openzeppelin/contracts/security/ReentrancyGuard.sol";
import "@openzeppelin/contracts/token/ERC20/utils/SafeERC20.sol";

import "./interfaces/IAdapter.sol";
import "./interfaces/IExchange.sol";

/**
 * @title Exchange
 */
contract Exchange is Ownable, Pausable, ReentrancyGuard, IExchange {
    IERC20 private constant hbar = IERC20(0x0000000000000000000000000000000000000000);

    using SafeERC20 for IERC20;
    using Address for address;
    using Address for address payable;

    // Mapping of aggregatorId to aggregator
    mapping(string => address) public adapters;
    mapping(string => bool) public adapterRemoved;

    event AdapterSet(
        string indexed aggregatorId,
        address indexed addr
    );
    event AdapterRemoved(string indexed aggregatorId);
    event Swap(
        string indexed aggregatorId,
        address indexed sender,
        IERC20 tokenFrom,
        IERC20 tokenTo,
        uint256 amountFrom,
        uint256 amountTo
    );

    /**
     * @dev Sets the adapter for an aggregator. It can't be changed later.
     * @param aggregatorId Aggregator's identifier
     * @param addr Address of the contract that contains the logic for this aggregator
     */
    function setAdapter(
        string calldata aggregatorId,
        address addr
    ) external {
        require(addr.code.length > 0, "EtaSwap: ADAPTER_NOT_A_CONTRACT");
        require(!adapterRemoved[aggregatorId], "EtaSwap: ADAPTER_REMOVED");
        require(adapters[aggregatorId] == address(0), "EtaSwap: ADAPTER_EXISTS");

        adapters[aggregatorId] = addr;
        emit AdapterSet(aggregatorId, addr);
    }

    function adapterFee(string calldata aggregatorId) external view returns (uint8 fee) {
        require(adapters[aggregatorId] != address(0), "EtaSwap: ADAPTER_DOES_NOT_EXIST");
        return IAdapter(adapters[aggregatorId]).feePromille();
    }

    /**
     * @dev Removes the adapter for an existing aggregator. This can't be undone.
     * @param aggregatorId Aggregator's identifier
     */
    function removeAdapter(string calldata aggregatorId) external onlyOwner {
        require(adapters[aggregatorId] != address(0), "EtaSwap: ADAPTER_DOES_NOT_EXIST");
        delete adapters[aggregatorId];
        adapterRemoved[aggregatorId] = true;
        emit AdapterRemoved(aggregatorId);
    }

    /**
     * @dev Performs a swap
     * @param aggregatorId Identifier of the aggregator to be used for the swap
     */
    function swap(
        string calldata aggregatorId,
        IERC20 tokenFrom,
        IERC20 tokenTo,
        uint256 amountFrom,
        uint256 amountTo,
        uint256 deadline,
        bool feeOnTransfer
    ) external payable whenNotPaused nonReentrant {
        require(adapters[aggregatorId] != address(0), "EtaSwap: ADAPTER_DOES_NOT_EXIST");
        _swap(aggregatorId, tokenFrom, tokenTo, amountFrom, amountTo, deadline, feeOnTransfer);
    }

    /**
     * @dev Performs a transactional split swap
     * @param aggregatorsId Identifiers of the aggregators to be used for the swap
     */
    function splitSwap(
        string[] calldata aggregatorsId,
        IERC20 tokenFrom,
        IERC20 tokenTo,
        uint256[] calldata amountsFrom,
        uint256[] calldata amountsTo,
        uint256 deadline,
        bool feeOnTransfer
    ) external payable whenNotPaused nonReentrant {
        for(uint8 i = 0; i < aggregatorsId.length; i++) {
            require(adapters[aggregatorsId[i]] != address(0), "EtaSwap: ADAPTER_DOES_NOT_EXIST");
            _swap(aggregatorsId[i], tokenFrom, tokenTo, amountsFrom[i], amountsTo[i], deadline, feeOnTransfer);
        }
    }

    function pauseSwaps() external onlyOwner {
        _pause();
    }

    function unpauseSwaps() external onlyOwner {
        _unpause();
    }

    function _swap(
        string calldata aggregatorId,
        IERC20 tokenFrom,
        IERC20 tokenTo,
        uint256 amountFrom,
        uint256 amountTo,
        uint256 deadline,
        bool feeOnTransfer
    ) internal {
        address adapter = adapters[aggregatorId];

        if (tokenFrom != hbar) {
            tokenFrom.safeTransferFrom(msg.sender, adapter, amountFrom);
        }

        IAdapter(adapter).swap{value: msg.value}(
            payable(msg.sender),
            tokenFrom,
            tokenTo,
            amountFrom,
            amountTo,
            deadline,
            feeOnTransfer
        );

        emit Swap(aggregatorId, msg.sender, tokenFrom, tokenTo, amountFrom, amountTo);
    }
}