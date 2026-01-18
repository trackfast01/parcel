const mongoose = require('mongoose');
const Parcel = require('./models/parcel');
const Admin = require('./models/admin');
require('dotenv').config();

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    
    // Find the test admin
    const admin = await Admin.findOne({ email: "testadmin@trackfast.com" });
    if (!admin) throw new Error("Test admin not found. Run seed_temp.js first.");

    const now = new Date();
    const trackingId = "TRK-TEST" + Math.floor(Math.random() * 1000);

    const parcel = await Parcel.create({
      id: trackingId,
      sender: "Test Sender",
      receiver: "Test Receiver",
      contact: "user@test.com",
      description: "Test Parcel",
      origin: "New York",
      destination: "London",
      status: "Order Received",
      estimated_delivery: new Date(now.getTime() + 86400000 * 5),
      state: "active",
      timeline: [{ status: "Order Received", location: "New York", time: now }],
      createdBy: admin._id,
    });

    console.log(`✅ Test Parcel created: ${trackingId}`);
    console.log(`Creator ID: ${admin._id}`);
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
