import { ClaimController } from "../../src/controller/ClaimController.js";
import {
	BadRequestError,
	InternalServerError,
	UnauthorizedError,
} from "../../src/controller/ApiError.js";
import { SbtMint } from "../../src/service/SbtMint.js";
import { Request, Response } from "express";

class SbtMintMock implements SbtMint {
	startMinting = jest.fn();
	getSbtState = jest.fn();
}

function requestWithQueryParams(
	query: Record<string, string | string[]>,
): Request {
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
	claimController: ClaimController;
};

function testFixture(name: string, fn: (ctx: TestContext) => Promise<void>) {
	test(name, async () => {
		const sbtMintMock = new SbtMintMock();
		const claimController = new ClaimController(sbtMintMock);

		fn({
			sbtMintMock,
			claimController,
		});
	});
}

describe("ClaimController.handleClaim", () => {
	testFixture(
		"throws BadRequestError if 'to' query parameter is not provided",
		async (ctx) => {
			const req = requestWithQueryParams({});
			const res = mockResponse();

			await expect(
				ctx.claimController.handleClaim(req, res),
			).rejects.toThrow(BadRequestError);
		},
	);

	testFixture(
		"throws BadRequestError if multiple 'to' query parameters are provided",
		async (ctx) => {
			const req = requestWithQueryParams({
				to: [validAddress, validAddress],
			});
			const res = mockResponse();

			await expect(
				ctx.claimController.handleClaim(req, res),
			).rejects.toThrow(BadRequestError);
		},
	);

	testFixture(
		"throws BadRequestError if 'to' query parameter is not a valid Ethereum address",
		async (ctx) => {
			const req = requestWithQueryParams({ to: "invalid" });
			const res = mockResponse();

			await expect(
				ctx.claimController.handleClaim(req, res),
			).rejects.toThrow(BadRequestError);
		},
	);

	testFixture(
		"throws BadRequestError if 'signature' query parameter is not provided",
		async (ctx) => {
			const req = requestWithQueryParams({ to: validAddress });
			const res = mockResponse();

			await expect(
				ctx.claimController.handleClaim(req, res),
			).rejects.toThrow(BadRequestError);
		},
	);

	testFixture(
		"throws BadRequestError if multiple 'signature' query parameters are provided",
		async (ctx) => {
			const req = requestWithQueryParams({
				signature: [validSignature, validSignature],
			});
			const res = mockResponse();

			await expect(
				ctx.claimController.handleClaim(req, res),
			).rejects.toThrow(BadRequestError);
		},
	);

	testFixture(
		"throws UnauthorizedError if signature is invalid",
		async (ctx) => {
			const req = requestWithQueryParams({
				to: validAddress,
				signature: "invalid",
			});
			const res = mockResponse();

			await expect(
				ctx.claimController.handleClaim(req, res),
			).rejects.toThrow(UnauthorizedError);
		},
	);

	testFixture("throws InternalServerError if minting fails", async (ctx) => {
		ctx.sbtMintMock.startMinting.mockRejectedValue(
			new Error("Failed to start minting"),
		);

		const req = requestWithQueryParams({
			to: validAddress,
			signature: validSignature,
		});
		const res = mockResponse();

		await expect(ctx.claimController.handleClaim(req, res)).rejects.toThrow(
			InternalServerError,
		);
	});

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
