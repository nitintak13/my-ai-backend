import redis from "../config/redis.js";
import Company from "../models/Company.js";
import bcrypt from "bcrypt";
import { v2 as cloudinary } from "cloudinary";
import generateToken from "../utils/generateToken.js";
import Job from "../models/Job.js";
import JobApplication from "../models/JobApplication.js";
import User from "../models/User.js";
import { GoogleGenAI } from "@google/genai";
const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
export const registerCompany = async (req, res) => {
  const { name, email, password } = req.body;
  const imageFile = req.file;

  if (!name || !email || !password || !imageFile) {
    return res.json({ success: false, message: "Missing Details" });
  }

  try {
    const exists = await Company.findOne({ email });
    if (exists) {
      return res.json({
        success: false,
        message: "Company already registered",
      });
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const imageUpload = await cloudinary.uploader.upload(imageFile.path);

    const company = await Company.create({
      name,
      email,
      password: hashedPassword,
      image: imageUpload.secure_url,
    });

    res.json({
      success: true,
      company: {
        _id: company._id,
        name: company.name,
        email: company.email,
        image: company.image,
      },
      token: generateToken(company._id),
    });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

// Login
export const loginCompany = async (req, res) => {
  const { email, password } = req.body;
  try {
    const company = await Company.findOne({ email });
    if (company && (await bcrypt.compare(password, company.password))) {
      return res.json({
        success: true,
        company: {
          _id: company._id,
          name: company.name,
          email: company.email,
          image: company.image,
        },
        token: generateToken(company._id),
      });
    }
    res.json({ success: false, message: "Invalid email or password" });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

// Get company data
export const getCompanyData = async (req, res) => {
  try {
    res.json({ success: true, company: req.company });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

// Post a new job
export const postJob = async (req, res) => {
  try {
    const { title, description, location, salary, level, category } = req.body;
    const companyId = req.company._id;

    // Create new job entry
    const newJob = await Job.create({
      title,
      description,
      location,
      salary,
      companyId,
      level,
      category,
      date: Date.now(),
    });

    // Return the newly created job without any auto-apply logic
    return res.json({
      success: true,
      newJob,
    });
  } catch (error) {
    console.error("postJob error:", error);
    return res.json({ success: false, message: error.message });
  }
};

export const getSortedApplicants = async (req, res) => {
  const { jobId } = req.query;
  if (!jobId) {
    return res
      .status(400)
      .json({ success: false, message: "Job ID is required" });
  }

  try {
    const redisKey = `job:${jobId}:applications`;
    const users = await redis.zrevrange(redisKey, 0, -1);

    const applicants = await Promise.all(
      users.map(async (redisUser) => {
        const userId = redisUser.split(":")[1];
        const app = await JobApplication.findOne({ userId, jobId })
          .populate("userId", "name email image resume")
          .populate("jobId", "title location");
        return app;
      })
    );

    res.json({ success: true, applicants: applicants.filter(Boolean) });
  } catch (error) {
    console.error("getSortedApplicants error:", error);
    res.status(500).json({ success: false, message: error.message });
  }
};

export const getCompanyJobApplicants = async (req, res) => {
  const { jobId } = req.query;
  if (!jobId) {
    return res
      .status(400)
      .json({ success: false, message: "Job ID is required" });
  }

  try {
    const applicants = await JobApplication.find({
      jobId,
      matchScore: { $gte: 60 },
    })
      .populate("userId", "name email image resume")
      .populate("jobId", "title location")
      .sort({ matchScore: -1 });

    res.json({ success: true, applicants });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

// Get all applicants across all jobs posted by this company
export const getAllCompanyApplicants = async (req, res) => {
  try {
    const companyId = req.company._id;
    const jobs = await Job.find({ companyId }).select("_id");
    const jobIds = jobs.map((job) => job._id);

    const applications = await JobApplication.find({ jobId: { $in: jobIds } })
      .populate("userId", "name email image resume")
      .populate("jobId", "title location");

    res.json({ success: true, applicants: applications });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

// List jobs posted by this company (for dropdown)
export const getCompanyPostedJobs = async (req, res) => {
  try {
    const companyId = req.company._id;
    const jobs = await Job.find({ companyId });

    const jobsData = await Promise.all(
      jobs.map(async (job) => {
        const count = await JobApplication.countDocuments({ jobId: job._id });
        return { ...job.toObject(), applicants: count };
      })
    );

    res.json({ success: true, jobsData });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

// Change applicant status
export const ChangeJobApplicationsStatus = async (req, res) => {
  try {
    const { id, status } = req.body;
    await JobApplication.findOneAndUpdate({ _id: id }, { status });
    res.json({ success: true, message: "Status Changed" });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

// Toggle job visibility
export const changeVisiblity = async (req, res) => {
  try {
    const { id } = req.body;
    const job = await Job.findById(id);
    if (req.company._id.toString() === job.companyId.toString()) {
      job.visible = !job.visible;
      await job.save();
      res.json({ success: true, job });
    } else {
      res.json({ success: false, message: "Unauthorized" });
    }
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};
