"""
FastAPI NLP Sidecar — main application
Endpoints:
  GET  /health
  POST /extract-terms
  POST /score-content
  POST /extract-seo-keywords   ← NEW: 7-step SEO keyword extraction pipeline
"""
import os
from fastapi import FastAPI, HTTPException, Security, Header
from fastapi.middleware.cors import CORSMiddleware
from typing import Optional

from nlp.schemas import (
    ScoreContentRequest, ScoreContentResponse,
    SeoKeywordRequest, SeoKeywordResponse,
)
from nlp.scorer import score_content
from nlp.seo_keyword_extractor import extract_seo_keywords

app = FastAPI(
    title="NLP Sidecar",
    description="Keyword extraction and content scoring for the Blog Generator",
    version="1.0.0",
)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],   # lock to your Vercel domain in production
    allow_methods=["GET", "POST"],
    allow_headers=["*"],
)

# Simple API key auth — set NLP_SERVICE_KEY env var on Railway
NLP_SERVICE_KEY = os.getenv("NLP_SERVICE_KEY", "").strip()


def verify_key(x_api_key: Optional[str] = Header(default=None, alias="x-api-key")):
    if NLP_SERVICE_KEY and (not x_api_key or x_api_key.strip() != NLP_SERVICE_KEY):
        raise HTTPException(status_code=401, detail="Invalid API key")


@app.get("/")
def read_root():
    return {
        "message": "Welcome to the NLP Sidecar API! The blog generator web UI is running on the frontend.",
        "frontend_url": "http://localhost:3000",
        "documentation": "/docs",
        "health": "/health"
    }


@app.get("/health")
def health():
    return {"status": "ok", "version": "1.0.0"}


@app.post("/score-content", response_model=ScoreContentResponse)
def score_content_endpoint(
    body: ScoreContentRequest,
    _: None = Security(verify_key),
) -> ScoreContentResponse:
    return score_content(
        draft=body.draft,
        competitor_texts=body.competitor_texts,
        terms=body.terms,
        entities=body.entities,
        top_terms_for_intent=body.top_terms_for_intent,
        median_word_count=body.median_word_count,
        median_title_length=body.median_title_length,
        median_h2_count=body.median_h2_count,
        title=body.title,
        headings=body.headings,
        content_gap_report=body.content_gap_report,
        heading_frequency=body.heading_frequency,
        topic_clusters=body.topic_clusters,
        paa_questions=body.paa_questions,
        median_lexical_diversity=body.median_lexical_diversity,
        featured_snippet_blueprint=body.featured_snippet_blueprint,
    )


@app.post("/extract-seo-keywords", response_model=SeoKeywordResponse)
def extract_seo_keywords_endpoint(
    body: SeoKeywordRequest,
    _: None = Security(verify_key),
) -> SeoKeywordResponse:
    """
    7-step SEO keyword extraction pipeline for reference articles.
    Replaces simple word-frequency counting with:
      TF-IDF + RAKE + KeyBERT + TextRank/POS + Question extraction
      + Hybrid weighted scoring + NeuronWriter-style 3-tier classification.
    """
    if not body.plain_text or not body.plain_text.strip():
        raise HTTPException(status_code=400, detail="plain_text must not be empty")

    result = extract_seo_keywords(
        plain_text=body.plain_text,
        html_text=body.html_text or "",
        supplementary_texts=body.supplementary_texts or [],
        depth=body.depth,
        top_n=body.top_n,
    )

    return SeoKeywordResponse(
        seo_keywords=result["seo_keywords"],
        structural_keywords=result["structural_keywords"],
        semantic_keywords=result["semantic_keywords"],
        intent_questions=result["intent_questions"],
        ner_entities=result["ner_entities"],
        categories=result["categories"],
    )
