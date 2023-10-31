const { ethers } = require("hardhat");
const {
    ContractFunctionParameters,
    Client,
    TokenAssociateTransaction,
    PrivateKey,
    ContractCreateFlow, AccountId, Hbar, TransferTransaction, ContractExecuteTransaction,
} = require('@hashgraph/sdk');

module.exports = async ({ client, clientAccount, feeAccount, adapters }) => {
    //Assign the first signer, which comes from the first privateKey from our configuration in hardhat.config.js, to a wallet variable.
    let wallet = (await ethers.getSigners())[0];
    let allTokensToAssociate = [];

    const Exchange = await ethers.getContractFactory("Exchange", wallet);
    const exchangeTx = new ContractCreateFlow()
        .setGas(215000)
        .setAdminKey(client.operatorPublicKey)
        .setAutoRenewAccountId(clientAccount.id)
        .setBytecode(Exchange.bytecode);
    const exchangeSign = await exchangeTx.sign(PrivateKey.fromString(clientAccount.privateKey));
    const exchangeSignResponse = await exchangeSign.execute(client);
    const { contractId } = await exchangeSignResponse.getReceipt(client);
    const exchangeAddress = `0x${contractId?.toSolidityAddress()}`;
    console.log(`Exchange deployed to: ${exchangeAddress}`);

    for (let adapterInfo of adapters) {
        const Adapter = await ethers.getContractFactory(adapterInfo.contractName, wallet);
        const adapterTx = new ContractCreateFlow()
            .setGas(170000)
            .setAdminKey(client.operatorPublicKey)
            .setAutoRenewAccountId(clientAccount.id)
            .setConstructorParameters(
                new ContractFunctionParameters()
                    .addAddress(`0x${feeAccount.id.toSolidityAddress()}`)
                    .addAddress(adapterInfo.router)
                    .addUint256(5)
                    .addAddress(adapterInfo.whbarToken)
                    .addAddress(adapterInfo.whbarContract)
            )
            .setBytecode(Adapter.bytecode);
        const adapterSign = await adapterTx.sign(PrivateKey.fromString(clientAccount.privateKey));
        const adapterSignResponse = await adapterSign.execute(client);
        const { contractId } = await adapterSignResponse.getReceipt(client);
        const adapterAddress = `0x${contractId?.toSolidityAddress()}`;
        console.log(`${adapterInfo.aggregatorId} adapter deployed to: ${adapterAddress}`);

        // Associate adapter with tokens
        for (let subTokensToAssociate of adapterInfo.tokensToAssociate) {
            const assocTx = await new TokenAssociateTransaction()
                .setTokenIds(subTokensToAssociate)
                .setAccountId(AccountId.fromSolidityAddress(adapterAddress))
                .freezeWith(client);
            const assocSign = await assocTx.sign(PrivateKey.fromString(clientAccount.privateKey));
            const assocRes = await assocSign.execute(client);
            const assocReceipt = await assocRes.getReceipt(client);

            allTokensToAssociate = allTokensToAssociate.concat(subTokensToAssociate);
        }

        const exchange = await ethers.getContractAt("Exchange", exchangeAddress, wallet);
        const setAdapterTx = await exchange.setAdapter(adapterInfo.aggregatorId, adapterAddress, { gasLimit: 56000 });
        const adapterRes = await setAdapterTx.wait();

        // to remove adapter
        // if (adapterInfo.aggregatorId === 'XXXXX') {
        //   const exchange = await ethers.getContractAt("Exchange", exchangeAddress, wallet);
        // const removeAdapterTx = await exchange.removeAdapter('SaucerSwapTest', { gasLimit: 56000 });
        // await removeAdapterTx.wait();
        // }
    }

    allTokensToAssociate = allTokensToAssociate
        .filter((v, i, a) => a.indexOf(v) === i)
        .filter(v => ['0.0.1062664', '0.0.127877', '0.0.1738930', '0.0.1738807'].indexOf(v) === -1);

    // Associate exchange with tokens
    const chunkSize = 20;
    for (let i = 0; i < allTokensToAssociate.length; i += chunkSize) {
        const chunk = allTokensToAssociate.slice(i, i + chunkSize);
        const assocExchangeTx = await new TokenAssociateTransaction()
            .setTokenIds(chunk)
            .setAccountId(AccountId.fromSolidityAddress(exchangeAddress))
            .freezeWith(client);
        const assocExchangeSign = await assocExchangeTx.sign(PrivateKey.fromString(clientAccount.privateKey));
        const assocExchangeRes = await assocExchangeSign.execute(client);
        await assocExchangeRes.getReceipt(client);
    }
    console.log(`Exchange associated to all tokens.`)

    //Associate fee wallet to all tokens
    for (let i = 0; i < allTokensToAssociate.length; i += chunkSize) {
        const chunk = allTokensToAssociate.slice(i, i + chunkSize);
        const assocFeeTx = await new TokenAssociateTransaction()
            .setTokenIds(chunk)
            .setAccountId(feeAccount.id)
            .freezeWith(client);
        const assocFeeSign = await assocFeeTx.sign(feeAccount.privateKey);
        const assocFeeRes = await assocFeeSign.execute(client);
        await assocFeeRes.getReceipt(client);
    }
    console.log('Fee account associated to all tokens.');

    return { contractAddress: exchangeAddress };
};
