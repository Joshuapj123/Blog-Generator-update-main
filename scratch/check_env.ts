// scratch/check_env.ts
import dotenv from 'dotenv';
dotenv.config();

console.log("Checking Environment Variables:");
console.log("SERP_KEY exists:", !!process.env.SERP_KEY);
console.log("GOOGLE_GENERATIVE_AI_API_KEY exists:", !!process.env.GOOGLE_GENERATIVE_AI_API_KEY);
console.log("GEMINI_API_KEY exists:", !!process.env.GEMINI_API_KEY);
console.log("YOUTUBE_API_KEY exists:", !!process.env.YOUTUBE_API_KEY);
