import { TransactionHash, TransactionStatus } from "./core";

export interface TransactionRepo {
	save(txHash: TransactionHash, status: TransactionStatus): Promise<void>;
	get(txHash: TransactionHash): Promise<TransactionStatus>;
}
