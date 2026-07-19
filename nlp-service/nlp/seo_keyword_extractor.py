"""
seo_keyword_extractor.py
========================
7-step industry-grade SEO keyword extraction pipeline.

Steps:
  1. Structural signal extraction  (headings, bold, anchor text from HTML)
  2. TF-IDF term scoring           (sklearn – works even on 1 document)
  3. RAKE phrase extraction        (rake-nltk – long-tail phrases)
  4. KeyBERT semantic expansion    (BERT embeddings, all-MiniLM-L6-v2)
  5. TextRank + POS filtering      (spaCy + pytextrank – graph-based, noun/proper-noun boost)
  6. Named Entity Recognition (NER) (spaCy – highly boosts brands, people, places)
  7. Question/intent extraction    (PAA-style interrogative sentences)
  8. Hybrid weighted scoring &     (merge, weight, cosine dedup, 3-tier classify)
     deduplication

Returns:
  {
    seo_keywords:        list[str]   – top-30 ranked final keywords
    structural_keywords: list[str]   – from H1/H2/H3/bold/anchor
    semantic_keywords:   list[str]   – from KeyBERT
    intent_questions:    list[str]   – question-form phrases
    categories: {
      must_have:    list[str],       – NeuronWriter-style tiers
      supplementary: list[str],
      contextual:   list[str]
    },
    ner_entities:        list[str]   – from spaCy NER
  }
"""
from __future__ import annotations

import re
import math
import logging
from collections import Counter
from typing import Any, Optional

# ── Optional heavy imports with graceful fallbacks ────────────────────────────
logger = logging.getLogger(__name__)

try:
    from bs4 import BeautifulSoup as BS
    BS_AVAILABLE = True
except ImportError:
    BS_AVAILABLE = False
    logger.warning("beautifulsoup4 not installed – HTML structural parsing will use regex fallback")

try:
    import spacy
    SPACY_AVAILABLE = True
except ImportError as e:
    SPACY_AVAILABLE = False
    logger.warning(f"spaCy not available – TextRank/NER steps will be skipped: {e}")

try:
    import pytextrank as _pytextrank  # side-effect: registers the 'textrank' spaCy pipeline component
    del _pytextrank  # satisfies linters; the pipeline component is already registered
    PYTEXTRANK_AVAILABLE = True
except ImportError:
    PYTEXTRANK_AVAILABLE = False
    logger.warning("pytextrank not installed – TextRank step will be skipped (NER still runs)")

_NLP_LG: Any = None
_NLP_SM: Any = None


def _get_nlp():
    """Lazy-load the best available spaCy model, with textrank if available."""
    if not SPACY_AVAILABLE:
        return None
    global _NLP_LG, _NLP_SM
    if _NLP_LG is not None:
        return _NLP_LG
    if _NLP_SM is not None:
        return _NLP_SM
    try:
        model = spacy.load("en_core_web_lg")
        if PYTEXTRANK_AVAILABLE and "textrank" not in model.pipe_names:
            model.add_pipe("textrank")
        _NLP_LG = model
        return _NLP_LG
    except Exception:
        pass
    try:
        model = spacy.load("en_core_web_sm")
        if PYTEXTRANK_AVAILABLE and "textrank" not in model.pipe_names:
            model.add_pipe("textrank")
        _NLP_SM = model
        return _NLP_SM
    except Exception:
        return None

try:
    from sklearn.feature_extraction.text import TfidfVectorizer
    SKLEARN_AVAILABLE = True
except ImportError:
    SKLEARN_AVAILABLE = False
    logger.warning("scikit-learn not installed – TF-IDF step will be skipped")

try:
    from rake_nltk import Rake
    RAKE_AVAILABLE = True
except ImportError:
    RAKE_AVAILABLE = False
    logger.warning("rake-nltk not installed – RAKE step will be skipped")

try:
    from keybert import KeyBERT
    _KB_MODEL: Any = None

    def _get_keybert():
        global _KB_MODEL
        if _KB_MODEL is None:
            # Use lightweight model: ~80 MB, still far better than TF-IDF alone
            _KB_MODEL = KeyBERT(model="all-MiniLM-L6-v2")
        return _KB_MODEL

    KEYBERT_AVAILABLE = True
except ImportError:
    KEYBERT_AVAILABLE = False
    def _get_keybert():
        return None
    logger.warning("keybert not installed – semantic expansion step will be skipped")

import nltk
try:
    from nltk.corpus import stopwords as _sw
    _sw.words("english")
except Exception:
    nltk.download("stopwords", quiet=True)
    nltk.download("punkt", quiet=True)
    nltk.download("punkt_tab", quiet=True)

try:
    from nltk.corpus import stopwords as _sw
    _STOP_EN = set(_sw.words("english"))
except Exception:
    _STOP_EN = set()

# Expand stop set with common web-content noise
_STOP_EN |= {
    "click", "read", "use", "used", "using", "make", "get", "one", "two", "three",
    "want", "need", "way", "back", "even", "just", "still", "well", "new", "old",
    "good", "great", "best", "many", "much", "time", "years", "year", "day", "days",
    "things", "thing", "work", "works", "working", "www", "http", "https", "com", "org",
    "also", "like", "really", "very", "quite", "however", "therefore", "thus",
    "page", "website", "tool", "start", "easy", "offer", "offers", "feature",
    "features", "content", "much", "takes",
}

# ── Scoring weights (Step 6) ──────────────────────────────────────────────────
_W_STRUCTURAL  = 3.0    # H1/H2/H3 heading text
_W_KEYBERT     = 2.5    # BERT semantic similarity
_W_NER         = 2.5    # Named entities (brands, people, places)
_W_TFIDF       = 2.0    # TF-IDF specificity score
_W_TEXTRANK    = 2.0    # TextRank graph centrality
_W_RAKE        = 1.5    # RAKE phrase co-occurrence score
_W_QUESTION    = 1.5    # intent / question-form phrases
_W_POS_BOOST   = 1.2    # NOUN / PROPN POS boost


# ─────────────────────────────────────────────────────────────────────────────
# Utility helpers
# ─────────────────────────────────────────────────────────────────────────────

def _clean_plain(text: str) -> str:
    """Strip tags and collapse whitespace."""
    text = re.sub(r"<[^>]+>", " ", text)
    text = re.sub(r"\s+", " ", text)
    return text.strip()


def _is_noise_keyword(phrase: str) -> bool:
    phrase = phrase.strip().lower()
    if len(phrase) < 3:
        return True
        
    noise_regexes = [
        r"stay\s+updated",
        r"latest\s+insights",
        r"don't\s+miss",
        r"subscribe",
        r"newsletter",
        r"sign\s+up",
        r"get\s+updates",
        r"mailing\s+list",
        r"cookie",
        r"privacy\s+policy",
        r"terms\s+of\s+(service|use)",
        r"copyright",
        r"all\s+rights\s+reserved",
        r"powered\s+by",
        r"contact\s+us",
        r"about\s+us",
        r"learn\s+more",
        r"read\s+more",
        r"click\s+here",
        r"get\s+started",
        r"free\s+trial",
        r"try\s+for\s+free",
        r"download\s+now",
        r"join\s+our",
        r"email\s+address",
        r"marketing\s+widget",
        r"site\s+map",
        r"navigation",
        r"menu",
        r"footer",
        r"applications\s+trends\s+marketing\s+business",
        r"social\s+media",
        r"follow\s+us"
    ]
    
    for pattern in noise_regexes:
        if re.search(pattern, phrase, re.IGNORECASE):
            return True
            
    ui_words = {'home', 'blog', 'contact', 'about', 'services', 'pricing', 'careers', 'jobs', 'privacy', 'terms', 'subscribe', 'login', 'signup', 'register', 'dashboard', 'search', 'menu', 'category', 'tag'}
    words = phrase.split()
    if len(words) <= 2 and all(w in ui_words for w in words):
        return True
        
    tag_words = {'applications', 'trends', 'marketing', 'business', 'news', 'insights', 'category', 'tags', 'archives', 'recent', 'popular', 'latest', 'posts', 'articles', 'comments'}
    tag_word_count = sum(1 for w in words if w in tag_words)
    if len(words) >= 3 and tag_word_count >= 3:
        return True
        
    return False


def _is_meaningful(phrase: str) -> bool:
    """Return True only if the phrase carries real topical information."""
    phrase = phrase.strip().lower()
    if len(phrase) < 3:
        return False
    if _is_noise_keyword(phrase):
        return False
    words = phrase.split()
    # Must have at least one non-stop word with >3 chars
    content_words = [w for w in words if w not in _STOP_EN and len(w) > 3]
    if not content_words:
        return False
    # Reject pure-numeric phrases
    if all(w.isdigit() for w in words):
        return False
    return True


def _normalise(phrase: str) -> str:
    return re.sub(r"[^a-z0-9 ]", "", phrase.lower().strip())


# ─────────────────────────────────────────────────────────────────────────────
# Step 1 — Structural Signal Extraction
# ─────────────────────────────────────────────────────────────────────────────

def _extract_structural_signals(html_text: str, plain_text: str) -> list[str]:
    """
    Extract keyword candidates from semantic HTML structure.
    Returns a deduplicated list of cleaned phrases from:
      - H1, H2, H3 text  (highest signal)
      - <title> and <meta name='description'>
      - <strong> / <b> / <em> / <i> text
      - Anchor link text (internal context)

    Falls back to markdown-style heuristics when HTML is not available.
    """
    phrases: list[str] = []

    if html_text and BS_AVAILABLE:
        soup = BS(html_text, "html.parser")

        # Headings
        for tag in soup.find_all(["h1", "h2", "h3"]):
            t = tag.get_text(separator=" ").strip()
            if t:
                phrases.append(t)

        # Title
        title_tag = soup.find("title")
        if title_tag:
            phrases.append(title_tag.get_text().strip())

        # Meta description
        meta = soup.find("meta", {"name": "description"})
        if meta and meta.get("content"):
            phrases.append(meta["content"].strip())

        # Bold/italic emphases
        for tag in soup.find_all(["strong", "b", "em", "i"]):
            t = tag.get_text(separator=" ").strip()
            if 3 < len(t) < 80:
                phrases.append(t)

        # Anchor text (internal intent signals)
        for a in soup.find_all("a", href=True):
            href: str = a.get("href", "")
            # skip external, hash, and javascript links
            if href.startswith("http") or href.startswith("#") or href.startswith("javascript"):
                continue
            t = a.get_text(separator=" ").strip()
            if 3 < len(t) < 60:
                phrases.append(t)

    else:
        # HTML not available — use markdown / regex heuristics on plain text
        if html_text:
            # Regex-based heading extraction from raw HTML
            for m in re.finditer(r"<h[1-3][^>]*>(.*?)</h[1-3]>", html_text, re.IGNORECASE | re.DOTALL):
                phrases.append(_clean_plain(m.group(1)))
            for m in re.finditer(r"<strong>(.*?)</strong>|<b>(.*?)</b>", html_text, re.IGNORECASE | re.DOTALL):
                t = _clean_plain(m.group(1) or m.group(2) or "")
                if 3 < len(t) < 80:
                    phrases.append(t)

        # Markdown headings from plain text
        if plain_text:
            for line in plain_text.splitlines():
                m = re.match(r"^#{1,3}\s+(.+)", line)
                if m:
                    phrases.append(m.group(1).strip())

    # Break long multi-phrase headings into individual noun phrases
    expanded: list[str] = []
    for p in phrases:
        p = _clean_plain(p)
        # Split on common delimiter patterns in headings
        parts = re.split(r"\s*[:\-|–—]\s*", p)
        expanded.extend(parts)

    # Keep only meaningful phrases, deduplicate preserving order
    seen: set[str] = set()
    result: list[str] = []
    for p in expanded:
        p = p.strip()
        norm = _normalise(p)
        if norm and norm not in seen and _is_meaningful(p):
            seen.add(norm)
            result.append(p.lower())

    return result


# ─────────────────────────────────────────────────────────────────────────────
# Step 2 — TF-IDF Term Scoring
# ─────────────────────────────────────────────────────────────────────────────

def _extract_tfidf(plain_text: str, top_n: int = 40) -> dict[str, float]:
    """
    Run TF-IDF against a minimal corpus: the article + a few neutral sentences.
    This gives us an IDF signal even on a single document.
    """
    if not SKLEARN_AVAILABLE or not plain_text.strip():
        return {}

    # Small generic reference corpus so IDF is meaningful for single-doc cases
    _generic_sentences = [
        "this article provides information about various topics",
        "learn more about how things work and the related concepts",
        "explore the different aspects and approaches to the subject",
        "understanding the fundamentals helps with implementation",
    ]

    corpus = [plain_text] + _generic_sentences

    try:
        vec = TfidfVectorizer(
            ngram_range=(1, 3),
            stop_words="english",
            max_features=500,
            sublinear_tf=True,
            min_df=1,
        )
        mat = vec.fit_transform(corpus)
        features = vec.get_feature_names_out()

        # Score only for the article (index 0)
        doc_scores = mat[0].toarray().flatten()

        scored: dict[str, float] = {}
        for term, score in zip(features, doc_scores):
            if score > 0 and _is_meaningful(term):
                scored[term] = float(score)

        # Normalise to 0-1
        if scored:
            mx = max(scored.values())
            if mx > 0:
                scored = {k: v / mx for k, v in scored.items()}

        return dict(sorted(scored.items(), key=lambda x: -x[1])[:top_n])

    except Exception as e:
        logger.warning("TF-IDF failed: %s", e)
        return {}


# ─────────────────────────────────────────────────────────────────────────────
# Step 3 — RAKE Phrase Extraction
# ─────────────────────────────────────────────────────────────────────────────

def _extract_rake(plain_text: str, top_n: int = 30) -> dict[str, float]:
    """RAKE captures multi-word phrases by word co-occurrence without stopwords."""
    if not RAKE_AVAILABLE or not plain_text.strip():
        return {}
    try:
        rake = Rake(
            min_length=1,
            max_length=4,
            include_repeated_phrases=False,
        )
        rake.extract_keywords_from_text(plain_text[:50_000])
        ranked = rake.get_ranked_phrases_with_scores()

        scored: dict[str, float] = {}
        for score, phrase in ranked[:top_n]:
            phrase = phrase.lower().strip()
            if _is_meaningful(phrase):
                scored[phrase] = float(score)

        if scored:
            mx = max(scored.values())
            if mx > 0:
                scored = {k: v / mx for k, v in scored.items()}

        return scored
    except Exception as e:
        logger.warning("RAKE failed: %s", e)
        return {}


# ─────────────────────────────────────────────────────────────────────────────
# Step 4 — KeyBERT Semantic Expansion
# ─────────────────────────────────────────────────────────────────────────────

def _extract_keybert(plain_text: str, supplementary_texts: Optional[list[str]] = None, top_n: int = 20) -> dict[str, float]:
    """
    BERT cosine-similarity between candidate phrases and the full document.
    Uses all-MiniLM-L6-v2 (~80 MB) for speed vs accuracy balance.
    Grounds extraction in live SERP vocabulary if supplementary_texts are provided.
    """
    if not KEYBERT_AVAILABLE or not plain_text.strip():
        return {}
    try:
        kb = _get_keybert()
        
        corpus = plain_text[:20_000]
        if supplementary_texts:
            # Prepend supplementary texts to anchor BERT to live SERP vocabulary
            supp_str = " ".join(supplementary_texts)
            corpus = supp_str + "\n\n" + corpus

        # Reduce corpus length and use MMR to massively speed up CPU inference
        corpus = corpus[:10_000]
        results = kb.extract_keywords(
            corpus,
            keyphrase_ngram_range=(1, 3),
            stop_words="english",
            use_mmr=True,
            diversity=0.3,
            top_n=top_n,
        )
        scored: dict[str, float] = {}
        for phrase, score in results:
            phrase = phrase.lower().strip()
            if _is_meaningful(phrase) and score > 0.1:
                scored[phrase] = float(score)

        if scored:
            mx = max(scored.values())
            if mx > 0:
                scored = {k: v / mx for k, v in scored.items()}

        return scored
    except Exception as e:
        logger.warning("KeyBERT failed: %s", e)
        return {}


# ─────────────────────────────────────────────────────────────────────────────
# Step 5 — TextRank + POS Filtering
# ─────────────────────────────────────────────────────────────────────────────

def _extract_textrank_pos(plain_text: str, top_n: int = 25) -> dict[str, float]:
    """
    TextRank finds structurally central phrases (those best connected to
    all other content in the graph — rough proxy for pillar keywords).
    POS filter retains only NOUN / PROPN dominated phrases.
    """
    if not SPACY_AVAILABLE or not PYTEXTRANK_AVAILABLE or not plain_text.strip():
        return {}
    try:
        nlp = _get_nlp()
        if nlp is None:
            return {}

        doc = nlp(plain_text[:100_000])
        scored: dict[str, float] = {}

        for phrase in doc._.phrases[:top_n]:
            text = phrase.text.lower().strip()
            rank = float(phrase.rank)

            if not _is_meaningful(text):
                continue

            # POS boost: check if span is noun/propn dominated
            span_doc = nlp.make_doc(text)
            noun_count = sum(1 for t in span_doc if t.pos_ in ("NOUN", "PROPN"))
            boost = _W_POS_BOOST if noun_count > 0 else 1.0

            scored[text] = rank * boost

        if scored:
            mx = max(scored.values())
            if mx > 0:
                scored = {k: v / mx for k, v in scored.items()}

        return scored
    except Exception as e:
        logger.warning("TextRank/POS failed: %s", e)
        return {}


# ─────────────────────────────────────────────────────────────────────────────
# Step 5b — Named Entity Recognition (NER)
# ─────────────────────────────────────────────────────────────────────────────

def _extract_ner(plain_text: str, top_n: int = 20) -> dict[str, float]:
    """
    Extracts high-value entities (brands, places, people, products).
    """
    if not SPACY_AVAILABLE or not plain_text.strip():
        return {}
    try:
        nlp_model = _get_nlp()
        if nlp_model is None:
            return {}

        doc = nlp_model(plain_text[:100_000])
        entity_counter = Counter()

        _NER_LABELS = {"ORG", "PERSON", "GPE", "PRODUCT", "WORK_OF_ART", "EVENT", "NORP", "FAC", "LOC", "LANGUAGE", "LAW"}
        for ent in doc.ents:
            if ent.label_ in _NER_LABELS:
                text = ent.text.lower().strip()
                if _is_meaningful(text):
                    entity_counter[text] += 1

        scored: dict[str, float] = {}
        for text, freq in entity_counter.most_common(top_n):
            scored[text] = math.log(freq + 1)  # log scale to dampen extreme frequency

        if scored:
            mx = max(scored.values())
            if mx > 0:
                scored = {k: v / mx for k, v in scored.items()}

        return scored
    except Exception as e:
        logger.warning("NER failed: %s", e)
        return {}


# ─────────────────────────────────────────────────────────────────────────────
# Step 6 — Question / Intent Phrase Extraction
# ─────────────────────────────────────────────────────────────────────────────

_QUESTION_STARTS = re.compile(
    r"^(What|How|Why|When|Which|Can|Does|Is|Are|Should|Will|Who|Where)\b",
    re.IGNORECASE,
)


def _extract_questions(plain_text: str, top_n: int = 15) -> list[str]:
    """
    Extract interrogative sentences — these map to PAA boxes and featured
    snippets. Also captures question-form subheadings from markdown.
    """
    questions: list[str] = []

    try:
        nltk.data.find("tokenizers/punkt_tab")
    except LookupError:
        nltk.download("punkt_tab", quiet=True)

    try:
        sentences = nltk.sent_tokenize(plain_text[:50_000])
    except Exception:
        sentences = re.split(r"[.!?]\s+", plain_text[:50_000])

    seen_q: set[str] = set()
    for sent in sentences:
        sent = sent.strip()
        if _QUESTION_STARTS.match(sent) and 10 < len(sent) < 200 and sent not in seen_q:
            questions.append(sent)
            seen_q.add(sent)

    # Also check markdown/heading question forms
    for line in plain_text.splitlines():
        line = line.strip().lstrip("#").strip()
        if _QUESTION_STARTS.match(line) and 10 < len(line) < 150 and line not in seen_q:
            questions.append(line)
            seen_q.add(line)

    return questions[:top_n]


# ─────────────────────────────────────────────────────────────────────────────
# Step 7 — Hybrid Scoring, Deduplication & Classification
# ─────────────────────────────────────────────────────────────────────────────

def _merge_and_score(
    structural:  list[str],
    tfidf:       dict[str, float],
    rake:        dict[str, float],
    keybert:     dict[str, float],
    textrank:    dict[str, float],
    ner:         dict[str, float],
    questions:   list[str],
) -> dict[str, float]:
    """
    Combine all signal sources with their weights into a single
    composite score per phrase.
    """
    composite: dict[str, float] = {}

    def _add(phrase: str, weight: float, base_score: float = 1.0):
        phrase = phrase.lower().strip()
        if not _is_meaningful(phrase):
            return
        norm = _normalise(phrase)
        composite[norm] = composite.get(norm, 0.0) + weight * base_score

    # Structural signals (H1/H2/H3 etc.) — highest weight
    for phrase in structural:
        _add(phrase, _W_STRUCTURAL)

    # TF-IDF terms
    for phrase, score in tfidf.items():
        _add(phrase, _W_TFIDF, score)

    # RAKE phrases
    for phrase, score in rake.items():
        _add(phrase, _W_RAKE, score)

    # KeyBERT semantic
    for phrase, score in keybert.items():
        _add(phrase, _W_KEYBERT, score)

    # TextRank (already POS-boosted)
    for phrase, score in textrank.items():
        _add(phrase, _W_TEXTRANK, score)

    # Named Entities
    for phrase, score in ner.items():
        _add(phrase, _W_NER, score)

    # Question-form (add as flat bonus — they're presence signals)
    for question in questions:
        # Extract the core phrase (first ~5 words) to represent in keyword list
        words = question.split()[:6]
        phrase = " ".join(words).lower().strip()
        _add(phrase, _W_QUESTION)

    return composite


def _cosine_dedup(
    scores: dict[str, float],
    threshold: float = 0.85,
) -> dict[str, float]:
    """
    Simple token-overlap-based near-duplicate removal.
    For two phrases with Jaccard similarity > threshold, keep the
    higher-scoring one.
    """
    phrases = sorted(scores.items(), key=lambda x: -x[1])
    kept: list[tuple[str, float]] = []
    kept_sets: list[set[str]] = []

    for phrase, score in phrases:
        if not phrase:  # skip empty-string phrases
            continue
        tokens = set(phrase.split())
        if not tokens:  # skip phrases that normalise to nothing
            continue
        is_dup = False
        for k_set in kept_sets:
            intersection = tokens & k_set
            union = tokens | k_set
            jaccard = len(intersection) / len(union) if union else 0
            if jaccard >= threshold:
                is_dup = True
                break
        if not is_dup:
            kept.append((phrase, score))
            kept_sets.append(tokens)

    return dict(kept)


def _classify(
    scores: dict[str, float],
    structural_set: set[str],
    semantic_set: set[str],
) -> dict[str, list[str]]:
    """
    NeuronWriter-style 3-tier classification.
      must_have:    composite ≥ 65th percentile OR structural signal
      supplementary: 35th–65th percentile OR semantic (KeyBERT) signal
      contextual:   below 35th percentile
    """
    if not scores:
        return {"must_have": [], "supplementary": [], "contextual": []}

    vals = sorted(scores.values())
    n = len(vals)
    p35 = vals[int(n * 0.35)]
    p65 = vals[int(n * 0.65)]

    must_have, supplementary, contextual = [], [], []

    for phrase, score in sorted(scores.items(), key=lambda x: -x[1]):
        if score >= p65 or phrase in structural_set:
            must_have.append(phrase)
        elif score >= p35 or phrase in semantic_set:
            supplementary.append(phrase)
        else:
            contextual.append(phrase)

    return {
        "must_have":    must_have,
        "supplementary": supplementary,
        "contextual":   contextual,
    }


# ─────────────────────────────────────────────────────────────────────────────
# Public API
# ─────────────────────────────────────────────────────────────────────────────

def extract_seo_keywords(
    plain_text: str,
    html_text: str = "",
    supplementary_texts: Optional[list[str]] = None,
    depth: str = "deep",
    top_n: int = 30,
) -> dict:
    """
    Run the full 7-step SEO keyword extraction pipeline.

    Args:
        plain_text: Raw text of the reference article (required).
        html_text:  Readability-parsed HTML of the article (optional but
                    greatly improves Step 1 structural signals).
        supplementary_texts: Array of SERP titles/PAA to ground the BERT model.
        depth:      "fast" or "deep". "fast" skips KeyBERT and Question extraction.
        top_n:      Number of top keywords to return in seo_keywords list.

    Returns:
        Dict with keys:
          seo_keywords, structural_keywords, semantic_keywords,
          intent_questions, categories, ner_entities
    """
    if not plain_text or not plain_text.strip():
        return {
            "seo_keywords":        [],
            "structural_keywords": [],
            "semantic_keywords":   [],
            "intent_questions":    [],
            "ner_entities":        [],
            "categories":          {"must_have": [], "supplementary": [], "contextual": []},
        }

    # Step 1 — Structural
    structural = _extract_structural_signals(html_text, plain_text)
    structural_set = set(_normalise(p) for p in structural)

    # Step 2 — TF-IDF
    tfidf = _extract_tfidf(plain_text, top_n=40)

    # Step 3 — RAKE
    rake = _extract_rake(plain_text, top_n=30)

    # Step 4 — KeyBERT (skipped in fast mode)
    if depth == "deep":
        keybert = _extract_keybert(plain_text, supplementary_texts, top_n=20)
    else:
        keybert = {}
    semantic_set = set(_normalise(p) for p in keybert)

    # Step 5 — TextRank + POS
    textrank = _extract_textrank_pos(plain_text, top_n=25)

    # Step 5b — NER
    ner = _extract_ner(plain_text, top_n=20)
    # Add NER to semantic set to ensure they graduate to at least supplementary
    semantic_set.update(set(_normalise(p) for p in ner))

    # Step 6 — Questions (skipped in fast mode)
    if depth == "deep":
        questions = _extract_questions(plain_text, top_n=15)
    else:
        questions = []

    # Step 7 — Merge, score, dedup, classify
    composite = _merge_and_score(structural, tfidf, rake, keybert, textrank, ner, questions)
    composite = _cosine_dedup(composite, threshold=0.85)

    ranked = sorted(composite.items(), key=lambda x: -x[1])
    categories = _classify(composite, structural_set, semantic_set)

    # Surface-form restoration: preferred is the version from structural > keybert > tfidf > rake
    # (normalised keys → find best surface form from inputs)
    norm_to_surface: dict[str, str] = {}
    for phrase in structural:
        norm_to_surface.setdefault(_normalise(phrase), phrase)
    for phrase in list(keybert) + list(tfidf) + list(rake) + list(textrank) + list(ner):
        norm_to_surface.setdefault(_normalise(phrase), phrase)

    def _restore(norm: str) -> str:
        return norm_to_surface.get(norm, norm)

    seo_keywords = [_restore(k) for k, _ in ranked[:top_n] if k and _restore(k)]

    return {
        "seo_keywords":        seo_keywords,
        "structural_keywords": [_restore(_normalise(p)) for p in structural[:15]],
        "semantic_keywords":   [_restore(_normalise(p)) for p in list(keybert.keys())[:15]],
        "intent_questions":    questions[:10],
        "ner_entities":        [_restore(_normalise(p)) for p in list(ner.keys())[:15]],
        "categories": {
            "must_have":    [_restore(k) for k in categories["must_have"][:15]],
            "supplementary": [_restore(k) for k in categories["supplementary"][:15]],
            "contextual":   [_restore(k) for k in categories["contextual"][:10]],
        },
    }
