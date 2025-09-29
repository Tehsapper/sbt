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

/**
 * Returns JSON encoded in base64 data URL with JSON MIME type.
 *
 * @returns JSON or null if tokenUri is not a data URL with JSON MIME type and base64 encoding.
 */
export function parseTokenDataFrom(
	tokenUri: string | null,
): { tokenData: any } | null {
	if (!tokenUri) {
		return null;
	}
	if (tokenUri.startsWith("data:application/json;base64,")) {
		return {
			tokenData: JSON.parse(
				Buffer.from(tokenUri.slice(29), "base64").toString("utf-8"),
			),
		};
	}
	return null;
}
