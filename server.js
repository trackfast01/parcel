// server.js (Render-ready + Socket.io + RBAC)
require("dotenv").config();

const express = require("express");
const cors = require("cors");
const path = require("path");
const mongoose = require("mongoose");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcryptjs");
const http = require("http");
const { Server } = require("socket.io");

// ===== MODELS =====
const Admin = require("./models/admin");
const Parcel = require("./models/parcel");
const Message = require("./models/Message");

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: "*", // allow all for simplicity in this demo
    methods: ["GET", "POST"],
  },
});

const PORT = process.env.PORT || 5000;

// ===== MIDDLEWARE =====
app.use(cors());
app.use(express.json());

// 🔍 DEBUG: LOG ALL REQUESTS
app.use((req, res, next) => {
  console.log("➡️ REQUEST:", req.method, req.url);
  next();
});

// ===== SERVE FRONTEND =====
app.use(express.static(path.join(__dirname, "public")));

// ===== SOCKET.IO LOGIC =====
// Socket.IO
io.on("connection", (socket) => {
  // console.log("New connection:", socket.id);

  // User joins session
  socket.on("join_user", (sessionId) => {
    socket.join(`session_${sessionId}`);
  });

  // Admin joins personal room + general
  socket.on("join_admin", (token) => {
    try {
      if (!token) {
        socket.join("admin_channel"); // Fallback for old clients
        return;
      }
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.join("admin_channel"); // General broadcasts
      socket.join(`admin_${decoded.adminId}`); // Private channel
      if (decoded.role === "superadmin") {
        socket.join("superadmin_channel"); // Super admin only
      }
    } catch (e) {
      console.error("Socket Auth Fail:", e.message);
    }
  });

  // User sends message
  socket.on("send_message_user", async (data) => {
    try {
      if (!data.sessionId || !data.content) return;
      
      const msgData = {
        sessionId: data.sessionId,
        sender: "user",
        content: data.content,
        image: data.image || null,
        trackingId: data.trackingId || null, // Save tracking ID
      };

      const msg = await Message.create(msgData);

      // Ack to user
      io.to(`session_${data.sessionId}`).emit("message_sent", msg);

      // Routing Logic
      let targetRoom = "admin_channel"; // Default (broadcast)
      
      if (data.trackingId) {
        const parcel = await Parcel.findOne({ id: data.trackingId });
        if (parcel && parcel.createdBy) {
          // Send to specific Creator
          io.to(`admin_${parcel.createdBy}`).emit("new_message", msg);
          
          // AND Super Admin (Supervision)
          io.to("superadmin_channel").emit("new_message", msg);
          return; 
        }
      }

      // Fallback: Broadcast to all if no tracking ID or legacy
      io.to("admin_channel").emit("new_message", msg);
      
    } catch (err) {
      console.error("Socket error:", err);
    }
  });

  // Admin replies
  socket.on("send_message_admin", async (data) => {
    try {
      if (!data.sessionId || !data.content) return;

      const msg = await Message.create({
        sessionId: data.sessionId,
        sender: "admin",
        content: data.content,
        adminId: data.adminId, 
        image: data.image || null,
        // We could look up the session's trackingId here if needed, but not strictly required for reply
      });

      // Emit to user
      io.to(`session_${data.sessionId}`).emit("admin_reply", msg);
      
      // Sync other admins (Creator + Supers)
      io.to("superadmin_channel").emit("admin_reply_broadcast", msg); 
      // ideally we'd look up the session's original admin, but broadcast is safe for sync
      io.to("admin_channel").emit("admin_reply_broadcast", msg);
    } catch (err) {
      console.error("Socket error:", err);
    }
  });

  socket.on("disconnect", () => {
    // console.log("Disconnected");
  });
});

// ===== HELPERS =====
function signToken(admin) {
  return jwt.sign(
    { adminId: admin._id.toString(), email: admin.email, role: admin.role },
    process.env.JWT_SECRET,
    { expiresIn: "8h" }
  );
}

// Auth Middleware (Populates req.admin)
async function authMiddleware(req, res, next) {
  const header = req.headers.authorization || "";
  const token = header.startsWith("Bearer ") ? header.slice(7) : null;

  if (!token) return res.status(401).json({ message: "No token provided" });

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    const admin = await Admin.findById(decoded.adminId);
    if (!admin) throw new Error("Admin not found");

    req.admin = admin; // Full admin object
    next();
  } catch (err) {
    return res.status(401).json({ message: "Invalid/Expired token" });
  }
}

// ===== ROUTES =====

// Health check
app.get("/api/health", (req, res) => {
  res.json({ ok: true, message: "TrackFast API running" });
});

// Frontend entry
app.get("/", (req, res) => {
  res.sendFile(path.join(__dirname, "public/index.html"));
});

// --- ADMIN AUTH ---

// Login Admin
app.post("/api/admin/login", async (req, res) => {
  try {
    const email = String(req.body.email || "").trim().toLowerCase();
    const password = String(req.body.password || "").trim();

    console.log(`Login attempt for: ${email}`);

    if (!email || !password) {
      return res.status(400).json({ message: "Email and password required" });
    }

    const admin = await Admin.findOne({ email });
    if (!admin) {
      console.log(`Login failed: Admin not found for ${email}`);
      return res.status(401).json({ message: "Invalid credentials" });
    }

    // console.log("Found admin:", admin.email, "Hash:", admin.passwordHash); // Debug only
    const ok = await bcrypt.compare(password, admin.passwordHash);
    console.log(`Password check for ${email}: ${ok}`);

    if (!ok) return res.status(401).json({ message: "Invalid credentials" });

    const token = signToken(admin);
    return res.json({ token, role: admin.role, email: admin.email, id: admin._id });
  } catch (err) {
    console.error("LOGIN ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// Create Agent (Super Admin Only)
app.post("/api/admin/create-agent", authMiddleware, async (req, res) => {
  try {
    if (req.admin.role !== "superadmin") {
      return res.status(403).json({ message: "Access denied. Super Admin only." });
    }

    const { email, password } = req.body;
    if (!email || !password) return res.status(400).json({ message: "Missing fields" });

    const exists = await Admin.findOne({ email });
    if (exists) return res.status(400).json({ message: "Email already exists" });

    const hash = await bcrypt.hash(password, 10);
    const newAgent = await Admin.create({
      email,
      passwordHash: hash,
      role: "admin",
      createdBy: req.admin._id,
    });

    res.status(201).json({ message: "Agent created", agent: newAgent });
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// List Agents (Super Admin Only)
app.get("/api/admin/agents", authMiddleware, async (req, res) => {
  if (req.admin.role !== "superadmin") {
    return res.status(403).json({ message: "Access denied" });
  }
  const agents = await Admin.find({ role: "admin" }).select("-passwordHash");
  res.json(agents);
});

// Delete Agent (Super Admin Only)
app.delete("/api/admin/agents/:id", authMiddleware, async (req, res) => {
  if (req.admin.role !== "superadmin") {
    return res.status(403).json({ message: "Access denied" });
  }
  await Admin.findByIdAndDelete(req.params.id);
  res.json({ message: "Agent deleted" });
});


// --- PARCEL MGMT (RBAC) ---

// Create Parcel
app.post("/api/parcels", authMiddleware, async (req, res) => {
  try {
    const {
      sender, receiver, contact, description, origin, destination, estimated_delivery, status
    } = req.body;

    if (!sender || !receiver || !origin || !destination || !status) {
      return res.status(400).json({ message: "Missing required fields" });
    }

    const now = new Date();
    const trackingId = "TRK-" + Math.random().toString(16).slice(2, 10).toUpperCase();

    const newParcel = await Parcel.create({
      id: trackingId,
      sender, receiver, contact, description, origin, destination, status,
      estimated_delivery,
      state: "active",
      pause_message: "",
      createdAt: now,
      timeline: [{ status, location: origin, time: now }],
      createdBy: req.admin._id, // ✅ Ownership
    });

    return res.status(201).json(newParcel);
  } catch (err) {
    console.error("CREATE ERROR:", err);
    return res.status(500).json({ message: "Server error" });
  }
});

// Get Parcels (Scoped)
app.get("/api/parcels", authMiddleware, async (req, res) => {
  try {
    let query = {};
    // If not superadmin, only show own parcels
    if (req.admin.role !== "superadmin") {
      query.createdBy = req.admin._id;
    }

    const parcels = await Parcel.find(query).sort({ createdAt: -1 });
    res.json(parcels);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Track Parcel (Public)
app.get("/api/parcels/:id", async (req, res) => {
  const parcel = await Parcel.findOne({ id: req.params.id });

  if (!parcel) return res.status(404).json({ message: "Parcel not found" });

  const timeline = Array.isArray(parcel.timeline) ? parcel.timeline : [];
  const pauseLocation =
    timeline.length && timeline[timeline.length - 1]?.location
      ? timeline[timeline.length - 1].location
      : parcel.origin;

  if (parcel.state === "paused") {
    return res.json({
      ...parcel.toObject(),
      paused: true,
      pauseMessage: parcel.pause_message || "",
      pauseLocation: pauseLocation || "",
    });
  }

  return res.json({
    ...parcel.toObject(),
    paused: false,
    pauseMessage: "",
    pauseLocation: "",
  });
});

// Helper for Update/Delete scope check
async function ensureOwnerOrSuper(req, res, next) {
  try {
    const parcel = await Parcel.findOne({ id: req.params.id });
    if (!parcel) return res.status(404).json({ message: "Parcel not found" });

    // Allow if Super Admin OR Owner matches
    if (req.admin.role === "superadmin" || String(parcel.createdBy) === String(req.admin._id)) {
      req.parcel = parcel; // attach for use
      return next();
    }

    return res.status(403).json({ message: "Access denied. Not your parcel." });
  } catch (err) {
    return res.status(500).json({ message: "Server error" });
  }
}

// Update Status
app.put("/api/parcels/:id/status", authMiddleware, ensureOwnerOrSuper, async (req, res) => {
  const { status, location } = req.body;
  if (!status || !location) return res.status(400).json({ message: "Status/Location required" });

  const parcel = req.parcel;
  const now = new Date();
  parcel.status = status;
  parcel.timeline.push({ status, location, time: now });
  await parcel.save();

  res.json(parcel);
});

// Edit Parcel
app.put("/api/parcels/:id", authMiddleware, ensureOwnerOrSuper, async (req, res) => {
  const {
    sender, receiver, contact, description, origin, destination, estimated_delivery, status
  } = req.body;

  const parcel = req.parcel;
  parcel.sender = sender;
  parcel.receiver = receiver;
  parcel.contact = contact;
  parcel.description = description;
  parcel.origin = origin;
  parcel.destination = destination;
  parcel.estimated_delivery = estimated_delivery;

  if (status !== parcel.status) {
    const now = new Date();
    parcel.status = status;
    const lastLoc = parcel.timeline.length ? parcel.timeline[parcel.timeline.length-1].location : origin;
    parcel.timeline.push({ status, location: lastLoc || origin, time: now });
  }

  await parcel.save();
  res.json(parcel);
});

// Pause/Resume
app.put("/api/parcels/:id/state", authMiddleware, ensureOwnerOrSuper, async (req, res) => {
  const { state, pauseMessage } = req.body;
  const parcel = req.parcel;

  if (state !== "active" && state !== "paused") return res.status(400).json({ message: "Invalid state" });

  parcel.state = state;
  if (state === "paused") {
    parcel.pause_message = String(pauseMessage || "").trim();
  } else {
    parcel.pause_message = "";
  }

  await parcel.save();
  res.json(parcel);
});

// Delete
app.delete("/api/parcels/:id", authMiddleware, ensureOwnerOrSuper, async (req, res) => {
  await Parcel.findOneAndDelete({ id: req.params.id });
  res.json({ message: "Parcel deleted" });
});

// --- CHAT ROUTES ---

// Get active sessions (Super/Admin sees relevant?)
app.get("/api/chat/sessions", authMiddleware, async (req, res) => {
  try {
    const sessions = await Message.aggregate([
       { $group: { 
           _id: "$sessionId", 
           lastMsg: { $last: "$$ROOT" },
           trackingId: { $max: "$trackingId" } 
       } },
       { $sort: { "lastMsg.createdAt": -1 } }
    ]);
    
    // Superadmin: See all
    if (req.admin.role === "superadmin") {
      return res.json(sessions);
    }

    // Normal Admin: Filter sessions for parcels they own
    
    // 1. Collect all trackingIds from these sessions
    const sessionTrackingIds = sessions
      .map(s => s.trackingId)
      .filter(id => !!id); // remove nulls
    
    if (sessionTrackingIds.length === 0) {
      return res.json([]);
    }

    // 2. Find which of these parcel IDs belong to this admin
    const myParcels = await Parcel.find({
      id: { $in: sessionTrackingIds },
      createdBy: req.admin._id
    }).select("id");

    const myParcelIds = new Set(myParcels.map(p => p.id));

    // 3. Filter sessions sorted by Parcels
    const filtered = sessions.filter(s => {
       const tid = s.trackingId;
       return tid && myParcelIds.has(tid);
    });

    res.json(filtered);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});

// Get messages for a session (Public access needed for user to see history)
app.get("/api/chat/:sessionId", async (req, res) => {
  try {
    const msgs = await Message.find({ sessionId: req.params.sessionId }).sort({ createdAt: 1 });
    res.json(msgs);
  } catch (err) {
    res.status(500).json({ message: err.message });
  }
});


// ===== DB + START =====
(async function start() {
  try {
    if (!process.env.MONGO_URI) throw new Error("Missing MONGO_URI");
    
    await mongoose.connect(process.env.MONGO_URI);
    console.log("✅ MongoDB connected");

    // Seed Super Admin if needed
    const adminEmail = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
    const adminHash = (process.env.ADMIN_PASSWORD_HASH || "").trim();

    if (adminEmail && adminHash) {
      const exists = await Admin.findOne({ email: adminEmail });
      if (!exists) {
        await Admin.create({ 
          email: adminEmail, 
          passwordHash: adminHash,
          role: "superadmin" // Default seed is superadmin
        });
        console.log("✅ Super Admin seeded:", adminEmail);
      } else {
        // Ensure existing seed is superadmin (optional, but good for migration)
        if (exists.role !== "superadmin") {
           exists.role = "superadmin";
           await exists.save();
           console.log("ℹ️ Updated existing admin to superadmin");
        }
      }
    }

    server.listen(PORT, () => {
      console.log(`✅ Server (Socket+Express) running on http://localhost:${PORT}`);
    });
  } catch (err) {
    console.error("❌ Start error:", err.message);
    process.exit(1);
  }
})();

