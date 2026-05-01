const mongoose = require("mongoose");
const dotenv = require("dotenv");
const path = require("node:path");
const User = require("./models/User");

dotenv.config({ path: path.resolve(__dirname, ".env") });
dotenv.config({ path: path.resolve(__dirname, "..", ".env") });

const demoUsers = [
  {
    username: "aisha_cse",
    fullName: "Aisha Khan",
    bio: "CSE student who is usually around the library and hackathon table.",
    instagram: "@aisha.codes",
    facebook: "https://facebook.com/aisha.campusdemo",
    course: "B.Tech CSE, 3rd year",
    interests: ["AI", "Hackathons", "Coffee"],
    latitude: 17.38525,
    longitude: 78.48695
  },
  {
    username: "rahul_design",
    fullName: "Rahul Mehta",
    bio: "UI/UX club volunteer. Happy to review app screens and posters.",
    instagram: "@rahul.pixel",
    facebook: "https://facebook.com/rahul.campusdemo",
    course: "B.Des Communication Design",
    interests: ["Design", "Figma", "Photography"],
    latitude: 17.38482,
    longitude: 78.48642
  },
  {
    username: "sneha_mba",
    fullName: "Sneha Reddy",
    bio: "MBA student looking for study partners and startup event buddies.",
    instagram: "@sneha.startups",
    facebook: "https://facebook.com/sneha.campusdemo",
    course: "MBA, 1st year",
    interests: ["Startups", "Marketing", "Events"],
    latitude: 17.38558,
    longitude: 78.48713
  },
  {
    username: "arjun_music",
    fullName: "Arjun Nair",
    bio: "Guitarist near the amphitheatre. Ping me for jam sessions.",
    instagram: "@arjun.jams",
    facebook: "https://facebook.com/arjun.campusdemo",
    course: "B.A. Media Studies",
    interests: ["Music", "Open mic", "Film"],
    latitude: 17.38455,
    longitude: 78.48703
  }
];

const toUserDocument = (user) => ({
  username: user.username,
  usernameKey: user.username.toLowerCase(),
  fullName: user.fullName,
  bio: user.bio,
  instagram: user.instagram,
  facebook: user.facebook,
  course: user.course,
  interests: user.interests,
  isVisible: true,
  radius: 500,
  location: {
    type: "Point",
    coordinates: [user.longitude, user.latitude]
  },
  lastActive: new Date(Date.now() + 60 * 60 * 1000)
});

async function seedDemoUsers() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is missing. Add it to .env before seeding demo users.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  console.log("MongoDB connected");

  for (const user of demoUsers) {
    const document = toUserDocument(user);
    await User.findOneAndUpdate(
      { usernameKey: document.usernameKey },
      document,
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  }

  const seededUsers = await User.find({
    usernameKey: { $in: demoUsers.map((user) => user.username.toLowerCase()) }
  })
    .select("username fullName bio instagram facebook course interests location lastActive")
    .sort({ username: 1 })
    .lean();

  console.table(
    seededUsers.map((user) => ({
      username: user.username,
      fullName: user.fullName,
      course: user.course,
      instagram: user.instagram,
      facebook: user.facebook,
      interests: user.interests.join(", "),
      longitude: user.location.coordinates[0],
      latitude: user.location.coordinates[1]
    }))
  );

  await mongoose.disconnect();
  console.log(`Seeded ${seededUsers.length} demo users near 17.38500, 78.48670.`);
}

seedDemoUsers().catch(async (error) => {
  console.error("Failed to seed demo users:", error.message);
  await mongoose.disconnect();
  process.exit(1);
});
