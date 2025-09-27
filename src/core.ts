import { ethers } from "ethers";

export type EthereumAddress = string;
export type TransactionHash = string;

export type TransactionStatus = "pending" | "confirmed" | "failed";

export type TransactionState = {
	status: TransactionStatus;
	hash: TransactionHash;
	submissionTime: Date;
};

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
