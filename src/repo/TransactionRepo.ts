import {
	EthereumTransactionHash,
	EthereumTransaction,
} from "../domain/EthereumTransaction.js";

export interface TransactionRepo {
	setup(): Promise<void>;
	create(tx: EthereumTransaction): Promise<void>;
	update(tx: EthereumTransaction): Promise<void>;
	get(txHash: EthereumTransactionHash): Promise<EthereumTransaction | null>;
	getAllPending(): Promise<EthereumTransaction[]>;
}
