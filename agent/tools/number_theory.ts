import { defineTool } from "eve/tools";
import { z } from "zod";
import { describe, evaluateExpression, formatValue } from "../lib/safe-math";

/**
 * Above this, trial-division factorisation stops being instant. mathjs has no
 * fast factoriser, and since mathjs runs synchronously on the event loop a
 * slow factorisation blocks every other request. Refusing is better than
 * hanging.
 */
const MAX_OPERAND = 1e12;

export default defineTool({
  description:
    "Elementary number theory on integers: primality, prime factorisation, gcd, lcm, and modular arithmetic. Use this rather than reasoning about divisibility yourself.",
  inputSchema: z.object({
    operation: z
      .enum(["isPrime", "factorise", "gcd", "lcm", "mod"])
      .describe("Which computation to perform."),
    a: z.number().int().describe("The first (or only) integer."),
    b: z
      .number()
      .int()
      .optional()
      .describe("The second integer, for gcd, lcm and mod."),
  }),
  async execute({ operation, a, b }) {
    const needsTwo = ["gcd", "lcm", "mod"] as const;
    if ((needsTwo as readonly string[]).includes(operation) && b === undefined) {
      return {
        ok: false as const,
        error: `${operation} needs two integers, but only one was given.`,
      };
    }

    for (const value of [a, b]) {
      if (value !== undefined && Math.abs(value) > MAX_OPERAND) {
        return {
          ok: false as const,
          error: `${value} is too large for this tool (limit ${MAX_OPERAND}).`,
        };
      }
    }

    try {
      switch (operation) {
        case "isPrime": {
          const prime = isPrime(a);
          return {
            ok: true as const,
            operation,
            a,
            result: prime,
            method: prime
              ? `${a} has no divisors other than 1 and itself.`
              : `${a} has a divisor other than 1 and itself.`,
          };
        }

        case "factorise": {
          if (a < 2) {
            return {
              ok: false as const,
              error: `Prime factorisation is only defined for integers of 2 or more; ${a} was given.`,
            };
          }
          const factors = primeFactors(a);
          return {
            ok: true as const,
            operation,
            a,
            result: factors,
            // Written out so the model can quote it rather than reassemble it,
            // which would be arithmetic.
            display: factors
              .map(({ prime, exponent }) =>
                exponent === 1 ? `${prime}` : `${prime}^${exponent}`
              )
              .join(" x "),
            method: "Factorised by trial division.",
          };
        }

        case "gcd":
          return {
            ok: true as const,
            operation,
            a,
            b,
            result: formatValue(evaluateExpression(`gcd(${a}, ${b})`)),
            method: "Computed with the Euclidean algorithm.",
          };

        case "lcm":
          return {
            ok: true as const,
            operation,
            a,
            b,
            result: formatValue(evaluateExpression(`lcm(${a}, ${b})`)),
            method: "Computed from the product divided by the gcd.",
          };

        case "mod": {
          if (b === 0) {
            return {
              ok: false as const,
              error: "The modulus cannot be zero.",
            };
          }
          return {
            ok: true as const,
            operation,
            a,
            b,
            result: formatValue(evaluateExpression(`mod(${a}, ${b})`)),
            method: `The remainder after dividing ${a} by ${b}.`,
          };
        }
      }
    } catch (error) {
      return {
        ok: false as const,
        error: `That could not be computed: ${describe(error)}`,
      };
    }
  },
});

function isPrime(n: number): boolean {
  if (!Number.isInteger(n) || n < 2) return false;
  if (n % 2 === 0) return n === 2;
  if (n % 3 === 0) return n === 3;
  for (let i = 5; i * i <= n; i += 6) {
    if (n % i === 0 || n % (i + 2) === 0) return false;
  }
  return true;
}

function primeFactors(n: number): { prime: number; exponent: number }[] {
  const factors: { prime: number; exponent: number }[] = [];
  let remaining = n;

  const divideOut = (prime: number) => {
    let exponent = 0;
    while (remaining % prime === 0) {
      remaining /= prime;
      exponent++;
    }
    if (exponent > 0) factors.push({ prime, exponent });
  };

  divideOut(2);
  divideOut(3);
  for (let i = 5; i * i <= remaining; i += 6) {
    divideOut(i);
    divideOut(i + 2);
  }
  // Whatever survives is prime.
  if (remaining > 1) factors.push({ prime: remaining, exponent: 1 });

  return factors;
}
