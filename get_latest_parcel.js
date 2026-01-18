const mongoose = require('mongoose');
const Parcel = require('./models/parcel');
require('dotenv').config();

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);
    const parcel = await Parcel.findOne().sort({ createdAt: -1 });
    if (parcel) {
        console.log("LATEST_PARCEL_ID:" + parcel.id);
    } else {
        console.log("NO_PARCELS_FOUND");
    }
    process.exit(0);
  } catch (err) {
    console.error(err);
    process.exit(1);
  }
})();
