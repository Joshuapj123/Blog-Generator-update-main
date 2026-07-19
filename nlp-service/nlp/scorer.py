"""
5-component content scorer: S / E / I / O / Q
Mirrors the formula in content-scoring.ts but uses numpy cosine for I-score.
"""
from __future__ import annotations

import math
import re
from typing import Any, Optional

import numpy as np
from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.metrics.pairwise import cosine_similarity
from nltk.stem import PorterStemmer

from nlp.schemas import ScoreBreakdown, ScoreContentResponse

_stemmer = PorterStemmer()

_STOP = {
    "the","and","for","that","with","this","from","are","not","have","but",
    "was","they","you","all","can","its","been","had","has","will","one",
    "our","their","your","more","also","than","then","into","when","where",
}

PHRASE_EXPANSIONS = {
    'crm workflow automation': [
        'workflow automation crm',
        'sales workflow automation',
        'automated crm workflows',
        'automated workflows',
        'sales workflows',
        'lead routing',
        'customer lifecycle automation'
    ],
    'customer lifecycle workflows': [
        'lifecycle automation',
        'customer lifecycle automation',
        'customer journey automation',
        'lifecycle workflows'
    ],
    'lead assignment automation': [
        'automated lead assignment',
        'lead routing automation',
        'automated lead routing',
        'lead distribution automation'
    ],
    'workflow automation crm': [
        'crm workflow automation',
        'crm automation workflows'
    ],
    'sales workflow automation': [
        'automated sales workflows',
        'sales automation workflows'
    ]
}


def _strip_md(text: str) -> str:
    text = re.sub(r"#{1,6}\s+", " ", text)
    text = re.sub(r"\*\*?|__?|~~|`{1,3}", "", text)
    text = re.sub(r"\[([^\]]+)\]\([^)]+\)", r"\1", text)
    text = re.sub(r"<[^>]+>", " ", text)
    return re.sub(r"\s+", " ", text).strip()


def _tokenize(text: str) -> list[str]:
    cleaned = re.sub(r"[^a-z0-9\s]", " ", _strip_md(text).lower())
    return [w for w in cleaned.split() if len(w) > 2 and w not in _STOP]


def split_sentences(text: str) -> list[str]:
    return [s.strip() for s in re.split(r"[.!?]+(?:\s+|\n+)|[\n\r]+", text) if len(s.strip()) > 5]


def stem_word(w: str) -> str:
    if len(w) <= 3:
        return w
    return _stemmer.stem(w)


def match_sentence_with_term(sentence: str, term: str) -> bool:
    s_tokens = [stem_word(w) for w in _tokenize(sentence)]
    t_tokens = [stem_word(w) for w in _tokenize(term)]
    if not t_tokens:
        return False
    s_set = set(s_tokens)
    hits = sum(1 for t in t_tokens if t in s_set)
    threshold = 0.8 if len(t_tokens) >= 3 else 1.0
    return (hits / len(t_tokens)) >= threshold


def check_semantic_match(sentences: list[str], draft_clean: str, term: str) -> bool:
    term_lower = term.lower().strip()
    if term_lower in draft_clean:
        return True
        
    for s in sentences:
        if match_sentence_with_term(s, term_lower):
            return True
            
    expansions = PHRASE_EXPANSIONS.get(term_lower, [])
    for exp in expansions:
        if exp in draft_clean:
            return True
        for s in sentences:
            if match_sentence_with_term(s, exp):
                return True
    return False


def check_phrase_stem_overlap(phrase_a: str, phrase_b: str, threshold=0.5) -> bool:
    stems_a = [stem_word(w) for w in _tokenize(phrase_a)]
    stems_b = [stem_word(w) for w in _tokenize(phrase_b)]
    if not stems_a or not stems_b:
        return False
    set_a = set(stems_a)
    set_b = set(stems_b)
    overlap = sum(1 for t in stems_a if t in set_b)
    return (overlap / min(len(set_a), len(set_b))) >= threshold


def Math_round(val: float) -> int:
    return int(math.floor(val + 0.5))



def score_content(
    draft: str,
    competitor_texts: list[str],
    terms: list[dict],
    entities: list[dict],
    top_terms_for_intent: list[str],
    median_word_count: int = 800,
    median_title_length: int = 60,
    median_h2_count: int = 5,
    title: str = "",
    headings: list[str] = None,
    content_gap_report: dict = None,
    heading_frequency: list[dict] = None,
    topic_clusters: list[dict] = None,
    paa_questions: list[dict] = None,
    median_lexical_diversity: float = 0.35,
    featured_snippet_blueprint: dict = None,
) -> ScoreContentResponse:
    headings = headings or []

    draft_clean  = _strip_md(draft).lower()
    draft_tokens = _tokenize(draft)
    word_count   = len(draft_tokens)
    sentences    = split_sentences(draft)

    # ── S: Semantic Coverage ─────────────────────────────────────────────────
    basic_terms = [t for t in terms if t.get("category") == "basic" and t.get("importance", 5) >= 4]
    supp_terms  = [t for t in terms if t.get("category") == "supplementary" and t.get("importance", 5) >= 4]

    def term_in_draft(t: dict) -> bool:
        surface = t.get("term", "").lower()
        if t.get("currentCount", 0) > 0:
            return True
        is_matched = check_semantic_match(sentences, draft_clean, surface)
        if is_matched:
            t["currentCount"] = max(t.get("currentCount", 0), 1)
            return True
        return False

    basic_hits = sum(1 for t in basic_terms if term_in_draft(t))
    basic_matched_weight = sum(t.get("importance", 5) for t in basic_terms if term_in_draft(t))
    basic_total_weight = sum(t.get("importance", 5) for t in basic_terms)
    basic_recall = basic_matched_weight / basic_total_weight if basic_total_weight > 0 else 1.0

    supp_matched_weight = sum(t.get("importance", 5) for t in supp_terms if term_in_draft(t))
    supp_total_weight = sum(t.get("importance", 5) for t in supp_terms)
    supp_recall = supp_matched_weight / supp_total_weight if supp_total_weight > 0 else 1.0

    S_raw = min(1.0, 0.7 * basic_recall + 0.3 * supp_recall)

    # ── E: Entity Coverage ───────────────────────────────────────────────────
    target_entities = []
    for e in entities:
        cov = e.get("competitorCoverage") or e.get("doc_spread") or 0.0
        imp = e.get("importanceScore")
        if imp is None:
            imp = Math_round(cov * 100)
        if cov >= 0.4 or imp >= 40:
            target_entities.append((e, imp))

    covered_entities_count = 0
    total_target_importance = 0
    covered_target_importance = 0

    for e, imp in target_entities:
        total_target_importance += imp
        name = (e.get("entityName") or e.get("text", "")).lower().strip()
        is_covered = name in draft_clean
        if is_covered:
            covered_entities_count += 1
            covered_target_importance += imp

    E = (covered_target_importance / total_target_importance) if total_target_importance > 0 else 0.8

    # Apply Entity Boost to Semantic Score S (Issue 4)
    S = S_raw
    if E >= 0.5:
        S = min(1.0, S_raw + 0.15 * E)

    # ── I: Intent Coverage (Issue 1) ─────────────────────────────────────────
    heading_similarity = 0.8
    if heading_frequency:
        popular_headings = [h for h in heading_frequency if (h.get("competitorPercentage") or (h.get("count", 0) / 10)) >= 0.3]
        targets = popular_headings if popular_headings else heading_frequency[:5]
        matched_weight = 0.0
        total_weight = 0.0
        for h in targets:
            weight = h.get("competitorPercentage") or (h.get("count", 0) / 10) or 0.5
            total_weight += weight
            h_text = h.get("heading", "").lower()
            is_matched = any(
                h_text in dh.lower() or dh.lower() in h_text or check_phrase_stem_overlap(dh, h_text, 0.5)
                for dh in headings
            )
            if is_matched:
                matched_weight += weight
        heading_similarity = (matched_weight / total_weight) if total_weight > 0 else 1.0
    else:
        heading_similarity = 1.0 if headings else 0.0

    topic_cluster_similarity = 0.8
    if topic_clusters:
        covered_clusters = 0
        for cluster in topic_clusters:
            cluster_terms = [cluster.get("clusterName", "")] + cluster.get("keywords", [])
            is_covered = any(
                check_semantic_match(sentences, draft_clean, term)
                for term in cluster_terms if term
            )
            if is_covered:
                covered_clusters += 1
        topic_cluster_similarity = covered_clusters / len(topic_clusters) if topic_clusters else 0.8

    entity_similarity = E

    paa_coverage = 0.8
    if paa_questions:
        covered_questions = 0
        for pq in paa_questions:
            q_text = pq.get("question", "")
            q_clean = re.sub(r"[?.]", "", q_text).lower().strip()
            is_covered = (
                q_clean in draft_clean
                or any(q_clean in h.lower() or check_phrase_stem_overlap(h, q_text, 0.6) for h in headings)
                or check_phrase_stem_overlap(draft_clean, q_text, 0.4)
            )
            if is_covered:
                covered_questions += 1
        paa_coverage = covered_questions / len(paa_questions) if paa_questions else 0.8

    keyword_similarity = S_raw

    I = 0.30 * heading_similarity + 0.25 * topic_cluster_similarity + 0.20 * entity_similarity + 0.15 * paa_coverage + 0.10 * keyword_similarity

    # ── O: On-page Structure ─────────────────────────────────────────────────
    has_h1 = bool(re.search(r"^#\s+.+", draft, re.MULTILINE) or re.search(r"<h1[^>]*>", draft, re.IGNORECASE))
    has_h2 = bool(headings or re.search(r"^##\s+.+", draft, re.MULTILINE))

    h2_variance     = abs(len(headings) - median_h2_count) / (median_h2_count or 1)
    h2_score        = 1.0 if h2_variance < 0.25 else (0.7 if h2_variance < 0.5 else 0.4)

    title_variance  = abs(len(title) - median_title_length) / (median_title_length or 1)
    title_len_score = 1.0 if title_variance < 0.2 else (0.6 if title_variance < 0.4 else 0.3)

    word_ratio      = word_count / (median_word_count or 1)
    len_score       = (1.0 if word_count >= median_word_count * 0.9
                       else 0.75 if abs(word_ratio - 1) < 0.2
                       else 0.5 if abs(word_ratio - 1) < 0.5
                       else 0.2)

    h1QualityVal = Math_round(title_len_score * 100) if has_h1 else 0
    h2CoverageVal = Math_round(h2_score * 100)
    h3CoverageVal = 100 if len(re.findall(r"^###\s+.+", draft, re.MULTILINE)) > 0 else 0
    faqCoverageVal = 100 if any('faq' in h.lower() or 'frequently asked' in h.lower() for h in headings) else 0
    tableCoverageVal = 100 if ('|' in draft and len(re.findall(r"\|[^\n]+\|[^\n]+\|", draft)) > 0) else 0
    wordCountAlignmentVal = Math_round(len_score * 100)
    headingFrequencyAlignmentVal = Math_round(heading_similarity * 100)

    # Featured Snippet Coverage
    featured_snippet_coverage_val = 100
    if featured_snippet_blueprint and featured_snippet_blueprint.get("hasFeaturedSnippet"):
        target_query = (featured_snippet_blueprint.get("targetQuery") or "").lower().strip()
        query_matched = target_query in draft_clean if target_query else False
        
        rec_words_ratio = 0.0
        if featured_snippet_blueprint.get("optimizedSnippetRecommendation"):
            rec_words = _tokenize(featured_snippet_blueprint.get("optimizedSnippetRecommendation"))
            unique_rec_words = list(set(rec_words))
            if unique_rec_words:
                matched_words = sum(1 for w in unique_rec_words if w in draft_clean)
                rec_words_ratio = matched_words / len(unique_rec_words)
            else:
                rec_words_ratio = 1.0
        else:
            rec_words_ratio = 1.0 if query_matched else 0.0
            
        if query_matched and rec_words_ratio >= 0.8:
            featured_snippet_coverage_val = 100
        elif (query_matched and rec_words_ratio >= 0.5) or rec_words_ratio >= 0.8:
            featured_snippet_coverage_val = 80
        elif query_matched or rec_words_ratio >= 0.35:
            featured_snippet_coverage_val = 50
        else:
            featured_snippet_coverage_val = 0

    O_raw = (0.10 * (h1QualityVal / 100) + 
             0.10 * (h2CoverageVal / 100) + 
             0.10 * (h3CoverageVal / 100) + 
             0.10 * (faqCoverageVal / 100) + 
             0.10 * (tableCoverageVal / 100) + 
             0.20 * (wordCountAlignmentVal / 100) + 
             0.15 * (headingFrequencyAlignmentVal / 100) +
             0.15 * (featured_snippet_coverage_val / 100))
    O = min(1.0, max(0.0, O_raw))


    # ── G: Content Gap Score ───────────────────────────────────────────────────
    G = 0.8
    if content_gap_report:
        gap_topics = []
        if isinstance(content_gap_report.get("missingTopics"), list):
            gap_topics.extend(content_gap_report["missingTopics"])
        if isinstance(content_gap_report.get("unansweredQuestions"), list):
            gap_topics.extend([q.replace("?", "") for q in content_gap_report["unansweredQuestions"]])
        
        covered = 0
        if gap_topics:
            for topic in gap_topics:
                topic_lower = topic.lower().strip()
                if topic_lower in draft_clean or any(topic_lower in h.lower() for h in headings):
                    covered += 1
        
        recommended_headings = []
        if isinstance(content_gap_report.get("recommendedNewSections"), list):
            recommended_headings = [s.get("heading", "").lower().strip() for s in content_gap_report["recommendedNewSections"] if s.get("heading")]
        
        rec_covered = 0
        if recommended_headings:
            for h in recommended_headings:
                if any(lh.lower() in h or h in lh.lower() for lh in headings):
                    rec_covered += 1
        
        topics_score = covered / len(gap_topics) if gap_topics else 1.0
        rec_score = rec_covered / len(recommended_headings) if recommended_headings else 1.0
        G = 0.6 * topics_score + 0.4 * rec_score

    # ── R: Readability / Naturalness ─────────────────────────────────────────────
    unique_ratio = len(set(draft_tokens)) / max(word_count, 1)
    lex_diversity = min(1.0, unique_ratio * 2)

    paragraphs = [p.strip() for p in re.split(r"\n{2,}", draft) if p.strip() and not p.strip().startswith("#")]
    avg_para_len = sum(len(p.split()) for p in paragraphs) / max(len(paragraphs), 1)
    
    para_depth = 1.0 if 40 <= avg_para_len <= 90 else (max(0.3, 1.0 - abs(avg_para_len - 65) / 100) if avg_para_len > 0 else 0.5)

    R = 0.5 * lex_diversity + 0.5 * para_depth

    # ── P: Penalties ─────────────────────────────────────────────────────────
    penalties = 0.0
    reasons: list[str] = []
    penalty_details: list[dict] = []

    # Keyword over-optimization penalty (Issue 3)
    over_optimized_count = 0
    over_optimized_terms = []
    
    for term in basic_terms + supp_terms:
        rec_min = term.get("recommendedMin") or term.get("recommended_min", 1)
        rec_max = term.get("recommendedMax") or term.get("recommended_max", 2)
        competitor_median = max(1.0, (rec_min + rec_max) / 2.0)
        curr_count = term.get("currentCount", 0)
        if curr_count > 2.0 * competitor_median:
            over_optimized_count += 1
            over_optimized_terms.append(term.get("term", ""))

    if over_optimized_count > 0:
        term_penalty = over_optimized_count * 3.0
        penalties += term_penalty
        reasons.append(f"Over-optimization ({', '.join(over_optimized_terms)} exceed 2x competitor median): −{int(term_penalty)}pts")
        penalty_details.append({
            "reason": f"Over-optimization ({', '.join(over_optimized_terms)} exceed 2x competitor median)",
            "points": float(term_penalty)
        })

    # Legacy density keyword stuffing penalty
    stuffed = 0
    for t in basic_terms[:10]:
        term_str = (t.get("term") or "").lower()
        if not term_str:
            continue
        count   = len(re.findall(r"\b" + re.escape(term_str) + r"\b", draft_clean))
        density = count / max(word_count, 1)
        if density > 0.03:
            penalties += 5
            stuffed   += 1
    if stuffed:
        penalties += stuffed * 5
        reasons.append(f"Keyword stuffing in {stuffed} term(s): −{stuffed * 5}pts")
        penalty_details.append({
            "reason": f"Keyword stuffing in {stuffed} term(s) (density > 3%)",
            "points": float(stuffed * 5)
        })

    if word_count < 300:
        penalties += 15
        reasons.append(f"Thin content ({word_count} words < 300): −15pts")
        penalty_details.append({
            "reason": f"Thin content ({word_count} words < 300)",
            "points": 15.0
        })

    # Low lexical diversity penalty based on competitor average (Issue 3)
    comp_median_ld = median_lexical_diversity or 0.35
    ld_threshold = comp_median_ld * 0.85
    ld_penalty = 0.0
    if unique_ratio < ld_threshold:
        ld_penalty = min(15.0, Math_round(((ld_threshold - unique_ratio) / ld_threshold) * 15.0))
        if ld_penalty > 0:
            penalties += ld_penalty
            reasons.append(f"Low lexical diversity ({Math_round(unique_ratio * 100)}% vs competitor median {Math_round(comp_median_ld * 100)}%): −{int(ld_penalty)}pts")
            penalty_details.append({
                "reason": f"Low lexical diversity ({Math_round(unique_ratio * 100)}% vs competitor median {Math_round(comp_median_ld * 100)}%)",
                "points": float(ld_penalty)
            })

    penalties = min(penalties, 30.0)

    # New Weighted Blended Score formula:
    # Score = 100 * (0.15 * S + 0.25 * E + 0.25 * I + 0.10 * O + 0.15 * G + 0.10 * R) - P
    raw   = (0.15 * S + 0.25 * E + 0.25 * I + 0.10 * O + 0.15 * G + 0.10 * R) * 100
    base_score = Math_round(raw)
    total = max(0.0, float(Math_round(raw - penalties)))

    breakdown = ScoreBreakdown(
        S=float(Math_round(S * 100)),
        I=float(Math_round(I * 100)),
        E=float(Math_round(E * 100)),
        O=float(Math_round(O * 100)),
        G=float(Math_round(G * 100)),
        R=float(Math_round(R * 100)),
    )

    structure_details = {
        "h1Quality": h1QualityVal,
        "h2Coverage": h2CoverageVal,
        "h3Coverage": h3CoverageVal,
        "faqCoverage": faqCoverageVal,
        "tableCoverage": tableCoverageVal,
        "wordCountAlignment": wordCountAlignmentVal,
        "headingFrequencyAlignment": headingFrequencyAlignmentVal,
        "featuredSnippetCoverage": featured_snippet_coverage_val
    }

    return ScoreContentResponse(
        total_score=total,
        breakdown=breakdown,
        penalties=penalties,
        penalty_reasons=reasons,
        stats={
            "word_count": word_count,
            "unique_ratio": round(unique_ratio, 2),
            "avg_words_per_para": Math_round(avg_para_len),
            "must_have_covered": f"{basic_hits}/{len(basic_terms)}",
            "entity_covered": f"{covered_entities_count}/{len(target_entities)}",
            "totalEntities": len(target_entities),
            "coveredEntities": covered_entities_count,
            "missingEntitiesCount": len(target_entities) - covered_entities_count,
            "entityScoreContribution": f"{Math_round(E * 100)}% (weighted)"
        },
        base_score=float(base_score),
        penalty_details=penalty_details,
        structure_details=structure_details,
    )


