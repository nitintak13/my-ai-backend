import re
from typing import List
from langchain.text_splitter import RecursiveCharacterTextSplitter

def clean_text(text: str) -> str:
   
    text = re.sub(r'[^\x00-\x7F]+', ' ', text)   
    return re.sub(r'\s+', ' ', text.strip())     

def chunk_text(text: str) -> List[str]:
   
    cleaned = clean_text(text)

    if len(cleaned) < 100:
        return [cleaned]  

    splitter = RecursiveCharacterTextSplitter(
        chunk_size=400,
        chunk_overlap=80,
        separators=["\n\n", "\n", ".", " ", ""]
    )

    chunks = splitter.split_text(cleaned)

   
    print(f"[Chunking] Total chunks created: {len(chunks)}")
    if chunks:
        print(f"[Chunking] First chunk preview:\n{chunks[0][:300]}...\n")

    return chunks
