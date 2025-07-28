import { useContext, useEffect, useState } from "react";
import { useAuth, useUser } from "@clerk/clerk-react";
import axios from "axios";
import moment from "moment";
import { toast } from "react-toastify";

import Navbar from "../components/Navbar";
import Footer from "../components/Footer";
import Loading from "../components/Loading";
import { AppContext } from "../context/AppContext";
import { assets } from "../assets/assets";

const Applications = () => {
  const { user } = useUser();
  const { getToken } = useAuth();
  const [isEdit, setIsEdit] = useState(false);
  const [resume, setResume] = useState(null);
  const [openFeedbackIndex, setOpenFeedbackIndex] = useState(null);

  const {
    backendUrl,
    userData,
    userApplications,
    fetchUserData,
    fetchUserApplications,
  } = useContext(AppContext);

  const updateResume = async () => {
    try {
      const formData = new FormData();
      formData.append("resume", resume);
      const token = await getToken();

      const { data } = await axios.post(
        `${backendUrl}/api/users/update-resume`,
        formData,
        { headers: { Authorization: `Bearer ${token}` } }
      );

      if (data.success) {
        toast.success(data.message);
        await fetchUserData();
      } else {
        toast.error(data.message);
      }

      setIsEdit(false);
      setResume(null);
    } catch {
      toast.error("Error updating resume.");
    }
  };

  useEffect(() => {
    if (user) fetchUserApplications();
  }, [user]);

  if (!userData) return <Loading />;

  return (
    <>
      <Navbar />
      <div className="max-w-5xl mx-auto px-4 py-8">
        <h2 className="text-xl font-medium mb-4">Your Resume</h2>
        <div className="flex items-center gap-3 mb-8">
          {isEdit || !userData.resume ? (
            <>
              <label
                htmlFor="resumeUpload"
                className="flex items-center gap-2 cursor-pointer"
              >
                <p className="bg-gray-100 text-gray-700 px-3 py-1 rounded">
                  {resume ? resume.name : "Choose PDF"}
                </p>
                <input
                  id="resumeUpload"
                  type="file"
                  accept="application/pdf"
                  hidden
                  onChange={(e) => setResume(e.target.files[0])}
                />
                <img
                  src={assets.profile_upload_icon}
                  alt="upload"
                  className="w-5"
                />
              </label>
              <button
                onClick={updateResume}
                className="px-3 py-1 text-sm bg-green-200 text-green-800 rounded"
              >
                Save
              </button>
            </>
          ) : (
            <>
              <a
                href={userData.resume}
                target="_blank"
                rel="noreferrer"
                className="px-3 py-1 bg-blue-100 text-blue-600 rounded text-sm"
              >
                View Resume
              </a>
              <button
                onClick={() => setIsEdit(true)}
                className="px-3 py-1 border text-gray-700 rounded text-sm"
              >
                Edit
              </button>
            </>
          )}
        </div>

        <h2 className="text-xl font-medium mb-4">Jobs Applied</h2>
        <div className="overflow-x-auto">
          <table className="w-full bg-white border">
            <thead>
              <tr className="bg-gray-50 text-sm">
                <th className="px-4 py-2 text-left">Company</th>
                <th className="px-4 py-2 text-left">Title</th>
                <th className="px-4 py-2 text-left hidden sm:table-cell">
                  Location
                </th>
                <th className="px-4 py-2 text-left hidden sm:table-cell">
                  Date
                </th>
                <th className="px-4 py-2 text-left">Status</th>
                <th className="px-4 py-2 text-left">Fit</th>
                <th className="px-4 py-2 text-left">Feedback</th>
              </tr>
            </thead>
            <tbody>
              {userApplications
                .filter((app) => app?.jobId && app?.companyId)
                .map((app, idx) => (
                  <tr key={idx} className="border-t text-sm">
                    <td className="px-4 py-2 flex items-center gap-2">
                      <img
                        src={app.companyId?.image || assets.default_avatar}
                        alt="company"
                        className="w-6 h-6 rounded-full"
                      />
                      {app.companyId?.name}
                    </td>
                    <td className="px-4 py-2">{app.jobId?.title}</td>
                    <td className="px-4 py-2 hidden sm:table-cell">
                      {app.jobId?.location}
                    </td>
                    <td className="px-4 py-2 hidden sm:table-cell">
                      {moment(app.date).format("ll")}
                    </td>
                    <td className="px-4 py-2">
                      <span
                        className={`px-2 py-1 rounded text-xs ${
                          app.status === "Accepted"
                            ? "bg-green-100 text-green-700"
                            : app.status === "Rejected"
                            ? "bg-red-100 text-red-700"
                            : "bg-yellow-100 text-yellow-700"
                        }`}
                      >
                        {app.status}
                      </span>
                    </td>
                    <td className="px-4 py-2">
                      {app.matchScore != null ? (
                        <span
                          className={`text-xs px-2 py-1 rounded ${
                            app.matchScore >= 60
                              ? "bg-green-50 text-green-700"
                              : "bg-red-50 text-red-700"
                          }`}
                        >
                          {app.matchScore}/100
                        </span>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                    <td className="px-4 py-2">
                      {app.matchScore != null ? (
                        <button
                          onClick={() =>
                            setOpenFeedbackIndex(
                              openFeedbackIndex === idx ? null : idx
                            )
                          }
                          className="text-blue-600 text-xs underline"
                        >
                          {openFeedbackIndex === idx ? "Hide" : "View"}
                        </button>
                      ) : (
                        <span className="text-gray-400 text-xs">—</span>
                      )}
                    </td>
                  </tr>
                ))}
            </tbody>
          </table>
        </div>

        {userApplications.map((app, idx) =>
          openFeedbackIndex === idx ? (
            <div
              key={`feedback-${idx}`}
              className="mt-4 p-4 bg-yellow-50 border text-sm rounded"
            >
              <p className="font-semibold">Fit Score: {app.matchScore}/100</p>
              <p className="mt-2 whitespace-pre-wrap">{app.aiAdvice}</p>

              {app.missingSkills?.length > 0 && (
                <>
                  <h4 className="mt-4 font-medium">Missing Skills</h4>
                  <ul className="list-disc list-inside">
                    {app.missingSkills.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </>
              )}

              {app.resumeSuggestions?.length > 0 && (
                <>
                  <h4 className="mt-4 font-medium">Resume Suggestions</h4>
                  <ul className="list-disc list-inside">
                    {app.resumeSuggestions.map((s, i) => (
                      <li key={i}>{s}</li>
                    ))}
                  </ul>
                </>
              )}

              {app.resources?.length > 0 && (
                <>
                  <h4 className="mt-4 font-medium">Resources</h4>
                  <ul className="list-disc list-inside">
                    {app.resources.map((r, i) => (
                      <li key={i}>
                        <a
                          href={r.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="underline"
                        >
                          {r.title || r.url}
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              )}

              {app.fitAnalysis?.summary && (
                <>
                  <h4 className="mt-4 font-medium">Fit Analysis</h4>
                  <p>{app.fitAnalysis.summary}</p>
                  {app.fitAnalysis.strengths?.length > 0 && (
                    <>
                      <h5 className="mt-2 font-medium">Strengths</h5>
                      <ul className="list-disc list-inside">
                        {app.fitAnalysis.strengths.map((s, i) => (
                          <li key={i}>{s}</li>
                        ))}
                      </ul>
                    </>
                  )}
                  {app.fitAnalysis.weaknesses?.length > 0 && (
                    <>
                      <h5 className="mt-2 font-medium">Weaknesses</h5>
                      <ul className="list-disc list-inside">
                        {app.fitAnalysis.weaknesses.map((w, i) => (
                          <li key={i}>{w}</li>
                        ))}
                      </ul>
                    </>
                  )}
                </>
              )}
            </div>
          ) : null
        )}
      </div>
      <Footer />
    </>
  );
};

export default Applications;
