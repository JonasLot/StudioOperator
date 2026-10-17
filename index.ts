// Standalone Higgsfield example: one Seedance 2.5 text-to-video generation through
// the official SDK. This is a BILLABLE request. Run it with `npm run hf:example`.
//
// Credentials come from HF_CREDENTIALS ("key-id:key-secret") in .env.local or the
// process environment. They are read here, server-side, and never printed.
import {
  APIError,
  AuthenticationError,
  BadInputError,
  CredentialsMissedError,
  NotEnoughCreditsError,
  TimeoutError,
  ValidationError,
  createHiggsfieldClient,
} from "@higgsfield/client/v2";

try {
  process.loadEnvFile(".env.local");
} catch (err) {
  // A missing file is fine (the variable may already be in the environment).
  if ((err as NodeJS.ErrnoException).code !== "ENOENT") throw err;
}

const MODEL = "bytedance/seedance-2.5/text-to-video";
const INPUT = { prompt: "A cinematic scene at sunset", duration: 5, resolution: "720p", aspect_ratio: "16:9" };

function fail(message: string): never {
  console.error(`Not generated: ${message}`);
  process.exit(1);
}

async function main() {
  const credentials = process.env.HF_CREDENTIALS?.trim();
  if (!credentials) fail("HF_CREDENTIALS is not set. Add it to .env.local as key-id:key-secret.");

  const client = createHiggsfieldClient({
    credentials,
    // Optional override, e.g. for a local test server.
    ...(process.env.HF_BASE_URL ? { baseURL: process.env.HF_BASE_URL } : {}),
    // Video takes a while; the SDK default is 5 minutes.
    maxPollTime: 15 * 60 * 1000,
  });

  console.log(`Submitting ${MODEL} (${INPUT.duration}s, ${INPUT.resolution}, ${INPUT.aspect_ratio}) ...`);
  const result = await client.subscribe(MODEL, { input: INPUT, withPolling: true });

  // The SDK stops polling on completed / failed / nsfw. "canceled" is documented as a
  // terminal status too but is not in its type, so compare as a plain string.
  const status: string = result.status;
  switch (status) {
    case "completed": {
      const url = result.video?.url;
      if (!url) fail(`request ${result.request_id} completed but returned no video URL.`);
      console.log(`Video URL: ${url}`);
      return;
    }
    case "nsfw":
      return fail(`request ${result.request_id} was rejected by content moderation (credits are refunded).`);
    case "failed":
      return fail(`request ${result.request_id} failed on the provider side (credits are refunded).`);
    case "canceled":
      return fail(`request ${result.request_id} was canceled.`);
    default:
      return fail(`request ${result.request_id} ended in unexpected status "${status}".`);
  }
}

main().catch((err: unknown) => {
  if (err instanceof CredentialsMissedError || err instanceof AuthenticationError) fail("the provider rejected the credentials (check HF_CREDENTIALS).");
  if (err instanceof NotEnoughCreditsError) fail("not enough credits on the account.");
  if (err instanceof ValidationError || err instanceof BadInputError) {
    fail(`the provider rejected the input: ${JSON.stringify(err.details ?? err.message)}`);
  }
  if (err instanceof TimeoutError) fail("gave up waiting; the request may still be running on the provider.");
  if (err instanceof APIError) fail(`API error ${err.statusCode ?? "?"}: ${err.message}`);
  fail(err instanceof Error ? err.message : "unknown error");
});
