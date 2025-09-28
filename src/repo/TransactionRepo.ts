import { TransactionHash, TransactionState } from "../core";

export interface TransactionRepo {
	setup(): Promise<void>;
	create(tx: TransactionState): Promise<void>;
	update(tx: TransactionState): Promise<void>;
	get(txHash: TransactionHash): Promise<TransactionState | undefined>;
	getAllPending(): Promise<TransactionState[]>;
}
