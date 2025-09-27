import { TransactionHash, TransactionState } from "../core.js";

export class InMemoryTransactionRepo {
	private transactions: Map<TransactionHash, TransactionState> = new Map();

	async save(tx: TransactionState): Promise<void> {
		this.transactions.set(tx.hash, tx);
	}

	async get(txHash: TransactionHash): Promise<TransactionState | undefined> {
		return this.transactions.get(txHash);
	}

	async getAllPending(): Promise<TransactionState[]> {
		return Array.from(this.transactions.values()).filter(
			(tx) => tx.status === "pending",
		);
	}
}
