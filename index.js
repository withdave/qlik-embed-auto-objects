import express from "express";
import helmet from "helmet";
import session from "express-session";
import { dirname, join } from "path";
import { fileURLToPath } from "url";
import { randomBytes } from "crypto";
import dotenv from "dotenv";

dotenv.config({ quiet: true });

import {
  auth as qlikAuth,
  users as qlikUsers,
  themes as qlikThemes,
  qix as openAppSession,
} from "@qlik/api";

const defaultThemes = [
  { id: "sense", key: "sense", name: "Sense" },
  { id: "card", key: "card", name: "Card" },
  { id: "breeze", key: "breeze", name: "Breeze" },
  { id: "horizon", key: "horizon", name: "Horizon" },
];

/** Server-side user API calls; frontend embed tokens still use `user_default` only. */
const BACKEND_USER_SCOPE = "admin_classic user_default";

const requiredEnv = ["host", "clientId", "clientSecret", "appId", "sessionSecret"];
const missingEnv = requiredEnv.filter((name) => !process.env[name]);
if (missingEnv.length > 0) {
  throw new Error(`Missing required env vars: ${missingEnv.join(", ")}`);
}

const host = process.env.host.replace(/\/+$/, "");

const config = {
  authType: "oauth2",
  host,
  clientId: process.env["clientId"],
  clientSecret: process.env["clientSecret"],
  noCache: true,
};

qlikAuth.setDefaultHostConfig(config);

const __dirname = dirname(fileURLToPath(import.meta.url));
const app = express();

app.set("trust proxy", 1);

app.use(
  helmet({
    contentSecurityPolicy: false,
  }),
);

/** Simple sliding-window rate limiter (per IP, in-memory). */
const rateBuckets = new Map();
function rateLimit({ windowMs, max, keyPrefix, onLimit }) {
  return (req, res, next) => {
    const ip = req.ip || req.socket?.remoteAddress || "unknown";
    const key = `${keyPrefix}:${ip}`;
    const now = Date.now();
    let bucket = rateBuckets.get(key);
    if (!bucket || now - bucket.start >= windowMs) {
      bucket = { start: now, count: 0 };
      rateBuckets.set(key, bucket);
    }
    bucket.count += 1;
    if (bucket.count > max) {
      if (typeof onLimit === "function") {
        onLimit(req, res);
        return;
      }
      res.status(429).json({ error: "Too many requests" });
      return;
    }
    next();
  };
}

const limitSessionRotate = rateLimit({ windowMs: 60_000, max: 30, keyPrefix: "rotate" });
const limitAccessToken = rateLimit({ windowMs: 60_000, max: 200, keyPrefix: "token" });
/** Limits session provisioning on first page load (Qlik user creation cost). */
const limitHomeProvision = rateLimit({
  windowMs: 60_000,
  max: 90,
  keyPrefix: "home",
  onLimit: (req, res) => {
    res.status(429).type("html").send(
      "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Too many requests</title></head>"
        + "<body><p>Too many requests. Please try again in a minute.</p></body></html>",
    );
  },
});

app.use(express.static("public"));
app.use(express.urlencoded({ extended: true }));

app.use(
  session({
    secret: process.env["sessionSecret"],
    resave: false,
    saveUninitialized: false,
    cookie: {
      httpOnly: true,
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
      maxAge: 8 * 60 * 60 * 1000,
    },
  }),
);

function escapeQlikFilterString(value) {
  return value.replace(/\\/g, "\\\\").replace(/\"/g, '\\"');
}

function randomEmbedKey() {
  return randomBytes(16).toString("hex");
}

function syntheticUserEmail(embedKey) {
  return `oauth_gen_auto_${embedKey}@example.com`;
}

function normalizeUserList(response) {
  const payload = response?.data;
  if (Array.isArray(payload)) {
    return payload;
  }
  if (payload && Array.isArray(payload.data)) {
    return payload.data;
  }
  return [];
}

function extractCreatedUserId(created) {
  const d = created?.data;
  if (typeof d?.id === "string") {
    return d.id;
  }
  if (d && typeof d.data?.id === "string") {
    return d.data.id;
  }
  return null;
}

async function listUsersByEmail(email) {
  const safeEmail = escapeQlikFilterString(email);
  const response = await qlikUsers.getUsers(
    {
      filter: `email eq \"${safeEmail}\"`,
    },
    {
      hostConfig: {
        ...config,
        scope: BACKEND_USER_SCOPE,
      },
    },
  );
  return normalizeUserList(response);
}

async function createSyntheticUser(email) {
  return qlikUsers.createUser(
    {
      name: email,
      email,
      subject: email,
      status: "active",
    },
    {
      hostConfig: {
        ...config,
        scope: BACKEND_USER_SCOPE,
      },
    },
  );
}

async function provisionSessionUser(req, maxAttempts = 8) {
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    if (!req.session.embedKey) {
      req.session.embedKey = randomEmbedKey();
    }

    const email = syntheticUserEmail(req.session.embedKey);

    try {
      const existing = await listUsersByEmail(email);
      if (existing.length >= 1) {
        req.session.userId = existing[0].id;
        return { ok: true };
      }

      const created = await createSyntheticUser(email);
      const id = extractCreatedUserId(created);
      if (id) {
        req.session.userId = id;
        return { ok: true };
      }

      const afterCreate = await listUsersByEmail(email);
      if (afterCreate.length >= 1) {
        req.session.userId = afterCreate[0].id;
        return { ok: true };
      }
    } catch (err) {
      console.warn(
        `provisionSessionUser attempt ${attempt}/${maxAttempts} failed`,
        err?.message || err,
      );
      try {
        const email = syntheticUserEmail(req.session.embedKey);
        const recovered = await listUsersByEmail(email);
        if (recovered.length >= 1) {
          req.session.userId = recovered[0].id;
          return { ok: true };
        }
      } catch {
        // fall through to rotate identity
      }
    }

    req.session.embedKey = randomEmbedKey();
    delete req.session.userId;
  }

  return { ok: false };
}

function getSessionUserId(req) {
  return typeof req.session.userId === "string" && req.session.userId.length > 0
    ? req.session.userId
    : null;
}

app.get("/", limitHomeProvision, async (req, res) => {
  try {
    const result = await provisionSessionUser(req);
    if (!result.ok) {
      console.error("Failed to provision embed session user after retries");
      res.status(503).send("Unable to initialize session. Please try again.");
      return;
    }
    res.sendFile(join(__dirname, "index.html"));
  } catch (error) {
    console.error("Failed to initialize user session", error);
    res.status(500).send("Unable to initialize session");
  }
});

app.get("/login", (req, res) => {
  res.redirect(302, "/");
});

app.post("/login", (req, res) => {
  res.redirect(302, "/");
});

app.post("/session/rotate", limitSessionRotate, async (req, res) => {
  delete req.session.userId;
  req.session.embedKey = randomEmbedKey();
  try {
    const result = await provisionSessionUser(req);
    if (!result.ok) {
      res.status(503).json({ ok: false, error: "provision_failed" });
      return;
    }
    res.json({ ok: true, sessionIdentity: req.session.embedKey });
  } catch (err) {
    console.error("session/rotate failed", err);
    res.status(500).json({ ok: false, error: "server_error" });
  }
});

function destroySessionAndRedirect(req, res) {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
    }
    res.clearCookie("connect.sid");
    res.redirect(303, "/");
  });
}

app.get("/logout", (req, res) => {
  res.status(405).set("Allow", "POST").type("html").send(
    "<!doctype html><html lang=\"en\"><head><meta charset=\"utf-8\"><title>Method not allowed</title></head>"
      + "<body><p>Logout must use POST. Use <strong>Clear session</strong> in the app bar.</p></body></html>",
  );
});

app.post("/logout", destroySessionAndRedirect);

app.post("/access-token", limitAccessToken, async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const accessToken = await qlikAuth.getAccessToken({
      hostConfig: {
        ...config,
        userId,
        scope: "user_default",
      },
    });
    res.send(accessToken);
  } catch (err) {
    console.error("Unable to retrieve access token", err);
    const status = err?.statusCode === 401 || err?.status === 401 ? 401 : 502;
    res.status(status).json({ error: "Unable to retrieve access token" });
  }
});

app.get("/assets", async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const appSession = openAppSession.openAppSession({
      appId: process.env["appId"],
      hostConfig: {
        ...config,
        userId,
        scope: "user_default",
      },
      withoutData: false,
    });
    const app = await appSession.getDoc();
    const sheetList = await app.getSheetList();
    res.send(sheetList);
  } catch (err) {
    console.error("Unable to retrieve sheet definitions", err);
    const unauthorized =
      err?.statusCode === 401
      || err?.status === 401
      || /401|unauthoriz/i.test(String(err?.message || ""));
    const status = unauthorized ? 401 : 502;
    res.status(status).json({ error: "Unable to retrieve sheet definitions" });
  }
});

app.get("/config", async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  const appConfig = {
    host,
    appId: process.env["appId"],
    clientId: process.env["clientId"],
    sessionIdentity: typeof req.session.embedKey === "string" ? req.session.embedKey : "",
  };
  res.send(appConfig);
});

app.get("/themes", async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).json({ error: "Not authenticated" });
    return;
  }

  try {
    const response = await qlikThemes.getThemes({
      hostConfig: {
        ...config,
        userId,
        scope: "user_default",
      },
    });

    const tenantThemeList = Array.isArray(response?.data?.data)
      ? response.data.data
      : [];

    const liveThemes = tenantThemeList.map((theme) => ({
      id: theme.qextFilename || theme.id,
      name: theme.name || theme.qextFilename || theme.id,
    }));

    const mergedMap = new Map();
    defaultThemes.forEach((theme) => mergedMap.set(theme.key, {
      id: theme.key,
      name: theme.name,
    }));
    liveThemes.forEach((theme) => {
      if (theme.id) {
        mergedMap.set(theme.id, theme);
      }
    });

    const themes = Array.from(mergedMap.values()).sort((a, b) =>
      a.name.localeCompare(b.name),
    );

    res.send({ data: themes });
  } catch (err) {
    console.error("Unable to retrieve tenant themes", err);
    res.send({ data: defaultThemes.map((theme) => ({
        id: theme.key,
        name: theme.name,
      })),
    });
  }
});

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
