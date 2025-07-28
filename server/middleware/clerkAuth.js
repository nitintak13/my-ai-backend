// // middleware/clerkAuth.js
// import { clerkClient } from "@clerk/backend";

// export const verifyClerkUser = async (req, res, next) => {
//   try {
//     const authHeader = req.headers.authorization;

//     if (!authHeader?.startsWith("Bearer ")) {
//       return res.status(401).json({ error: "No token provided" });
//     }

//     const token = authHeader.split(" ")[1];

//     const { sub: userId } = await clerkClient.verifyToken(token);
//     if (!userId) {
//       return res.status(401).json({ error: "Invalid token" });
//     }

//     req.user = { id: userId };
//     next();
//   } catch (error) {
//     console.error("[ClerkAuth]", error.message);
//     return res.status(401).json({ error: "Unauthorized" });
//   }
// };
