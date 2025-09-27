import { ILogObj, Logger } from "tslog";
import { InMemoryTransactionRepo } from "../../src/repo/InMemoryTransactionRepo.js";
import {
	SbtMintContractCallFailure,
	SbtMintChainQueryFailure,
	SbtMintImpl,
} from "../../src/service/SbtMint.js";
import * as MultiBaas from "@curvegrid/multibaas-sdk";
import * as ethers from "ethers";

class ContractsApiMock extends MultiBaas.ContractsApi {
	callContractFunction = jest.fn();
}

class ChainsApiMock extends MultiBaas.ChainsApi {
	getChainStatus = jest.fn();
}

class WalletMock extends ethers.Wallet {
	signMessage = jest.fn();
}

const validAddress = "0x269e1D5d79760B061E3082C9605cD39E0Ece3a4A";
const bogusKey = "1111111111111111111111111111111111111111111111111111111111111111";

function makeDummyTxToSign(): MultiBaas.TransactionToSignTx {
    return {
        to: validAddress,
        from: validAddress,
        nonce: 0,
        data: "0x",
        value: "0x0",
        gas: 0,
        gasFeeCap: "0x0",
        gasTipCap: "0x0",
        type: 0,
    };
}

describe("SbtMint.startMinting", () => {
	test("throws an error if the contract call fails", async () => {
		const contractsApiMock = new ContractsApiMock();
		contractsApiMock.callContractFunction.mockRejectedValue(
			new Error("Contract call failed"),
		);
        const chainsApiMock = new ChainsApiMock();
		const transactionRepo = new InMemoryTransactionRepo();
		const walletMock = new WalletMock(bogusKey);
        const hiddenLogger = new Logger<ILogObj>({type: "hidden"});
		const sbtMint = new SbtMintImpl(
			contractsApiMock,
			chainsApiMock,
			transactionRepo,
			walletMock,
			"ethereum",
            hiddenLogger,
		);

		await expect(sbtMint.startMinting(validAddress)).rejects.toThrow(
			SbtMintContractCallFailure,
		);
	});

    test("throws an error if the contract call fails", async () => {
        const contractsApiMock = new ContractsApiMock();
        contractsApiMock.callContractFunction.mockRejectedValue(new Error("Contract call failed"));
        const chainsApiMock = new ChainsApiMock();
        const transactionRepo = new InMemoryTransactionRepo();
        const walletMock = new WalletMock(bogusKey);
        const hiddenLogger = new Logger<ILogObj>({type: "hidden"});
        const sbtMint = new SbtMintImpl(
            contractsApiMock,
            chainsApiMock,
            transactionRepo,
            walletMock,
            "ethereum",
            hiddenLogger,
        );
        await expect(sbtMint.startMinting(validAddress)).rejects.toThrow(
            SbtMintContractCallFailure,
        );
    });

    test("throws an error if the chain query fails", async () => {
        const contractsApiMock = new ContractsApiMock();
        contractsApiMock.callContractFunction.mockResolvedValue({
            data: {
                result: {
                    kind: "TransactionToSignResponse",
                    tx: makeDummyTxToSign(),
                },
            },
        });
        const chainsApiMock = new ChainsApiMock();
        chainsApiMock.getChainStatus.mockRejectedValue(new Error("Chain query failed"));
        const transactionRepo = new InMemoryTransactionRepo();
        const walletMock = new WalletMock(bogusKey);
        const hiddenLogger = new Logger<ILogObj>({type: "hidden"});

        const sbtMint = new SbtMintImpl(
            contractsApiMock,
            chainsApiMock,
            transactionRepo,
            walletMock,
            "ethereum",
            hiddenLogger,
        );

        await expect(sbtMint.startMinting(validAddress)).rejects.toThrow(
            SbtMintChainQueryFailure,
        );
    });
});
