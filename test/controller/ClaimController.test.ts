import { ClaimController } from "../../src/controller/ClaimController.js";
import { SbtMint } from "../../src/service/SbtMint.js";
import { Request, Response } from "express";
import { ILogObj, Logger } from "tslog";

class SbtMintMock implements SbtMint {
	startMinting = jest.fn();
}

function requestWithQueryParams(query: Record<string, string>): Request {
	return { query } as unknown as Request;
}

function mockResponse(): Response {
	const res = {
		status: jest.fn(() => res),
		json: jest.fn(() => res),
	} as unknown as Response;
	return res;
}

const validAddress = "0x269e1D5d79760B061E3082C9605cD39E0Ece3a4A";
const validSignature =
	"0x1a32da8189e96c52b1f9a1fdb8cf81ca369236fc4041f85d23fcd08eaad118e97182b8836ea2813b2c779feca296c4eae21453ef1e5f3f6705cc3845d9c549f31c";
const validTxHash =
	"0x3cbc6345a67a276f3ba132b8655dcebd0ca249b5c9b77fc6361f3ae89bd0a928";

type TestContext = {
	sbtMintMock: SbtMintMock;
	hiddenLogger: Logger<ILogObj>;
	claimController: ClaimController;
};

function testFixture(name: string, fn: (ctx: TestContext) => Promise<void>) {
	test(name, async () => {
		const sbtMintMock = new SbtMintMock();
		const hiddenLogger = new Logger<ILogObj>({ type: "hidden" });
		const claimController = new ClaimController(sbtMintMock, hiddenLogger);

		fn({
			sbtMintMock,
			hiddenLogger,
			claimController,
		});
	});
}

describe("ClaimController.handleClaim", () => {
	testFixture(
		"responds with 400 status code and JSON body with error message if 'to' query parameter is not provided",
		async (ctx) => {
			const req = requestWithQueryParams({});
			const res = mockResponse();

			await ctx.claimController.handleClaim(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({
				error: '"to" query parameter is required',
			});
		},
	);

	testFixture(
		"responds with 400 status code and JSON body with error message if 'to' query parameter is not a valid Ethereum address",
		async (ctx) => {
			const req = requestWithQueryParams({ to: "invalid" });
			const res = mockResponse();

			await ctx.claimController.handleClaim(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({
				error: '"to" query parameter is not a valid Ethereum address',
			});
		},
	);

	testFixture(
		"responds with 400 status code and JSON body with error message if 'signature' query parameter is not provided",
		async (ctx) => {
			const req = requestWithQueryParams({ to: validAddress });
			const res = mockResponse();

			await ctx.claimController.handleClaim(req, res);

			expect(res.status).toHaveBeenCalledWith(400);
			expect(res.json).toHaveBeenCalledWith({
				error: '"signature" query parameter is required',
			});
		},
	);

	testFixture(
		"responds with 401 status code and JSON body with error message if signature is invalid",
		async (ctx) => {
			const req = requestWithQueryParams({
				to: validAddress,
				signature: "invalid",
			});
			const res = mockResponse();

			await ctx.claimController.handleClaim(req, res);

			expect(res.status).toHaveBeenCalledWith(401);
			expect(res.json).toHaveBeenCalledWith({
				error: "Could not verify signature",
			});
		},
	);

	testFixture(
		"responds with 500 status code and JSON body with error message if minting fails",
		async (ctx) => {
			ctx.sbtMintMock.startMinting.mockRejectedValue(
				new Error("Failed to start minting"),
			);

			const req = requestWithQueryParams({
				to: validAddress,
				signature: validSignature,
			});
			const res = mockResponse();

			await ctx.claimController.handleClaim(req, res);

			expect(res.status).toHaveBeenCalledWith(500);
			expect(res.json).toHaveBeenCalledWith({
				error: "Failed to start minting",
			});
		},
	);

	testFixture(
		"responds with 200 status code and JSON body with result transaction hash if minting starts successfully",
		async (ctx) => {
			const submittedTxHash = validTxHash;
			ctx.sbtMintMock.startMinting.mockResolvedValue(submittedTxHash);

			const req = requestWithQueryParams({
				to: validAddress,
				signature: validSignature,
			});
			const res = mockResponse();

			await ctx.claimController.handleClaim(req, res);

			expect(res.status).toHaveBeenCalledWith(200);
			expect(res.json).toHaveBeenCalledWith({ txHash: submittedTxHash });
		},
	);
});
