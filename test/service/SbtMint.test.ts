import { ILogObj, Logger } from "tslog";
import {
	SbtMintContractCallFailure,
	SbtMintChainQueryFailure,
	SbtMintImpl,
	SbtMintSigningFailure,
	SbtMintSubmissionFailure,
	SbtMintStateSavingFailure,
} from "../../src/service/SbtMint.js";
import * as MultiBaas from "@curvegrid/multibaas-sdk";
import * as ethers from "ethers";
import { Clock } from "../../src/service/Clock.js";
import { TransactionRepo } from "../../src/repo/TransactionRepo.js";

class ContractsApiMock extends MultiBaas.ContractsApi {
	callContractFunction = jest.fn();
}

class ChainsApiMock extends MultiBaas.ChainsApi {
	getChainStatus = jest.fn();
	submitSignedTransaction = jest.fn();
}

class TransactionRepoMock implements TransactionRepo {
	save = jest.fn();
	get = jest.fn();
	getAllPending = jest.fn();
}

class WalletMock extends ethers.Wallet {
	signTransaction = jest.fn();
}

class ClockMock implements Clock {
	getCurrentTime = jest.fn();
}

const validAddress = "0x269e1D5d79760B061E3082C9605cD39E0Ece3a4A";
const bogusKey =
	"1111111111111111111111111111111111111111111111111111111111111111";
const validTxHash =
	"0x3cbc6345a67a276f3ba132b8655dcebd0ca249b5c9b77fc6361f3ae89bd0a928";

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

type TestContext = {
	contractsApiMock: ContractsApiMock;
	chainsApiMock: ChainsApiMock;
	transactionRepo: TransactionRepoMock;
	clock: ClockMock;
	walletMock: WalletMock;
	hiddenLogger: Logger<ILogObj>;
	sbtMint: SbtMintImpl;
};

function testFixture(name: string, fn: (ctx: TestContext) => Promise<void>) {
	test(name, async () => {
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
		chainsApiMock.getChainStatus.mockResolvedValue({
			data: {
				result: {
					chainID: 1,
				},
			},
		});
		chainsApiMock.submitSignedTransaction.mockResolvedValue({
			data: {
				result: {
					tx: {
						hash: validTxHash,
					},
				},
			},
		});

		const transactionRepo = new TransactionRepoMock();
		transactionRepo.save.mockResolvedValue(undefined);

		const clock = new ClockMock();
		clock.getCurrentTime.mockResolvedValue(
			new Date("2025-01-01T00:00:00Z"),
		);

		const walletMock = new WalletMock(bogusKey);
		walletMock.signTransaction.mockResolvedValue(validTxHash);

		const hiddenLogger = new Logger<ILogObj>({ type: "hidden" });

		const sbtMint = new SbtMintImpl(
			contractsApiMock,
			chainsApiMock,
			transactionRepo,
			clock,
			walletMock,
			"ethereum",
			hiddenLogger,
		);
		await fn({
			contractsApiMock,
			chainsApiMock,
			transactionRepo,
			clock,
			walletMock,
			hiddenLogger,
			sbtMint,
		});
	});
}

describe("SbtMint.startMinting", () => {
	testFixture("throws an error if the contract call fails", async (ctx) => {
		ctx.contractsApiMock.callContractFunction.mockRejectedValue(
			new Error("Contract call failed"),
		);
		await expect(ctx.sbtMint.startMinting(validAddress)).rejects.toThrow(
			SbtMintContractCallFailure,
		);
	});

	testFixture("throws an error if the chain query fails", async (ctx) => {
		ctx.contractsApiMock.callContractFunction.mockResolvedValue({
			data: {
				result: {
					kind: "TransactionToSignResponse",
					tx: makeDummyTxToSign(),
				},
			},
		});
		ctx.chainsApiMock.getChainStatus.mockRejectedValue(
			new Error("Chain query failed"),
		);

		await expect(ctx.sbtMint.startMinting(validAddress)).rejects.toThrow(
			SbtMintChainQueryFailure,
		);
	});

	testFixture("throws an error if transaction signing fails", async (ctx) => {
		ctx.walletMock.signTransaction.mockRejectedValue(
			new Error("Signing failed"),
		);

		await expect(ctx.sbtMint.startMinting(validAddress)).rejects.toThrow(
			SbtMintSigningFailure,
		);
	});

	testFixture(
		"throws an error if transaction submission fails",
		async (ctx) => {
			ctx.chainsApiMock.submitSignedTransaction.mockRejectedValue(
				new Error("Submission failed"),
			);

			await expect(
				ctx.sbtMint.startMinting(validAddress),
			).rejects.toThrow(SbtMintSubmissionFailure);
		},
	);

	testFixture(
		"throws an error if transaction state saving fails",
		async (ctx) => {
			ctx.transactionRepo.save.mockRejectedValue(
				new Error("Saving failed"),
			);
			await expect(
				ctx.sbtMint.startMinting(validAddress),
			).rejects.toThrow(SbtMintStateSavingFailure);
		},
	);

	testFixture(
		"saves submitted pending transaction hash to the transaction repo",
		async (ctx) => {
			const txHash = validTxHash;
			const submissionTime = new Date("2025-01-01T00:00:00Z");
			ctx.walletMock.signTransaction.mockResolvedValue(txHash);
			ctx.clock.getCurrentTime.mockReturnValue(submissionTime);

			const mintedTxHash = await ctx.sbtMint.startMinting(validAddress);

			expect(mintedTxHash).toEqual(txHash);
			expect(ctx.transactionRepo.save).toHaveBeenCalledWith({
				hash: txHash,
				status: "pending",
				submissionTime,
			});
		},
	);
});
