import * as MultiBaas from "@curvegrid/multibaas-sdk";
import { TransactionRepo } from "../repo/TransactionRepo.js";
import { Logger, ILogObj } from "tslog";
import {
	TransactionHash,
	TransactionState,
	TransactionStatus,
} from "../core.js";
import { isAxiosError } from "axios";

export interface TransactionChecker {
	updatePendingTransactions(): Promise<void>;
}

export class TransactionCheckerError extends Error {
	constructor(message: string, cause: unknown) {
		super(message);
		this.cause = cause;
	}
}

export class TransactionCheckerRepoRetrievalError extends TransactionCheckerError {
	constructor(message: string, cause: unknown) {
		super(message, cause);
	}
}

export class TransactionCheckerApiRetrievalError extends TransactionCheckerError {
	constructor(message: string, cause: unknown) {
		super(message, cause);
	}
}

export class TransactionCheckerRepoUpdateError extends TransactionCheckerError {
	constructor(message: string, cause: unknown) {
		super(message, cause);
	}
}

export class TransactionCheckerImpl implements TransactionChecker {
	private transactionRepo: TransactionRepo;
	private chainsApi: MultiBaas.ChainsApi;
	private logger: Logger<ILogObj>;

	constructor(
		transactionRepo: TransactionRepo,
		chainsApi: MultiBaas.ChainsApi,
		logger: Logger<ILogObj>,
	) {
		this.transactionRepo = transactionRepo;
		this.chainsApi = chainsApi;
		this.logger = logger;
	}

	async updatePendingTransactions(): Promise<void> {
		const pendingTxs = await this.getAllPendingTransactions();

		this.logger.info(
			`Got ${pendingTxs.length} pending transactions to check`,
		);

		// TODO: retrieve transactions in bulk (watch blocks instead?)
		for (const tx of pendingTxs) {
			this.logger.info("Checking pending transaction", {
				txHash: tx.hash,
			});
			const result = await this.getTransaction(tx.hash);

			// if the transaction is not found, we assume it was discarded
			// TODO: add grace period to avoid false positives
			// TODO: consider that transaction might come back
			const newStatus = result
				? result.isPending
					? "pending"
					: "confirmed"
				: "failed";

			if (tx.status !== newStatus) {
				// TODO: update changed transactions in bulk
				await this.updateTransactionStatus(tx, newStatus);
			}
		}
	}

	private async getAllPendingTransactions(): Promise<TransactionState[]> {
		try {
			const pendingTxs = await this.transactionRepo.getAllPending();
			return pendingTxs;
		} catch (error) {
			throw new TransactionCheckerRepoRetrievalError(
				"Error getting all pending transactions",
				error,
			);
		}
	}

	private async getTransaction(
		txHash: TransactionHash,
	): Promise<MultiBaas.TransactionData | null> {
		try {
			this.logger.info("Getting transaction data", { txHash });
			const response = await this.chainsApi.getTransaction(
				MultiBaas.ChainName.Ethereum,
				txHash,
			);
			const result = response.data.result;
			this.logger.info("Got transaction data", { txHash, result });
			return result;
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
			throw new TransactionCheckerApiRetrievalError(
				`Error getting transaction ${error}`,
				error,
			);
		}
	}

	private async updateTransactionStatus(
		tx: TransactionState,
		newStatus: TransactionStatus,
	): Promise<void> {
		try {
			this.logger.info("Updating transaction status", {
				txHash: tx.hash,
				oldStatus: tx.status,
				newStatus: newStatus,
			});
			await this.transactionRepo.update({ ...tx, status: newStatus });
			this.logger.info("Updated transaction status", {
				txHash: tx.hash,
				status: newStatus,
			});
		} catch (error) {
			throw new TransactionCheckerRepoUpdateError(
				"Error updating transaction status",
				error,
			);
		}
	}
}
