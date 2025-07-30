# # import logging
# # from langchain_pinecone import PineconeVectorStore
# # from langchain_huggingface import HuggingFaceEmbeddings
# # from langchain.schema import Document
# # from clients.pinecone_client import initialize_pinecone_index
# # from config.settings import settings
# # from rag.document_loader import chunk_text

# # logging.basicConfig(level=logging.INFO)
# # logger = logging.getLogger(__name__)

# # # Use HuggingFace MiniLM for embedding
# # embedding_model = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

# # # Initialize Pinecone index
# # index = initialize_pinecone_index(settings.PINECONE_INDEX)


# # def add_to_vector_store(doc_id: str, raw_text: str, namespace: str):
# #     """
# #     Splits raw text into chunks and adds them to the Pinecone vector store under a namespace.
# #     """
# #     chunks = chunk_text(raw_text)

# #     # Add metadata for tracking
# #     docs = [
# #         Document(
# #             page_content=c,
# #             metadata={"doc_id": doc_id, "chunk_id": i}
# #         )
# #         for i, c in enumerate(chunks)
# #     ]

# #     logger.info(f"[VectorStore] Adding {len(docs)} chunks to namespace '{namespace}'")

# #     try:
# #         vs = PineconeVectorStore(
# #             index=index,
# #             embedding=embedding_model,
# #             text_key="page_content",
# #             namespace=namespace
# #         )
# #         vs.add_documents(documents=docs)
# #         logger.info(f"[VectorStore] Successfully added to Pinecone")
# #     except Exception as e:
# #         logger.error(f"[VectorStore] Failed to add documents: {e}")


# # def get_retriever(namespace: str, top_k: int = 5):
# #     """
# #     Returns a retriever configured to query the Pinecone vector store within a namespace.
# #     """
# #     try:
# #         vs = PineconeVectorStore(
# #             index=index,
# #             embedding=embedding_model,
# #             text_key="page_content",
# #             namespace=namespace
# #         )
# #         retriever = vs.as_retriever(search_kwargs={"k": top_k})
# #         logger.info(f"[VectorStore] Retriever initialized with top_k={top_k} for namespace '{namespace}'")
# #         return retriever
# #     except Exception as e:
# #         logger.error(f"[VectorStore] Failed to initialize retriever: {e}")
# #         raise
# import logging
# from langchain_pinecone import PineconeVectorStore
# from langchain_huggingface import HuggingFaceEmbeddings
# from langchain.schema import Document
# from clients.pinecone_client import initialize_pinecone_index
# from config.settings import settings
# from rag.document_loader import chunk_text

# logging.basicConfig(level=logging.INFO)
# logger = logging.getLogger(__name__)

# # Initialize embedding model
# embedding_model = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")

# # Initialize Pinecone index only once
# index = initialize_pinecone_index(settings.PINECONE_INDEX)


# def add_to_vector_store(doc_id: str, raw_text: str, namespace: str):
#     """
#     Splits raw text into chunks and adds them to the Pinecone vector store under a namespace.
#     """
#     try:
#         chunks = chunk_text(raw_text)
#         if not chunks:
#             logger.warning(f"[VectorStore] No chunks created from raw text for doc_id={doc_id}")
#             return

#         # Prepare documents with metadata
#         docs = [
#             Document(
#                 page_content=chunk,
#                 metadata={"doc_id": doc_id, "chunk_id": idx}
#             )
#             for idx, chunk in enumerate(chunks)
#         ]

#         logger.info(f"[VectorStore] Adding {len(docs)} chunks to namespace '{namespace}'")

#         vector_store = PineconeVectorStore(
#             index=index,
#             embedding=embedding_model,
#             text_key="page_content",
#             namespace=namespace
#         )
#         vector_store.add_documents(documents=docs)

#         logger.info(f"[VectorStore] Successfully added {len(docs)} documents to Pinecone namespace '{namespace}'")

#     except Exception as e:
#         logger.exception(f"[VectorStore] Error while adding documents: {str(e)}")


# def get_retriever(namespace: str, top_k: int = 5):
#     """
#     Returns a retriever configured to query the Pinecone vector store within a namespace.
#     """
#     try:
#         vector_store = PineconeVectorStore(
#             index=index,
#             embedding=embedding_model,
#             text_key="page_content",
#             namespace=namespace
#         )
#         retriever = vector_store.as_retriever(search_kwargs={"k": top_k})
#         logger.info(f"[VectorStore] Retriever ready with top_k={top_k} for namespace '{namespace}'")
#         return retriever
#     except Exception as e:
#         logger.exception(f"[VectorStore] Failed to create retriever for namespace '{namespace}': {str(e)}")
#         raise RuntimeError("Retriever creation failed") from e

import logging
from langchain_pinecone import PineconeVectorStore
from langchain_huggingface import HuggingFaceEmbeddings
from langchain.schema import Document
from clients.pinecone_client import initialize_pinecone_index
from config.settings import settings
from rag.document_loader import chunk_text

# Setup logging
logging.basicConfig(level=logging.INFO)
logger = logging.getLogger(__name__)

# Load embedding model once
# embedding_model = HuggingFaceEmbeddings(model_name="sentence-transformers/all-MiniLM-L6-v2")
embedding_model = HuggingFaceEmbeddings(model_name="sentence-transformers/paraphrase-MiniLM-L3-v2")


# Initialize Pinecone index
index = initialize_pinecone_index(settings.PINECONE_INDEX)


def add_to_vector_store(doc_id: str, raw_text: str, namespace: str):
    """
    Splits raw text into chunks and adds them to the Pinecone vector store.
    Logs each major step and checks for failure points.
    """
    try:
        logger.info(f"[VectorStore] Starting addition for doc_id='{doc_id}' in namespace='{namespace}'")

        if not raw_text.strip():
            logger.warning(f"[VectorStore] Skipped empty text for doc_id={doc_id}")
            return

        # Chunking
        chunks = chunk_text(raw_text)
        logger.info(f"[VectorStore] Chunked into {len(chunks)} parts")

        if not chunks:
            logger.warning(f"[VectorStore] No chunks produced for doc_id={doc_id}")
            return

        # Prepare LangChain Documents
        docs = [
            Document(
                page_content=chunk,
                metadata={"doc_id": doc_id, "chunk_id": idx}
            )
            for idx, chunk in enumerate(chunks)
        ]

        # Initialize Vector Store
        vector_store = PineconeVectorStore(
            index=index,
            embedding=embedding_model,
            text_key="page_content",
            namespace=namespace
        )

        # Add to Pinecone
        vector_store.add_documents(documents=docs)
        logger.info(f"[VectorStore] Added {len(docs)} documents to Pinecone in namespace '{namespace}'")

    except Exception as e:
        logger.exception(f"[VectorStore] Failed to add document: {str(e)}")


def get_retriever(namespace: str, top_k: int = 5):
    """
    Creates a retriever for a given namespace and returns it.
    """
    try:
        logger.info(f"[Retriever] Initializing retriever for namespace='{namespace}', top_k={top_k}")

        vector_store = PineconeVectorStore(
            index=index,
            embedding=embedding_model,
            text_key="page_content",
            namespace=namespace
        )

        retriever = vector_store.as_retriever(search_kwargs={"k": top_k})
        logger.info(f"[Retriever] Retriever ready for namespace '{namespace}'")

        return retriever
    except Exception as e:
        logger.exception(f"[Retriever] Failed to initialize retriever: {str(e)}")
        raise RuntimeError("Retriever creation failed") from e


def test_retrieval(query: str, namespace: str, top_k: int = 5):
    """
    Test utility: Run a sample query against Pinecone and log retrieved documents.
    """
    logger.info(f"[Test] Running test query='{query}' on namespace='{namespace}'")
    try:
        retriever = get_retriever(namespace, top_k=top_k)
        results = retriever.get_relevant_documents(query)

        if not results:
            logger.warning("[Test] No documents retrieved.")
        else:
            logger.info(f"[Test] Retrieved {len(results)} documents.")
            for i, doc in enumerate(results):
                logger.info(f"  Chunk #{i + 1} | Metadata: {doc.metadata} | Content snippet: {doc.page_content[:100]}")

        return results
    except Exception as e:
        logger.exception(f"[Test] Error during retrieval: {e}")
        return []
