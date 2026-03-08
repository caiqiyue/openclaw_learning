"""GET/PUT /api/config/rag-mode — RAG mode toggle API."""

from fastapi import APIRouter
from pydantic import BaseModel

from config import get_rag_mode, set_rag_mode

router = APIRouter()


class RagModeRequest(BaseModel):
    enabled: bool


@router.get("/config/rag-mode")
async def get_rag_mode_endpoint():
    return {"rag_mode": get_rag_mode()}


@router.put("/config/rag-mode")
async def set_rag_mode_endpoint(request: RagModeRequest):
    set_rag_mode(request.enabled)
    return {"rag_mode": request.enabled}
