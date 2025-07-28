from typing import List
from sentence_transformers import SentenceTransformer
from sklearn.preprocessing import normalize


model = SentenceTransformer('sentence-transformers/all-MiniLM-L6-v2')

def embed_text(texts: List[str]) -> List[List[float]]:
    """
    Converts a list of input texts into dense, normalized vector embeddings.

    Args:
        texts (List[str]): List of texts to embed.

    Returns:
        List[List[float]]: List of normalized embedding vectors.
    """
    if not texts:
        return []

    
    texts = [str(t) for t in texts]

    
    embeddings = model.encode(
        texts,
        convert_to_tensor=False,
        show_progress_bar=False
    )

   
    normalized_embeddings = normalize(embeddings).tolist()

    return normalized_embeddings
