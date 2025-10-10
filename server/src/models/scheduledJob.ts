import mongoose, { Schema, Document } from 'mongoose';
import type { IScheduledJob } from './types.js';

// Omit _id from IScheduledJob since it's provided by Document
export interface IScheduledJobDocument extends Omit<IScheduledJob, '_id'>, Document {}

// Schema definition for ScheduledJob
const scheduledJobSchema = new Schema(
  {    
    scheduleId: {
      type: Schema.Types.ObjectId,
      ref: 'Schedule',
      required: true,
      index: true,
    },
    startedAt: {
      type: Date,
      default: Date.now,
      index: true,
    },
    completedAt: {
      type: Date,
    },
    status: {
      type: String,
      enum: ['pending', 'started', 'success', 'failed'],
      default: 'pending',
      index: true,
    }    
  }
);

// Create and export the ScheduledJob model
const ScheduledJob = mongoose.model<IScheduledJobDocument>('ScheduledJob', scheduledJobSchema);
export default ScheduledJob;
