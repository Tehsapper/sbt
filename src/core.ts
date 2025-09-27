export type EthereumAddress = string;
export type TransactionHash = string;

export type TransactionStatus = "pending" | "confirmed" | "failed";

export type TransactionState = {
	status: TransactionStatus;
	hash: TransactionHash;
	submissionTime: Date;
};
