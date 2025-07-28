from langchain_groq import ChatGroq
from config.settings import settings

def get_groq_llm():
    return ChatGroq(
        temperature=0,
        model_name="llama3-8b-8192",
        api_key=settings.GROQ_API_KEY,
    )
