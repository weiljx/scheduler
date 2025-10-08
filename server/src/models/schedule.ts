import mongoose, { Schema, Document } from 'mongoose';
import type { ISchedule } from './types.js';
import { isValidCron as validateCron } from 'cron-validator';

// Omit _id from ISchedule since it's provided by Document
export interface IScheduleDocument extends Omit<ISchedule, '_id'>, Document {}

// Schema definition for Schedule
const scheduleSchema = new Schema({
    name: {
        type: String,
        required: [true, 'Schedule name is required'],
        trim: true
    },
    description: {
        type: String,
        trim: true
    },
    cron: {
        type: String,
        required: [true, 'Cron expression is required'],
        validate: {
            validator: function(value: string) {
                return validateCron(value);
            },
            message: (props: { value: string }) => `${props.value} is not a valid cron expression`
        }
    },
    createdBy: {
        type: String,
        ref: 'User',
        required: [true, 'User reference is required']
    },
    createdAt: {
        type: Date,
        default: Date.now
    }
});

// Create and export the Schedule model
const Schedule = mongoose.model<IScheduleDocument>('Schedule', scheduleSchema);
export default Schedule;
