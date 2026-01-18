const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');
const Admin = require('./models/admin');
require('dotenv').config();

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const email = "testadmin@trackfast.com";
    const password = "password123";
    const hash = await bcrypt.hash(password, 10);
    
    await Admin.findOneAndUpdate(
      { email },
      { email, passwordHash: hash, role: "admin", createdBy: null },
      { upsert: true, new: true }
    );
    console.log("✅ Test Admin created/updated");
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
