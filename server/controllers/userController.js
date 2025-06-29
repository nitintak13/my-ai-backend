import Job from "../models/Job.js";
import JobApplication from "../models/JobApplication.js";
import User from "../models/User.js";
import { v2 as cloudinary } from "cloudinary";
import pdfParse from "pdf-parse/lib/pdf-parse.js";
import redis from "../config/redis.js";
import { GoogleGenAI } from "@google/genai";
import { clerkClient } from "@clerk/clerk-sdk-node";

// Initialize Gemini AI
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

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
  const rateLimit = 5;
  const windowSec = 60 * 60;

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
    const already = await JobApplication.findOne({ jobId, userId });
    if (already) {
      return res.json({ success: false, message: "Already Applied" });
    }

    const cooldownKey = `cooldown:${userId}:${jobId}`;
    const scoreCacheKey = `score:${userId}:${jobId}`;

    const isBlocked = await redis.exists(cooldownKey);
    if (isBlocked) {
      const cachedAdvice = await redis.get(scoreCacheKey);
      const ttl = await redis.ttl(cooldownKey);
      const match = cachedAdvice?.match(/Match Score:\s*(\d+)/i);
      const score = match ? parseInt(match[1], 10) : null;
      const expiryTimestamp = Date.now() + ttl * 1000;

      return res.json({
        success: true,
        blocked: true,
        matchScore: score,
        advice: cachedAdvice,
        cooldownExpiry: expiryTimestamp,
      });
    }

    const job = await Job.findById(jobId);
    const user = await User.findById(userId);
    if (!job || !user) {
      return res.json({ success: false, message: "Job or User not found" });
    }

    const prompt = `You are a highly experienced AI recruiter and resume screening expert working for a top tech company. Your job is to evaluate how well a candidate’s resume matches a given job description and provide a comprehensive analysis.

Please perform the following steps:

1. **Carefully analyze the resume** for details like:
   - Work experience (titles, responsibilities, domains, years)
   - Tools, programming languages, frameworks, platforms
   - Degree, specialization/branch, college, graduation year
   - Certifications, internships, open-source work, achievements
   - Roles held, leadership/mentorship, projects, results

2. **Compare each element against the job description**, which includes:
   - Expected skills and tech stack
   - Required experience (years + type of work)
   - Minimum qualifications (degree/branch/year/college)
   - Tools/methodologies (Agile, DevOps, CI/CD, etc.)
   - Specific roles, industries, and project exposure

3. **Identify all strong matches** and **highlight every weak or missing area** from the resume in a professional tone. Be specific and factual.
 keep advice like roadmap what to do or not to do where to start short and concise bullet points learn these to get better score
Resume:
${user.resumeText}

Job Description:${job.description}
4. **Return your output in the format below:**

Match Score: XX

Strong Points:
- [Bullet points highlighting good alignment with the JD]
- [Mention tools, experiences, qualifications that match exactly]

Missing or Weak Areas:
- [Bullet points describing each missing requirement or weak fit]
- [Be clear, specific, and non-repetitive]

Advice:
- Provide 3–5 clear, personalized suggestions on how the candidate can improve their match.
- Include practical resume improvements, tools to learn, experiences to highlight, or degree clarifications.
- Be empathetic but honest – the goal is to help the candidate become a better fit.




Please respond ONLY using the required format. Do not generate any extra commentary or sections. Keep the tone professional and precise.

`;

    const response = await ai.models.generateContent({
      model: "gemini-2.0-flash",
      contents: prompt,
    });

    const text = response.text;
    console.log("🎯 Raw AI output:\n", text);

    let match = text.match(/Match Score:\s*(\d{1,3})/i);
    if (!match) {
      match = text.match(/(\d{1,3})\s*\/\s*100/);
    }
    const score = match ? parseInt(match[1], 10) : 0;
    console.log("🏷 Parsed score:", score);
    // Cache score & advice
    await redis.setex(scoreCacheKey, 24 * 60 * 60, text);

    if (score < 60) {
      const ttl = 5 * 60 * 60; // 5 hours
      await redis.setex(cooldownKey, ttl, "true");
      const expiryTimestamp = Date.now() + ttl * 1000;
      // console.log(
      //   `Cooldown applied for user ${userId} on job ${jobId} (score: ${score})`
      // );
      return res.json({
        success: true,
        blocked: true,
        matchScore: score,
        advice: text.trim(),
        cooldownExpiry: expiryTimestamp,
      });
    }

    const successKey = `ratelimit:success:${userId}`;
    const count = await redis.incr(successKey);
    if (count === 1) await redis.expire(successKey, windowSec);
    if (count > rateLimit) {
      return res.json({
        success: false,
        rateLimited: true,
        message: "You've reached your hourly apply limit.",
      });
    }

    await JobApplication.create({
      companyId: job.companyId,
      userId,
      jobId,
      date: Date.now(),
      matchScore: score,
      aiAdvice: text.trim(),
    });

    await redis.zadd(`job:${jobId}:applications`, score, `user:${userId}`);

    return res.json({
      success: true,
      blocked: false,
      matchScore: score,
      advice: text.trim(),
    });
  } catch (err) {
    console.error("applyForJob error:", err);
    return res.json({ success: false, message: err.message });
  }
};

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

export const updateUserResume = async (req, res) => {
  try {
    const userId = req.auth.userId;

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

    const userData = await User.findById(userId);

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

    const pdfData = await pdfParse(req.file.buffer);
    userData.resumeText = pdfData.text;
    await userData.save();

    const allJobs = await Job.find({});
    for (const job of allJobs) {
      await redis.del(`score:${userId}:${job._id}`);
    }

    if (currentUploads) {
      await redis.incr(rateKey);
    } else {
      await redis.setex(rateKey, 24 * 60 * 60, 1);
    }

    const appliedJobIds = await JobApplication.find({ userId }).distinct(
      "jobId"
    );
    const unappliedJobs = allJobs.filter(
      (job) => !appliedJobIds.includes(job._id.toString())
    );

    for (const job of unappliedJobs) {
      const cooldownKey = `cooldown:${userId}:${job._id}`;
      const isBlocked = await redis.exists(cooldownKey);
      if (isBlocked) continue;

      const alreadyApplied = await JobApplication.exists({
        userId,
        jobId: job._id,
      });
      if (alreadyApplied) continue;

      const prompt = `You are a highly experienced AI recruiter and resume screening expert working for a top tech company. Your job is to evaluate how well a candidate’s resume matches a given job description and provide a comprehensive analysis.

Please perform the following steps:

1. **Carefully analyze the resume** for details like:
   - Work experience (titles, responsibilities, domains, years)
   - Tools, programming languages, frameworks, platforms
   - Degree, specialization/branch, college, graduation year
   - Certifications, internships, open-source work, achievements
   - Roles held, leadership/mentorship, projects, results

2. **Compare each element against the job description**, which includes:
   - Expected skills and tech stack
   - Required experience (years + type of work)
   - Minimum qualifications (degree/branch/year/college)
   - Tools/methodologies (Agile, DevOps, CI/CD, etc.)
   - Specific roles, industries, and project exposure

3. **Identify all strong matches** and **highlight every weak or missing area** from the resume in a professional tone. Be specific and factual.
Keep advice like roadmap what to do or not to do where to start short and concise bullet points learn these to get better score

Resume:
${userData.resumeText}

Job Description:
${job.description}

4. **Return your output in the format below:**

Match Score: XX

Strong Points:
- [Bullet points]

Missing or Weak Areas:
- [Bullet points]

Advice:
- [3–5 personalized, short, practical suggestions]
`;
      console.log(`🔥 Calling Gemini for user ${userId}, job ${jobId}`);
      let text = "";
      try {
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);

        const response = await ai.models.generateContent({
          model: "gemini-2.0-flash",
          contents: prompt,
          signal: controller.signal,
        });

        clearTimeout(timeout);
        text = response.text || "";
        console.log(`✅ Gemini returned (${text.length} chars)`);
      } catch (err) {
        console.error("⛔ Gemini call failed or timed out:", err.message);
        // Fail early or fallback:
        return res.json({
          success: false,
          message: "AI scoring unavailable, please try again later.",
        });
      }

      const match = text.match(/Match Score:\s*(\d+)/i);
      const score = match ? parseInt(match[1], 10) : 0;

      await redis.setex(`score:${userId}:${job._id}`, 24 * 60 * 60, text);

      if (score < 60) {
        await redis.setex(cooldownKey, 5 * 60 * 60, "true");
        continue;
      }

      await JobApplication.create({
        companyId: job.companyId,
        userId,
        jobId: job._id,
        date: Date.now(),
        matchScore: score,
        aiAdvice: text.trim(),
      });

      await redis.zadd(`job:${job._id}:applications`, score, `user:${userId}`);

      console.log(`Auto-applied to ${job.title}`);
    }

    return res.json({
      success: true,
      message: "Resume updated and auto-applied to eligible jobs.",
      resume: resumeUrl,
    });
  } catch (error) {
    console.error("updateUserResume error:", error);
    return res.json({ success: false, message: error.message });
  }
};
