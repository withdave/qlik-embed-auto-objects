// Import required modules
import express from "express";
import session from "express-session";
import { join } from "path";
import bodyParser from "body-parser";

import {
  auth as qlikAuth,
  users as qlikUsers,
  qix as openAppSession,
} from "@qlik/api";

const config = {
  authType: "oauth2",
  host: process.env["host"],
  clientId: process.env["clientId"],
  clientSecret: process.env["clientSecret"],
  noCache: true,
};

qlikAuth.setDefaultHostConfig(config);

// Initialize Express app
const __dirname = new URL(".", import.meta.url).pathname;
const app = express();
app.use(express.static("public"));

// Configure session middleware
app.use(
  session({
    secret: "secret-key",
    resave: false,
    saveUninitialized: true,
  }),
);

// Configure body parser middleware
app.use(bodyParser.urlencoded({ extended: true }));

// Get Qlik user
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

// Set up a route for the index page
app.get("/", async (req, res) => {
  const email = req.session.email;

  (async () => {
    if (email) {
      //check to see if a matching user email exists on the tenant
      const currentUser = await getQlikUser(email);

      // If user doesn't exist, create
      if (currentUser.data.length !== 1) {
        // We have no user, so create
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
        console.log("Created user: ", currentUser);
        req.session.userId = currentUser.data.id;
      } else {
        // We have a user, continue
        req.session.userId = currentUser.data[0].id;
      }
      res.sendFile(join(__dirname, "index.html"));
    } else {
      res.redirect("/login");
    }
  })();
});

// Set up a route to serve the login form
app.get("/login", (req, res) => {
  res.sendFile(join(__dirname, "login.html"));
});

// Handle form submission
app.post("/login", (req, res) => {
  const { email } = req.body;
  if (email) {
    // Save email to session
    req.session.email = email;
    console.log("Logging in user:", email);
    res.redirect("/");
  } else {
    res.send("Please provide an email.");
  }
});

// Logout route
app.get("/logout", (req, res) => {
  req.session.destroy((err) => {
    if (err) {
      console.error("Error destroying session:", err);
    }
    console.log("Destroyed session for user.");
    res.redirect("/login");
  });
});

// Get access token for qlik-embed
app.post("/access-token", async (req, res) => {
  const userId = req.session.userId;
  if (userId.length > 0) {
    try {
      const accessToken = await qlikAuth.getAccessToken({
        hostConfig: {
          ...config,
          userId,
          scope: "user_default",
        },
      });
      console.log("Retrieved access token for: ", userId);
      res.send(accessToken);
    } catch (err) {
      console.log(err);
      res.status(401).send("No access");
    }
  } else {
    res.redirect("/login");
  }
});

// Get assets in app for qlik-embed
app.get("/assets", async (req, res) => {
  const userId = req.session.userId;
  if (typeof userId !== "undefined" && userId !== null) {
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
      // get the "qix document (qlik app)"
      const app = await appSession.getDoc();

      // app is now fully typed including sense-client mixins
      const sheetList = await app.getSheetList();
      res.send(sheetList);
    } catch (err) {
      console.log(err);
      res.status(401).send("Unable to retrieve sheet definitions.");
    }
  } else {
    res.redirect("/login");
  }
});

// Get configuration for qlik-embed
app.get("/config", async (req, res) => {
  const userId = req.session.userId;
  if (typeof userId !== "undefined" && userId !== null) {
    // app is now fully typed including sense-client mixins
    const appConfig = {
      host: process.env["host"],
      appId: process.env["appId"],
      clientId: process.env["clientId"],
    };
    res.send(appConfig);
  } else {
    res.redirect("/login");
  }
});

// Start the server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server is running at http://localhost:${PORT}`);
});
