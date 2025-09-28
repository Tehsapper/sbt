import { EthereumAddress } from "../core.js";

export type EthereumTransactionHash = string;

export type EthereumTransactionStatus = "pending" | "confirmed" | "failed";

export type EthereumTransaction = {
	hash: EthereumTransactionHash;
	from: EthereumAddress | null;
	to: EthereumAddress;
	value: number;
	nonce: number;
	gasLimit: number;
	blockNumber: number | null;
	status: EthereumTransactionStatus;
	submittedAt: Date; // TODO: use better date type
	updatedAt: Date;
};
