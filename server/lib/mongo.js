import mongoose from 'mongoose';

export async function connectMongo(uri) {
  if (!uri) {
    throw new Error('MONGODB_URI is required for production backend mode.');
  }

  if (mongoose.connection.readyState === 1) {
    return mongoose.connection;
  }

  mongoose.set('strictQuery', true);

  await mongoose.connect(uri, {
    minPoolSize: 2,
    maxPoolSize: 20,
    maxIdleTimeMS: 30_000,
    socketTimeoutMS: 45_000,
    serverSelectionTimeoutMS: 15000,
    autoIndex: process.env.NODE_ENV !== 'production',
  });

  return mongoose.connection;
}
