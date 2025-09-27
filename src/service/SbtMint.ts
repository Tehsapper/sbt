import * as MultiBaas from "@curvegrid/multibaas-sdk";
import { isAxiosError } from "axios";
import { ethers } from "ethers";
import { EthereumAddress, TransactionHash } from "../core.js";
import { ILogObj, Logger } from "tslog";
import { TransactionRepo } from "../repo/TransactionRepo.js";

type SignedTransaction = string;

export class SbtMintFailure extends Error {
	constructor(message: string, cause?: unknown) {
		super(message);
		this.cause = cause;
	}
}

export class SbtMintContractCallFailure extends SbtMintFailure {
	constructor(message: string, cause?: unknown) {
		super(message, cause);
	}
}

export class SbtMintChainQueryFailure extends SbtMintFailure {
	constructor(message: string, cause?: unknown) {
		super(message, cause);
	}
}

export class SbtMintSigningFailure extends SbtMintFailure {
	constructor(message: string, cause?: unknown) {
		super(message, cause);
	}
}

export class SbtMintSubmissionFailure extends SbtMintFailure {
	constructor(message: string, cause?: unknown) {
		super(message, cause);
	}
}

export interface SbtMint {
	startMinting(to: EthereumAddress): Promise<TransactionHash>;
}

export class SbtMintImpl implements SbtMint {
	private contractsApi: MultiBaas.ContractsApi;
	private chainsApi: MultiBaas.ChainsApi;
	private transactionRepo: TransactionRepo;
	private wallet: ethers.Wallet;
	private chain: MultiBaas.ChainName;
	private logger: Logger<ILogObj>;

	constructor(
		contractsApi: MultiBaas.ContractsApi,
		chainsApi: MultiBaas.ChainsApi,
		transactionRepo: TransactionRepo,
		wallet: ethers.Wallet,
		chain: MultiBaas.ChainName = MultiBaas.ChainName.Ethereum,
		logger: Logger<ILogObj> = new Logger({
			name: "SbtMint",
		}),
	) {
		this.contractsApi = contractsApi;
		this.chainsApi = chainsApi;
		this.transactionRepo = transactionRepo;
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
		this.logger.info("Minting SBT transaction submitted", { txHash });
		await this.transactionRepo.save({
			hash: txHash,
			status: "pending",
			submissionTime: new Date(),
		});
		this.logger.info("Minting SBT transaction state saved", { txHash });
		return txHash;
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
				throw new SbtMintContractCallFailure(
					"Expected TransactionToSignResponse, got " + result.kind,
				);
			}
			return result.tx;
		} catch (e) {
			if (isAxiosError(e)) {
				throw new SbtMintContractCallFailure(
					`MultiBaas contract call API failed with status code '${e.response?.data.status}' and message: ${e.response?.data.message}`,
					e,
				);
			}
			throw new SbtMintContractCallFailure(
				"Failed to call contract function",
				e,
			);
		}
	}

	private async getChainId(): Promise<number> {
		try {
			// TODO: can this be cached?
			const resp = await this.chainsApi.getChainStatus(this.chain);
			return resp.data.result.chainID;
		} catch (e) {
			throw new SbtMintChainQueryFailure("Failed to get chain status", e);
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
			throw new SbtMintSigningFailure("Failed to sign transaction", e);
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
			throw new SbtMintSubmissionFailure(
				"Failed to submit signed transaction",
				e,
			);
		}
	}
}
