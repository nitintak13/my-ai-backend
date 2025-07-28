

from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    PINECONE_API_KEY: str
    PINECONE_INDEX: str
    PINECONE_ENVIRONMENT: str  
    HUGGINGFACE_API_TOKEN: str
    HUGGINGFACE_EMBEDDING_MODEL: str
    GROQ_API_KEY: str
    GROQ_MODEL: str

    model_config = SettingsConfigDict(env_file=".env")


settings = Settings()
