import * as MultiBaas from "@curvegrid/multibaas-sdk";
import { isAxiosError } from "axios";
import { ethers } from "ethers";
import { ILogObj, Logger } from "tslog";
import { Clock } from "./Clock.js";
import {
	EthereumTransaction,
	EthereumTransactionHash,
} from "../domain/EthereumTransaction.js";
import { EthereumAddress } from "../domain/EthereumAddress.js";
import { numberFromHexString } from "../core.js";
import { MintedSbt } from "../domain/MintedSbt.js";
import { SbtRepo } from "../repo/SbtRepo.js";

type SignedTransaction = string;

export class SbtMintError extends Error {
	constructor(message: string, cause?: unknown) {
		super(message);
		this.cause = cause;
	}
}

export class SbtMintContractCallError extends SbtMintError {
	constructor(message: string, cause?: unknown) {
		super(message, cause);
	}
}

export class SbtMintChainQueryError extends SbtMintError {
	constructor(message: string, cause: unknown) {
		super(message, cause);
	}
}

export class SbtMintSigningError extends SbtMintError {
	constructor(message: string, cause: unknown) {
		super(message, cause);
	}
}

export class SbtMintSubmissionError extends SbtMintError {
	constructor(message: string, cause: unknown) {
		super(message, cause);
	}
}

export class SbtMintStateSavingError extends SbtMintError {
	constructor(message: string, cause?: unknown) {
		super(message, cause);
	}
}

export class SbtMintStateQueryError extends SbtMintError {
	constructor(message: string, cause?: unknown) {
		super(message, cause);
	}
}

export interface SbtMint {
	startMinting(to: EthereumAddress): Promise<EthereumTransactionHash>;
	getSbt(txHash: EthereumTransactionHash): Promise<MintedSbt>;
}

export class SbtMintImpl implements SbtMint {
	private contractsApi: MultiBaas.ContractsApi;
	private chainsApi: MultiBaas.ChainsApi;
	private sbtRepo: SbtRepo;
	private clock: Clock;
	private wallet: ethers.Wallet;
	private chain: MultiBaas.ChainName;
	private logger: Logger<ILogObj>;

	constructor(
		contractsApi: MultiBaas.ContractsApi,
		chainsApi: MultiBaas.ChainsApi,
		sbtRepo: SbtRepo,
		clock: Clock,
		wallet: ethers.Wallet,
		logger: Logger<ILogObj>,
		chain: MultiBaas.ChainName = MultiBaas.ChainName.Ethereum,
	) {
		this.contractsApi = contractsApi;
		this.chainsApi = chainsApi;
		this.sbtRepo = sbtRepo;
		this.clock = clock;
		this.wallet = wallet;
		this.chain = chain;
		this.logger = logger;
	}

	/**
	 * Start soul-bound token (SBT) minting by making a transaction.
	 * @param to SBT receiver Ethereum address.
	 * @returns submitted minting transaction hash.
	 */
	async startMinting(to: EthereumAddress): Promise<EthereumTransactionHash> {
		this.logger.info("Starting minting SBT", { to });
		const txToSign = await this.makeSbtMintTx(this.wallet.address, to);
		const signedTx = await this.signTx(txToSign);
		const submittedTx = await this.sendSignedTx(signedTx);
		await this.saveSbtState({
			txHash: submittedTx.hash,
			from: this.wallet.address,
			to,
			tokenId: null,
			tokenUri: null,
			createdAt: submittedTx.submittedAt,
			issuedAt: null,
			updatedAt: submittedTx.updatedAt,
			status: "pending",
		});
		return submittedTx.hash;
	}

	async getSbt(txHash: EthereumTransactionHash): Promise<MintedSbt> {
		const tx = await this.sbtRepo.get(txHash);
		if (!tx) {
			throw new SbtMintStateQueryError(
				`SBT transaction ${txHash} not found`,
			);
		}
		return tx;
	}

	private async makeSbtMintTx(
		from: EthereumAddress,
		to: EthereumAddress,
	): Promise<MultiBaas.TransactionToSignTx> {
		const deployedAddressOrAlias = "sbt";
		const contractLabel = "sbt";
		const contractMethod = "safeMint";
		const burnAuth = "2"; // gas can be burned by both issuer and receiver
		const payload: MultiBaas.PostMethodArgs = {
			args: [to, burnAuth],
			from: from,
		};

		try {
			const response = await this.contractsApi.callContractFunction(
				this.chain,
				deployedAddressOrAlias,
				contractLabel,
				contractMethod,
				payload,
			);
			const result = response.data.result;
			this.logger.info(
				`${contractMethod} contract call result:\n`,
				result,
			);
			if (result.kind !== "TransactionToSignResponse") {
				throw new SbtMintContractCallError(
					"Expected TransactionToSignResponse, got " + result.kind,
				);
			}
			return result.tx;
		} catch (e) {
			if (isAxiosError(e)) {
				throw new SbtMintContractCallError(
					`MultiBaas contract call API failed with status code '${e.response?.data.status}' and message: ${e.response?.data.message}`,
					e,
				);
			}
			throw new SbtMintContractCallError(
				"Failed to call contract function",
				e,
			);
		}
	}

	private async getChainId(): Promise<number> {
		try {
			// TODO: check if this can be cached
			const response = await this.chainsApi.getChainStatus(this.chain);
			return response.data.result.chainID;
		} catch (e) {
			throw new SbtMintChainQueryError("Failed to get chain status", e);
		}
	}

	private async signTx(
		tx: MultiBaas.TransactionToSignTx,
	): Promise<SignedTransaction> {
		const chainId = await this.getChainId();
		this.logger.info("Signing transaction", { tx, chainId });
		const formattedTx = {
			to: tx.to,
			from: tx.from,
			nonce: tx.nonce,
			data: tx.data,
			value: tx.value,
			gasLimit: tx.gas,
			maxFeePerGas: tx.gasFeeCap,
			maxPriorityFeePerGas: tx.gasTipCap,
			type: tx.type,
			chainId: chainId,
		};

		try {
			const signedTx = await this.wallet.signTransaction(formattedTx);
			this.logger.info("Transaction signed", { signedTx });
			return signedTx;
		} catch (e) {
			throw new SbtMintSigningError("Failed to sign transaction", e);
		}
	}

	private async sendSignedTx(
		signedTx: SignedTransaction,
	): Promise<EthereumTransaction> {
		try {
			const response = await this.chainsApi.submitSignedTransaction(
				this.chain,
				{
					signedTx,
				},
			);
			const result = response.data.result;
			const tx = result.tx;
			const submissionTime = this.clock.getCurrentTime();
			this.logger.info("Transaction submitted", { result });

			// TODO: validate MultiBaas API response
			return {
				hash: result.tx.hash,
				status: "pending",
				from: tx.from ?? null, // for some reason the API returns null here, even though "from" is known at signature time.
				to: tx.to as EthereumAddress,
				value: numberFromHexString(tx.value ?? "0x0"),
				nonce: numberFromHexString(tx.nonce ?? "0x0"),
				gasLimit: numberFromHexString(tx.gas ?? "0x0"),
				blockNumber: null,
				submittedAt: submissionTime,
				updatedAt: submissionTime,
			};
		} catch (e) {
			throw new SbtMintSubmissionError(
				"Failed to submit signed transaction",
				e,
			);
		}
	}

	private async saveSbtState(sbt: MintedSbt) {
		try {
			await this.sbtRepo.create(sbt);
			this.logger.info("Pending SBT state saved", {
				sbt,
			});
		} catch (e) {
			throw new SbtMintStateSavingError("Failed to save SBT state", e);
		}
	}
}
