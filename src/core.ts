import { ethers } from "ethers";
import { isAxiosError } from "axios";
import { EthereumAddress } from "./domain/EthereumAddress.js";
import { EthereumTransactionHash } from "./domain/EthereumTransaction.js";

/**
 * Checks if a string is a valid Ethereum transaction hash.
 *
 * @returns hash itself if valid, null otherwise.
 */
export function ethereumTxHashFrom(
	rawHash: string,
): EthereumTransactionHash | null {
	if (!ethers.isHexString(rawHash, 32)) {
		return null;
	}
	return rawHash as EthereumTransactionHash;
}

/**
 * Checks if a string is a valid Ethereum address.
 *
 * @returns address itself if valid, null otherwise.
 */
export function ethereumAddressFrom(
	rawAddress: string,
): EthereumAddress | null {
	try {
		return ethers.getAddress(rawAddress);
	} catch (error) {
		return null;
	}
}

/**
 * Returns true if a signature is valid for a message and Ethereum address.
 */
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

/**
 * Returns slimmer error object for logging.
 */
export function slimError(
	error: unknown,
	maxDepth: number = 5,
	depth: number = 0,
): any {
	if (!error) return error;
	if (isAxiosError(error)) {
		// Axios errors are objects with a lot of properties
		return {
			status: error.response?.status,
			body: error.response?.data,
			message: error.message,
		};
	}
	if (error instanceof Error) {
		// This avoids infinite recursion for errors with circular references
		const newCause =
			depth < maxDepth
				? slimError(error.cause, maxDepth, depth + 1)
				: "...truncated...";
		return {
			message: error.message,
			cause: newCause,
		};
	}
	return error;
}
