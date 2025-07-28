

from pydantic import BaseModel

class MatchRequest(BaseModel):
    resume_text: str
    jd_text: str
