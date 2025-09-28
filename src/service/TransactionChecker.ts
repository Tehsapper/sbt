import * as MultiBaas from "@curvegrid/multibaas-sdk";
import { TransactionRepo } from "../repo/TransactionRepo.js";
import { Logger, ILogObj } from "tslog";
import {
	EthereumTransactionHash,
	EthereumTransactionStatus,
	EthereumTransaction,
} from "../domain/EthereumTransaction.js";
import { isAxiosError } from "axios";
import { Clock } from "./Clock.js";
import { ethereumAddressFrom, numberFromHexString } from "../core.js";

export interface TransactionChecker {
	updatePendingTxs(): Promise<void>;
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
	private clock: Clock;
	private discardedTxGracePeriodMs: number;
	private logger: Logger<ILogObj>;

	constructor(
		transactionRepo: TransactionRepo,
		chainsApi: MultiBaas.ChainsApi,
		clock: Clock,
		discardedTxGracePeriodSeconds: number,
		logger: Logger<ILogObj>,
	) {
		this.transactionRepo = transactionRepo;
		this.chainsApi = chainsApi;
		this.clock = clock;
		this.discardedTxGracePeriodMs = discardedTxGracePeriodSeconds * 1000;
		this.logger = logger;
	}

	async updatePendingTxs(): Promise<void> {
		const pendingTxs = await this.getAllKnownPendingTxs();

		this.logger.info(
			`Got ${pendingTxs.length} pending transactions to check`,
		);

		// TODO: retrieve transactions in bulk (watch blocks instead?)
		for (const tx of pendingTxs) {
			this.logger.info("Checking pending transaction", {
				txHash: tx.hash,
			});
			const result = await this.getTxFromBlockchain(tx.hash);
			const newStatus = this.newTxStatus(tx, result);

			if (tx.status !== newStatus) {
				// TODO: update changed transactions in bulk
				const update: Partial<EthereumTransaction> = Object.assign(
					{},
					{ status: newStatus },
					result?.blockNumber && {
						blockNumber: numberFromHexString(result.blockNumber),
					},
					result?.from && {
						from: ethereumAddressFrom(result.from),
					},
				);
				await this.updateTxState(tx, update);
			}
		}
	}

	private async getAllKnownPendingTxs(): Promise<EthereumTransaction[]> {
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

	private async getTxFromBlockchain(
		txHash: EthereumTransactionHash,
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

	private async updateTxState(
		tx: EthereumTransaction,
		update: Partial<EthereumTransaction>,
	): Promise<void> {
		try {
			const updatedAt = this.clock.getCurrentTime();
			const newTxState = {
				...tx,
				...update,
				updatedAt,
			};
			this.logger.info("Updating transaction", {
				txHash: tx.hash,
				oldTx: tx,
				newTx: newTxState,
			});
			await this.transactionRepo.update(newTxState);
			this.logger.info("Updated transaction", {
				newTx: newTxState,
			});
		} catch (error) {
			throw new TransactionCheckerRepoUpdateError(
				"Error updating transaction",
				error,
			);
		}
	}

	private newTxStatus(
		tx: EthereumTransaction,
		result: MultiBaas.TransactionData | null,
	): EthereumTransactionStatus {
		if (!result) {
			// if the transaction was not found after grace period, we assume it was discarded
			// TODO: consider that transaction might come back as zombie after being "discarded"
			const now = this.clock.getCurrentTime();
			const cutoff = new Date(
				tx.submittedAt.getTime() + this.discardedTxGracePeriodMs,
			);
			return now > cutoff ? "failed" : "pending";
		} else {
			return result.isPending ? "pending" : "confirmed";
		}
	}
}
