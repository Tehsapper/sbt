import { TransactionHash, TransactionState } from "../core";

export interface TransactionRepo {
	save(tx: TransactionState): Promise<void>;
	get(txHash: TransactionHash): Promise<TransactionState | undefined>;
	getAllPending(): Promise<TransactionState[]>;
}
