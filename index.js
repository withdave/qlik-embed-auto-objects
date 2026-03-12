import express from "express";
import session from "express-session";
import { join } from "path";

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

const __dirname = new URL(".", import.meta.url).pathname;
const app = express();
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

async function getQlikUser(userEmail) {
  const { data: user } = await qlikUsers.getUsers(
    {
      filter: `email eq "${userEmail}"`,
    },
    {
      hostConfig: {
        ...config,
        scope: "user_default",
      },
    },
  );
  return user;
}

function getSessionUserId(req) {
  return typeof req.session.userId === "string" && req.session.userId.length > 0
    ? req.session.userId
    : null;
}

app.get("/", async (req, res) => {
  const email = req.session.email;
  if (!email) {
    res.redirect("/login");
    return;
  }

  try {
      const currentUser = await getQlikUser(email);

      if (currentUser.data.length !== 1) {
        const currentUser = await qlikUsers.createUser(
          {
            name: "anon_" + req.session.email,
            email: req.session.email,
            subject: "anon_" + req.session.email,
            status: "active",
          },
          {
            hostConfig: {
              ...config,
              scope: "admin_classic user_default",
            },
          },
        );
        req.session.userId = currentUser.data.id;
      } else {
        req.session.userId = currentUser.data[0].id;
      }
      res.sendFile(join(__dirname, "index.html"));
  } catch (error) {
    console.error("Failed to initialize user session", error);
    res.status(500).send("Unable to initialize session");
  }
});

app.get("/login", (req, res) => {
  res.sendFile(join(__dirname, "login.html"));
});

app.post("/login", (req, res) => {
  const email = req.body?.email?.trim().toLowerCase();
  if (email) {
    req.session.email = email;
    res.redirect("/");
  } else {
    res.status(400).send("Please provide an email.");
  }
});

app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
    }
    res.clearCookie("connect.sid");
    res.redirect("/login");
  });
});

app.post("/access-token", async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.status(401).send("Not authenticated");
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
    res.status(401).send("No access");
  }
});

app.get("/assets", async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.redirect("/login");
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
    res.status(401).send("Unable to retrieve sheet definitions.");
  }
});

app.get("/config", async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.redirect("/login");
    return;
  }

  const appConfig = {
    host,
    appId: process.env["appId"],
    clientId: process.env["clientId"],
  };
  res.send(appConfig);
});

app.get("/themes", async (req, res) => {
  const userId = getSessionUserId(req);
  if (!userId) {
    res.redirect("/login");
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
