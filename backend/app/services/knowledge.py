import os
import re
import uuid
from pathlib import Path

UPLOAD_DIR = Path(__file__).resolve().parent.parent.parent / 'data' / 'uploads'


def _ensure_upload_dir():
    UPLOAD_DIR.mkdir(parents=True, exist_ok=True)


def _extract_text(file_path: str) -> str:
    ext = os.path.splitext(file_path)[1].lower()
    if ext == '.txt':
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return f.read()
    elif ext == '.md':
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return f.read()
    elif ext == '.json':
        with open(file_path, 'r', encoding='utf-8', errors='ignore') as f:
            return f.read()
    else:
        with open(file_path, 'rb') as f:
            raw = f.read()
        try:
            return raw.decode('utf-8')
        except UnicodeDecodeError:
            return raw.decode('utf-8', errors='replace')


def _split_chunks(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    paragraphs = re.split(r'\n\s*\n', text)
    chunks = []
    buffer = ''
    for para in paragraphs:
        para = para.strip()
        if not para:
            continue
        if len(buffer) + len(para) < chunk_size:
            buffer = (buffer + '\n' + para).strip()
        else:
            if buffer:
                chunks.append(buffer)
            buffer = para
    if buffer:
        chunks.append(buffer)

    if not chunks:
        words = text.split()
        for i in range(0, len(words), chunk_size):
            chunks.append(' '.join(words[i:i + chunk_size]))

    return chunks if chunks else [text]


def save_upload_file(filename: str, content: bytes) -> str:
    _ensure_upload_dir()
    unique_name = f'{uuid.uuid4().hex}_{filename}'
    file_path = str(UPLOAD_DIR / unique_name)
    with open(file_path, 'wb') as f:
        f.write(content)
    return file_path


def extract_and_chunk(file_path: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    text = _extract_text(file_path)
    return _split_chunks(text, chunk_size, overlap)


def search_chunks(chunks: list[dict], query: str, top_k: int = 5) -> list[dict]:
    query_lower = query.lower()
    query_terms = set(re.findall(r'\w+', query_lower))

    scored = []
    for chunk in chunks:
        content = chunk['content'].lower()
        term_matches = sum(1 for t in query_terms if t in content)
        exact_count = content.count(query_lower)
        score = term_matches + exact_count * 2
        if score > 0:
            scored.append((score, {**chunk, 'score': score / max(len(query_terms), 1)}))

    scored.sort(key=lambda x: -x[0])
    return [item[1] for item in scored[:top_k]]
