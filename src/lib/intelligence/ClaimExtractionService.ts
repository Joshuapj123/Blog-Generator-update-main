// src/lib/intelligence/ClaimExtractionService.ts
import { 
  CanonicalClaim, 
  CanonicalClaimType, 
  QuantitativeValue 
} from '@/core/contracts/evidence';

export class ClaimExtractionService {
  /**
   * Question patterns to reject
   */
  private static QUESTION_PATTERNS = [
    /^(?:how|what|why|when|where|who|can|could|should|is|are|do|does|will|would)\b/i,
  ];

  /**
   * Pure subjective advice / recommendations to reject from factual claim extraction
   */
  private static ADVICE_PATTERNS = [
    /\b(?:we recommend|it is recommended|you should|teams should|make sure to|be sure to|consider using|we suggest|it is advisable|best practice is to)\b/i,
  ];

  /**
   * Subjective opinion / promotional puffery without verifiable factual assertions
   */
  private static OPINION_PATTERNS = [
    /\b(?:in our opinion|we believe|it feels like|many believe|widely regarded as the most beloved)\b/i,
  ];

  /**
   * External empirical research attribution patterns.
   * Matches explicit attributions to named research sources, surveys, studies, or benchmark publications.
   * NOTE: Ordinary documentation or reference links (e.g. [MDN Web Docs](...), [W3C](...)) must NOT
   * be classified as empirical research attributions unless accompanied by an explicit research attribution phrase.
   */
  private static ATTRIBUTION_PATTERNS = [
    /\b(?:[Aa]ccording to|[Aa]s reported by|[Pp]ublished by|[Cc]ited by|[Ss]ource:|[Cc]ite:|[Ss]tudy by|[Ss]urvey by|[Rr]esearch from)\s+\[?([A-Z][A-Za-z0-9&.-]+(?:\s+[A-Z][A-Za-z0-9&.-]+)?)\]?/i,
    /\b(?:[Pp]er)\s+\[?([A-Z][A-Za-z0-9&.-]+(?:\s+[A-Z][A-Za-z0-9&.-]+)?)\]?\b/,
    /\[([A-Z][A-Za-z0-9&.-]+(?:\s+[A-Z][A-Za-z0-9&.-]+)?)\s+(?:study|survey|research|benchmark|report|findings)\]\((https?:\/\/[^\)]+)\)/i,
    /\[([A-Z][A-Za-z0-9&.-]+(?:\s+[A-Z][A-Za-z0-9&.-]+)?)\]\((https?:\/\/[^\)]+)\)\s+(?:found|reported|showed|discovered|demonstrated|estimated|measured|surveyed|concluded)\b/i,
  ];

  private static NON_ATTRIBUTION_SOURCES = new Set([
    'hour', 'day', 'month', 'year', 'user', 'seat', 'client', 'server', 'second', 'minute', 'week', 'quarter', 'se', 'annum', 'developer', 'engineer',
    'annual audit', 'annual audit figures', 'audit figures', 'internal audit', 'internal data', 'internal records', 'company records', 'company data', 'audit data'
  ]);

  /**
   * Comparative patterns
   */
  private static COMPARATIVE_PATTERNS = [
    /\b(?:faster than|cheaper than|better than|more affordable than|outperforms?|superior to|compared\s+(?:to|with)|versus|vs\.?|unlike)\s+([A-Z][A-Za-z0-9&.-]+)/i,
    /\b(\d+(?:\.\d+)?)\s*(?:x|times|fold)\s*(?:faster|more|higher|lower|cheaper|reduction|growth)/i,
    /\b(?:in contrast to|as opposed to|whereas)\s+([A-Z][A-Za-z0-9&.-]+)/i,
  ];

  /**
   * Explicit superiority and performance differential comparative patterns (strictly CRITICAL)
   */
  private static SUPERIORITY_COMPARATIVE_PATTERNS = [
    /\b(?:faster than|cheaper than|better than|more affordable than|outperforms?|superior to|more reliable than|higher\s+\w+\s+than|lower\s+\w+\s+than|greater\s+\w+\s+than)\b/i,
    /\b(\d+(?:\.\d+)?)\s*(?:x|times|fold)\s*(?:faster|more|higher|lower|cheaper|reduction|growth)/i,
    /\b(?:ranks?\s+higher|rated\s+better|delivers\s+superior|proves\s+superior)\b/i,
  ];

  /**
   * Meta-editorial and navigational phrasing patterns that discuss or frame a comparison
   * without asserting empirical superiority or falsifiable performance metrics.
   */
  private static META_EDITORIAL_COMPARATIVE_PATTERNS = [
    /^(?:comparing|evaluating|analyzing|exploring|examining|understanding|assessing|reviewing|weighing|choosing\s+between|deciding\s+between)\b/i,
    /\b(?:helps?|allows?|enables?)\s+(?:leadership|teams?|agencies|developers?|users?|buyers?|enterprises?|organizations?|readers?|practitioners?)\s+(?:understand|decide|evaluate|assess|choose|determine|navigate|identify|see)\b/i,
    /\b(?:when\s+(?:comparing|evaluating|considering|choosing\s+between|deciding\s+between|looking\s+at))\b/i,
    /\b(?:in\s+the\s+debate\s+between|in\s+the\s+comparison\s+(?:between|of)|the\s+choice\s+between)\b/i,
    /\b(?:to\s+understand\s+the\s+difference\s+between|understanding\s+the\s+difference\s+between)\b/i,
    /\b(?:guide\s+(?:explores|compares|evaluates|examines)|article\s+(?:explores|compares|evaluates|examines))\b/i,
    /\b(?:key\s+differences\s+between|tradeoffs?\s+between|pros\s+and\s+cons\s+of)\b/i,
  ];

  /**
   * Conceptual, architectural, or strategic trade-off patterns (e.g. "build vs. buy", "on-prem vs. cloud")
   * that discuss decision frameworks rather than empirical competitor comparisons.
   */
  private static CONCEPTUAL_TRADEOFF_PATTERNS = [
    /\b(?:build\s+(?:vs\.?|versus)\s+buy|buy\s+(?:vs\.?|versus)\s+build)\b/i,
    /\b(?:on[- ]prem(?:ises?)?\s+(?:vs\.?|versus)\s+cloud|cloud\s+(?:vs\.?|versus)\s+on[- ]prem(?:ises?)?)\b/i,
    /\b(?:in[- ]house\s+(?:vs\.?|versus)\s+(?:outsourced?|vendor|agency)|(?:outsourced?|vendor|agency)\s+(?:vs\.?|versus)\s+in[- ]house)\b/i,
    /\b(?:open[- ]source\s+(?:vs\.?|versus)\s+proprietary|proprietary\s+(?:vs\.?|versus)\s+open[- ]source)\b/i,
    /\b(?:manual\s+(?:vs\.?|versus)\s+automated|automated\s+(?:vs\.?|versus)\s+manual)\b/i,
    /\b(?:monolith\s+(?:vs\.?|versus)\s+microservices|microservices\s+(?:vs\.?|versus)\s+monolith)\b/i,
    /\b(?:pros\s+(?:and|vs\.?|versus)\s+cons|features\s+(?:vs\.?|versus)\s+benefits|cost\s+(?:vs\.?|versus)\s+value|risk\s+(?:vs\.?|versus)\s+reward)\b/i,
  ];

  /**
   * Capability and feature patterns
   */
  private static CAPABILITY_PATTERNS = [
    /\b(?:supports?|provides?|features?|integrates?(?:\s+with)?|offers?|delivers?|includes?|automates?|handles?|built with|certified for|compliant with|operates?|manufactures?|invents?|develops?|builds?|eliminates?|guarantees?|achieves?|streamlines?|accelerates?|optimizes?|ensures?|prevents?|reduces?|simplifies?|enables?|empowers?|allows?|improves?|boosts?|increases?)\b/i,
  ];

  /**
   * Qualitative commercial promises, performance guarantees, and operational claims
   */
  private static COMMERCIAL_PROMISE_PATTERNS = [
    /\b(?:instant|effortless|frictionless|risk-free|turnkey|seamless|zero[- ]downtime)\s+(?:deployment|integration|operation|setup|onboarding|migration|rollout|synchronization|execution)\b/i,
    /\b(?:deployment|setup|onboarding|integration|operation|rollout)\s+is\s+(?:instant|effortless|frictionless|risk-free|seamless|automated)\b/i,
    /\b(?:works|integrates|compatible)\s+with\s+(?:every|all)\s+(?:major\s+)?(?:system|systems|platform|platforms|tool|tools|database|databases|cloud|clouds|provider|providers)\b/i,
    /\b(?:guarantees?|promises?)\s+(?:effortless|seamless|instant|frictionless|zero[- ]downtime|risk-free|enterprise)\b/i,
    /\b(?:teams?|enterprises?|users?|developers?|customers?)\s+(?:achieves?|enjoys?|benefits?\s+from)\s+(?:seamless|effortless|instant|frictionless)\b/i,
    /\b(?:eliminates?|removes?)\s+(?:onboarding|deployment|integration|operational|workflow)\s+friction\b/i,
  ];

  /**
   * Negated capability statements (limitations, disclaimers, or explicit absence of capability)
   */
  private static NEGATED_CAPABILITY_PATTERNS = [
    /\b(?:does\s+not|doesn't|do\s+not|don't|did\s+not|didn't|cannot|can't|never|fails?\s+to)\s+(?:guarantee|eliminate|provide|deliver|offer|feature|include|support|achieve|ensure|streamline|accelerate|optimize|prevent|reduce|simplify)\b/i,
  ];

  /**
   * Purely hypothetical or conditional statement openings
   */
  private static HYPOTHETICAL_PATTERNS = [
    /^(?:if|assuming|suppose|hypothetically|in theory)\b/i,
    /\b(?:could potentially|might potentially)\b/i,
  ];

  /**
   * Concessive, skeptical, or third-party reporting contexts where commercial promises
   * are discussed critically, cited as vendor claims, or contrasted with independent findings.
   * e.g., "Although the vendor advertises instant deployment, independent tests found delays."
   */
  private static SKEPTICAL_OR_CONCESSIVE_PATTERNS = [
    /\b(?:although|though|even though|while|whereas)\s+(?:the\s+)?(?:vendor|competitor|maker|company|provider)\s+(?:advertises?|claims?|promises?|touts?)\b/i,
    /\b(?:independent|third-party)\s+(?:tests?|evaluations?|audits?|benchmarks?|observers?|researchers?)\s+(?:found|reported|showed|discovered|noted)\s+(?:delays?|issues?|problems?|limitations?|bottlenecks?|failures?)\b/i,
    /\b(?:advertises?|allegedly|purportedly|supposedly)\s+(?:instant|effortless|frictionless|risk-free|seamless)\b/i,
    /\b(?:question\s+whether|doubt\s+whether|debated\s+whether|unclear\s+whether|dispute\s+whether)\b/i,
    /\b(?:evidence|data|research|studies|benchmarks?|findings?)\s+(?:does\s+not|doesn't|do\s+not|don't|cannot|can't|fails?\s+to)\s+(?:establish|prove|demonstrate|show|confirm|validate|support|substantiate)\b/i,
    /\b(?:not\s+proven|unproven|unverified|inconclusive|not\s+established)\s+(?:whether|that)\b/i,
    /\b(?:no\s+evidence|little\s+evidence|insufficient\s+evidence)\s+(?:to\s+suggest|to\s+prove|that|shows?)\b/i,
  ];

  /**
   * First-person brand subject patterns (marketing / organizational copy):
   * "our platform", "our software", "our team", "we", etc.
   */
  public static FIRST_PERSON_SUBJECT_PATTERNS = [
    /\b(?:our|my)\s+(?:platform|software|system|tool|tools|solution|solutions|service|services|team|agency|product|products|company|architecture|infrastructure|api|engine|application|app|engineers?|developers?)\b/i,
    /\b(?:we)\b/i,
  ];

  /**
   * Definite product subject patterns:
   * "the platform", "the software", "the tool", "this platform", "the solution", "the system"
   */
  private static DEFINITE_PRODUCT_PATTERNS = [
    /\b(?:the|this)\s+(?:platform|software|system|tool|tools|solution|solutions|service|services|product|products|application|app|engine|api)\b/i,
  ];

  /**
   * Buyer evaluation guidance, verification criteria, and exploratory advice patterns
   * where features are discussed as criteria to verify or examine rather than asserted vendor capabilities.
   */
  private static EVALUATION_GUIDANCE_PATTERNS = [
    /\b(?:verify|check|confirm|ask|ensure|determine|evaluate|investigate|test|assess|identify|gauge|judge|decide|examine|explore)\s+(?:if|whether|that|how|(?:the|your|a|any)\s+(?:platform|tool|software|solution|system|vendor))\b/i,
    /\b(?:before\s+(?:you\s+)?(?:commit(?:ting)?|buy(?:ing)?|purchas(?:e|ing)|choos(?:e|ing)|decid(?:e|ing)|sign(?:ing)?|subscrib(?:e|ing)|select(?:ing)?))\b/i,
    /\b(?:when\s+(?:assessing|evaluating|choosing|selecting|considering|shopping\s+for|benchmarking)\s+(?:tools?|platforms?|software|solutions?|vendors?|options?|systems?))\b/i,
    /\b(?:look\s+for|seek\s+out|watch\s+out\s+for|pay\s+attention\s+to)\s+(?:tools?|platforms?|solutions?|features?)\b/i,
    /\b(?:you\s+can\s+(?:also\s+)?(?:explore|check|review|evaluate|look\s+into|examine|test|browse))\b/i,
    /\b(?:to\s+(?:see|determine|find\s+out|evaluate|assess|gauge|identify|judge|check|uncover))\s+(?:if|whether)\b/i,
    /\b(?:to\s+see\s+if|to\s+determine\s+if|to\s+find\s+out\s+if)\s+(?:your|the|a|any)\b/i,
    /\b(?:helps?|allows?|enables?|guides?|assists?)\s+(?:you|teams?|buyers?|users?|organizations?|companies|evaluators?|readers?)(?:\s+to)?\s+(?:see|determine|evaluate|find\s+out|understand|identify|gauge|assess|judge|decide|tell|learn|clarify|uncover)\s+(?:if|whether)\b/i,
    /\b(?:key\s+criteria|factors?\s+to\s+consider|questions?\s+to\s+ask|checklist\s+for)\s+(?:when|to|for)\s+(?:evaluating|assessing|choosing|selecting)\b/i,
    // UI/UX design guidance & recommendations: "ensure navigation serves...", "verify layout remains...", "design forms to..."
    /\b(?:ensure|make\s+sure|verify|design|structure|organize)\s+(?:that\s+)?(?:navigation|layouts?|flows?|forms?|menus?|buttons?|content|pages?|steps?|interfaces?|components?|elements?|experiences?)\s+(?:serves?|provides?|remains?|keeps?|offers?|guides?|has|is|are|focuses?)\b/i,
    /\b(?:ensure|verify|confirm)\s+(?:navigation|layout|flow|hierarchy)\s+(?:serves|has|provides|remains)\b/i,
  ];

  public static isEvaluationGuidance(text: string): boolean {
    return this.EVALUATION_GUIDANCE_PATTERNS.some(pat => pat.test(text));
  }

  /**
   * Helper: checks if a brand or competitor entity is genuinely the grammatical subject
   * of the clause or assertion, rather than an incidental object, location, or prepositional target.
   */
  public static isEntitySubjectOfClause(text: string, entity: string): boolean {
    if (!text || !entity || !entity.trim()) return false;
    const trimmedText = text.trim();
    const escaped = entity.trim().replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

    // Exclude review/guide/alternative meta-framing phrases like "A [Brand] features review", "[Brand] alternatives"
    const isMetaFramingSubject = new RegExp(
      `^(?:the\\s+|a\\s+|an\\s+)?${escaped}(?:'s)?\\s+(?:features?\\s+review|platform\\s+review|software\\s+review|review|guide|overview|analysis|article|breakdown|alternatives?)\\b`,
      'i'
    ).test(trimmedText);
    if (isMetaFramingSubject) return false;

    // Check if clause starts with the entity (allowing optional leading article)
    const startsWithEntity = new RegExp(`^(?:the\\s+|a\\s+|an\\s+)?${escaped}\\b`, 'i').test(trimmedText);
    if (startsWithEntity) return true;

    // Check if entity is followed directly by an active verb of assertion
    const verbFollower = new RegExp(
      `\\b${escaped}(?:'s)?\\s+(?:is|are|was|were|has|have|had|offers?|provides?|features?|supports?|charges?|costs?|requires?|delivers?|includes?|lacks?|fails?|built|enables?|guarantees?|ensures?|reduces?|prevents?|optimizes?|streamlines?)\\b`,
      'i'
    );

    // Check if entity is in an obvious prepositional or indirect-object role
    const isPrepositionalObject = new RegExp(
      `\\b(?:to|with|from|for|against|between|than|like|as|in|within|into|via|through|about)\\s+(?:the\\s+|your\\s+|a\\s+|an\\s+)?${escaped}\\b`,
      'i'
    ).test(text);

    if (verbFollower.test(text) && !isPrepositionalObject) {
      return true;
    }

    return false;
  }

  /**
   * Validates whether a definite product phrase ("the platform", "this software", "the tool")
   * is genuinely functioning as the grammatical subject asserting a commercial capability,
   * rather than appearing as a direct object, prepositional phrase, or noun adjunct
   * (e.g. "product core", "product roadmap", "product team").
   */
  public static isDefiniteProductSubject(trimmed: string): boolean {
    if (!this.DEFINITE_PRODUCT_PATTERNS.some(pat => pat.test(trimmed))) {
      return false;
    }

    // Reject if "product" is a noun adjunct modifying another noun (e.g. "product core", "product roadmap", "product team")
    if (/\b(?:the|this)\s+product\s+(?:core|roadmap|team|teams|backlog|lifecycle|catalog|manager|managers|owner|owners|lead|leads|designer|designers|market|fit|analytics|metric|metrics|requirement|requirements|flow|flows|spec|specs|specification|specifications)\b/i.test(trimmed)) {
      return false;
    }

    // Reject if in prepositional phrase
    if (/\b(?:to|with|from|for|against|between|than|like|as|in|within|into|via|through|about|of|on|across|under|over)\s+(?:the|this)\s+(?:platform|software|system|tool|tools|solution|solutions|service|services|product|products|application|app|engine|api)\b/i.test(trimmed)) {
      return false;
    }

    // Reject if direct object of a transitive verb
    if (/\b(?:impact(?:s|ed|ing)?|affect(?:s|ed|ing)?|use(?:s|d|ing)?|modify(?:ing)?|modifies|test(?:s|ed|ing)?|audit(?:s|ed|ing)?|inspect(?:s|ed|ing)?|evaluat(?:e|es|ed|ing)|deploy(?:s|ed|ing)?|review(?:s|ed|ing)?|integrat(?:e|es|ed|ing)|purchas(?:e|es|ed|ing)|buy(?:ing|s)?|build(?:s|ing)?|choos(?:e|es|ing)|select(?:s|ed|ing)?|develop(?:s|ed|ing)?|run(?:s|ning)?|support(?:s|ed|ing)?|optimiz(?:e|es|ed|ing)|customiz(?:e|es|ed|ing)|configure(?:s|d|ing)?|enhanc(?:e|es|ed|ing)|maintain(?:s|ed|ing)?|scale(?:s|d|ing)?|access(?:es|ed|ing)?|monit(?:or|ors|ored|oring))\s+(?:the|this)\s+(?:platform|software|system|tool|tools|solution|solutions|service|services|product|products|application|app|engine|api)\b/i.test(trimmed)) {
      return false;
    }

    // Must function as grammatical subject: starts the clause OR followed by active verb of assertion
    const startsWithProduct = /^(?:the|this)\s+(?:platform|software|system|tool|tools|solution|solutions|service|services|product|products|application|app|engine|api)\b/i.test(trimmed);
    const followedByVerb = /\b(?:the|this)\s+(?:platform|software|system|tool|tools|solution|solutions|service|services|product|products|application|app|engine|api)\s+(?:is|are|was|were|has|have|had|offers?|provides?|features?|supports?|delivers?|includes?|automates?|enables?|guarantees?|ensures?|reduces?|prevents?|optimizes?|streamlines?|built|integrates?)\b/i.test(trimmed);

    return startsWithProduct || followedByVerb;
  }

  /**
   * Lead indicators for coordinate predicate clauses
   */
  private static VERB_LEAD_REGEX = /^(?:guarantees?|provides?|providing|features?|featuring|integrates?(?:\s+with)?|offers?|offering|delivers?|delivering|includes?|including|automates?|handles?|eliminates?|achieves?|streamlines?|accelerates?|optimizes?|ensures?|prevents?|reduces?|simplifies?|enables?|empowers?|operates?|manufactures?|invents?|develops?|builds?|improves?|boosts?|increases?|does\s+not|doesn't|cannot|can't)\b/i;

  private static PROMISE_LEAD_REGEX = /^(?:instant|effortless|frictionless|risk-free|turnkey|seamless|zero[- ]downtime)\b/i;

  private static SUBORDINATE_LEAD_REGEX = /^(?:while|whereas|although|though|if|unless|since|because|even\s+if)\b/i;

  private static SUBJECT_FINITE_VERB_REGEX = /^(?:our\s+[a-z0-9_-]+|the\s+[a-z0-9_-]+|this\s+[a-z0-9_-]+|we|they|it|teams?|enterprises?|users?|developers?|customers?|engineers?|product\s+teams?|[A-Z][a-zA-Z0-9_]+)\s+(?:(?:can|could|may|might|will|would|should|must|do|does|did|is|are|was|were|has|have|had|also|always|typically|often|consistently|never|rarely)\s+)*(?:is|are|was|were|has|have|had|lose|loses|lost|provide|provides|provided|offer|offers|offered|deliver|delivers|delivered|require|requires|help|helps|build|builds|create|creates|ensure|ensures|reduce|reduces|spend|spends|spent|face|faces|experience|experiences|find|finds|see|sees|need|needs|want|wants)\b/i;

  /**
   * Temporal patterns (years, founding, launching)
   */
  private static TEMPORAL_PATTERNS = [
    /\b(?:founded in|established in|launched in|released in|started in|created in)\s+(19\d\d|20\d\d)\b/i,
    /\b(?:since|in|by)\s+(19\d\d|20\d\d)\b/i,
  ];

  /**
   * Quantitative regex patterns
   */
  private static QUANTITATIVE_PATTERNS = [
    // Ranges
    /(?:between|from)\s+[\$€£]?\s*\d+(?:,\d+)*(?:\.\d+)?\s*(?:%|ms|users?|engineers?|developers?|k|m|b)?\s+(?:and|to)\s+[\$€£]?\s*\d+(?:,\d+)*(?:\.\d+)?(?:\s*(?:%|ms|users?|engineers?|developers?|k|m|b))?/gi,
    // Currencies
    /(?:(?:more than|greater than|over|above|exceeding|at least|minimum of|less than|fewer than|under|below|at most|up to|maximum of|approximately|approx\.|about|around|nearly|roughly|~)\s+)?(?:[\$€£]\s*\d+(?:,\d+)*(?:\.\d+)?(?:\s*(?:million|billion|k|m|b)\b)?|\b(?:USD|EUR|GBP)\s*\d+(?:,\d+)*(?:\.\d+)?(?:\s*(?:million|billion|k|m|b)\b)?|\b\d+(?:,\d+)*(?:\.\d+)?\s*(?:USD|EUR|GBP|dollars?|euros?|million|billion|k|m|b)\b)/gi,
    // Percentages (note: no \b after %)
    /(?:(?:more than|greater than|over|above|exceeding|at least|minimum of|less than|fewer than|under|below|at most|up to|maximum of|approximately|approx\.|about|around|nearly|roughly|~)\s+)?\b\d+(?:\.\d+)?\s*(?:%|\bpercent\b)/gi,
    // Performance & time metrics
    /(?:(?:more than|greater than|over|above|exceeding|at least|minimum of|less than|fewer than|under|below|at most|up to|maximum of|approximately|approx\.|about|around|nearly|roughly|~)\s+)?\b\d+(?:,\d+)*(?:\.\d+)?\s*(?:ms|milliseconds?|seconds?|minutes?|hours?|days?|weeks?|months?|years?|req\/s|rps|tps|qps|gbps|mbps|tb|gb|mb|ghz|iops)\b/gi,
    // Multipliers
    /(?:(?:more than|greater than|over|above|exceeding|at least|minimum of|less than|fewer than|under|below|at most|up to|maximum of|approximately|approx\.|about|around|nearly|roughly|~)\s+)?\b\d+(?:\.\d+)?\s*(?:times|x|fold)\b/gi,
    // Quantities & counts (allowing optional descriptive adjective e.g. senior developers, integrations)
    /(?:(?:more than|greater than|over|above|exceeding|at least|minimum of|less than|fewer than|under|below|at most|up to|maximum of|approximately|approx\.|about|around|nearly|roughly|~)\s+)?\b\d+(?:,\d+)?\s*(?:(?:senior|junior|lead|enterprise|cloud|active|total|concurrent|registered|connected)\s+)?(?:users?|clients?|nodes?|servers?|clusters?|engineers?|developers?|microservices|pipelines?|tenants?|customers?|integrations?)\b/gi,
  ];

  /**
   * Deterministically normalizes malformed Markdown links (e.g. nested links produced by LLMs or prompt echoing)
   * into clean Markdown links [anchor](url), while preserving valid links and their exact destinations.
   * - [anchor]\([url](url)) -> [anchor](url)
   * - [anchor]([url](url)) -> [anchor](url)
   * - [anchor]\(url\) -> [anchor](url)
   */
  public static normalizeMarkdownLinks(text: string): string {
    if (!text) return '';

    // 1. Nested duplicate URL links with optional backslash before paren:
    // e.g. [MDN Web Docs]\([https://developer.mozilla.org/](https://developer.mozilla.org/))
    // or [MDN Web Docs]([https://developer.mozilla.org/](https://developer.mozilla.org/))
    let result = text.replace(
      /\[([^\]\n]+)\]\\?\(\s*\[(https?:\/\/[^\s\]\n]+)\]\(\s*(https?:\/\/[^\s\)\n]+)\s*\)\s*\)/g,
      (_, anchor, innerAnchor, targetUrl) => {
        return `[${anchor.trim()}](${targetUrl.trim()})`;
      }
    );

    // 2. Escaped parenthesis on simple markdown link: [anchor]\(url\) or [anchor]\(url)
    result = result.replace(
      /\[([^\]\n]+)\]\\\(\s*(https?:\/\/[^\s\)\n]+)\s*\\?\)/g,
      (_, anchor, url) => {
        return `[${anchor.trim()}](${url.trim()})`;
      }
    );

    return result;
  }

  /**
   * Extracts canonical claims from full markdown content.
   */
  public static extractClaimsFromMarkdown(
    markdown: string,
    targetBrand?: string,
    knownCompetitors: string[] = []
  ): CanonicalClaim[] {
    const claims: CanonicalClaim[] = [];
    if (!markdown || !markdown.trim()) return claims;

    const normalizedMarkdown = this.normalizeMarkdownLinks(markdown);

    // Split markdown into sections by headings
    const sectionRegex = /(?:^|\n)(#{2,3})\s+([^\n]+)/g;
    const sectionIndices: { heading: string; level: string; headingStart: number; contentStart: number }[] = [];
    let match: RegExpExecArray | null;

    while ((match = sectionRegex.exec(normalizedMarkdown)) !== null) {
      sectionIndices.push({
        heading: match[2].trim(),
        level: match[1],
        headingStart: match.index,
        contentStart: match.index + match[0].length,
      });
    }

    if (sectionIndices.length === 0) {
      // Treat entire content as single section 0
      return this.extractClaimsFromSection(normalizedMarkdown, 0, 'Introduction', targetBrand, knownCompetitors);
    }

    for (let i = 0; i < sectionIndices.length; i++) {
      const current = sectionIndices[i];
      const end = i + 1 < sectionIndices.length ? sectionIndices[i + 1].headingStart : normalizedMarkdown.length;
      const sectionText = normalizedMarkdown.slice(current.contentStart, end).trim();
      const secClaims = this.extractClaimsFromSection(
        sectionText,
        i,
        current.heading,
        targetBrand,
        knownCompetitors
      );
      claims.push(...secClaims);
    }

    return claims;
  }

  /**
   * Extracts canonical claims from a single section text.
   */
  public static extractClaimsFromSection(
    sectionContent: string,
    sectionIndex: number,
    sectionHeading: string,
    targetBrand?: string,
    knownCompetitors: string[] = []
  ): CanonicalClaim[] {
    const claims: CanonicalClaim[] = [];
    if (!sectionContent || !sectionContent.trim()) return claims;

    const normalizedContent = this.normalizeMarkdownLinks(sectionContent);

    // Split text into paragraphs, skipping tables, code blocks, and markdown headings
    const paragraphs = normalizedContent
      .split(/\n\s*\n/)
      .map(p => p.trim())
      .filter(p => p.length > 0 && !p.startsWith('|') && !p.startsWith('```') && !p.startsWith('#'));

    let claimIdx = 0;
    for (const para of paragraphs) {
      // Split paragraph into sentences
      const sentences = this.splitIntoSentences(para);
      for (const sent of sentences) {
        const extracted = this.extractClaimsFromSentence(
          sent,
          sectionIndex,
          sectionHeading,
          claimIdx,
          targetBrand,
          knownCompetitors,
          para
        );
        for (const c of extracted) {
          claims.push(c);
          claimIdx++;
        }
      }
    }

    return claims;
  }

  /**
   * Helper: splits a compound sentence into distinct proposition clauses.
   */
  public static splitSentenceIntoClauses(sentence: string): string[] {
    const trimmed = sentence.trim();
    if (trimmed.length < 20) return [trimmed];

    // Protect ranges: e.g. "between $100 and $150", "from 10 to 20%"
    const rangePlaceholders: string[] = [];
    const protectedSentence = trimmed.replace(
      /(?:between|from)\s+[\$€£]?\s*\d+(?:,\d+)*(?:\.\d+)?\s*(?:%|ms|users?|engineers?|developers?|k|m|b)?\s+(?:and|to)\s+[\$€£]?\s*\d+(?:,\d+)*(?:\.\d+)?(?:\s*(?:%|ms|users?|engineers?|developers?|k|m|b))?/gi,
      (m) => {
        rangePlaceholders.push(m);
        return `__RANGE_${rangePlaceholders.length - 1}__`;
      }
    );

    const splitRegex = /(?:;\s*|,\s*(?:and|but|while|whereas|although|though|however|yet|plus|as well as)\s+|,\s*(?=(?:guarantees?|delivers?|delivering|provides?|providing|offers?|offering|eliminates?|automates?|features?|reduces?|achieves?|streamlines?|optimizes?|ensures?)\b)|,\s*(?=(?:our\s+|the\s+|this\s+|we\b|teams?\b|enterprises?\b|users?\b|developers?\b|customers?\b|engineers?\b|product\s+teams?\b|[A-Z][a-zA-Z0-9_]*\b))|\s+(?:and|but|while|whereas|although|though|yet|plus|as well as)\s+|\s+with\s+(?=(?:instant|effortless|frictionless|risk-free|seamless|zero[- ]downtime)\b))/gi;

    const FRONTED_SUBORDINATE_REGEX = /^(?:when|if|while|whereas|although|though|unless|because|since|as|even\s+if)\b/i;
    const HAS_FINITE_VERB_REGEX = /\b(?:is|are|was|were|has|have|had|do|does|did|can|could|may|might|will|would|should|must|provides?|providing|offers?|offering|delivers?|delivering|features?|includes?|requires?|helps?|builds?|creates?|ensures?|reduces?|loses?|spend|spends?|maintains?|charges?|faces?|encounters?|experiences?|finds?|sees?|reviews?|optimizes?|eliminates?|supports?|focuses?|relies?|benefits?|chooses?)\b/i;

    const rawSplits: string[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = splitRegex.exec(protectedSentence)) !== null) {
      const clauseBefore = protectedSentence.slice(lastIndex, match.index).trim();
      const delimiter = match[0];
      const remainingAfter = protectedSentence.slice(match.index + delimiter.length).trim();

      // Quotation protection: do not split inside quotes or immediately before an open quote
      if (/^["'“”‘’]/.test(remainingAfter) || /["'“”‘’]$/.test(clauseBefore)) continue;

      // Abbreviation protection: e.g. "e.g.", "i.e.", "etc."
      if (/\b(?:e\.g|i\.e|etc|vs|vol|no)\b$/i.test(clauseBefore)) continue;

      // Fronted subordinate clause separation (e.g. "When an agency delivers a generic audit, developers lose time...")
      const isCommaOnly = delimiter.trim() === ',';
      const isFrontedSubordinateComma = isCommaOnly && FRONTED_SUBORDINATE_REGEX.test(clauseBefore) && HAS_FINITE_VERB_REGEX.test(clauseBefore);

      // Serial list item protection: if delimiter is ", and " but follower has no finite verb predicate, do not split
      const isCommaAnd = /,\s*and\s+/i.test(delimiter);
      if (isCommaAnd && !HAS_FINITE_VERB_REGEX.test(remainingAfter)) {
        continue;
      }

      const isPunctuationDelimiter = delimiter.includes(';');
      const isClauseFollower =
        isPunctuationDelimiter ||
        isFrontedSubordinateComma ||
        this.VERB_LEAD_REGEX.test(remainingAfter) ||
        this.PROMISE_LEAD_REGEX.test(remainingAfter) ||
        this.SUBORDINATE_LEAD_REGEX.test(remainingAfter) ||
        this.SUBJECT_FINITE_VERB_REGEX.test(remainingAfter);

      if (clauseBefore.length >= 10 && remainingAfter.length >= 10 && isClauseFollower) {
        rawSplits.push(clauseBefore);
        lastIndex = match.index + delimiter.length;
      }
    }

    const trailing = protectedSentence.slice(lastIndex).trim();
    if (trailing.length > 0) {
      rawSplits.push(trailing);
    }

    const finalClauses = rawSplits.map(clause => {
      return clause.replace(/__RANGE_(\d+)__/g, (_, idx) => rangePlaceholders[parseInt(idx, 10)]).trim();
    });

    return finalClauses.length > 0 ? finalClauses : [trimmed];
  }

  /**
   * Extracts canonical claims from a single sentence.
   */
  public static extractClaimsFromSentence(
    sentence: string,
    sectionIndex: number,
    sectionHeading: string,
    claimIndex: number,
    targetBrand?: string,
    knownCompetitors: string[] = [],
    contextParagraph?: string
  ): CanonicalClaim[] {
    const trimmed = sentence.trim();
    if (trimmed.length < 20) return []; // Ignore tiny fragments

    // Reject rhetorical or inquiry questions
    if (trimmed.endsWith('?')) return [];
    for (const pat of this.QUESTION_PATTERNS) {
      if (pat.test(trimmed) && /^(?:how to|what is|why do|can we|should you|is there|are there)\b/i.test(trimmed)) {
        return [];
      }
    }

    const clauses = this.splitSentenceIntoClauses(trimmed);
    if (clauses.length <= 1) {
      return this.extractClaimsFromClause(
        trimmed,
        trimmed,
        sectionIndex,
        sectionHeading,
        claimIndex,
        targetBrand,
        knownCompetitors,
        contextParagraph
      );
    }

    // Resolve sentence-level subject for coordinate predicate inheritance
    const { subjectEntity: sentenceSubject } = this.resolveEntities(
      trimmed,
      targetBrand,
      knownCompetitors,
      contextParagraph,
      sectionHeading,
      true
    );

    const allClaims: CanonicalClaim[] = [];
    let subIdx = 0;
    let inheritedSubject = sentenceSubject;

    for (const clause of clauses) {
      const isGuidance = this.isEvaluationGuidance(clause);
      const isSubordinate = /^(?:while|whereas|although|though|if|when|unless|because|since|as)\b/i.test(clause.trim());
      const isTradeoff = this.CONCEPTUAL_TRADEOFF_PATTERNS.some(pat => pat.test(clause));
      const subjectToInherit = (isGuidance || isSubordinate || isTradeoff) ? undefined : inheritedSubject;
      const clauseClaims = this.extractClaimsFromClause(
        clause,
        trimmed,
        sectionIndex,
        sectionHeading,
        claimIndex + subIdx,
        targetBrand,
        knownCompetitors,
        contextParagraph,
        subjectToInherit
      );

      for (const c of clauseClaims) {
        allClaims.push(c);
        if (c.subjectEntity) {
          inheritedSubject = c.subjectEntity;
        }
        subIdx++;
      }
    }

    return allClaims;
  }

  /**
   * Extracts canonical claims from an individual proposition clause.
   */
  private static extractClaimsFromClause(
    clauseText: string,
    fullSentence: string,
    sectionIndex: number,
    sectionHeading: string,
    claimIndex: number,
    targetBrand?: string,
    knownCompetitors: string[] = [],
    contextParagraph?: string,
    inheritedSubject?: string
  ): CanonicalClaim[] {
    const trimmed = clauseText.trim();
    if (trimmed.length < 10) return [];

    // Reject pure recommendations/advice without factual metrics
    let isAdvice = false;
    for (const pat of this.ADVICE_PATTERNS) {
      if (pat.test(trimmed)) {
        isAdvice = true;
        break;
      }
    }

    // Check for quantitative values
    const quantValues = this.parseQuantitativeValues(trimmed);

    // If pure advice and NO quantitative value, ignore
    if (isAdvice && quantValues.length === 0) {
      return [];
    }

    // Check for subjective puffery without facts
    let isOpinion = false;
    for (const pat of this.OPINION_PATTERNS) {
      if (pat.test(trimmed)) {
        isOpinion = true;
        break;
      }
    }
    if (isOpinion && quantValues.length === 0) {
      return [];
    }

    // Detect attribution
    let attributionSource: string | undefined;
    for (const pat of this.ATTRIBUTION_PATTERNS) {
      const m = trimmed.match(pat);
      if (m) {
        const candidate = m[1]?.trim();
        if (candidate && !this.NON_ATTRIBUTION_SOURCES.has(candidate.toLowerCase())) {
          attributionSource = candidate;
          break;
        }
      }
    }

    // Detect temporal anchor
    let temporalAnchor: string | undefined;
    for (const pat of this.TEMPORAL_PATTERNS) {
      const m = trimmed.match(pat);
      if (m) {
        temporalAnchor = m[1]?.trim();
        break;
      }
    }

    // Detect comparative
    let isComparative = false;
    for (const pat of this.COMPARATIVE_PATTERNS) {
      if (pat.test(trimmed)) {
        isComparative = true;
        break;
      }
    }

    // Exclude conceptual decision trade-offs (e.g. "build vs. buy", "on-prem vs. cloud")
    // unless an explicit empirical superiority claim or known competitor entity is present
    if (isComparative && this.CONCEPTUAL_TRADEOFF_PATTERNS.some(pat => pat.test(trimmed))) {
      const hasExplicitSuperiority = this.SUPERIORITY_COMPARATIVE_PATTERNS.some(pat => pat.test(trimmed));
      const hasCompetitorEntity = knownCompetitors.some(c => this.hasWordBoundaryMatch(trimmed, c));
      if (!hasExplicitSuperiority && !hasCompetitorEntity) {
        isComparative = false;
      }
    }

    // Detect commercial promise patterns
    let isCommercialPromise = false;
    for (const pat of this.COMMERCIAL_PROMISE_PATTERNS) {
      if (pat.test(trimmed)) {
        isCommercialPromise = true;
        break;
      }
    }

    // Detect capability
    let isCapability = false;
    for (const pat of this.CAPABILITY_PATTERNS) {
      if (pat.test(trimmed)) {
        isCapability = true;
        break;
      }
    }

    // "build" in "build vs. buy" or "build versus buy" is part of a decision matrix, not a software capability verb
    if (isCapability && this.CONCEPTUAL_TRADEOFF_PATTERNS.some(pat => pat.test(trimmed))) {
      const strippedTradeoff = trimmed.replace(
        /\b(?:build\s+(?:vs\.?|versus)\s+buy|buy\s+(?:vs\.?|versus)\s+build)\b/gi,
        ''
      );
      isCapability = this.CAPABILITY_PATTERNS.some(pat => pat.test(strippedTradeoff));
    }

    // Detect negated capability
    let isNegatedCapability = false;
    for (const pat of this.NEGATED_CAPABILITY_PATTERNS) {
      if (pat.test(trimmed)) {
        isNegatedCapability = true;
        break;
      }
    }

    // Detect hypothetical
    let isHypothetical = false;
    for (const pat of this.HYPOTHETICAL_PATTERNS) {
      if (pat.test(trimmed)) {
        isHypothetical = true;
        break;
      }
    }

    // Detect skeptical or concessive context
    let isSkeptical = false;
    for (const pat of this.SKEPTICAL_OR_CONCESSIVE_PATTERNS) {
      if (pat.test(trimmed)) {
        isSkeptical = true;
        break;
      }
    }

    // Preliminary subject indicators on this specific clause
    const isTargetSubject = Boolean(targetBrand && this.isEntitySubjectOfClause(trimmed, targetBrand));
    const isCompetitorSubject = knownCompetitors.some(c => this.isEntitySubjectOfClause(trimmed, c));
    const isFirstPerson = this.FIRST_PERSON_SUBJECT_PATTERNS.some(pat => pat.test(trimmed));
    const isDefiniteProduct = this.isDefiniteProductSubject(trimmed);
    const hasBrandOrFirstPersonSubject = isTargetSubject || isCompetitorSubject || isFirstPerson || Boolean(inheritedSubject);
    const hasExplicitVendorSubject = hasBrandOrFirstPersonSubject || (isDefiniteProduct && !this.isEvaluationGuidance(trimmed));

    // Detect evaluation guidance (clause-level or enclosing sentence)
    // Only applies if the clause itself does NOT have an explicit vendor/brand subject asserting capability
    const isEvaluationAdvice = !hasExplicitVendorSubject && (this.isEvaluationGuidance(trimmed) || (!inheritedSubject && this.isEvaluationGuidance(fullSentence)));

    // If pure evaluation guidance/advice and NO quantitative metric,
    // classify as general guidance / framing (SUPPLEMENTAL), not an affirmative target-brand capability
    if (isEvaluationAdvice && quantValues.length === 0) {
      return [{
        id: `claim-${sectionIndex}-${claimIndex}-0`,
        sectionIndex,
        sectionHeading,
        sentence: fullSentence,
        claimText: trimmed,
        claimType: 'GENERAL_FACT',
        subjectEntity: undefined,
        targetEntity: undefined,
        temporalAnchor,
        confidence: 0.7,
        materiality: 'SUPPLEMENTAL',
        supportStatus: 'UNSUPPORTED',
        groundedEvidenceIds: [],
      }];
    }

    // If explicitly skeptical context, concessive analysis, or disclaimer stating lack of proof,
    // and NO quantitative metric, classify as general editorial framing (SUPPLEMENTAL),
    // not an affirmative target-brand capability that would trigger false-positive grounding failures.
    if (isSkeptical && quantValues.length === 0) {
      return [{
        id: `claim-${sectionIndex}-${claimIndex}-0`,
        sectionIndex,
        sectionHeading,
        sentence: fullSentence,
        claimText: trimmed,
        claimType: 'GENERAL_FACT',
        subjectEntity: undefined,
        targetEntity: undefined,
        temporalAnchor,
        confidence: 0.7,
        materiality: 'SUPPLEMENTAL',
        supportStatus: 'UNSUPPORTED',
        groundedEvidenceIds: [],
      }];
    }

    const isCommercialSubjectContext = !isEvaluationAdvice && (isTargetSubject || isCompetitorSubject || isFirstPerson || isDefiniteProduct);

    // Commercial capability assertion:
    // A commercial promise (guarantees, SLAs, zero-downtime) is ALWAYS a commercial capability assertion
    // unless explicitly negated or skeptical/concessive. A modal hedge (e.g. "could potentially guarantee zero downtime")
    // does NOT downgrade an ungrounded commercial promise into a safe general fact.
    // For standard capabilities (supports, integrates, reduces), disqualify if hypothetical, skeptical, or evaluation guidance.
    const isCommercialCapability = !isNegatedCapability && !isSkeptical && (
      isCommercialPromise || (!isHypothetical && !isEvaluationAdvice && isCapability && isCommercialSubjectContext)
    );

    // Detect subject entity and target entity (context-aware & boundary-safe)
    const isMarketingClaimContext = isCommercialCapability || isCapability || isComparative || quantValues.length > 0;
    let { subjectEntity, targetEntity } = this.resolveEntities(
      trimmed,
      targetBrand,
      knownCompetitors,
      contextParagraph,
      sectionHeading,
      isMarketingClaimContext
    );

    // Inherit subject from previous coordinate predicate if clause has no explicit subject
    if (!subjectEntity && inheritedSubject && (isCommercialCapability || isCapability || quantValues.length > 0)) {
      subjectEntity = inheritedSubject;
    }

    const claims: CanonicalClaim[] = [];

    // If quantitative values found, each distinct metric produces a claim
    if (quantValues.length > 0) {
      quantValues.forEach((qv, idx) => {
        let claimType: CanonicalClaimType = 'QUANTITATIVE';
        if (attributionSource) claimType = 'ATTRIBUTION';
        else if (isComparative) claimType = 'COMPARATIVE';
        else if (temporalAnchor && !qv.unit) claimType = 'TEMPORAL';

        // Materiality: Quantitative claims with metrics, currencies, percentages, or multipliers are CRITICAL
        const materiality: 'CRITICAL' | 'IMPORTANT' | 'SUPPLEMENTAL' = 'CRITICAL';

        claims.push({
          id: `claim-${sectionIndex}-${claimIndex}-${idx}`,
          sectionIndex,
          sectionHeading,
          sentence: fullSentence,
          claimText: qv.raw,
          claimType,
          subjectEntity,
          targetEntity,
          quantitativeValue: qv,
          attributionSource,
          temporalAnchor,
          confidence: 0.95,
          materiality,
          supportStatus: 'UNSUPPORTED',
          groundedEvidenceIds: [],
        });
      });

      // Residual safety: if this same clause ALSO contains an independent commercial promise
      // that is not just the numeric metric itself, extract it as an independent capability claim.
      if (isCommercialPromise && !isNegatedCapability && !isHypothetical && !isSkeptical) {
        const isCompetitor = Boolean(
          subjectEntity && knownCompetitors.some(c => c.toLowerCase() === subjectEntity.toLowerCase())
        );
        const materiality: 'CRITICAL' | 'IMPORTANT' | 'SUPPLEMENTAL' = isCompetitor ? 'IMPORTANT' : 'CRITICAL';
        const claimType: CanonicalClaimType = isCompetitor ? 'COMPETITOR_ASSERTION' : 'ENTITY_CAPABILITY';

        claims.push({
          id: `claim-${sectionIndex}-${claimIndex}-${claims.length}`,
          sectionIndex,
          sectionHeading,
          sentence: fullSentence,
          claimText: trimmed,
          claimType,
          subjectEntity,
          targetEntity,
          temporalAnchor,
          confidence: 0.85,
          materiality,
          supportStatus: 'UNSUPPORTED',
          groundedEvidenceIds: [],
        });
      }

      return claims;
    }

    // Attribution without explicit quantitative value (e.g. "According to Gartner, CRM adoption is accelerating")
    if (attributionSource) {
      return [{
        id: `claim-${sectionIndex}-${claimIndex}-0`,
        sectionIndex,
        sectionHeading,
        sentence: fullSentence,
        claimText: trimmed,
        claimType: 'ATTRIBUTION',
        subjectEntity,
        targetEntity,
        attributionSource,
        temporalAnchor,
        confidence: 0.9,
        materiality: 'CRITICAL',
        supportStatus: 'UNSUPPORTED',
        groundedEvidenceIds: [],
      }];
    }

    // Comparative assertion without numbers
    if (isComparative) {
      const isMetaEditorial = this.META_EDITORIAL_COMPARATIVE_PATTERNS.some(pat => pat.test(trimmed));
      const hasExplicitSuperiority = this.SUPERIORITY_COMPARATIVE_PATTERNS.some(pat => pat.test(trimmed));

      // If it is meta-editorial framing, a qualified hypothesis, or skeptical/concessive context,
      // and lacks explicit empirical superiority assertions and commercial promises,
      // classify as a general framing statement (SUPPLEMENTAL), not a CRITICAL empirical comparative claim.
      if (((isMetaEditorial || isHypothetical || isSkeptical) && !hasExplicitSuperiority && !isCommercialPromise)) {
        return [{
          id: `claim-${sectionIndex}-${claimIndex}-0`,
          sectionIndex,
          sectionHeading,
          sentence: fullSentence,
          claimText: trimmed,
          claimType: 'GENERAL_FACT',
          subjectEntity,
          targetEntity,
          temporalAnchor,
          confidence: 0.7,
          materiality: 'SUPPLEMENTAL',
          supportStatus: 'UNSUPPORTED',
          groundedEvidenceIds: [],
        }];
      }

      return [{
        id: `claim-${sectionIndex}-${claimIndex}-0`,
        sectionIndex,
        sectionHeading,
        sentence: fullSentence,
        claimText: trimmed,
        claimType: 'COMPARATIVE',
        subjectEntity,
        targetEntity,
        temporalAnchor,
        confidence: 0.85,
        materiality: 'CRITICAL',
        supportStatus: 'UNSUPPORTED',
        groundedEvidenceIds: [],
      }];
    }

    // Competitor assertion
    if (subjectEntity && knownCompetitors.some(c => c.toLowerCase() === subjectEntity.toLowerCase())) {
      return [{
        id: `claim-${sectionIndex}-${claimIndex}-0`,
        sectionIndex,
        sectionHeading,
        sentence: fullSentence,
        claimText: trimmed,
        claimType: 'COMPETITOR_ASSERTION',
        subjectEntity,
        targetEntity,
        temporalAnchor,
        confidence: 0.85,
        materiality: 'IMPORTANT',
        supportStatus: 'UNSUPPORTED',
        groundedEvidenceIds: [],
      }];
    }

    // Entity capability or commercial product promise
    if (!isNegatedCapability && !isSkeptical && (isCommercialCapability || (!isHypothetical && isCapability && subjectEntity))) {
      const isTargetBrand = Boolean(
        targetBrand && subjectEntity && subjectEntity.toLowerCase() === targetBrand.toLowerCase()
      );
      const isCompetitor = Boolean(
        subjectEntity && knownCompetitors.some(c => c.toLowerCase() === subjectEntity.toLowerCase())
      );

      // Materiality:
      // - Explicit competitor assertion: IMPORTANT
      // - Target brand capability: CRITICAL
      // - Unresolved commercial promise (subject entity absent): CRITICAL (cannot bypass strict validation)
      const materiality: 'CRITICAL' | 'IMPORTANT' | 'SUPPLEMENTAL' = isCompetitor ? 'IMPORTANT' : 'CRITICAL';
      const claimType: CanonicalClaimType = isCompetitor ? 'COMPETITOR_ASSERTION' : 'ENTITY_CAPABILITY';

      return [{
        id: `claim-${sectionIndex}-${claimIndex}-0`,
        sectionIndex,
        sectionHeading,
        sentence: fullSentence,
        claimText: trimmed,
        claimType,
        subjectEntity,
        targetEntity,
        temporalAnchor,
        confidence: 0.85,
        materiality,
        supportStatus: 'UNSUPPORTED',
        groundedEvidenceIds: [],
      }];
    }

    // Temporal fact (e.g., "Founded in 2018 in San Francisco")
    if (temporalAnchor) {
      return [{
        id: `claim-${sectionIndex}-${claimIndex}-0`,
        sectionIndex,
        sectionHeading,
        sentence: fullSentence,
        claimText: trimmed,
        claimType: 'TEMPORAL',
        subjectEntity,
        targetEntity,
        temporalAnchor,
        confidence: 0.85,
        materiality: 'IMPORTANT',
        supportStatus: 'UNSUPPORTED',
        groundedEvidenceIds: [],
      }];
    }

    // General fact
    return [{
      id: `claim-${sectionIndex}-${claimIndex}-0`,
      sectionIndex,
      sectionHeading,
      sentence: fullSentence,
      claimText: trimmed,
      claimType: 'GENERAL_FACT',
      subjectEntity,
      targetEntity,
      confidence: 0.7,
      materiality: 'SUPPLEMENTAL',
      supportStatus: 'UNSUPPORTED',
      groundedEvidenceIds: [],
    }];
  }

  /**
   * Parses structured QuantitativeValues from text.
   */
  public static parseQuantitativeValues(text: string): QuantitativeValue[] {
    const results: QuantitativeValue[] = [];
    const seen = new Set<string>();

    for (const pat of this.QUANTITATIVE_PATTERNS) {
      const regex = new RegExp(pat.source, pat.flags);
      const matches = text.match(regex) || [];

      for (const rawMatch of matches) {
        const raw = rawMatch.trim();
        const rawLower = raw.toLowerCase();
        if (seen.has(rawLower)) continue;
        seen.add(rawLower);

        // Check for Range: "between $100 and $150", "from 10 to 20%"
        const rangeMatch = raw.match(/(?:between|from)\s+([\$€£]?\s*\d+(?:,\d+)*(?:\.\d+)?)\s*(?:and|to)\s+([\$€£]?\s*\d+(?:,\d+)*(?:\.\d+)?)(?:\s*(%|ms|users|engineers|developers|k|m|b))?/i);
        if (rangeMatch) {
          const minNum = this.parseNumericValue(rangeMatch[1]);
          const maxNum = this.parseNumericValue(rangeMatch[2]);
          const unit = this.parseUnit(raw);
          results.push({
            raw,
            operator: 'RANGE',
            rangeMin: minNum,
            rangeMax: maxNum,
            normalizedNumber: minNum,
            unit,
            tolerance: 0.05,
          });
          continue;
        }

        // Check operators
        let operator: 'EXACT' | 'APPROX' | 'GT' | 'GTE' | 'LT' | 'LTE' = 'EXACT';
        if (/\b(?:at\s+least|minimum\s+of|>=)\b/i.test(raw)) {
          operator = 'GTE';
        } else if (/\b(?:more\s+than|greater\s+than|over|above|exceeding|>|\+)\b/i.test(raw)) {
          operator = 'GT';
        } else if (/\b(?:at\s+most|up\s+to|maximum\s+of|<=)\b/i.test(raw)) {
          operator = 'LTE';
        } else if (/\b(?:less\s+than|fewer\s+than|under|below|<)\b/i.test(raw)) {
          operator = 'LT';
        } else if (/\b(?:approximately|approx\.|about|around|nearly|roughly|~)\b/i.test(raw)) {
          operator = 'APPROX';
        }

        const numVal = this.parseNumericValue(raw);
        const unit = this.parseUnit(raw);

        results.push({
          raw,
          operator,
          normalizedNumber: numVal,
          unit,
          tolerance: 0.05,
        });
      }
    }

    return results;
  }

  /**
   * Helper: parses numeric value from string (supporting k, m, b, million, billion).
   */
  public static parseNumericValue(str: string): number | undefined {
    const clean = str.replace(/,/g, '').toLowerCase();
    const numMatch = clean.match(/(\d+(?:\.\d+)?)/);
    if (!numMatch) return undefined;

    let base = parseFloat(numMatch[1]);
    if (clean.includes('billion') || clean.includes(' b')) {
      base *= 1_000_000_000;
    } else if (clean.includes('million') || clean.includes(' m') || clean.endsWith('m') || clean.includes('m ')) {
      // Check if it's 'ms' (milliseconds)
      if (!clean.includes('ms')) {
        base *= 1_000_000;
      }
    } else if (clean.includes('k') || clean.includes('thousand')) {
      base *= 1_000;
    }

    return base;
  }

  /**
   * Helper: parses unit from string.
   */
  public static parseUnit(str: string): string | undefined {
    const clean = str.toLowerCase();
    if (clean.includes('%') || clean.includes('percent')) return '%';
    if (clean.includes('$') || clean.includes('usd') || clean.includes('dollar')) return '$';
    if (clean.includes('€') || clean.includes('eur') || clean.includes('euro')) return '€';
    if (clean.includes('£') || clean.includes('gbp')) return '£';
    if (clean.includes('ms') || clean.includes('millisecond')) return 'ms';
    if (clean.includes('second')) return 'seconds';
    if (clean.includes('minute')) return 'minutes';
    if (clean.includes('hour')) return 'hours';
    if (clean.includes('day')) return 'days';
    if (clean.includes('week')) return 'weeks';
    if (clean.includes('month')) return 'months';
    if (clean.includes('year')) return 'years';
    if (/\b(?:req\/s|rps)\b/.test(clean)) return 'req/s';
    if (/\b(?:tps|qps)\b/.test(clean)) return 'tps';
    if (/\b(?:x|times|fold)\b/.test(clean)) return 'x';
    if (clean.includes('user')) return 'users';
    if (clean.includes('client')) return 'clients';
    if (clean.includes('customer')) return 'customers';
    if (clean.includes('developer')) return 'developers';
    if (clean.includes('engineer')) return 'engineers';
    if (clean.includes('node')) return 'nodes';
    if (clean.includes('server')) return 'servers';
    if (clean.includes('pipeline')) return 'pipelines';
    if (clean.includes('integration')) return 'integrations';
    return undefined;
  }

  /**
   * Helper: splits text into clean sentences.
   */
  public static splitIntoSentences(text: string): string[] {
    // Preserve decimals (e.g. 99.9%) and abbreviations (e.g. e.g., vs., etc., al., inc., corp., ltd.)
    const normalized = text
      .replace(/(\d+)\.(\d+)/g, '$1__DOT__$2')
      .replace(/\b(?:e\.g\.|i\.e\.|vs\.|approx\.|etc\.|al\.|inc\.|corp\.|ltd\.)/gi, match => match.replace(/\./g, '__DOT__'));

    const sentences = normalized.split(/(?<=[.!?]['"”’\)])\s+|(?<=[.!?])\s+/);
    return sentences
      .map(s => s.replace(/__DOT__/g, '.').trim())
      .filter(s => s.length > 0);
  }

  /**
   * Helper: checks if text contains entity using word boundary matching.
   */
  public static hasWordBoundaryMatch(text: string, entity: string): boolean {
    if (!text || !entity || !entity.trim()) return false;
    const trimmed = entity.trim();
    const escaped = trimmed.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    const prefix = /^\w/.test(trimmed) ? '\\b' : '';
    const suffix = /\w$/.test(trimmed) ? '\\b' : '';
    const regex = new RegExp(`${prefix}${escaped}${suffix}`, 'i');
    return regex.test(text);
  }

  /**
   * Helper: resolves subject and target entities in a sentence.
   */
  private static resolveEntities(
    sentence: string,
    targetBrand?: string,
    knownCompetitors: string[] = [],
    contextParagraph?: string,
    sectionHeading?: string,
    isMarketingClaimContext: boolean = false
  ): { subjectEntity?: string; targetEntity?: string } {
    let subjectEntity: string | undefined;
    let targetEntity: string | undefined;

    // Check explicit target brand presence with boundary-safe matching
    const hasTarget = Boolean(targetBrand && this.hasWordBoundaryMatch(sentence, targetBrand));

    // Check explicit competitor presence with boundary-safe matching
    const matchedCompetitors = knownCompetitors.filter(c => this.hasWordBoundaryMatch(sentence, c));

    // Check first-person brand ownership ("our platform", "our software", "we")
    const isFirstPerson = this.FIRST_PERSON_SUBJECT_PATTERNS.some(pat => pat.test(sentence));

    // Check definite product mention ("the platform", "the software")
    const isDefiniteProduct = this.DEFINITE_PRODUCT_PATTERNS.some(pat => pat.test(sentence));

    if (targetBrand && hasTarget && matchedCompetitors.length > 0) {
      if (this.isEntitySubjectOfClause(sentence, targetBrand) || isFirstPerson) {
        // Target brand is subject, competitor is target
        subjectEntity = targetBrand;
        targetEntity = matchedCompetitors[0];
      } else if (this.isEntitySubjectOfClause(sentence, matchedCompetitors[0])) {
        // Competitor is subject, target brand is target
        subjectEntity = matchedCompetitors[0];
        targetEntity = targetBrand;
      } else {
        // Neither is grammatical subject (e.g. general comparison or meta-intro)
        targetEntity = matchedCompetitors[0];
      }
    } else if (matchedCompetitors.length > 0) {
      if (isFirstPerson && targetBrand && isMarketingClaimContext) {
        // e.g. "Our platform outperforms CompetitorX"
        subjectEntity = targetBrand;
        targetEntity = matchedCompetitors[0];
      } else if (this.isEntitySubjectOfClause(sentence, matchedCompetitors[0])) {
        // Competitor is genuinely the subject of the clause
        subjectEntity = matchedCompetitors[0];
      } else {
        // Competitor is a contextual reference or target entity, not the active subject
        targetEntity = matchedCompetitors[0];
      }
    } else if (targetBrand && hasTarget) {
      if (this.isEntitySubjectOfClause(sentence, targetBrand)) {
        subjectEntity = targetBrand;
      } else {
        targetEntity = targetBrand;
      }
    } else if (isFirstPerson && targetBrand && isMarketingClaimContext) {
      // Unambiguous first-person marketing statement in branded content:
      // "Our platform provides X", "We offer X"
      subjectEntity = targetBrand;
    } else if (isDefiniteProduct && targetBrand && isMarketingClaimContext) {
      // "The platform delivers X"
      // Verify surrounding context (paragraph or section heading) unambiguously identifies target brand
      const contextText = [contextParagraph, sectionHeading].filter(Boolean).join(' ');
      const contextHasTarget = this.hasWordBoundaryMatch(contextText, targetBrand);
      const contextHasCompetitor = knownCompetitors.some(c => this.hasWordBoundaryMatch(contextText, c));

      // Do not associate generic "the platform/tool" with target brand in buyer evaluation guidance
      // or conditional inquiry clauses ("if the platform...", "whether the platform...")
      const isConditionalInquiry = /\b(?:if|whether)\s+(?:the|this)\s+(?:platform|software|system|tool|solution|product)\b/i.test(sentence);
      if (contextHasTarget && !contextHasCompetitor && !this.isEvaluationGuidance(sentence) && !isConditionalInquiry) {
        subjectEntity = targetBrand;
      }
      // Ambiguous context -> do not invent entity association
    }

    return { subjectEntity, targetEntity };
  }
}
