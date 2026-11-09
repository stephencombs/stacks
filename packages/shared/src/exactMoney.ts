import { MinorUnits } from "@stacks/contracts";

const MAX = BigInt(Number.MAX_SAFE_INTEGER);

export const checkedMinorUnits = (amount: bigint): MinorUnits => {
  if (amount < -MAX || amount > MAX) throw new RangeError("Money exceeds safe integer minor units");
  return MinorUnits.make(Number(amount));
};
