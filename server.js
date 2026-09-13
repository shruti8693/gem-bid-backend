import express from "express";
import cors from "cors";
import path from "path";
import { fileURLToPath } from "url";
import { readCollection, writeCollection } from "./services/jsonStore.js";
const app = express();
const PORT = process.env.PORT || 4000;
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FRONTEND_DIST = path.join(__dirname, "frontend", "dist");

app.use(cors());
app.use(express.json());

// Health check — used to confirm the backend is up during development.
app.get("/api/health", (_req, res) => {
  res.json({ status: "ok", service: "gem-compliance-backend" });
});

// Mock login. Checks email + password + role against the seeded users.
app.post("/api/auth/login", async (req, res) => {
  const { email, password, role } = req.body;
  const users = await readCollection("users");

  const user = users.find(
    (u) => u.email === email && u.password === password && u.role === role
  );

  if (!user) {
    return res.status(401).json({ error: "Invalid email, password, or role." });
  }

  const { password: _pw, ...safeUser } = user;
  res.json({ user: safeUser });
});

// Buyer registration — creates a user + buyer profile.
app.post("/api/register/buyer", async (req, res) => {
  const users = await readCollection("users");
  const buyers = await readCollection("buyers");

  const existing = users.find((u) => u.email === req.body.officialEmail);
  if (existing) {
    return res
      .status(409)
      .json({ error: "An account with this email already exists." });
  }

  const buyerId = `BUY-${String(buyers.length + 1).padStart(3, "0")}`;
  const userId = `USR-BUYER-${String(buyers.length + 1).padStart(3, "0")}`;

  const newBuyer = { id: buyerId, ...req.body };
  const newUser = {
    id: userId,
    role: "buyer",
    email: req.body.officialEmail,
    password: req.body.password,
    profileId: buyerId,
  };

  await writeCollection("buyers", [...buyers, newBuyer]);
  await writeCollection("users", [...users, newUser]);

  const { password: _pw, ...safeUser } = newUser;
  res.json({ user: safeUser, profile: newBuyer });
});

// Officer registration — creates a user + officer profile with
// predefined permissions (section 14D).
app.post("/api/register/officer", async (req, res) => {
  const users = await readCollection("users");
  const officers = await readCollection("officers");

  const existing = users.find((u) => u.email === req.body.officialEmail);
  if (existing) {
    return res
      .status(409)
      .json({ error: "An account with this email already exists." });
  }

  const officerId = `OFF-${String(officers.length + 1).padStart(3, "0")}`;
  const userId = `USR-OFFICER-${String(officers.length + 1).padStart(3, "0")}`;

  const permissions = [
    "View Tender",
    "View Bids",
    "Review Compliance",
    "View Risk Reports",
    "Evaluate Bid",
    "Make Recommendation",
  ];

  const newOfficer = { id: officerId, ...req.body, permissions };
  const newUser = {
    id: userId,
    role: "officer",
    email: req.body.officialEmail,
    password: req.body.password,
    profileId: officerId,
  };

  await writeCollection("officers", [...officers, newOfficer]);
  await writeCollection("users", [...users, newUser]);

  const { password: _pw, ...safeUser } = newUser;
  res.json({ user: safeUser, profile: newOfficer });
});

// Bidder registration — creates a user + bidder profile.
// Certifications (ISO/BIS/etc.) are conditional — only stored if
// applicable, per section 11G.
app.post("/api/register/bidder", async (req, res) => {
  const users = await readCollection("users");
  const bidders = await readCollection("bidders");

  const existing = users.find((u) => u.email === req.body.officialEmail);
  if (existing) {
    return res
      .status(409)
      .json({ error: "An account with this email already exists." });
  }

  const bidderId = `BID-${String(bidders.length + 1).padStart(3, "0")}`;
  const userId = `USR-BIDDER-${String(bidders.length + 1).padStart(3, "0")}`;

  const newBidder = { id: bidderId, ...req.body };
  const newUser = {
    id: userId,
    role: "bidder",
    email: req.body.officialEmail,
    password: req.body.password,
    profileId: bidderId,
  };

  await writeCollection("bidders", [...bidders, newBidder]);
  await writeCollection("users", [...users, newUser]);

  const { password: _pw, ...safeUser } = newUser;
  res.json({ user: safeUser, profile: newBidder });
});

// Fetch a single bidder profile — used by the dashboard to show the
// logged-in bidder's real company name instead of a hardcoded one.
app.get("/api/bidders/:id", async (req, res) => {
  const bidders = await readCollection("bidders");
  const bidder = bidders.find((b) => b.id === req.params.id);

  if (!bidder) {
    return res.status(404).json({ error: "Bidder not found." });
  }
  res.json({ bidder });
});

// Fetch a single buyer profile — used by the dashboard to show the
// logged-in buyer's real organization name.
app.get("/api/buyers/:id", async (req, res) => {
  const buyers = await readCollection("buyers");
  const buyer = buyers.find((b) => b.id === req.params.id);

  if (!buyer) {
    return res.status(404).json({ error: "Buyer not found." });
  }
  res.json({ buyer });
});

// Fetch a single officer profile — used by the dashboard to show the
// logged-in officer's real name.
app.get("/api/officers/:id", async (req, res) => {
  const officers = await readCollection("officers");
  const officer = officers.find((o) => o.id === req.params.id);

  if (!officer) {
    return res.status(404).json({ error: "Officer not found." });
  }
  res.json({ officer });
});

// Create a tender as a draft. Buyer fills this in over multiple wizard
// steps on the frontend, but it's saved to the backend in one shot when
// they reach the end of step 3 (see StepReview.jsx pattern won't apply
// here — tender creation submits once, then is published separately).
app.post("/api/tenders", async (req, res) => {
  const tenders = await readCollection("tenders");

  // Always generate a URL-safe internal id, regardless of what the buyer
  // typed as the human-readable Tender ID (e.g. "MoPNG/2026/001" contains
  // slashes and would break routes like /api/tenders/:id if used directly).
  const newTender = {
    id: `TND-${String(tenders.length + 1).padStart(3, "0")}`,
    status: "Draft",
    createdAt: new Date().toISOString(),
    ...req.body,
  };

  await writeCollection("tenders", [...tenders, newTender]);
  res.json({ tender: newTender });
});

// List all tenders — used by Buyer's "My Tenders" and Bidder's
// "Available Tenders" (filtered to Published only, on the frontend).
app.get("/api/tenders", async (_req, res) => {
  const tenders = await readCollection("tenders");
  res.json({ tenders });
});

// Fetch a single tender by ID.
app.get("/api/tenders/:id", async (req, res) => {
  const tenders = await readCollection("tenders");
  const tender = tenders.find((t) => t.id === req.params.id);

  if (!tender) {
    return res.status(404).json({ error: "Tender not found." });
  }
  res.json({ tender });
});

// Publish a tender — flips status from Draft to Published.
app.patch("/api/tenders/:id/publish", async (req, res) => {
  const tenders = await readCollection("tenders");
  const index = tenders.findIndex((t) => t.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: "Tender not found." });
  }

  tenders[index] = { ...tenders[index], status: "Published", publishedAt: new Date().toISOString() };
  await writeCollection("tenders", tenders);
  res.json({ tender: tenders[index] });
});

// Stores documents a bidder uploads specifically for one tender (not part
// of their permanent profile) — e.g. an ISO cert they didn't have on file
// when they registered. Keyed by bidderId + tenderId combination.
app.post("/api/documents/extra", async (req, res) => {
  const { bidderId, tenderId, docs } = req.body;
  const documents = await readCollection("documents");

  const existingIndex = documents.findIndex(
    (d) => d.bidderId === bidderId && d.tenderId === tenderId
  );

  if (existingIndex !== -1) {
    documents[existingIndex] = {
      ...documents[existingIndex],
      docs: { ...documents[existingIndex].docs, ...docs },
    };
  } else {
    documents.push({ bidderId, tenderId, docs });
  }

  await writeCollection("documents", documents);
  res.json({ success: true });
});

// Fetch any tender-specific extra documents a bidder has uploaded.
app.get("/api/documents/extra/:bidderId/:tenderId", async (req, res) => {
  const { bidderId, tenderId } = req.params;
  const documents = await readCollection("documents");

  const record = documents.find(
    (d) => d.bidderId === bidderId && d.tenderId === tenderId
  );

  res.json({ docs: record?.docs || {} });
});

// Submit a bid. Stores which tender + bidder this bid is for, plus a
// predefined verification result (mock — see sections 31/61 for why this
// is not real AI). The result is generated once here and simply
// "revealed" to the user via animation on the frontend.
app.post("/api/bids", async (req, res) => {
  const { bidderId, tenderId } = req.body;
  const bids = await readCollection("bids");

  const bidId = `BID-SUB-${String(bids.length + 1).padStart(3, "0")}`;

  // Predefined mock verification result — matches the main demo scenario
  // (94% compliance / LOW risk) described in the spec's section 74.
  const newBid = {
    id: bidId,
    bidderId,
    tenderId,
    status: "Under Review",
    submittedAt: new Date().toISOString(),
    complianceScore: 94,
    riskLevel: "LOW",
    riskScore: 8,
    verification: {
      documents: {
        companyRegistration: "Verified",
        gst: "Verified",
        pan: "Verified",
        experience: "Verified",
        financial: "Verified",
        technical: "Verified",
        iso: "Verified",
        representative: "Verified",
      },
      governmentCrossCheck: {
        gstn: "Match",
        pan: "Match",
        mca: "Match",
        udyam: "Match",
        nsic: "Match",
        epfo: "Match",
        esic: "Match",
      },
      nameConsistencyWarning: true,
    },
  };

  await writeCollection("bids", [...bids, newBid]);
  res.json({ bid: newBid });
});

// List bids — optionally filtered by bidderId or tenderId via query params.
app.get("/api/bids", async (req, res) => {
  const { bidderId, tenderId } = req.query;
  let bids = await readCollection("bids");

  if (bidderId) bids = bids.filter((b) => b.bidderId === bidderId);
  if (tenderId) bids = bids.filter((b) => b.tenderId === tenderId);

  res.json({ bids });
});

// Fetch a single bid — used by the verification report page.
app.get("/api/bids/:id", async (req, res) => {
  const bids = await readCollection("bids");
  const bid = bids.find((b) => b.id === req.params.id);

  if (!bid) {
    return res.status(404).json({ error: "Bid not found." });
  }
  res.json({ bid });
});

// Officer decision on a bid — Approve, Reject, or flag for Clarification.
app.patch("/api/bids/:id/status", async (req, res) => {
  const { status } = req.body;
  const validStatuses = ["Approved", "Rejected", "Clarification Requested", "Under Review"];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: "Invalid status." });
  }

  const bids = await readCollection("bids");
  const index = bids.findIndex((b) => b.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: "Bid not found." });
  }

  bids[index] = { ...bids[index], status };
  await writeCollection("bids", bids);
  res.json({ bid: bids[index] });
});

// Officer sends a clarification request on a specific document.
app.post("/api/clarifications", async (req, res) => {
  const { bidId, tenderId, bidderId, document, reason, message } = req.body;
  const clarifications = await readCollection("clarifications");

  const newClarification = {
    id: `CLR-${String(clarifications.length + 1).padStart(3, "0")}`,
    bidId,
    tenderId,
    bidderId,
    document,
    reason,
    message,
    status: "Pending",
    createdAt: new Date().toISOString(),
  };

  await writeCollection("clarifications", [...clarifications, newClarification]);

  // Also flip the bid's status so it's visible everywhere.
  const bids = await readCollection("bids");
  const bidIndex = bids.findIndex((b) => b.id === bidId);
  if (bidIndex !== -1) {
    bids[bidIndex] = { ...bids[bidIndex], status: "Clarification Requested" };
    await writeCollection("bids", bids);
  }

  res.json({ clarification: newClarification });
});

// Fetch clarifications for a given bidder — used to show the bidder
// what's pending, and for the "respond" flow.
app.get("/api/clarifications", async (req, res) => {
  const { bidderId, bidId } = req.query;
  let clarifications = await readCollection("clarifications");

  if (bidderId) clarifications = clarifications.filter((c) => c.bidderId === bidderId);
  if (bidId) clarifications = clarifications.filter((c) => c.bidId === bidId);

  res.json({ clarifications });
});

// Bidder marks a clarification as resolved (after re-uploading the
// corrected document). Re-verification result stays the same mock data
// per section 52 — the prototype simulates re-verification, it doesn't
// recompute anything real.
app.patch("/api/clarifications/:id/resolve", async (req, res) => {
  const clarifications = await readCollection("clarifications");
  const index = clarifications.findIndex((c) => c.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: "Clarification not found." });
  }

  clarifications[index] = { ...clarifications[index], status: "Resolved" };
  await writeCollection("clarifications", clarifications);

  // Move the bid back to Under Review so the officer can re-evaluate.
  const bids = await readCollection("bids");
  const bidIndex = bids.findIndex((b) => b.id === clarifications[index].bidId);
  if (bidIndex !== -1) {
    bids[bidIndex] = { ...bids[bidIndex], status: "Under Review" };
    await writeCollection("bids", bids);
  }

  res.json({ clarification: clarifications[index] });
});

// Create a notification for a specific user (identified by role + profileId).
app.post("/api/notifications", async (req, res) => {
  const { recipientRole, recipientId, type, title, message, link } = req.body;
  const notifications = await readCollection("notifications");

  const newNotification = {
    id: `NOTIF-${String(notifications.length + 1).padStart(3, "0")}`,
    recipientRole,
    recipientId,
    type,
    title,
    message,
    link: link || null,
    read: false,
    createdAt: new Date().toISOString(),
  };

  await writeCollection("notifications", [...notifications, newNotification]);
  res.json({ notification: newNotification });
});

// List notifications for a specific user, newest first.
app.get("/api/notifications", async (req, res) => {
  const { recipientId } = req.query;
  let notifications = await readCollection("notifications");

  if (recipientId) {
    notifications = notifications.filter((n) => n.recipientId === recipientId);
  }

  notifications.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ notifications });
});

// Mark a single notification as read.
app.patch("/api/notifications/:id/read", async (req, res) => {
  const notifications = await readCollection("notifications");
  const index = notifications.findIndex((n) => n.id === req.params.id);

  if (index === -1) {
    return res.status(404).json({ error: "Notification not found." });
  }

  notifications[index] = { ...notifications[index], read: true };
  await writeCollection("notifications", notifications);
  res.json({ notification: notifications[index] });
});
// Serve the React frontend
app.use(express.static(FRONTEND_DIST));

// React Router fallback
app.get("/{*splat}", (_req, res) => {
  res.sendFile(path.join(FRONTEND_DIST, "index.html"));
});

app.listen(PORT, () => {
  console.log(`GeM Compliance backend running on http://localhost:${PORT}`);
});