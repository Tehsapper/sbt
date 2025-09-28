import { EthereumTransactionHash } from "../domain/EthereumTransaction.js";
import { MintedSbt } from "../domain/MintedSbt.js";

export interface SbtRepo {
	setup(): Promise<void>;
	create(sbt: MintedSbt): Promise<void>;
	update(sbt: MintedSbt): Promise<void>;
	get(txHash: EthereumTransactionHash): Promise<MintedSbt | null>;
	getAllPending(): Promise<MintedSbt[]>;
}
