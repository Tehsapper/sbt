import { ethers } from "ethers";

export class EthersSignatureVerifier {
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
