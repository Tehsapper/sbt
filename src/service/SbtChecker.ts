import * as MultiBaas from "@curvegrid/multibaas-sdk";
import { Logger, ILogObj } from "tslog";
import {
	EthereumTransactionHash,
	EthereumTransactionStatus,
} from "../domain/EthereumTransaction.js";
import { Clock } from "./Clock.js";
import { EthereumAddress } from "../core.js";
import { MintedSbt } from "../domain/MintedSbt.js";
import { SbtRepo } from "../repo/SbtRepo.js";

export interface SbtChecker {
	updatePending(): Promise<void>;
}

export class SbtCheckerError extends Error {
	constructor(message: string, cause: unknown) {
		super(message);
		this.cause = cause;
	}
}

export class SbtCheckerRepoRetrievalError extends SbtCheckerError {
	constructor(message: string, cause: unknown) {
		super(message, cause);
	}
}

export class SbtCheckerApiRetrievalError extends SbtCheckerError {
	constructor(message: string, cause: unknown) {
		super(message, cause);
	}
}

export class SbtCheckerRepoUpdateError extends SbtCheckerError {
	constructor(message: string, cause: unknown) {
		super(message, cause);
	}
}

type BaseEvent = {
	txHash: EthereumTransactionHash;
	txBlock: number;
	triggeredAt: Date;
};

type SbtIssuedEvent = BaseEvent & {
	name: "Issued";
	inputs: {
		from: EthereumAddress;
		to: EthereumAddress;
		tokenId: number;
		burnAuth: number;
	};
};

type SbtTransferEvent = BaseEvent & {
	name: "Transfer";
	inputs: {
		from: EthereumAddress;
		to: EthereumAddress;
		tokenId: number;
	};
};

type SbtEvent = SbtIssuedEvent | SbtTransferEvent;

export class SbtCheckerImpl implements SbtChecker {
	private sbtRepo: SbtRepo;
	private eventsApi: MultiBaas.EventsApi;
	private contractsApi: MultiBaas.ContractsApi;
	private clock: Clock;
	private discardedTxGracePeriodMs: number;
	private logger: Logger<ILogObj>;

	constructor(
		sbtRepo: SbtRepo,
		eventsApi: MultiBaas.EventsApi,
		contractsApi: MultiBaas.ContractsApi,
		clock: Clock,
		discardedTxGracePeriodSeconds: number,
		logger: Logger<ILogObj>,
	) {
		this.sbtRepo = sbtRepo;
		this.eventsApi = eventsApi;
		this.contractsApi = contractsApi;
		this.clock = clock;
		this.discardedTxGracePeriodMs = discardedTxGracePeriodSeconds * 1000;
		this.logger = logger;
	}

	async updatePending(): Promise<void> {
		const pendingSbts = await this.getAllKnownPendingSbts();

		if (pendingSbts.length === 0) {
			this.logger.info("No pending SBTs to check");
			return;
		}

		this.logger.info(`Got ${pendingSbts.length} pending SBTs to check`);

		// TODO: Implement some kind of pagination if there is more than 50 events for this contract per poll period.
		//       or poll latest block instead of events (?)
		//       or query individual transaction receipts for their events.
		//       Unfortunately MultiBaas API documentation is lacking. It does not support pagination either.
		//       The Events Query API seems to be broken (returns empty objects).
		//
		const events = await this.checkRecentEvents({
			contractLabel: "sbt",
			limit: 50, // experimentally deduced, everything above is an "invalid request"
		});

		const issuedEventsByTxHash = events.reduce((acc, event) => {
			const txHash = event.txHash;
			if (event.name === "Issued") {
				acc.set(txHash, event);
			}
			return acc;
		}, new Map<EthereumTransactionHash, SbtIssuedEvent>());

		// TODO: retrieve transactions in bulk (watch blocks instead?)
		for (const sbt of pendingSbts) {
			this.logger.info("Checking pending SBT", {
				txHash: sbt.txHash,
			});

			const maybeIssuedEvent =
				issuedEventsByTxHash.get(sbt.txHash) ?? null;
			const newStatus = this.newSbtStatus(sbt, maybeIssuedEvent);

			if (sbt.status !== newStatus) {
				const issuedEventData = maybeIssuedEvent && {
					tokenId: maybeIssuedEvent.inputs.tokenId,
					issuedAt: maybeIssuedEvent.triggeredAt,
				};

				const tokenData = issuedEventData && {
					tokenUri: await this.getTokenUri(issuedEventData.tokenId),
				};

				// TODO: consider updating changed SBTs in a single DB transaction?
				const update: Partial<MintedSbt> = Object.assign(
					{},
					{ status: newStatus },
					issuedEventData,
					tokenData,
				);
				await this.updateSbtState(sbt, update);
			}
		}
	}

	private async getTokenUri(tokenId: number): Promise<string> {
		const chain = "ethereum";
		const deployedAddressOrAlias = "sbt";
		const contractLabel = "sbt";
		const contractMethod = "tokenURI";
		const payload: MultiBaas.PostMethodArgs = {
			args: [`${tokenId}`],
		};

		try {
			const response = await this.contractsApi.callContractFunction(
				chain,
				deployedAddressOrAlias,
				contractLabel,
				contractMethod,
				payload,
			);
			this.logger.info(
				"token URI function call result",
				response.data.result,
			);
			if (response.data.result.kind !== "MethodCallResponse") {
				throw new SbtCheckerApiRetrievalError(
					"Expected MethodCallResponse, got " +
						response.data.result.kind,
					null,
				);
			}
			return response.data.result.output as string;
		} catch (e) {
			throw new SbtCheckerApiRetrievalError(
				"Error retrieving token URI",
				e,
			);
		}
	}

	private async checkRecentEvents(
		params: Record<string, any>,
	): Promise<SbtEvent[]> {
		try {
			this.logger.info("Listing events", { params });
			const response = await this.eventsApi.listEvents(
				params.blockHash,
				params.blockNumber,
				params.txIndexInBlock,
				params.eventIndexInLog,
				params.txHash,
				params.fromConstructor,
				MultiBaas.ChainName.Ethereum,
				params.contractAddress,
				params.contractLabel,
				params.eventSignature,
				params.limit,
				params.offset,
			);
			const events = response.data.result;
			const sbtEvents = events.flatMap(sbtEventFrom);
			this.logger.info("Got events", { sbtEvents });
			return sbtEvents;
		} catch (error) {
			throw new SbtCheckerApiRetrievalError(
				"Error retrieving events",
				error,
			);
		}
	}

	private async getAllKnownPendingSbts(): Promise<MintedSbt[]> {
		try {
			return await this.sbtRepo.getAllPending();
		} catch (error) {
			throw new SbtCheckerRepoRetrievalError(
				"Error getting all pending transactions",
				error,
			);
		}
	}

	private async updateSbtState(
		sbt: MintedSbt,
		update: Partial<MintedSbt>,
	): Promise<void> {
		try {
			const updatedAt = this.clock.getCurrentTime();
			const newSbtState = {
				...sbt,
				...update,
				updatedAt,
			};
			this.logger.info("Updating SBT", {
				txHash: sbt.txHash,
				oldSbt: sbt,
				newSbt: newSbtState,
			});
			await this.sbtRepo.update(newSbtState);
			this.logger.info("Updated SBT", {
				newSbt: newSbtState,
			});
		} catch (error) {
			throw new SbtCheckerRepoUpdateError("Error updating SBT", error);
		}
	}

	private newSbtStatus(
		sbt: MintedSbt,
		maybeIssuedEvent: SbtIssuedEvent | null,
	): EthereumTransactionStatus {
		if (!maybeIssuedEvent) {
			// if no "Issued" event was found after grace period, we assume the transaction was discarded
			// TODO: consider that transaction might come back as zombie after being "discarded"
			const now = this.clock.getCurrentTime();
			const cutoff = new Date(
				sbt.createdAt.getTime() + this.discardedTxGracePeriodMs,
			);
			return now > cutoff ? "failed" : "pending";
		} else {
			return "confirmed";
		}
	}
}

// this returns an array of SbtEvent to be used with flatMap
// as JS does not have Optional support
function sbtEventFrom(e: MultiBaas.Event): SbtEvent[] {
	const rawInputs = e.event.inputs.reduce(
		(acc, input) => {
			acc[input.name] = input.value;
			return acc;
		},
		{} as Record<string, any>,
	);

	const baseEvent: BaseEvent = {
		txHash: e.transaction.txHash,
		txBlock: e.transaction.blockNumber,
		triggeredAt: new Date(e.triggeredAt),
	};

	if (e.event.name === "Issued") {
		const inputs: SbtIssuedEvent["inputs"] = {
			from: rawInputs.from,
			to: rawInputs.to,
			tokenId: parseInt(rawInputs.tokenId as string),
			burnAuth: rawInputs.burnAuth as number,
		};
		return [
			{
				...baseEvent,
				name: "Issued",
				inputs,
			},
		];
	} else if (e.event.name === "Transfer") {
		const inputs: SbtTransferEvent["inputs"] = {
			from: rawInputs.from,
			to: rawInputs.to,
			tokenId: parseInt(rawInputs.tokenId as string),
		};
		return [
			{
				...baseEvent,
				name: "Transfer",
				inputs,
			},
		];
	}
	// some other event, ignore it
	return [];
}
