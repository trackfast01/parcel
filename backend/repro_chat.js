const mongoose = require('mongoose');
const Admin = require('./models/admin');
const Parcel = require('./models/parcel');
const Message = require('./models/Message');
require('dotenv').config();

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to DB");

    // 1. Create Agent
    const agentEmail = `agent_${Date.now()}@test.com`;
    const agent = await Admin.create({
      email: agentEmail,
      passwordHash: "dummy",
      role: "admin"
    });
    console.log(`Created Agent: ${agent._id}`);

    // 2. Create Parcel
    const trackingId = `TRK-${Date.now()}`;
    const parcel = await Parcel.create({
      id: trackingId,
      sender: "S", receiver: "R", contact: "C", origin: "O", destination: "D",
      status: "Pending", state: "active",
      createdBy: agent._id
    });
    console.log(`Created Parcel: ${trackingId} owned by ${agent._id}`);

    // 3. Simulate User Message
    const sessionId = `sess_${Date.now()}`;
    await Message.create({
      sessionId,
      sender: "user",
      content: "Hello Support",
      trackingId: trackingId // Frontend should send this
    });
    console.log(`Created Message for session ${sessionId} with trackingId ${trackingId}`);

    // 4. Simulate server.js /api/chat/sessions logic
    const sessions = await Message.aggregate([
       { $group: { _id: "$sessionId", lastMsg: { $last: "$$ROOT" } } },
       { $sort: { "lastMsg.createdAt": -1 } }
    ]);

    const sessionTrackingIds = sessions.map(s => s.lastMsg.trackingId).filter(id => !!id);
    console.log("Session Tracking IDs found:", sessionTrackingIds);

    const myParcels = await Parcel.find({
      id: { $in: sessionTrackingIds },
      createdBy: agent._id
    }).select("id");
    
    const myParcelIds = new Set(myParcels.map(p => p.id));
    console.log("My Parcel IDs:", Array.from(myParcelIds));

    const filtered = sessions.filter(s => {
       const tid = s.lastMsg.trackingId;
       const match = tid && myParcelIds.has(tid);
       if (s._id === sessionId) {
           console.log(`Checking Debug Session: tid=${tid}, match=${match}`);
       }
       return match;
    });

    const isVisible = filtered.some(s => s._id === sessionId);
    console.log(`Is Session Visible to Agent? ${isVisible ? 'YES' : 'NO'}`);

    if (!isVisible) {
        console.error("FAIL: Session was filtered out!");
    } else {
        console.log("PASS: Session is visible.");
    }
    
    // Clean up
    await Admin.deleteOne({ _id: agent._id });
    await Parcel.deleteOne({ _id: parcel._id });
    await Message.deleteMany({ sessionId });
    
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
