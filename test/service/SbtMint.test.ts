import { ILogObj, Logger } from "tslog";
import {
	SbtMintContractCallError,
	SbtMintImpl,
	SbtMintSigningError,
	SbtMintSubmissionError,
	SbtMintStateSavingError,
	SbtMintChainQueryError,
} from "../../src/service/SbtMint.js";
import * as MultiBaas from "@curvegrid/multibaas-sdk";
import * as ethers from "ethers";
import { Clock } from "../../src/service/Clock.js";
import { SbtRepo } from "../../src/repo/SbtRepo.js";

class ContractsApiMock extends MultiBaas.ContractsApi {
	callContractFunction = jest.fn();
}

class ChainsApiMock extends MultiBaas.ChainsApi {
	getChainStatus = jest.fn();
	submitSignedTransaction = jest.fn();
}

class SbtRepoMock implements SbtRepo {
	create = jest.fn();
	update = jest.fn();
	get = jest.fn();
	getAllPending = jest.fn();
	setup = jest.fn();
}

class WalletMock extends ethers.Wallet {
	signTransaction = jest.fn();
}

class ClockMock implements Clock {
	getCurrentTime = jest.fn();
}

const validAddress1 = "0x269e1D5d79760B061E3082C9605cD39E0Ece3a4A";
const validAddress2 = "0x269e1D5d79760B061E3082C9605cD39E0Ece3a4B";
const bogusKey =
	"1111111111111111111111111111111111111111111111111111111111111111";
const bogusKeyAddress = "0x19E7E376E7C213B7E7e7e46cc70A5dD086DAff2A";
const validTxHash =
	"0x3cbc6345a67a276f3ba132b8655dcebd0ca249b5c9b77fc6361f3ae89bd0a928";

function makeDummyTxToSign(): MultiBaas.TransactionToSignTx {
	return {
		to: validAddress1,
		from: validAddress2,
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
	sbtRepo: SbtRepoMock;
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
						from: validAddress1,
						to: validAddress2,
						value: "0x0",
						nonce: 0,
						gas: 0,
						gasFeeCap: "0x0",
						gasTipCap: "0x0",
						type: 0,
					},
				},
			},
		});

		const sbtRepo = new SbtRepoMock();
		sbtRepo.create.mockResolvedValue(undefined);

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
			sbtRepo,
			clock,
			walletMock,
			hiddenLogger,
			MultiBaas.ChainName.Ethereum,
		);
		await fn({
			contractsApiMock,
			chainsApiMock,
			sbtRepo,
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
		await expect(ctx.sbtMint.startMinting(validAddress1)).rejects.toThrow(
			SbtMintContractCallError,
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

		await expect(ctx.sbtMint.startMinting(validAddress1)).rejects.toThrow(
			SbtMintChainQueryError,
		);
	});

	testFixture("throws an error if transaction signing fails", async (ctx) => {
		ctx.walletMock.signTransaction.mockRejectedValue(
			new Error("Signing failed"),
		);

		await expect(ctx.sbtMint.startMinting(validAddress1)).rejects.toThrow(
			SbtMintSigningError,
		);
	});

	testFixture(
		"throws an error if transaction submission fails",
		async (ctx) => {
			ctx.chainsApiMock.submitSignedTransaction.mockRejectedValue(
				new Error("Submission failed"),
			);

			await expect(
				ctx.sbtMint.startMinting(validAddress1),
			).rejects.toThrow(SbtMintSubmissionError);
		},
	);

	testFixture("throws an error if SBT state saving fails", async (ctx) => {
		ctx.sbtRepo.create.mockRejectedValue(new Error("Saving failed"));
		await expect(ctx.sbtMint.startMinting(validAddress1)).rejects.toThrow(
			SbtMintStateSavingError,
		);
	});

	testFixture(
		"saves successfully submitted pending SBT state to the repo",
		async (ctx) => {
			const txHash = validTxHash;
			const submissionTime = new Date("2025-01-01T00:00:00Z");
			ctx.walletMock.signTransaction.mockResolvedValue(txHash);
			ctx.clock.getCurrentTime.mockReturnValue(submissionTime);
			ctx.chainsApiMock.submitSignedTransaction.mockResolvedValue({
				data: {
					result: {
						tx: {
							hash: validTxHash,
							to: validAddress1,
							value: "0x0",
							nonce: 0,
							gas: 0,
							gasFeeCap: "0x0",
							gasTipCap: "0x0",
							type: 2,
						},
					},
				},
			});

			const mintedTxHash = await ctx.sbtMint.startMinting(validAddress1);

			expect(mintedTxHash).toEqual(txHash);
			expect(ctx.sbtRepo.create).toHaveBeenCalledWith({
				txHash,
				status: "pending",
				from: bogusKeyAddress,
				to: validAddress1,
				tokenId: null,
				tokenUri: null,
				createdAt: submissionTime,
				issuedAt: null,
				updatedAt: submissionTime,
			});
		},
	);
});
