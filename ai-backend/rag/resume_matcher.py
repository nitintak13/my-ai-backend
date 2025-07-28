

import json
import re
import logging
from bs4 import BeautifulSoup
from clients.groq_llm import get_groq_llm
from rag.vector_store import add_to_vector_store, get_retriever
from langchain.chains import RetrievalQA
from langchain.schema.messages import AIMessage

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)


def html_to_text(html: str) -> str:
    """Convert HTML content to plain text."""
    soup = BeautifulSoup(html, "html.parser")
    return soup.get_text(separator=" ")


def extract_json(text: str) -> dict | None:
    """Extract and clean JSON from LLM output."""
    try:
        fence_match = re.search(r"```(?:json)?\s*(\{.*?\})\s*```", text, re.DOTALL)
        if fence_match:
            json_text = fence_match.group(1)
        else:
            start = text.find('{')
            end = text.rfind('}')
            if start != -1 and end != -1:
                json_text = text[start:end+1]
            else:
                logger.warning("[extract_json] No JSON boundaries found")
                return None
        return json.loads(json_text)
    except Exception as e:
        logger.error(f"[extract_json] JSON parse error: {e}")
        logger.debug(f"Raw LLM output: {text}")
        return None


def normalize_resources(resources) -> list[dict]:
    """Ensure resources is a list of dicts with title and url."""
    normalized = []
    if isinstance(resources, list):
        for r in resources:
            if isinstance(r, dict) and 'url' in r:
                normalized.append(r)
            elif isinstance(r, str):
                normalized.append({'title': r, 'url': r})
    return normalized


def generate_prompt(resume_text: str, jd_text: str) -> str:
    """Prompt for evaluating resume–JD match."""
    return f"""
You are a FAANG-level recruiter with 10+ years of experience, extremely strict when evaluating resumes against job descriptions. Provide objective, experience-backed feedback.

Return ONLY a raw JSON object with keys:
- score (0–100)
- advice
- fit_analysis: {{summary, strengths, weaknesses}}
- missing_skills
- resume_suggestions
- resources (list of {{title, url}})

---RESUME---
{resume_text}

---JOB DESCRIPTION---
{jd_text}
"""


def direct_prompt(resume_text: str, jd_text: str) -> dict:
    """Fallback: Use LLM without RAG context."""
    prompt = generate_prompt(resume_text, jd_text)
    llm = get_groq_llm()
    output = llm.invoke(prompt)
    raw_output = output.content if isinstance(output, AIMessage) else str(output)
    logger.info(f"[direct_prompt] Raw LLM output:\n{raw_output}")
    parsed = extract_json(raw_output)
    if parsed:
        parsed['resources'] = normalize_resources(parsed.get('resources', []))
        return parsed
    raise RuntimeError("Failed to parse LLM output from direct prompt")


def match_resume_to_jd(resume_text: str, jd_text: str, namespace: str) -> dict:
 
    resume_plain = html_to_text(resume_text)
    jd_plain = html_to_text(jd_text)

    doc_id = f"session-{namespace}"
   
    add_to_vector_store(f"{doc_id}-resume", resume_plain, namespace)
    add_to_vector_store(f"{doc_id}-jd", jd_plain, namespace)

    
    retriever = get_retriever(namespace)

    query_text = jd_plain.split('\n', 1)[0][:200]
    logger.info(f"[Matcher] Querying retriever with: {query_text}")
   
    retrieved_docs = retriever.invoke(query_text)
    logger.info(f"[Matcher] Retrieved {len(retrieved_docs)} docs from RAG context")

  
    if not retrieved_docs:
        logger.warning("[Matcher] No RAG context found, using direct prompt")
        return direct_prompt(resume_plain, jd_plain)

   
    prompt = generate_prompt(resume_plain, jd_plain)
    llm = get_groq_llm()
    chain = RetrievalQA.from_chain_type(
        llm=llm,
        retriever=retriever,
        chain_type="stuff",
        return_source_documents=False
    )

    try:
        result = chain.invoke({"query": prompt})
        raw_output = (
            result.get("result") or 
            result.get("output_text") or 
            (result.content if isinstance(result, AIMessage) else str(result))
        )
        logger.info(f"[RetrievalQA] Raw output:\n{raw_output}")
        parsed = extract_json(raw_output)
        if parsed:
            parsed['resources'] = normalize_resources(parsed.get('resources', []))
            return parsed
        logger.warning("[Matcher] Unparseable chain output, fallback to direct prompt")
        return direct_prompt(resume_plain, jd_plain)
    except Exception as e:
        logger.exception("[Matcher] RAG chain error, fallback to direct prompt")
        return direct_prompt(resume_plain, jd_plain)
