"""
Pydantic v2 schemas that define the API contract between
Next.js (serp-extract route) and this Python NLP sidecar.
"""
from pydantic import BaseModel, Field
from typing import Optional, Dict, List




class ScoreContentRequest(BaseModel):
    draft: str
    competitor_texts: list[str]
    terms: list[dict]               # serialised SerpTerm list from Next.js
    entities: list[dict]
    top_terms_for_intent: list[str]
    median_word_count: int = 800
    median_title_length: int = 60
    median_h2_count: int = 5
    title: str = ""
    headings: list[str] = Field(default_factory=list)
    content_gap_report: Optional[dict] = None
    heading_frequency: Optional[list[dict]] = None
    topic_clusters: Optional[list[dict]] = None
    paa_questions: Optional[list[dict]] = None
    median_lexical_diversity: Optional[float] = 0.35
    featured_snippet_blueprint: Optional[dict] = None


class ScoreBreakdown(BaseModel):
    S: float    # Semantic coverage      0–100
    I: float    # Intent alignment       0–100
    E: float    # Entity coverage        0–100
    O: float    # On-page structure      0–100
    G: float    # Content Gap coverage   0–100
    R: float    # Readability            0–100


class ScoreContentResponse(BaseModel):
    total_score: float
    breakdown: ScoreBreakdown
    penalties: float
    penalty_reasons: list[str]
    stats: dict
    base_score: Optional[float] = None
    penalty_details: Optional[list[dict]] = None
    structure_details: Optional[dict] = None


# ── NEW: SEO Keyword Extraction ───────────────────────────────────────────────

class SeoKeywordRequest(BaseModel):
    plain_text: str                     # stripped article text (required)
    html_text: Optional[str] = ""       # Readability article HTML (optional, improves Step 1)
    supplementary_texts: Optional[list[str]] = Field(default_factory=list) # SERP titles/PAA
    depth: str = "deep"                 # "fast" or "deep"
    top_n: int = 30                     # number of top keywords to return


class SeoKeywordCategories(BaseModel):
    must_have:     list[str] = Field(default_factory=list)
    supplementary: list[str] = Field(default_factory=list)
    contextual:    list[str] = Field(default_factory=list)


class SeoKeywordResponse(BaseModel):
    pipeline_version:    str = "v2"          # Indicates unified + NER upgraded scoring
    seo_keywords:        list[str]           # top-N ranked final keywords
    structural_keywords: list[str]           # from H1/H2/H3 headings, bold, anchors
    semantic_keywords:   list[str]           # from KeyBERT BERT embeddings
    intent_questions:    list[str]           # interrogative-sentence phrases
    ner_entities:        list[str]           # from spaCy NER
    categories:          SeoKeywordCategories  # NeuronWriter-style 3-tier classification
