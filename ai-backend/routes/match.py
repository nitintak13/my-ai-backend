from fastapi import APIRouter, HTTPException
from models.request_models import MatchRequest
from models.response_models import MatchResponse
from rag.resume_matcher import match_resume_to_jd
from uuid import uuid4

router = APIRouter()

@router.post("/", response_model=MatchResponse)
async def match_resume_to_job(request: MatchRequest):
    print("[DEBUG] Match API called.")
    print("[DEBUG] Request received:", request)

    try:
        ns = str(uuid4())
        result = match_resume_to_jd(request.resume_text, request.jd_text, ns)
        print("[DEBUG] Raw result from matcher:", result)

        required_keys = ["score", "advice", "missing_skills", "resume_suggestions"]
        for key in required_keys:
            if key not in result:
                raise HTTPException(status_code=500, detail=f"Missing key: {key}")

        # Optional deeper feedback
        fit_analysis = result.get("fit_analysis", {})
        resources = result.get("resources", [])

        print("[FINAL RESPONSE]", {
            "score": result["score"],
            "advice": result["advice"],
            "fit_analysis": fit_analysis,
            "resources": resources
        })

        return MatchResponse(
            success=True,
            message="Match successful",
            score=result["score"],
            advice=result["advice"],
            missing_skills=result["missing_skills"],
            resume_suggestions=result["resume_suggestions"],
            resources=resources,
            fit_analysis=fit_analysis
        )

    except Exception as e:
        print("[ERROR]", str(e))
        raise HTTPException(status_code=500, detail=f"Matching failed: {str(e)}")
