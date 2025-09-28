import { EthereumAddress } from "./EthereumAddress";
import {
	EthereumTransactionHash,
	EthereumTransactionStatus,
} from "./EthereumTransaction";

export type MintedSbt = {
	txHash: EthereumTransactionHash;
	from: EthereumAddress;
	to: EthereumAddress;
	tokenId: number | null;
	tokenUri: string | null;
	createdAt: Date;
	issuedAt: Date | null;
	updatedAt: Date;
	status: EthereumTransactionStatus;
};
