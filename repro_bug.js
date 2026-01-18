const mongoose = require('mongoose');
const Admin = require('./models/admin');
const Parcel = require('./models/parcel');
const Message = require('./models/Message');
require('dotenv').config();

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    // Setup
    const agentEmail = `agent2_${Date.now()}@test.com`;
    const agent = await Admin.create({ email: agentEmail, passwordHash: "dummy", role: "admin" });
    const trackingId = `TRK-BUG-${Date.now()}`;
    const parcel = await Parcel.create({
      id: trackingId, createdBy: agent._id,
      sender: "S", receiver: "R", origin: "O", destination: "D", status: "P", state: "active",
      timeline: []
    });
    const sessionId = `sess2_${Date.now()}`;

    // 1. User sends message WITH trackingId
    await Message.create({
      sessionId, sender: "user", content: "Help me", trackingId: trackingId
    });

    // 2. Admin replies WITHOUT trackingId
    await Message.create({
      sessionId, sender: "admin", content: "Sure", adminId: agent._id
    });

    console.log("Simulating Session Fetch...");

    // CURRENT LOGIC
    const sessions = await Message.aggregate([
       { $group: { _id: "$sessionId", lastMsg: { $last: "$$ROOT" } } },
       { $sort: { "lastMsg.createdAt": -1 } }
    ]);
    
    const relevantSession = sessions.find(s => s._id === sessionId);
    console.log("Last Msg Tracking ID:", relevantSession.lastMsg.trackingId); // Expect undefined

    // Filter Logic
    const ids = [trackingId];
    // Check if relevantSession.lastMsg.trackingId is in ids
    const isVisible = relevantSession.lastMsg.trackingId && ids.includes(relevantSession.lastMsg.trackingId);
    
    console.log(`Is visible with current logic? ${isVisible ? 'YES' : 'NO'}`);

    if (!isVisible) {
        console.log("Found the bug! Session disappears after Admin reply.");
    }

    // PROPOSED FIX LOGIC
    const fixedSessions = await Message.aggregate([
       { $group: { 
           _id: "$sessionId", 
           lastMsg: { $last: "$$ROOT" },
           trackingId: { $max: "$trackingId" }, // Take trackingId from any msg in group
           trackingIds: { $addToSet: "$trackingId" } // Debug
       } },
       { $sort: { "lastMsg.createdAt": -1 } }
    ]);

    const fixedSession = fixedSessions.find(s => s._id === sessionId);
    console.log("Fixed Session TrackingId:", fixedSession.trackingId, "All:", fixedSession.trackingIds);
    
    const isVisibleFixed = fixedSession.trackingId && ids.includes(fixedSession.trackingId);
    console.log(`Is visible with FIXED logic? ${isVisibleFixed ? 'YES' : 'NO'}`);

    // Cleanup
    await Admin.deleteOne({ _id: agent._id });
    await Parcel.deleteOne({ _id: parcel._id });
    await Message.deleteMany({ sessionId });
    process.exit(0);

  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
