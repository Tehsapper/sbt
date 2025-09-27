import { ClaimController } from "../../src/controller/ClaimController.js";
import { SbtMint } from "../../src/service/SbtMint.js";
import { EthereumAddress, TransactionHash } from "../../src/core.js";
import { Request, Response } from "express";
import { ILogObj, Logger } from "tslog";

class DummySbtMint implements SbtMint {
	private resultTxHash: TransactionHash;

	constructor(resultTxHash: TransactionHash = "0x123") {
		this.resultTxHash = resultTxHash;
	}

	async startMinting(to: EthereumAddress): Promise<TransactionHash> {
		return this.resultTxHash;
	}
}

class FailingSbtMint implements SbtMint {
	async startMinting(to: EthereumAddress): Promise<TransactionHash> {
		throw new Error("Failed to start minting");
	}
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

describe("ClaimController.handleClaim", () => {
	test("responds with 400 status code and JSON body with error message if 'to' query parameter is not provided", async () => {
		const sbtMintMock = new DummySbtMint();
		const hiddenLogger = new Logger<ILogObj>({type: "hidden"});
		const claimController = new ClaimController(sbtMintMock, hiddenLogger);

		const req = requestWithQueryParams({});
		const res = mockResponse();

		await claimController.handleClaim(req, res);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({
			error: '"to" query parameter is required',
		});
	});

	test("responds with 400 status code and JSON body with error message if 'to' query parameter is not a valid Ethereum address", async () => {
		const sbtMintMock = new DummySbtMint();
		const hiddenLogger = new Logger<ILogObj>({type: "hidden"});
		const claimController = new ClaimController(sbtMintMock, hiddenLogger);

		const req = requestWithQueryParams({ to: "invalid" });
		const res = mockResponse();

		await claimController.handleClaim(req, res);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({
			error: '"to" query parameter is not a valid Ethereum address',
		});
	});

	test("responds with 400 status code and JSON body with error message if 'signature' query parameter is not provided", async () => {
		const sbtMintMock = new DummySbtMint();
		const hiddenLogger = new Logger<ILogObj>({type: "hidden"});
		const claimController = new ClaimController(sbtMintMock, hiddenLogger);

		const req = requestWithQueryParams({ to: validAddress });
		const res = mockResponse();

		await claimController.handleClaim(req, res);

		expect(res.status).toHaveBeenCalledWith(400);
		expect(res.json).toHaveBeenCalledWith({
			error: '"signature" query parameter is required',
		});
	});

	test("responds with 401 status code and JSON body with error message if signature is invalid", async () => {
		const sbtMintMock = new DummySbtMint();
		const hiddenLogger = new Logger<ILogObj>({type: "hidden"});
		const claimController = new ClaimController(sbtMintMock, hiddenLogger);

		const req = requestWithQueryParams({
			to: validAddress,
			signature: "invalid",
		});
		const res = mockResponse();

		await claimController.handleClaim(req, res);

		expect(res.status).toHaveBeenCalledWith(401);
		expect(res.json).toHaveBeenCalledWith({
			error: "Could not verify signature",
		});
	});

	test("responds with 500 status code and JSON body with error message if minting fails", async () => {
		const sbtMintMock = new FailingSbtMint();
		const hiddenLogger = new Logger<ILogObj>({type: "hidden"});
		const claimController = new ClaimController(sbtMintMock, hiddenLogger);

		const req = requestWithQueryParams({
			to: validAddress,
			signature: validSignature,
		});
		const res = mockResponse();

		await claimController.handleClaim(req, res);

		expect(res.status).toHaveBeenCalledWith(500);
		expect(res.json).toHaveBeenCalledWith({
			error: "Failed to start minting",
		});
	});

	test("responds with 200 status code and JSON body with result transaction hash if minting starts successfully", async () => {
		const resultTxHash = "0x123";
		const sbtMintMock = new DummySbtMint(resultTxHash);
		const hiddenLogger = new Logger<ILogObj>({type: "hidden"});
		const claimController = new ClaimController(sbtMintMock, hiddenLogger);

		const req = requestWithQueryParams({
			to: validAddress,
			signature: validSignature,
		});
		const res = mockResponse();

		await claimController.handleClaim(req, res);

		expect(res.status).toHaveBeenCalledWith(200);
		expect(res.json).toHaveBeenCalledWith({ txHash: resultTxHash });
	});
});
