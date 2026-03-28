import { Transaction } from "@iota/iota-sdk/transactions";
import type { TransactionIntentResponse } from "../notarizationApi";

export function buildTxFromIntent(intent: TransactionIntentResponse): Transaction {
  const tx = new Transaction();
  tx.moveCall({
    target: `${intent.package_id}::${intent.target_module}::${intent.target_function}`,
    arguments: intent.arguments.map((arg) => {
      if (arg.kind === "object") return tx.object(arg.object_id);
      if (arg.kind === "pure_u64") return tx.pure.u64(BigInt(arg.value));
      if (arg.kind === "pure_bool") return tx.pure.bool(arg.value);
      if (arg.kind === "pure_id") return tx.pure.address(arg.value);
      if (arg.kind === "pure_string") return tx.pure.string(arg.value);
      if (arg.kind === "pure_string_vector") return tx.pure.vector("string", arg.value);
      if (arg.kind === "pure_bytes") return tx.pure.vector("u8", arg.value.map(Number));
      if (arg.kind === "pure_bcs_bytes") return tx.pure(Uint8Array.from(arg.value));
      throw new Error(`Unknown arg kind: ${(arg as { kind?: string }).kind}`);
    }),
  });
  return tx;
}
