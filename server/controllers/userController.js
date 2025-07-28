import Job from "../models/Job.js";
import JobApplication from "../models/JobApplication.js";
import User from "../models/User.js";
import { v2 as cloudinary } from "cloudinary";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import redis from "../config/redis.js";
import { GoogleGenAI } from "@google/genai";
import { clerkClient } from "@clerk/clerk-sdk-node";
import axios from "axios";

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
export const getUserJobApplications = async (req, res) => {
  try {
    const userId = req.auth.userId;
    const applications = await JobApplication.find({ userId })
      .populate("companyId", "name email image")
      .populate("jobId", "title description location category level salary");

    if (!applications) {
      return res.json({
        success: false,
        message: "No job applications found for this user.",
      });
    }

    return res.json({ success: true, applications });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};
export const getUserData = async (req, res) => {
  const userId = req.auth.userId;

  try {
    let user = await User.findById(userId);
    if (!user) {
      const clerkUser = await clerkClient.users.getUser(userId);
      user = await User.create({
        _id: userId,
        email: clerkUser.emailAddresses[0].emailAddress,
        name: clerkUser.firstName + " " + clerkUser.lastName,
        image: clerkUser.imageUrl,
        resume: "",
        resumeText: "",
      });
      console.log(`Inserted new User(${userId}) from Clerk Admin API`);
    }

    return res.json({ success: true, user });
  } catch (err) {
    console.error("getUserData error:", err);
    return res.json({ success: false, message: err.message });
  }
};

export const applyForJob = async (req, res) => {
  const { jobId } = req.body;
  const userId = req.auth.userId;

  const rateLimitKey = `rate:user:${userId}`;
  const rateLimit = 10; // ← now 10 per hour
  const windowSec = 60 * 60; // 1 hour

  // Track raw attempts
  const attempts = await redis.incr(rateLimitKey);
  if (attempts === 1) {
    await redis.expire(rateLimitKey, windowSec);
  }
  if (attempts > rateLimit) {
    const ttl = await redis.ttl(rateLimitKey);
    return res.json({
      success: false,
      message: `Too many attempts. Try again in ${Math.ceil(ttl / 60)} mins.`,
      rateLimited: true,
      retryAfter: Date.now() + ttl * 1000,
    });
  }

  try {
    // Prevent duplicate applications
    if (await JobApplication.findOne({ jobId, userId })) {
      return res.json({ success: false, message: "Already Applied" });
    }

    const cooldownKey = `cooldown:${userId}:${jobId}`;
    const scoreCacheKey = `score:${userId}:${jobId}`;

    // If on cooldown, return cached advice/score
    if (await redis.exists(cooldownKey)) {
      const ttl = await redis.ttl(cooldownKey);
      return res.json({
        success: true,
        blocked: true,
        matchScore: parseFloat(await redis.get(scoreCacheKey)) || 0,
        advice: (await redis.get(scoreCacheKey)) || "No advice returned.",
        cooldownExpiry: Date.now() + ttl * 1000,
      });
    }

    // Fetch job & user
    const job = await Job.findById(jobId);
    const user = await User.findById(userId);
    if (!job || !user) {
      return res.json({ success: false, message: "Job or User not found" });
    }

    // Call FastAPI matcher
    let aiData = {
      score: 0,
      advice: "No advice returned.",
      missing_skills: [],
      resume_suggestions: [],
      resources: [],
      fit_analysis: { summary: "", strengths: [], weaknesses: [] },
    };
    try {
      const { data } = await axios.post("http://localhost:8000/api/match/", {
        resume_text: user.resumeText || "",
        jd_text: job.description || "",
      });
      aiData = { ...aiData, ...data };
    } catch (err) {
      console.error("❌ AI match error:", err.message);
      return res.json({ success: false, message: "AI matching failed." });
    }

    // Cache advice & score for 24h
    await redis.setex(scoreCacheKey, 24 * 60 * 60, aiData.advice);
    await redis.setex(
      `score:${userId}:${jobId}`,
      24 * 60 * 60,
      aiData.score.toString()
    );

    // Block low scores with 5h cooldown
    if (aiData.score < 75) {
      const ttl = 5 * 60 * 60;
      await redis.setex(cooldownKey, ttl, "1");
      return res.json({
        success: true,
        blocked: true,
        matchScore: aiData.score,
        advice: aiData.advice,
        missingSkills: aiData.missing_skills,
        resumeSuggestions: aiData.resume_suggestions,
        resources: aiData.resources,
        fitAnalysis: aiData.fit_analysis,
        cooldownExpiry: Date.now() + ttl * 1000,
      });
    }

    // Track successful applies (also limited to 10/hour)
    const successKey = `rate:success:${userId}`;
    const successCount = await redis.incr(successKey);
    if (successCount === 1) {
      await redis.expire(successKey, windowSec);
    }
    if (successCount > rateLimit) {
      return res.json({
        success: false,
        rateLimited: true,
        message: "You've reached your hourly apply limit.",
      });
    }

    // Persist application
    await JobApplication.create({
      companyId: job.companyId,
      userId,
      jobId,
      date: Date.now(),
      matchScore: aiData.score,
      aiAdvice: aiData.advice,
    });

    // Add to sorted set for recruiter ordering
    await redis.zadd(
      `job:${jobId}:applications`,
      aiData.score,
      `user:${userId}`
    );

    // Final success response
    return res.json({
      success: true,
      blocked: false,
      matchScore: aiData.score,
      advice: aiData.advice,
      fitAnalysis: aiData.fit_analysis,
      missingSkills: aiData.missing_skills,
      resumeSuggestions: aiData.resume_suggestions,
      resources: aiData.resources,
    });
  } catch (err) {
    console.error("❌ applyForJob error:", err);
    return res.status(500).json({ success: false, message: err.message });
  }
};

export const updateUserResume = async (req, res) => {
  try {
    const userId = req.auth.userId;

    // Rate limit resume uploads per day
    const rateKey = `resume:upload:${userId}`;
    const currentUploads = await redis.get(rateKey);
    if (currentUploads && parseInt(currentUploads) >= 3) {
      return res.json({
        success: false,
        message: "You have reached your resume upload limit for today.",
      });
    }

    if (!req.file) {
      return res.json({ success: false, message: "No file provided" });
    }

    // Fetch user from DB
    const userData = await User.findById(userId);
    if (!userData) {
      return res.json({ success: false, message: "User not found" });
    }

    // Upload to Cloudinary
    const cloudinaryUpload = () =>
      new Promise((resolve, reject) => {
        const uploadStream = cloudinary.uploader.upload_stream(
          { resource_type: "auto" },
          (err, result) => {
            if (err) return reject(err);
            resolve(result.secure_url);
          }
        );
        uploadStream.end(req.file.buffer);
      });

    const resumeUrl = await cloudinaryUpload();
    userData.resume = resumeUrl;

    // Extract text from PDF for later AI matching
    const pdfData = await pdfParse(req.file.buffer);
    userData.resumeText = pdfData.text;
    await userData.save();

    // Invalidate any previous cached scores
    const allJobs = await Job.find({});
    for (const job of allJobs) {
      await redis.del(`score:${userId}:${job._id}`);
    }

    // Increment upload counter
    if (currentUploads) {
      await redis.incr(rateKey);
    } else {
      await redis.setex(rateKey, 24 * 60 * 60, 1);
    }

    return res.json({
      success: true,
      message: "Resume updated successfully.",
      resume: resumeUrl,
    });
  } catch (error) {
    console.error("updateUserResume error:", error);
    return res.json({ success: false, message: error.message });
  }
};
