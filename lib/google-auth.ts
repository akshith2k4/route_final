import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export type ServiceAccountCredentials = {
  project_id: string;
  client_email: string;
  private_key: string;
};

export function getGoogleCredentials(): ServiceAccountCredentials {
  if (process.env.GCP_SERVICE_ACCOUNT_JSON) {
    try {
      return JSON.parse(process.env.GCP_SERVICE_ACCOUNT_JSON);
    } catch {
      // Fall through to the local service-account file.
    }
  }

  const filePath = path.join(process.cwd(), "gcp_service_account.json");
  if (fs.existsSync(filePath)) {
    return JSON.parse(fs.readFileSync(filePath, "utf8"));
  }

  throw new Error(
    "GCP Service Account credentials not found. Please provide GCP_SERVICE_ACCOUNT_JSON or gcp_service_account.json.",
  );
}

export async function getGoogleAccessToken(
  scope = "https://www.googleapis.com/auth/cloud-platform",
): Promise<{ token: string; projectId: string }> {
  const creds = getGoogleCredentials();
  const now = Math.floor(Date.now() / 1000);

  const header = Buffer.from(
    JSON.stringify({ alg: "RS256", typ: "JWT" }),
  ).toString("base64url");
  const claim = Buffer.from(
    JSON.stringify({
      iss: creds.client_email,
      scope,
      aud: "https://oauth2.googleapis.com/token",
      exp: now + 3600,
      iat: now,
    }),
  ).toString("base64url");

  const signer = crypto.createSign("RSA-SHA256");
  signer.update(`${header}.${claim}`);
  const signature = signer.sign(creds.private_key, "base64url");
  const jwt = `${header}.${claim}.${signature}`;

  const tokenRes = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Failed to authenticate with Google OAuth2: ${errText}`);
  }

  const tokenData = (await tokenRes.json()) as {
    access_token: string;
  };
  return { token: tokenData.access_token, projectId: creds.project_id };
}
