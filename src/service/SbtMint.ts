import * as MultiBaas from "@curvegrid/multibaas-sdk";
import { isAxiosError } from "axios";
import { ethers } from "ethers";
import { EthereumAddress, TransactionHash, TransactionState } from "../core.js";
import { ILogObj, Logger } from "tslog";
import { TransactionRepo } from "../repo/TransactionRepo.js";
import { Clock } from "./Clock.js";

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
	startMinting(to: EthereumAddress): Promise<TransactionHash>;
	getSbtState(txHash: TransactionHash): Promise<TransactionState>;
}

export class SbtMintImpl implements SbtMint {
	private contractsApi: MultiBaas.ContractsApi;
	private chainsApi: MultiBaas.ChainsApi;
	private transactionRepo: TransactionRepo;
	private clock: Clock;
	private wallet: ethers.Wallet;
	private chain: MultiBaas.ChainName;
	private logger: Logger<ILogObj>;

	constructor(
		contractsApi: MultiBaas.ContractsApi,
		chainsApi: MultiBaas.ChainsApi,
		transactionRepo: TransactionRepo,
		clock: Clock,
		wallet: ethers.Wallet,
		logger: Logger<ILogObj>,
		chain: MultiBaas.ChainName = MultiBaas.ChainName.Ethereum,
	) {
		this.contractsApi = contractsApi;
		this.chainsApi = chainsApi;
		this.transactionRepo = transactionRepo;
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
	async startMinting(to: EthereumAddress): Promise<TransactionHash> {
		this.logger.info("Starting minting SBT", { to });
		const tx = await this.makeSbtMintTx(this.wallet.address, to);
		const signedTx = await this.signTx(tx);
		const txHash = await this.sendSignedTx(signedTx);
		await this.saveTxState(txHash);
		return txHash;
	}

	async getSbtState(txHash: TransactionHash): Promise<TransactionState> {
		const tx = await this.transactionRepo.get(txHash);
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
	): Promise<TransactionHash> {
		try {
			const response = await this.chainsApi.submitSignedTransaction(
				this.chain,
				{
					signedTx,
				},
			);
			const result = response.data.result;
			this.logger.info("Transaction submitted", { result });
			return result.tx.hash;
		} catch (e) {
			throw new SbtMintSubmissionError(
				"Failed to submit signed transaction",
				e,
			);
		}
	}

	private async saveTxState(txHash: TransactionHash) {
		try {
			const submissionTime = this.clock.getCurrentTime();
			await this.transactionRepo.create({
				hash: txHash,
				status: "pending",
				submissionTime,
			});
			this.logger.info("Pending SBT transaction state saved", {
				txHash,
				submissionTime,
			});
		} catch (e) {
			throw new SbtMintStateSavingError(
				"Failed to save transaction state",
				e,
			);
		}
	}
}
