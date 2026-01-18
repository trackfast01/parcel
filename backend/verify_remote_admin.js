const mongoose = require("mongoose");
const Admin = require("./models/admin");

// Hardcoded URI from user input to be absolutely sure
const URI = "mongodb+srv://trackfast:Zaidan%40.244@cluster0.vv0et7q.mongodb.net/trackfast?appName=Cluster0";

async function verifyRemote() {
  try {
    console.log("Connecting to REMOTE DB...");
    await mongoose.connect(URI);
    console.log("Connected!");

    const email = "admin@fasttrak.com"; // Checking the TYPO email
    const user = await Admin.findOne({ email });
    
    if (!user) {
        console.log("❌ User NOT FOUND:", email);
    } else {
        console.log("✅ User Found:");
        console.log("ID:", user._id);
        console.log("Email:", user.email);
        console.log("Role:", user.role); // This MUST be 'superadmin'
        
        if (user.role !== "superadmin") {
            console.log("⚠️ FIXING ROLE...");
            user.role = "superadmin";
            await user.save();
            console.log("✅ Role updated to SUPERADMIN");
        }
    }

    mongoose.connection.close();
  } catch (err) {
    console.error("Error:", err);
  }
}

verifyRemote();
