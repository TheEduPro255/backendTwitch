const mongoose = require("mongoose");

const eventSchema = new mongoose.Schema({
    title: { type: String, required: true },
    description: { type: String, default: "" },

    date: { type: String, required: true },
    time: { type: String, required: true },

    streamerId: { type: String, required: true },
    streamerName: { type: String, required: true },
    streamerAvatar: { type: String, required: true },

    userId: { type: String, required: true },

    createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Event", eventSchema);