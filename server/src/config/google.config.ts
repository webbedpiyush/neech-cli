import dotenv from "dotenv";
dotenv.config();

export const config = {
  googleApiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || "",
  neechModel: process.env.NEECH_MODEL || "gemini-2.5-flash",
};
