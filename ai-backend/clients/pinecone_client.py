

from pinecone import Pinecone, ServerlessSpec
from config.settings import settings

pc = Pinecone(api_key=settings.PINECONE_API_KEY)

def initialize_pinecone_index(index_name: str, dimension: int = 384):
    """
    Ensure the index exists, then return its client-side handle.
    """
    existing = pc.list_indexes().names()

   
    if index_name not in existing:
        pc.create_index(
            name=index_name,
            dimension=dimension,
            metric="cosine",
            spec=ServerlessSpec(
                cloud="aws",
                region=settings.PINECONE_ENVIRONMENT
            )
        )
    
   
    return pc.Index(name=index_name)

index = initialize_pinecone_index(settings.PINECONE_INDEX)
