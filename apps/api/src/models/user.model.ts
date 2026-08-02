import { Schema, model, type HydratedDocument } from "mongoose";

export interface UserData {
  name: string;
  email: string;
  passwordHash: string;
  createdAt: Date;
  updatedAt: Date;
}

export type UserDocument = HydratedDocument<UserData>;

const userSchema = new Schema<UserData>(
  {
    name: { type: String, required: true, trim: true, maxlength: 80 },
    email: { type: String, required: true, trim: true, lowercase: true, maxlength: 254 },
    passwordHash: { type: String, required: true, select: false },
  },
  {
    timestamps: true,
    versionKey: false,
  },
);

userSchema.index({ email: 1 }, { unique: true, name: "users_email_unique" });

export const User = model<UserData>("User", userSchema);

export function serializeUser(user: UserDocument): {
  id: string;
  name: string;
  email: string;
} {
  return {
    id: user._id.toString(),
    name: user.name,
    email: user.email,
  };
}
