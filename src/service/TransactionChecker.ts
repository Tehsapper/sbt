import * as MultiBaas from "@curvegrid/multibaas-sdk";
import { TransactionRepo } from "../repo/TransactionRepo.js";
import { Logger, ILogObj } from "tslog";
import { TransactionHash } from "../core.js";
import { isAxiosError } from "axios";

export interface TransactionChecker {
	updatePendingTransactions(): Promise<void>;
}

export class TransactionCheckerImpl implements TransactionChecker {
	private transactionRepo: TransactionRepo;
	private chainsApi: MultiBaas.ChainsApi;
	private logger: Logger<ILogObj>;

	constructor(
		transactionRepo: TransactionRepo,
		chainsApi: MultiBaas.ChainsApi,
		logger: Logger<ILogObj> = new Logger({ name: "TransactionChecker" }),
	) {
		this.transactionRepo = transactionRepo;
		this.chainsApi = chainsApi;
		this.logger = logger;
	}

	async updatePendingTransactions(): Promise<void> {
		const pendingTxs = await this.transactionRepo.getAllPending();

		this.logger.info(`Got ${pendingTxs.length} transactions to check`);

		for (const tx of pendingTxs) {
			this.logger.info("Checking transaction", { txHash: tx.hash });
			const result = await this.getTransaction(tx.hash);

			const newStatus = result
				? result.isPending
					? "pending"
					: "confirmed"
				: "failed";

			if (tx.status !== newStatus) {
				await this.transactionRepo.save({ ...tx, status: newStatus });
				this.logger.info("Updated transaction status", {
					txHash: tx.hash,
					status: newStatus,
				});
			}
		}
	}

	private async getTransaction(
		txHash: TransactionHash,
	): Promise<MultiBaas.TransactionData | null> {
		try {
			const response = await this.chainsApi.getTransaction(
				MultiBaas.ChainName.Ethereum,
				txHash,
			);
			return response.data.result;
		} catch (error) {
			if (isAxiosError(error)) {
				// MultiBaas returns 404 status code and a JSON body with "status" field set to 404
				// when the transaction is not found.
				if (
					error.response?.status === 404 &&
					error.response?.data?.status === 404
				) {
					this.logger.warn("Transaction not found", { txHash });
					return null;
				}
			}
			throw error;
		}
	}
}
