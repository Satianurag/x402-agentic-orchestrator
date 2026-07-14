/** Particle package.json "exports" omits "types" — shim for tsc without breaking tsx runtime. */
declare module "@particle-network/universal-account-sdk" {
  export {
    CHAIN_ID,
    SUPPORTED_TOKEN_TYPE,
    UniversalAccount,
  } from "../../node_modules/@particle-network/universal-account-sdk/dist/index";
  export type {
    EIP7702Authorization,
    ITransaction,
    IUserOpEVM,
    IUserOpWithChain,
  } from "../../node_modules/@particle-network/universal-account-sdk/dist/index";
}
