const mongoose = require("mongoose");
require("dotenv").config();
const Admin = require("./models/admin");

async function checkAdmins() {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    console.log("Connected to DB");

    const admins = await Admin.find({});
    console.log("Found admins:", admins.length);
    admins.forEach(a => {
        console.log(`Email: ${a.email}, Role: ${a.role}`);
    });

    mongoose.connection.close();
  } catch (err) {
    console.error(err);
  }
}

checkAdmins();
