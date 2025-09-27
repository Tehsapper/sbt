import * as MultiBaas from "@curvegrid/multibaas-sdk";
import { isAxiosError } from "axios";
import { ethers } from "ethers";
import { EthereumAddress, TransactionHash } from "./core";

type SignedTransaction = string;

export class SbtMint {
    private contractsApi: MultiBaas.ContractsApi;
    private chainsApi: MultiBaas.ChainsApi;
    private wallet: ethers.Wallet;
    private chain: MultiBaas.ChainName;

    constructor(
        contractsApi: MultiBaas.ContractsApi,
        chainsApi: MultiBaas.ChainsApi,
        wallet: ethers.Wallet,
        chain: MultiBaas.ChainName = MultiBaas.ChainName.Ethereum
    ) {
        this.contractsApi = contractsApi;
        this.chainsApi = chainsApi;
        this.wallet = wallet;
        this.chain = chain;
    }

    /**
     * Start soul-bound token (SBT) minting by making a transaction.
     * @param to SBT receiver Ethereum address .
     * @returns submitted minting transaction hash.
     */
    async startMinting(to: EthereumAddress): Promise<TransactionHash> {
        const tx = await this.makeSbtMintTx(this.wallet.address, to);
        const signedTx = await this.signTx(tx);
        const txHash = await this.sendSignedTx(signedTx);
        return txHash;
    }

    private async makeSbtMintTx(from: EthereumAddress, to: EthereumAddress): Promise<MultiBaas.TransactionToSignTx> {
        const deployedAddressOrAlias = "sbt";
        const contractLabel = "sbt";
        const contractMethod = "safeMint";
        const burnAuth = "2"; // gas can be burned by both issuer and receiver
        const payload: MultiBaas.PostMethodArgs = {
            args: [to, burnAuth],
            from: from,
        };
      
        try {
            const resp = await this.contractsApi.callContractFunction(this.chain, deployedAddressOrAlias, contractLabel, contractMethod, payload);
            console.log("Function call result:\n", resp.data.result);
            if (resp.data.result.kind !== "TransactionToSignResponse") {
                throw new Error("Expected TransactionToSignResponse, got " + resp.data.result.kind);
            }
                const tx = resp.data.result.tx;
                return tx;
            } catch (e) {
                if (isAxiosError(e)) {
                    console.log(`MultiBaas error with status '${e.response?.data.status}' and message: ${e.response?.data.message}`);
                } else {
                    console.log("An unexpected error occurred:", e);
                }
                throw e;
            }
      }

    private async getChainId(): Promise<number> {
        // TODO: can this be cached?
        const resp = await this.chainsApi.getChainStatus(this.chain);
        return resp.data.result.chainID;
    }

    private async signTx(tx: MultiBaas.TransactionToSignTx): Promise<SignedTransaction> {
        const chainId = await this.getChainId();
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
    
        const signedTx = await this.wallet.signTransaction(formattedTx);
        return signedTx;
    }

    private async sendSignedTx(signedTx: SignedTransaction): Promise<TransactionHash> {
        const result = await this.chainsApi.submitSignedTransaction(this.chain, {signedTx});
        return result.data.result.tx.hash;
    }
}
