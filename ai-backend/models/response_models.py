from pydantic import BaseModel
from typing import List, Optional, Dict, Any

class MatchResponse(BaseModel):
    success: bool
    message: str
    score: float
    advice: str
    missing_skills: List[str]
    resume_suggestions: List[str]
    resources: Optional[List[dict]] = []
    fit_analysis: Optional[Dict[str, Any]] = {}  
