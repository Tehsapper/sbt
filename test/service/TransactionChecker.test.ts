import { TransactionRepo } from "../../src/repo/TransactionRepo.js";
import * as MultiBaas from "@curvegrid/multibaas-sdk";
import { ILogObj, Logger } from "tslog";
import {
	TransactionChecker,
	TransactionCheckerApiRetrievalError,
	TransactionCheckerImpl,
	TransactionCheckerRepoRetrievalError,
	TransactionCheckerRepoUpdateError,
} from "../../src/service/TransactionChecker.js";
import { Clock } from "../../src/service/Clock.js";
import { EthereumTransaction } from "../../src/domain/EthereumTransaction.js";

class TransactionRepoMock implements TransactionRepo {
	create = jest.fn();
	update = jest.fn();
	get = jest.fn();
	getAllPending = jest.fn();
	setup = jest.fn();
}

class ChainsApiMock extends MultiBaas.ChainsApi {
	getTransaction = jest.fn();
}

class ClockMock implements Clock {
	getCurrentTime = jest.fn();
}

type TestContext = {
	transactionRepoMock: TransactionRepoMock;
	chainsApiMock: ChainsApiMock;
	clockMock: ClockMock;
	discardedTxGracePeriodSeconds: number;
	hiddenLogger: Logger<ILogObj>;
	transactionChecker: TransactionChecker;
};

function testFixture(name: string, fn: (ctx: TestContext) => Promise<void>) {
	test(name, async () => {
		const transactionRepoMock = new TransactionRepoMock();
		const chainsApiMock = new ChainsApiMock();
		const clockMock = new ClockMock();
		const discardedTxGracePeriodSeconds = 10;
		const hiddenLogger = new Logger<ILogObj>({ type: "hidden" });
		const transactionChecker = new TransactionCheckerImpl(
			transactionRepoMock,
			chainsApiMock,
			clockMock,
			discardedTxGracePeriodSeconds,
			hiddenLogger,
		);

		fn({
			transactionRepoMock,
			chainsApiMock,
			clockMock,
			discardedTxGracePeriodSeconds,
			hiddenLogger,
			transactionChecker,
		});
	});
}

function makePendingTx(
	required: Partial<EthereumTransaction> = {},
): EthereumTransaction {
	return {
		hash: "0x3cbc6345a67a276f3ba132b8655dcebd0ca249b5c9b77fc6361f3ae89bd0a928",
		status: "pending",
		submittedAt: new Date("2025-01-01T00:00:00Z"),
		updatedAt: new Date("2025-01-01T00:00:00Z"),
		from: "0x0000000000000000000000000000000000000001",
		to: "0x0000000000000000000000000000000000000002",
		value: 0,
		nonce: 0,
		gasLimit: 0,
		blockNumber: null,
		...required,
	};
}

function addSeconds(date: Date, seconds: number): Date {
	return new Date(date.getTime() + seconds * 1000);
}

describe("TransactionChecker.updatePendingTransactions", () => {
	testFixture(
		"throws an error if pending transactions retrieval fails",
		async (ctx) => {
			ctx.transactionRepoMock.getAllPending.mockRejectedValue(
				new Error("Repo retrieval failed"),
			);

			await expect(
				ctx.transactionChecker.updatePendingTxs(),
			).rejects.toThrow(TransactionCheckerRepoRetrievalError);
		},
	);

	testFixture(
		"throws an error if transaction status API retrieval fails",
		async (ctx) => {
			const pendingTxs = [makePendingTx()];
			ctx.transactionRepoMock.getAllPending.mockResolvedValue(pendingTxs);
			ctx.chainsApiMock.getTransaction.mockRejectedValue(
				new Error("API retrieval failed"),
			);

			await expect(
				ctx.transactionChecker.updatePendingTxs(),
			).rejects.toThrow(TransactionCheckerApiRetrievalError);
		},
	);

	testFixture(
		"throws an error if transaction status update fails",
		async (ctx) => {
			const pendingTxs = [makePendingTx()];
			ctx.transactionRepoMock.getAllPending.mockResolvedValue(pendingTxs);
			ctx.chainsApiMock.getTransaction.mockResolvedValue({
				data: {
					result: {
						isPending: false,
					},
				},
			});
			ctx.transactionRepoMock.update.mockRejectedValue(
				new Error("Repo update failed"),
			);

			await expect(
				ctx.transactionChecker.updatePendingTxs(),
			).rejects.toThrow(TransactionCheckerRepoUpdateError);
		},
	);

	testFixture(
		"does not update pending transaction status if it remains pending",
		async (ctx) => {
			const pendingTxs = [makePendingTx()];
			ctx.transactionRepoMock.getAllPending.mockResolvedValue(pendingTxs);
			ctx.chainsApiMock.getTransaction.mockResolvedValue({
				data: {
					result: {
						isPending: true,
					},
				},
			});

			await ctx.transactionChecker.updatePendingTxs();

			expect(ctx.transactionRepoMock.update).not.toHaveBeenCalled();
		},
	);

	testFixture(
		"does not update transaction status if it is missing before grace period",
		async (ctx) => {
			const pendingTx1 = makePendingTx({
				submittedAt: new Date("2025-01-01T00:00:00Z"),
			});
			const passedSeconds = ctx.discardedTxGracePeriodSeconds - 1;
			const currentTime = addSeconds(
				pendingTx1.submittedAt,
				passedSeconds,
			);
			ctx.clockMock.getCurrentTime.mockReturnValue(currentTime);
			ctx.transactionRepoMock.getAllPending.mockResolvedValue([
				pendingTx1,
			]);
			ctx.chainsApiMock.getTransaction.mockResolvedValue({
				status: 404,
				data: {
					status: 404,
				},
			});

			await ctx.transactionChecker.updatePendingTxs();

			expect(ctx.transactionRepoMock.update).not.toHaveBeenCalled();
		},
	);

	testFixture(
		"updates transaction status if it becomes confirmed",
		async (ctx) => {
			const pendingTx1 = makePendingTx();
			const pendingTxs = [pendingTx1];
			const currentTime = new Date("2025-01-01T00:00:02Z");
			ctx.transactionRepoMock.getAllPending.mockResolvedValue(pendingTxs);
			ctx.chainsApiMock.getTransaction.mockResolvedValue({
				data: {
					result: {
						isPending: false,
					},
				},
			});
			ctx.clockMock.getCurrentTime.mockReturnValue(currentTime);

			await ctx.transactionChecker.updatePendingTxs();

			expect(ctx.transactionRepoMock.update).toHaveBeenCalledWith({
				...pendingTx1,
				status: "confirmed",
				updatedAt: currentTime,
			});
		},
	);

	testFixture(
		"updates transaction status to failed if it is no longer found after grace period",
		async (ctx) => {
			const pendingTx1 = makePendingTx({
				submittedAt: new Date("2025-01-01T00:00:00Z"),
			});
			const pendingTxs = [pendingTx1];
			const passedSeconds = ctx.discardedTxGracePeriodSeconds + 1;
			const currentTime = addSeconds(
				pendingTx1.submittedAt,
				passedSeconds,
			);
			ctx.clockMock.getCurrentTime.mockReturnValue(currentTime);
			ctx.transactionRepoMock.getAllPending.mockResolvedValue(pendingTxs);
			ctx.chainsApiMock.getTransaction.mockResolvedValue({
				status: 404,
				data: {
					status: 404,
				},
			});

			await ctx.transactionChecker.updatePendingTxs();

			expect(ctx.transactionRepoMock.update).toHaveBeenCalledWith({
				...pendingTx1,
				status: "failed",
				updatedAt: currentTime,
			});
		},
	);
});
