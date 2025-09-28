import { ethers } from "ethers";

// TODO: consider making these opaque types
export type EthereumAddress = string;
export type TransactionHash = string;

export type TransactionStatus = "pending" | "confirmed" | "failed";

export type TransactionState = {
	status: TransactionStatus;
	hash: TransactionHash;
	submissionTime: Date;
};

export function transactionHashFrom(rawHash: string): TransactionHash | null {
	if (!ethers.isHexString(rawHash, 32)) {
		return null;
	}
	return rawHash as TransactionHash;
}

export function ethereumAddressFrom(
	rawAddress: string,
): EthereumAddress | null {
	try {
		return ethers.getAddress(rawAddress);
	} catch (error) {
		return null;
	}
}

export function validSignature(
	message: string,
	signature: string,
	address: EthereumAddress,
): boolean {
	try {
		const messageHash = ethers.hashMessage(message);
		const recoveredAddress = ethers.recoverAddress(messageHash, signature);
		return recoveredAddress.toLowerCase() === address.toLowerCase();
	} catch (error) {
		return false;
	}
}

export function numberFromHexString(hexString: string): number {
	return parseInt(hexString, 16);
}
