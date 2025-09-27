import { ethers } from "ethers";

export interface SignatureVerifier {
	verify(
		message: string,
		signature: string,
		address: string,
	): Promise<boolean>;
}

export class EthersSignatureVerifier implements SignatureVerifier {
	async verify(
		message: string,
		signature: string,
		address: string,
	): Promise<boolean> {
		const messageHash = ethers.hashMessage(message);
		const recoveredAddress = ethers.recoverAddress(messageHash, signature);
		return recoveredAddress.toLowerCase() === address.toLowerCase();
	}
}
