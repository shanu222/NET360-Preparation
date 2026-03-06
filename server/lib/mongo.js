import mongoose from 'mongoose';

export async function connectMongo(uri) {
  if (!uri) {
    throw new Error('MONGODB_URI is required for production backend mode.');
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  await mongoose.connect(uri, {
    maxPoolSize: 20,
    serverSelectionTimeoutMS: 15000,
  });

  return mongoose.connection;
}
