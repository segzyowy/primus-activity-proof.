import {
  createPublicClient,
  decodeAbiParameters,
  hexToString,
  http,
  isHex,
  keccak256,
  toBytes,
  type Address,
  type Hex
} from "viem";
import { bscTestnet } from "viem/chains";

const GITHUB_IDENTITY_PROPERTY_HEX =
  "0x0e5adf3535913ff915e7f062801a0f3a165711cb26709ec9574a9c45e091c7ff" as Hex;

const IDENTITY_PROPERTY_BY_GATEWAY_ID: Record<string, Hex> = {
  github_account_age: GITHUB_IDENTITY_PROPERTY_HEX
};

const BNB_TESTNET_IDENTITY_REGISTRY = "0x9569299A8877Bc155232cF5Aa50AF42F9Fc32C7C" as Address;

const REGISTRY_ABI = [
  {
    type: "function",
    name: "getLatestIdentityProperty",
    stateMutability: "view",
    inputs: [
      { name: "wallet", type: "address" },
      { name: "providerId", type: "bytes32" },
      { name: "identityProperty", type: "bytes32" }
    ],
    outputs: [
      { name: "timestamp", type: "uint64" },
      { name: "dataBlob", type: "bytes" }
    ]
  }
] as const;

export type PrimusAttestedResult = {
  status: "on_chain_attested";
  walletAddress: string;
  providerId: string;
  identityPropertyId: string;
  proofRequestId?: string;
};

export type GithubAttestedProfile = {
  accountEarliestYear: string;
  contributionsLastYear: string;
  registryTimestamp: string;
  registry: string;
  chainId: number;
};

export function identityPropertyToBytes32(identityPropertyId: string): Hex {
  const key = identityPropertyId.trim();
  if (isHex(key, { strict: true }) && key.length === 66) {
    if (key.toLowerCase() === GITHUB_IDENTITY_PROPERTY_HEX) {
      return GITHUB_IDENTITY_PROPERTY_HEX;
    }
    throw new Error("Primus returned a GitHub property without a reviewed decoder. Its proof reference can be shared, but no profile figures will be inferred.");
  }
  const mapped = IDENTITY_PROPERTY_BY_GATEWAY_ID[key];
  if (!mapped) {
    throw new Error("Primus returned an identity property that this app does not yet decode.");
  }
  return mapped;
}

export function providerIdToBytes32(providerId: string): Hex {
  const value = providerId.trim();
  if (isHex(value, { strict: true }) && value.length === 66) {
    return value.toLowerCase() as Hex;
  }
  if (!value) {
    throw new Error("The Primus result did not include a provider ID.");
  }
  return keccak256(toBytes(value));
}

function toIntegerString(value: unknown): string | null {
  if (typeof value === "bigint") return value.toString();
  if (typeof value === "number" && Number.isSafeInteger(value)) return String(value);
  if (typeof value === "string" && /^\d+$/.test(value.trim())) return value.trim();
  return null;
}

function decodeJsonBlob(text: string): { accountEarliestYear: string; contributionsLastYear: string } | null {
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    let record = parsed as Record<string, unknown>;
    if (record.data !== null && typeof record.data === "object" && !Array.isArray(record.data)) {
      record = record.data as Record<string, unknown>;
    }

    const year = toIntegerString(
      record.accountEarliestYear ?? record.account_earliest_year ?? record.earliestYear
    );
    const contributions = toIntegerString(
      record.contributionsLastYear ??
      record.contributions_last_year ??
      record.contributionLastYear ??
      record.lastYearContributions
    );

    return year !== null && contributions !== null
      ? { accountEarliestYear: year, contributionsLastYear: contributions }
      : null;
  } catch {
    return null;
  }
}

function decodeGithubProfileBlob(dataBlob: Hex): { accountEarliestYear: string; contributionsLastYear: string } {
  const text = hexToString(dataBlob).trim();

  if (text.startsWith("{")) {
    const decoded = decodeJsonBlob(text);
    if (decoded) return decoded;
  }

  const [profile] = decodeAbiParameters(
    [
      {
        type: "tuple",
        components: [
          { name: "accountEarliestYear", type: "uint256" },
          { name: "contributionsLastYear", type: "uint256" }
        ]
      }
    ],
    dataBlob
  );

  const year = toIntegerString(profile.accountEarliestYear);
  const contributions = toIntegerString(profile.contributionsLastYear);
  if (year === null || contributions === null) {
    throw new Error("The GitHub attestation payload did not match the documented profile schema.");
  }

  return { accountEarliestYear: year, contributionsLastYear: contributions };
}

/**
 * Reads the registry record tied to a successful Primus BNB ZKID result.
 * This implementation targets the documented BNB testnet demo registry only.
 */
export async function readGithubAttestedProfile(
  proof: PrimusAttestedResult
): Promise<GithubAttestedProfile> {
  if (proof.status !== "on_chain_attested") {
    throw new Error("A profile can only be read after Primus reports on-chain attestation.");
  }

  const identityProperty = identityPropertyToBytes32(proof.identityPropertyId);
  const providerId = providerIdToBytes32(proof.providerId);
  const rpcUrl =
    import.meta.env.VITE_BNB_TESTNET_RPC_URL?.trim() ||
    "https://bsc-testnet.publicnode.com";

  const client = createPublicClient({
    chain: bscTestnet,
    transport: http(rpcUrl)
  });

  const [timestamp, dataBlob] = await client.readContract({
    address: BNB_TESTNET_IDENTITY_REGISTRY,
    abi: REGISTRY_ABI,
    functionName: "getLatestIdentityProperty",
    args: [proof.walletAddress as Address, providerId, identityProperty]
  });

  if (!dataBlob || dataBlob === "0x") {
    throw new Error("Primus attested successfully, but no GitHub profile payload was found in the demo registry.");
  }

  const profile = decodeGithubProfileBlob(dataBlob as Hex);
  return {
    ...profile,
    registryTimestamp: timestamp.toString(),
    registry: BNB_TESTNET_IDENTITY_REGISTRY,
    chainId: bscTestnet.id
  };
}

export type ShareablePassport = {
  version: 1;
  issuer: "Primus BNB ZKID";
  title: "GitHub Builder Passport";
  status: "on_chain_attested";
  issuedAt: string;
  proofRequestId: string;
  providerId: string;
  identityPropertyId: string;
  walletAddress?: string;
  profile?: GithubAttestedProfile;
};

function encodeBase64Utf8(value: string): string {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  bytes.forEach((byte) => { binary += String.fromCharCode(byte); });
  return btoa(binary);
}

function decodeBase64Utf8(value: string): string {
  const binary = atob(value);
  const bytes = Uint8Array.from(binary, (character) => character.charCodeAt(0));
  return new TextDecoder().decode(bytes);
}

export function makePassportUrl(passport: ShareablePassport): string {
  const encoded = encodeBase64Utf8(JSON.stringify(passport));
  const url = new URL(window.location.href);
  url.hash = "passport=" + encoded;
  return url.toString();
}

export function readPassportFromUrl(): ShareablePassport | null {
  const hash = window.location.hash;
  if (!hash.startsWith("#passport=")) return null;
  try {
    const parsed: unknown = JSON.parse(decodeBase64Utf8(hash.slice("#passport=".length)));
    if (parsed === null || typeof parsed !== "object") return null;
    const value = parsed as Partial<ShareablePassport>;
    if (
      value.version !== 1 ||
      value.issuer !== "Primus BNB ZKID" ||
      value.status !== "on_chain_attested" ||
      value.title !== "GitHub Builder Passport" ||
      typeof value.proofRequestId !== "string" ||
      value.proofRequestId.trim().length === 0 ||
      typeof value.providerId !== "string" ||
      typeof value.identityPropertyId !== "string"
    ) return null;
    return value as ShareablePassport;
  } catch {
    return null;
  }
}