const http = require('http');
const mongoose = require('mongoose');
const Admin = require('./models/admin');
const Parcel = require('./models/parcel');
const Message = require('./models/Message');
const jwt = require('jsonwebtoken');
require('dotenv').config();

const PORT = process.env.PORT || 5000;
const MONGO_URI = process.env.MONGO_URI;

async function setupData() {
  await mongoose.connect(MONGO_URI);
  
  // Cleanup
  await Admin.deleteMany({ email: /routing_test/ });
  await Parcel.deleteMany({ description: "Routing Test Parcel" });
  await Message.deleteMany({ content: "Test Message Routing" });

  // Create Admins
  const admin1 = await Admin.create({ 
    email: "routing_test_1@test.com", passwordHash: "hash", role: "admin" 
  });
  const admin2 = await Admin.create({ 
    email: "routing_test_2@test.com", passwordHash: "hash", role: "admin" 
  });

  // Create Parcels
  const parcel1 = await Parcel.create({
    id: "TRK-ROUTE-1",
    sender: "S", receiver: "R", contact: "C", description: "Routing Test Parcel",
    origin: "A", destination: "B", status: "Pending",
    createdBy: admin1._id
  });

  // Create Message for Parcel 1
  await Message.create({
      sessionId: "session_route_1",
      sender: "user",
      content: "Test Message Routing",
      trackingId: parcel1.id
  });

  console.log("✅ Data Setup Complete");
  return { admin1, admin2 };
}

function makeRequest(path, token) {
    return new Promise((resolve, reject) => {
        const options = {
            hostname: 'localhost',
            port: PORT,
            path: path,
            method: 'GET',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            }
        };

        const req = http.request(options, (res) => {
            let data = '';
            res.on('data', (chunk) => data += chunk);
            res.on('end', () => {
                try {
                    resolve(JSON.parse(data));
                } catch (e) {
                    resolve(data); // Return raw if parse fails
                }
            });
        });

        req.on('error', reject);
        req.end();
    });
}

function signToken(admin) {
    return jwt.sign(
        { adminId: admin._id.toString(), email: admin.email, role: admin.role },
        process.env.JWT_SECRET,
        { expiresIn: "10m" }
    );
}

async function runTest() {
  try {
    const { admin1, admin2 } = await setupData();
    
    // Tokens
    const token1 = signToken(admin1);
    const token2 = signToken(admin2);

    console.log("⏳ Testing Admin 1 (Owner)...");
    const res1 = await makeRequest('/api/chat/sessions', token1);
    const session1 = Array.isArray(res1) ? res1.find(s => s._id === "session_route_1") : null;
    
    if (session1) {
        console.log("✅ Admin 1 CAN see the session (Correct)");
    } else {
        console.error("❌ Admin 1 CANNOT see the session (Fail)");
        console.log("Response:", JSON.stringify(res1, null, 2));
    }

    console.log("⏳ Testing Admin 2 (Non-Owner)...");
    const res2 = await makeRequest('/api/chat/sessions', token2);
    const session2 = Array.isArray(res2) ? res2.find(s => s._id === "session_route_1") : null;
    
    if (!session2) {
        console.log("✅ Admin 2 CANNOT see the session (Correct)");
    } else {
        console.error("❌ Admin 2 CAN see the session (Fail)");
        console.log("Response:", JSON.stringify(res2, null, 2));
    }

    process.exit(0);
  } catch (e) {
    console.error(e);
    process.exit(1);
  }
}

runTest();
