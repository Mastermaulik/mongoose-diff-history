const mongoose = require('mongoose');
const mongoosastic = require('mongoosastic');

const historySchema = new mongoose.Schema(
  {
    collectionName: { type: String, es_indexed: true },
    contentId: { type: mongoose.Schema.Types.ObjectId, es_indexed: true },
    contentIds: { type: [mongoose.Schema.Types.ObjectId], es_indexed: true },
    diff: { type: mongoose.Schema.Types.Mixed, es_indexed: true },
    original: {},
    updated: {},
    user: {},
    description: { type: String, es_indexed: true },
    version: { type: Number, min: 0 },
    createdAt: { type: Date, es_indexed: true },
    updatedAt: { type: Date, es_indexed: true },
    actorId: { type: mongoose.Schema.Types.ObjectId, es_indexed: true },
    action: { type: String, es_indexed: true }
  },
  {
    timestamps: true
  });

const History = mongoose.model('History', historySchema);

module.exports = History;
