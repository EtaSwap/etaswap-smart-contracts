const hre = require("hardhat");
const { expect } = require("chai");
const { ORACLES } = require('./constants');
const { AccountId } = require('@hashgraph/sdk');
const { ethers } = require('hardhat');

const GAS_LIMITS = {
    exactTokenToToken: 900000, //877969    875079
    exactHBARToToken: 247000, //221207     203366
    exactTokenToHBAR: 1670000, //1629306   1623679
    tokenToExactToken: 920000, //894071    891182
    HBARToExactToken: 240000, //211040     218135
    tokenToExactHBAR: 1690000, //1645353   1639941
}

describe("Exchange", function () {
    let adapterAddresses = {};
    let exchangeAddress;

    let client;
    let clientAccount;
    let feeAccount;
    let signers;

    let feeRate = 0.005;

    before(async function () {
        const initData = await hre.run('init');
        client = initData.client;
        clientAccount = initData.clientAccount;
        feeAccount = initData.feeAccount;
        signers = initData.signers;

        for (const name in Object.keys[ORACLES]) {
            adapterAddresses[name] = hre.ethers.constants.AddressZero;
        }
    });

    it("should be able to deploy exchange and attach Uniswap adapter", async function () {
        const exchange = await hre.run("deploy-exchange", {
            client,
            clientAccount,
            feeAccount,
            adapters: Object.values(ORACLES).map(oracle => ({
                router: oracle.router,
                contractName: oracle.adapterContract,
                aggregatorId: oracle.aggregatorId,
                tokensToAssociate: oracle.tokensToAssociate,
                whbarToken: oracle.whbarToken,
                whbarContract: oracle.whbarContract,
            }))
        });
        exchangeAddress = exchange.contractAddress;
        expect(exchangeAddress).not.to.equal(hre.ethers.constants.AddressZero);
    });

    it("should be able to exchange exact tokens to tokens", async function () {
        for (const name of Object.keys(ORACLES)) {
            const { tokenA, tokenB } = ORACLES[name].validPair;
            const tokenABalanceBefore = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenA
            });
            const tokenBBalanceBefore = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenB
            });
            const tokenABalanceFeeBefore = await hre.run('get-balance', {
                userAddress: feeAccount.id.toSolidityAddress(),
                tokenAddress: tokenA
            });
            const slippageTolerance = 0.025;
            const { rate } = await hre.run('get-rate-oracle', {
                name,
                address: ORACLES[name].address,
                tokenA,
                tokenB,
            });

            const amountFrom = hre.ethers.BigNumber.from(100000000);
            const amountTo = amountFrom.mul(rate).div(hre.ethers.BigNumber.from(10).pow(18)).mul(1000 - slippageTolerance * 1000 - feeRate * 1000).div(1000);

            await hre.run("call-exchange", {
                client,
                clientAccount,
                exchangeAddress,
                tokenFrom: tokenA,
                tokenTo: tokenB,
                amountFrom,
                amountTo,
                aggregatorId: ORACLES[name].aggregatorId,
                feeOnTransfer: false,
                gasLimit: GAS_LIMITS.exactTokenToToken,
            });

            const tokenABalanceAfter = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenA
            });
            const tokenBBalanceAfter = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenB
            });
            const tokenABalanceFeeAfter = await hre.run('get-balance', {
                userAddress: feeAccount.id.toSolidityAddress(),
                tokenAddress: tokenA
            });

            expect(tokenABalanceAfter).to.be.equal(tokenABalanceBefore.sub(amountFrom));
            expect(tokenBBalanceAfter).to.be.greaterThan(tokenBBalanceBefore.add(amountTo));
            expect(tokenBBalanceAfter).to.be.lessThanOrEqual(tokenBBalanceBefore.add(amountFrom.mul(rate).div(hre.ethers.BigNumber.from(10).pow(18)).mul((1 - feeRate) * 1000).div(1000)));
            expect(tokenABalanceFeeAfter.sub(tokenABalanceFeeBefore.add(amountFrom.mul(feeRate * 1000).div(1000))).abs()).to.be.lessThanOrEqual(100);
        }
    });

    it("should be able to exchange exact HBAR to tokens", async function () {
        for (const name of Object.keys(ORACLES)) {
            const { tokenA, tokenB } = ORACLES[name].validPairHbar;
            const tokenABalanceBefore = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenA
            });
            const tokenBBalanceBefore = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenB
            });
            const tokenABalanceFeeBefore = await hre.run('get-balance', {
                userAddress: feeAccount.id.toSolidityAddress(),
                tokenAddress: tokenA
            });
            const slippageTolerance = 0.025;
            const { rate } = await hre.run('get-rate-oracle', {
                name,
                address: ORACLES[name].address,
                tokenA: tokenA === ethers.constants.AddressZero ? ORACLES[name].whbarToken : tokenA,
                tokenB: tokenB === ethers.constants.AddressZero ? ORACLES[name].whbarToken : tokenB,
            });

            const amountFrom = hre.ethers.BigNumber.from(100000000);
            const amountTo = amountFrom.mul(rate).div(hre.ethers.BigNumber.from(10).pow(18)).mul(1000 - slippageTolerance * 1000 - feeRate * 1000).div(1000);

            await hre.run("call-exchange", {
                client,
                clientAccount,
                exchangeAddress,
                tokenFrom: tokenA,
                tokenTo: tokenB,
                amountFrom,
                amountTo,
                aggregatorId: ORACLES[name].aggregatorId,
                feeOnTransfer: false,
                gasLimit: GAS_LIMITS.exactHBARToToken,
            });

            const tokenABalanceAfter = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenA
            });
            const tokenBBalanceAfter = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenB
            });
            const tokenABalanceFeeAfter = await hre.run('get-balance', {
                userAddress: feeAccount.id.toSolidityAddress(),
                tokenAddress: tokenA
            });

            expect(tokenABalanceAfter).not.to.be.equal(tokenABalanceBefore);
            expect(tokenBBalanceAfter).to.be.greaterThan(tokenBBalanceBefore.add(amountTo));
            expect(tokenBBalanceAfter).to.be.lessThanOrEqual(tokenBBalanceBefore.add(amountFrom.mul(rate).div(hre.ethers.BigNumber.from(10).pow(18)).mul((1 - feeRate) * 1000).div(1000)));
            expect(tokenABalanceFeeAfter.sub(tokenABalanceFeeBefore.add(amountFrom.mul(feeRate * 1000).div(1000))).abs()).to.be.lessThanOrEqual(100);
        }
    });

    it("should be able to exchange exact tokens to HBAR", async function () {
        for (const name of Object.keys(ORACLES)) {
            const { tokenA, tokenB } = ORACLES[name].validPairHbar;
            const tokenABalanceBefore = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenA
            });
            const tokenBBalanceBefore = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenB
            });
            const tokenBBalanceFeeBefore = await hre.run('get-balance', {
                userAddress: feeAccount.id.toSolidityAddress(),
                tokenAddress: tokenB
            });
            const slippageTolerance = 0.025;
            const { rate } = await hre.run('get-rate-oracle', {
                name,
                address: ORACLES[name].address,
                tokenA: tokenB === ethers.constants.AddressZero ? ORACLES[name].whbarToken : tokenB,
                tokenB: tokenA === ethers.constants.AddressZero ? ORACLES[name].whbarToken : tokenA,
            });

            const amountFrom = hre.ethers.BigNumber.from(100000);
            const amountTo = amountFrom.mul(rate).div(hre.ethers.BigNumber.from(10).pow(18)).mul(1000 - slippageTolerance * 1000 - feeRate * 1000).div(1000);

            await hre.run("call-exchange", {
                client,
                clientAccount,
                exchangeAddress,
                tokenFrom: tokenB,
                tokenTo: tokenA,
                amountFrom,
                amountTo,
                aggregatorId: ORACLES[name].aggregatorId,
                feeOnTransfer: false,
                gasLimit: GAS_LIMITS.exactTokenToHBAR,
            });

            const tokenABalanceAfter = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenA
            });
            const tokenBBalanceAfter = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenB
            });
            const tokenBBalanceFeeAfter = await hre.run('get-balance', {
                userAddress: feeAccount.id.toSolidityAddress(),
                tokenAddress: tokenB
            });

            expect(tokenBBalanceAfter).to.be.equal(tokenBBalanceBefore.sub(amountFrom));
            // TODO: -gas
            // expect(tokenABalanceAfter).to.be.greaterThan(tokenABalanceBefore.add(amountTo));
            expect(tokenABalanceAfter).to.be.lessThanOrEqual(tokenABalanceBefore.add(amountFrom.mul(rate).div(hre.ethers.BigNumber.from(10).pow(18)).mul((1 - feeRate) * 1000).div(1000)));
            expect(tokenBBalanceFeeAfter.sub(tokenBBalanceFeeBefore.add(amountFrom.mul(feeRate * 1000).div(1000))).abs()).to.be.lessThanOrEqual(100);
        }
    });

    it("should be able to change fee as admin", async function () {
        const oldFeeRate = feeRate;
        feeRate = 0.003;
        for (const name of Object.keys(ORACLES)) {
            const { newFeeRate } = await hre.run('set-adapter-fee', {
                exchangeAddress,
                aggregatorId: ORACLES[name].aggregatorId,
                adapterName: ORACLES[name].adapterContract,
                feePromille: feeRate * 1000,
            });

            expect(newFeeRate).not.to.be.equal(hre.ethers.BigNumber.from(oldFeeRate * 1000));
            expect(newFeeRate).to.be.equal(hre.ethers.BigNumber.from(feeRate * 1000));
        }
    });

    it("should be able to exchange tokens to exact tokens", async function () {
        for (const name of Object.keys(ORACLES)) {
            const { tokenA, tokenB } = ORACLES[name].validPair;
            const tokenABalanceBefore = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenA
            });
            const tokenBBalanceBefore = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenB
            });
            const tokenABalanceFeeBefore = await hre.run('get-balance', {
                userAddress: feeAccount.id.toSolidityAddress(),
                tokenAddress: tokenA
            });
            const slippageTolerance = 0.025;
            const { rate } = await hre.run('get-rate-oracle', {
                name,
                address: ORACLES[name].address,
                tokenA: tokenB,
                tokenB: tokenA,
            });

            const amountTo = hre.ethers.BigNumber.from(100000);
            const amountFrom = amountTo.mul(rate).div(hre.ethers.BigNumber.from(10).pow(18)).mul(1000 + slippageTolerance * 1000 + feeRate * 1000).div(1000);

            await hre.run("call-exchange", {
                client,
                clientAccount,
                exchangeAddress,
                tokenFrom: tokenA,
                tokenTo: tokenB,
                amountFrom,
                amountTo,
                aggregatorId: ORACLES[name].aggregatorId,
                feeOnTransfer: true,
                gasLimit: GAS_LIMITS.tokenToExactToken,
            });


            const tokenABalanceAfter = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenA
            });
            const tokenBBalanceAfter = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenB
            });
            const tokenABalanceFeeAfter = await hre.run('get-balance', {
                userAddress: feeAccount.id.toSolidityAddress(),
                tokenAddress: tokenA
            });

            expect(tokenABalanceAfter).to.be.greaterThan(tokenABalanceBefore.sub(amountFrom));
            expect(tokenABalanceAfter).to.be.lessThanOrEqual(tokenABalanceBefore.sub(amountTo.mul(rate).div(hre.ethers.BigNumber.from(10).pow(18)).mul(1000 + feeRate * 1000).div(1000)));
            expect(tokenBBalanceAfter).to.be.equal(tokenBBalanceBefore.add(amountTo));
            expect(tokenABalanceFeeAfter.sub(tokenABalanceFeeBefore.add(amountFrom.mul(feeRate * 1000).div(1000))).abs()).to.be.lessThanOrEqual(100);
        }
    });

    it("should be able to exchange HBAR to exact tokens", async function () {
        for (const name of Object.keys(ORACLES)) {
            const { tokenA, tokenB } = ORACLES[name].validPairHbar;
            const tokenABalanceBefore = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenA
            });
            const tokenBBalanceBefore = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenB
            });
            const tokenABalanceFeeBefore = await hre.run('get-balance', {
                userAddress: feeAccount.id.toSolidityAddress(),
                tokenAddress: tokenA
            });
            const slippageTolerance = 0.025;
            const { rate } = await hre.run('get-rate-oracle', {
                name,
                address: ORACLES[name].address,
                tokenA: tokenB === ethers.constants.AddressZero ? ORACLES[name].whbarToken : tokenB,
                tokenB: tokenA === ethers.constants.AddressZero ? ORACLES[name].whbarToken : tokenA,
            });

            const amountTo = hre.ethers.BigNumber.from(1000000);
            const amountFrom = amountTo.mul(rate).div(hre.ethers.BigNumber.from(10).pow(18)).mul(1000 + slippageTolerance * 1000 + feeRate * 1000).div(1000);

            await hre.run("call-exchange", {
                client,
                clientAccount,
                exchangeAddress,
                tokenFrom: tokenA,
                tokenTo: tokenB,
                amountFrom: amountFrom,
                amountTo,
                aggregatorId: ORACLES[name].aggregatorId,
                feeOnTransfer: true,
                gasLimit: GAS_LIMITS.HBARToExactToken,
            });


            const tokenABalanceAfter = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenA
            });
            const tokenBBalanceAfter = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenB
            });
            const tokenABalanceFeeAfter = await hre.run('get-balance', {
                userAddress: feeAccount.id.toSolidityAddress(),
                tokenAddress: tokenA
            });

            expect(tokenABalanceAfter).to.be.lessThanOrEqual(tokenABalanceBefore.sub(amountTo.mul(rate).div(hre.ethers.BigNumber.from(10).pow(18)).mul(1000 + feeRate * 1000).div(1000)));
            expect(tokenBBalanceAfter).to.be.equal(tokenBBalanceBefore.add(amountTo));
            expect(tokenABalanceFeeAfter.sub(tokenABalanceFeeBefore.add(amountFrom.mul(feeRate * 1000).div(1000))).abs()).to.be.lessThanOrEqual(100);
        }
    });

    it("should be able to exchange tokens to exact HBAR", async function () {
        for (const name of Object.keys(ORACLES)) {
            const { tokenA, tokenB } = ORACLES[name].validPairHbar;
            const tokenABalanceBefore = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenA
            });
            const tokenBBalanceBefore = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenB
            });
            const tokenBBalanceFeeBefore = await hre.run('get-balance', {
                userAddress: feeAccount.id.toSolidityAddress(),
                tokenAddress: tokenB
            });
            const slippageTolerance = 0.025;
            const { rate } = await hre.run('get-rate-oracle', {
                name,
                address: ORACLES[name].address,
                tokenA: tokenA === ethers.constants.AddressZero ? ORACLES[name].whbarToken : tokenA,
                tokenB: tokenB === ethers.constants.AddressZero ? ORACLES[name].whbarToken : tokenB,
            });

            const amountTo = hre.ethers.BigNumber.from(100000000);
            const amountFrom = amountTo.mul(rate).div(hre.ethers.BigNumber.from(10).pow(18)).mul(1000 + slippageTolerance * 1000 + feeRate * 1000).div(1000);

            await hre.run("call-exchange", {
                client,
                clientAccount,
                exchangeAddress,
                tokenFrom: tokenB,
                tokenTo: tokenA,
                amountFrom,
                amountTo,
                aggregatorId: ORACLES[name].aggregatorId,
                feeOnTransfer: true,
                gasLimit: GAS_LIMITS.tokenToExactHBAR,
            });


            const tokenABalanceAfter = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenA
            });
            const tokenBBalanceAfter = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenB
            });
            const tokenBBalanceFeeAfter = await hre.run('get-balance', {
                userAddress: feeAccount.id.toSolidityAddress(),
                tokenAddress: tokenB
            });

            expect(tokenBBalanceAfter).to.be.greaterThan(tokenBBalanceBefore.sub(amountFrom));
            expect(tokenBBalanceAfter).to.be.lessThanOrEqual(tokenBBalanceBefore.sub(amountTo.mul(rate).div(hre.ethers.BigNumber.from(10).pow(18)).mul(1000 + feeRate * 1000).div(1000)));
            //TODO: -fee
            // expect(tokenBBalanceAfter).to.be.equal(tokenBBalanceBefore.sub(amountTo));
            expect(tokenBBalanceFeeAfter.sub(tokenBBalanceFeeBefore.add(amountFrom.mul(feeRate * 1000).div(1000))).abs()).to.be.lessThanOrEqual(100);
        }
    });

    it('should be able to pause and unpause swaps by admin', async function () {
        for (const name of Object.keys(ORACLES)) {
            const { tokenA, tokenB } = ORACLES[name].validPair;
            const tokenABalanceBefore = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenA
            });

            await hre.run('set-exchange-paused', { exchangeAddress, paused: true });

            const slippageTolerance = 0.025;
            const { rate } = await hre.run('get-rate-oracle', {
                name,
                address: ORACLES[name].address,
                tokenA,
                tokenB,
            });

            const amountFrom = hre.ethers.BigNumber.from(100000000);
            const amountTo = amountFrom.mul(rate).div(hre.ethers.BigNumber.from(10).pow(18)).mul(1000 - slippageTolerance * 1000 - feeRate * 1000).div(1000);

            try {
                await hre.run("call-exchange", {
                    client,
                    clientAccount,
                    exchangeAddress,
                    tokenFrom: tokenA,
                    tokenTo: tokenB,
                    amountFrom,
                    amountTo,
                    aggregatorId: ORACLES[name].aggregatorId,
                    feeOnTransfer: false,
                    gasLimit: GAS_LIMITS.exactTokenToToken,
                });
                expect(true).to.be.equal(false);
            } catch (err) {
                expect(err.reason).to.be.equal('transaction failed');
            }

            const tokenABalancePaused = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenA
            });

            expect(tokenABalancePaused).to.be.equal(tokenABalanceBefore);

            await hre.run('set-exchange-paused', { exchangeAddress, paused: false });

            await hre.run("call-exchange", {
                client,
                clientAccount,
                exchangeAddress,
                tokenFrom: tokenA,
                tokenTo: tokenB,
                amountFrom,
                amountTo,
                aggregatorId: ORACLES[name].aggregatorId,
                feeOnTransfer: false,
                gasLimit: GAS_LIMITS.exactTokenToToken,
            });

            const tokenABalanceAfter = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenA
            });

            expect(tokenABalanceAfter).to.be.equal(tokenABalanceBefore.sub(amountFrom));
        }
    });

    it("should be able to exchange split order exact tokens to tokens", async function () {
        for (const name of Object.keys(ORACLES)) {
            const { tokenA, tokenB } = ORACLES[name].validPair;
            const tokenABalanceBefore = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenA
            });
            const tokenBBalanceBefore = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenB
            });
            const tokenABalanceFeeBefore = await hre.run('get-balance', {
                userAddress: feeAccount.id.toSolidityAddress(),
                tokenAddress: tokenA
            });
            const slippageTolerance = 0.025;
            const { rate } = await hre.run('get-rate-oracle', {
                name,
                address: ORACLES[name].address,
                tokenA,
                tokenB,
            });

            const amountFrom = hre.ethers.BigNumber.from(100000000);
            const amountTo = amountFrom.mul(rate).div(hre.ethers.BigNumber.from(10).pow(18)).mul(1000 - slippageTolerance * 1000 - feeRate * 1000).div(1000);

            await hre.run("call-exchange", {
                client,
                clientAccount,
                exchangeAddress,
                tokenFrom: tokenA,
                tokenTo: tokenB,
                amountFrom: [amountFrom.div(4), amountFrom.div(4).mul(3)],
                amountTo: [amountTo.div(4), amountTo.div(4).mul(3)],
                aggregatorId: [ORACLES[name].aggregatorId, ORACLES[name].aggregatorId],
                feeOnTransfer: false,
                gasLimit: GAS_LIMITS.exactTokenToToken * 2,
            });

            const tokenABalanceAfter = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenA
            });
            const tokenBBalanceAfter = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenB
            });
            const tokenABalanceFeeAfter = await hre.run('get-balance', {
                userAddress: feeAccount.id.toSolidityAddress(),
                tokenAddress: tokenA
            });

            expect(tokenABalanceAfter).to.be.equal(tokenABalanceBefore.sub(amountFrom));
            expect(tokenBBalanceAfter).to.be.greaterThan(tokenBBalanceBefore.add(amountTo));
            expect(tokenBBalanceAfter).to.be.lessThanOrEqual(tokenBBalanceBefore.add(amountFrom.mul(rate).div(hre.ethers.BigNumber.from(10).pow(18)).mul((1 - feeRate) * 1000).div(1000)));
            expect(tokenABalanceFeeAfter.sub(tokenABalanceFeeBefore.add(amountFrom.mul(feeRate * 1000).div(1000))).abs()).to.be.lessThanOrEqual(100);
        }
    });


    it("should be able to exchange split order exact tokens to HBAR", async function () {
        for (const name of Object.keys(ORACLES)) {
            const { tokenA, tokenB } = ORACLES[name].validPairHbar;
            const tokenABalanceBefore = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenA
            });
            const tokenBBalanceBefore = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenB
            });
            const tokenBBalanceFeeBefore = await hre.run('get-balance', {
                userAddress: feeAccount.id.toSolidityAddress(),
                tokenAddress: tokenB
            });
            const slippageTolerance = 0.025;
            const { rate } = await hre.run('get-rate-oracle', {
                name,
                address: ORACLES[name].address,
                tokenA: tokenB === ethers.constants.AddressZero ? ORACLES[name].whbarToken : tokenB,
                tokenB: tokenA === ethers.constants.AddressZero ? ORACLES[name].whbarToken : tokenA,
            });

            const amountFrom = hre.ethers.BigNumber.from(100000);
            const amountTo = amountFrom.mul(rate).div(hre.ethers.BigNumber.from(10).pow(18)).mul(1000 - slippageTolerance * 1000 - feeRate * 1000).div(1000);

            await hre.run("call-exchange", {
                client,
                clientAccount,
                exchangeAddress,
                tokenFrom: tokenB,
                tokenTo: tokenA,
                amountFrom: [amountFrom.div(4), amountFrom.div(2), amountFrom.div(4)],
                amountTo: [amountTo.div(4), amountTo.div(2), amountTo.div(4)],
                aggregatorId: [ORACLES[name].aggregatorId, ORACLES[name].aggregatorId, ORACLES[name].aggregatorId],
                feeOnTransfer: false,
                gasLimit: GAS_LIMITS.exactTokenToHBAR * 3,
            });

            const tokenABalanceAfter = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenA
            });
            const tokenBBalanceAfter = await hre.run('get-balance', {
                userAddress: AccountId.fromString(clientAccount.id).toSolidityAddress(),
                tokenAddress: tokenB
            });
            const tokenBBalanceFeeAfter = await hre.run('get-balance', {
                userAddress: feeAccount.id.toSolidityAddress(),
                tokenAddress: tokenB
            });

            expect(tokenBBalanceAfter).to.be.equal(tokenBBalanceBefore.sub(amountFrom));
            // TODO: -gas
            // expect(tokenABalanceAfter).to.be.greaterThan(tokenABalanceBefore.add(amountTo));
            expect(tokenABalanceAfter).to.be.lessThanOrEqual(tokenABalanceBefore.add(amountFrom.mul(rate).div(hre.ethers.BigNumber.from(10).pow(18)).mul((1 - feeRate) * 1000).div(1000)));
            expect(tokenBBalanceFeeAfter.sub(tokenBBalanceFeeBefore.add(amountFrom.mul(feeRate * 1000).div(1000))).abs()).to.be.lessThanOrEqual(100);
        }
    });

});
