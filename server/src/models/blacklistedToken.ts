import mongoose from 'mongoose';

export interface IBlacklistedToken {
    token: string;
    createdAt: Date;
}

const blacklistedTokenSchema = new mongoose.Schema<IBlacklistedToken>({
    token: {
        type: String,
        required: true,
        unique: true
    },
    createdAt: {
        type: Date,
        default: Date.now,
        expires: '24h' // Automatically delete tokens after 24 hours
    }
});

const BlacklistedToken = mongoose.model<IBlacklistedToken>('BlacklistedToken', blacklistedTokenSchema);

export default BlacklistedToken;
