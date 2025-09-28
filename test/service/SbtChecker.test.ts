import * as MultiBaas from "@curvegrid/multibaas-sdk";
import { ILogObj, Logger } from "tslog";
import {
	SbtChecker,
	SbtCheckerApiRetrievalError,
	SbtCheckerImpl,
	SbtCheckerRepoRetrievalError,
	SbtCheckerRepoUpdateError,
} from "../../src/service/SbtChecker.js";
import { Clock } from "../../src/service/Clock.js";
import { SbtRepo } from "../../src/repo/SbtRepo.js";
import { MintedSbt } from "../../src/domain/MintedSbt.js";

class SbtRepoMock implements SbtRepo {
	create = jest.fn();
	update = jest.fn();
	get = jest.fn();
	getAllPending = jest.fn();
	setup = jest.fn();
}

class EventsApiMock extends MultiBaas.EventsApi {
	listEvents = jest.fn();
}

class ContractsApiMock extends MultiBaas.ContractsApi {
	callContractFunction = jest.fn();
}

class ClockMock implements Clock {
	getCurrentTime = jest.fn();
}

type TestContext = {
	sbtRepoMock: SbtRepoMock;
	eventsApiMock: EventsApiMock;
	contractsApiMock: ContractsApiMock;
	clockMock: ClockMock;
	discardedTxGracePeriodSeconds: number;
	hiddenLogger: Logger<ILogObj>;
	sbtChecker: SbtChecker;
};

function testFixture(name: string, fn: (ctx: TestContext) => Promise<void>) {
	test(name, async () => {
		const sbtRepoMock = new SbtRepoMock();
		const eventsApiMock = new EventsApiMock();
		const contractsApiMock = new ContractsApiMock();
		const clockMock = new ClockMock();
		const discardedTxGracePeriodSeconds = 10;
		const hiddenLogger = new Logger<ILogObj>({ type: "hidden" });
		const sbtChecker = new SbtCheckerImpl(
			sbtRepoMock,
			eventsApiMock,
			contractsApiMock,
			clockMock,
			discardedTxGracePeriodSeconds,
			hiddenLogger,
		);

		fn({
			sbtRepoMock,
			eventsApiMock,
			contractsApiMock,
			clockMock,
			discardedTxGracePeriodSeconds,
			hiddenLogger,
			sbtChecker,
		});
	});
}

const validTxHash1 =
	"0x3cbc6345a67a276f3ba132b8655dcebd0ca249b5c9b77fc6361f3ae89bd0a928";

function makePendingSbt(required: Partial<MintedSbt> = {}): MintedSbt {
	return {
		txHash: "0x3cbc6345a67a276f3ba132b8655dcebd0ca249b5c9b77fc6361f3ae89bd0a928",
		status: "pending",
		createdAt: new Date("2025-01-01T00:00:00Z"),
		updatedAt: new Date("2025-01-01T00:00:00Z"),
		from: "0x0000000000000000000000000000000000000001",
		to: "0x0000000000000000000000000000000000000002",
		tokenId: null,
		tokenUri: null,
		issuedAt: null,
		...required,
	};
}

function makeIssuedEvent(
	required: Record<string, any> = {},
): Record<string, any> {
	return {
		triggeredAt: "2025-01-01T00:00:00Z",
		transaction: {
			txHash: "0x3cbc6345a67a276f3ba132b8655dcebd0ca249b5c9b77fc6361f3ae89bd0a928",
			blockNumber: 1,
		},
		event: {
			name: "Issued",
			inputs: [
				{
					name: "from",
					value: "0x0000000000000000000000000000000000000001",
				},
				{
					name: "to",
					value: "0x0000000000000000000000000000000000000002",
				},
				{
					name: "burnAuth",
					value: "2",
				},
				{
					name: "tokenId",
					value: "1",
				},
			],
		},
		...required,
	};
}

function makeIssuedEventForToken(
	txHash: string,
	tokenId: number,
): Record<string, any> {
	return {
		triggeredAt: "2025-01-01T00:00:00Z",
		transaction: {
			txHash,
			blockNumber: 1,
		},
		event: {
			name: "Issued",
			inputs: [
				{
					name: "from",
					value: "0x0000000000000000000000000000000000000001",
				},
				{
					name: "to",
					value: "0x0000000000000000000000000000000000000002",
				},
				{
					name: "burnAuth",
					value: "2",
				},
				{
					name: "tokenId",
					value: `${tokenId}`,
				},
			],
		},
	};
}

function addSeconds(date: Date, seconds: number): Date {
	return new Date(date.getTime() + seconds * 1000);
}

describe("SbtChecker.updatePending", () => {
	testFixture(
		"throws an error if pending SBTs retrieval fails",
		async (ctx) => {
			ctx.sbtRepoMock.getAllPending.mockRejectedValue(
				new Error("Repo retrieval failed"),
			);

			await expect(ctx.sbtChecker.updatePending()).rejects.toThrow(
				SbtCheckerRepoRetrievalError,
			);
		},
	);

	testFixture(
		"throws an error if events API retrieval fails",
		async (ctx) => {
			const pendingTxs = [makePendingSbt()];
			ctx.sbtRepoMock.getAllPending.mockResolvedValue(pendingTxs);
			ctx.eventsApiMock.listEvents.mockRejectedValue(
				new Error("API retrieval failed"),
			);

			await expect(ctx.sbtChecker.updatePending()).rejects.toThrow(
				SbtCheckerApiRetrievalError,
			);
		},
	);

	testFixture("throws an error if SBT state update fails", async (ctx) => {
		const sbtTxHash = validTxHash1;
		const sbtTokenId = 1;
		const pendingSbt = makePendingSbt({ txHash: sbtTxHash });
		ctx.sbtRepoMock.getAllPending.mockResolvedValue([pendingSbt]);
		ctx.eventsApiMock.listEvents.mockResolvedValue({
			data: {
				result: [makeIssuedEventForToken(sbtTxHash, sbtTokenId)],
			},
		});
		ctx.contractsApiMock.callContractFunction.mockResolvedValue({
			data: {
				result: {
					kind: "MethodCallResponse",
					output: `https://example.com/token/${sbtTokenId}`,
				},
			},
		});
		ctx.sbtRepoMock.update.mockRejectedValue(
			new Error("Repo update failed"),
		);

		await expect(ctx.sbtChecker.updatePending()).rejects.toThrow(
			SbtCheckerRepoUpdateError,
		);
	});

	testFixture(
		"does not update SBT state if no issued event before grace period",
		async (ctx) => {
			const pendingSbt = makePendingSbt({
				createdAt: new Date("2025-01-01T00:00:00Z"),
			});
			const passedSeconds = ctx.discardedTxGracePeriodSeconds - 1;
			const currentTime = addSeconds(pendingSbt.createdAt, passedSeconds);
			ctx.clockMock.getCurrentTime.mockReturnValue(currentTime);
			ctx.sbtRepoMock.getAllPending.mockResolvedValue([pendingSbt]);
			ctx.eventsApiMock.listEvents.mockResolvedValue({
				data: {
					result: [],
				},
			});

			await ctx.sbtChecker.updatePending();

			expect(ctx.sbtRepoMock.update).not.toHaveBeenCalled();
		},
	);

	testFixture(
		"updates SBT as confirmed if it becomes issued",
		async (ctx) => {
			const sbtTxHash = validTxHash1;
			const sbtTokenId = 1;
			const pendingSbt = makePendingSbt({ txHash: sbtTxHash });
			const currentTime = new Date("2025-01-01T00:00:02Z");
			ctx.sbtRepoMock.getAllPending.mockResolvedValue([pendingSbt]);
			const issuedEvent = makeIssuedEventForToken(sbtTxHash, sbtTokenId);
			ctx.eventsApiMock.listEvents.mockResolvedValue({
				data: {
					result: [issuedEvent],
				},
			});
			ctx.contractsApiMock.callContractFunction.mockResolvedValue({
				data: {
					result: {
						kind: "MethodCallResponse",
						output: "https://example.com/token/1",
					},
				},
			});
			ctx.clockMock.getCurrentTime.mockReturnValue(currentTime);

			await ctx.sbtChecker.updatePending();

			expect(ctx.sbtRepoMock.update).toHaveBeenCalledWith({
				...pendingSbt,
				status: "confirmed",
				issuedAt: new Date(issuedEvent.triggeredAt),
				updatedAt: currentTime,
				tokenId: sbtTokenId,
				tokenUri: "https://example.com/token/1",
			});
		},
	);

	testFixture(
		"updates SBT status to failed if no issued event after grace period",
		async (ctx) => {
			const pendingSbt = makePendingSbt({
				createdAt: new Date("2025-01-01T00:00:00Z"),
			});
			const passedSeconds = ctx.discardedTxGracePeriodSeconds + 1;
			const currentTime = addSeconds(pendingSbt.createdAt, passedSeconds);
			ctx.clockMock.getCurrentTime.mockReturnValue(currentTime);
			ctx.sbtRepoMock.getAllPending.mockResolvedValue([pendingSbt]);
			ctx.eventsApiMock.listEvents.mockResolvedValue({
				data: {
					result: [],
				},
			});

			await ctx.sbtChecker.updatePending();

			expect(ctx.sbtRepoMock.update).toHaveBeenCalledWith({
				...pendingSbt,
				status: "failed",
				updatedAt: currentTime,
			});
		},
	);
});
