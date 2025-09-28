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
import { TransactionState } from "../../src/core.js";

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

type TestContext = {
	transactionRepoMock: TransactionRepoMock;
	chainsApiMock: ChainsApiMock;
	hiddenLogger: Logger<ILogObj>;
	transactionChecker: TransactionChecker;
};

function testFixture(name: string, fn: (ctx: TestContext) => Promise<void>) {
	test(name, async () => {
		const transactionRepoMock = new TransactionRepoMock();
		const chainsApiMock = new ChainsApiMock();
		const hiddenLogger = new Logger<ILogObj>({ type: "hidden" });
		const transactionChecker = new TransactionCheckerImpl(
			transactionRepoMock,
			chainsApiMock,
			hiddenLogger,
		);

		fn({
			transactionRepoMock,
			chainsApiMock,
			hiddenLogger,
			transactionChecker,
		});
	});
}

function makePendingTx(): TransactionState {
	return {
		hash: "0x3cbc6345a67a276f3ba132b8655dcebd0ca249b5c9b77fc6361f3ae89bd0a928",
		status: "pending",
		submissionTime: new Date("2025-01-01T00:00:00Z"),
	};
}

describe("TransactionChecker.updatePendingTransactions", () => {
	testFixture(
		"throws an error if pending transactions retrieval fails",
		async (ctx) => {
			ctx.transactionRepoMock.getAllPending.mockRejectedValue(
				new Error("Repo retrieval failed"),
			);

			await expect(
				ctx.transactionChecker.updatePendingTransactions(),
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
				ctx.transactionChecker.updatePendingTransactions(),
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
				ctx.transactionChecker.updatePendingTransactions(),
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

			await ctx.transactionChecker.updatePendingTransactions();

			expect(ctx.transactionRepoMock.update).not.toHaveBeenCalled();
		},
	);

	testFixture(
		"updates transaction status if it becomes confirmed",
		async (ctx) => {
			const pendingTx1 = makePendingTx();
			const pendingTxs = [pendingTx1];
			ctx.transactionRepoMock.getAllPending.mockResolvedValue(pendingTxs);
			ctx.chainsApiMock.getTransaction.mockResolvedValue({
				data: {
					result: {
						isPending: false,
					},
				},
			});

			await ctx.transactionChecker.updatePendingTransactions();

			expect(ctx.transactionRepoMock.update).toHaveBeenCalledWith({
				...pendingTx1,
				status: "confirmed",
			});
		},
	);

	testFixture(
		"updates transaction status to failed if it is no longer found",
		async (ctx) => {
			const pendingTx1 = makePendingTx();
			const pendingTxs = [pendingTx1];
			ctx.transactionRepoMock.getAllPending.mockResolvedValue(pendingTxs);
			ctx.chainsApiMock.getTransaction.mockResolvedValue({
				status: 404,
				data: {
					status: 404,
				},
			});

			await ctx.transactionChecker.updatePendingTransactions();

			expect(ctx.transactionRepoMock.update).toHaveBeenCalledWith({
				...pendingTx1,
				status: "failed",
			});
		},
	);
});
