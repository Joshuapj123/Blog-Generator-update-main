import { db } from "./config";
import { collection, addDoc, updateDoc, doc, getDoc, getDocs, query, where, serverTimestamp, setDoc, deleteDoc } from "firebase/firestore";

export type ArticleStage = "Todo" | "Draft" | "Published";

export interface Article {
  id?: string;
  title: string;
  content: string;
  folder: string;
  stage: ArticleStage;
  planId?: string;
  planRole?: 'primary' | 'support';
  clusterOrder?: number;
  sourceKeyword?: string;
  targetKeywords?: string[];
  selectedForGeneration?: boolean;
  engineStage?: string;
  createdAt?: any;
  updatedAt?: any;
  keywordBank?: any;
  referenceUrl?: string;
  blueprint?: any;
  serpAnalysis?: any;
  analysisResults?: any;
  contentScore?: any;
}

export interface ExternalLink {
  id?: string;
  url: string;
  title: string;
  folder: string;
  createdAt?: any;
  updatedAt?: any;
}

export interface Folder {
  id?: string;
  name: string;
}

export const saveArticle = async (article: Article) => {
  const articlesCol = collection(db, "articles");
  
  // Firebase does not support undefined values, so we filter them out.
  const cleanData = Object.fromEntries(Object.entries(article).filter(([_, v]) => v !== undefined));

  if (cleanData.id) {
    const docRef = doc(db, "articles", cleanData.id as string);
    await updateDoc(docRef, {
      ...cleanData,
      updatedAt: serverTimestamp()
    });
    return cleanData.id as string;
  } else {
    const docRef = await addDoc(articlesCol, {
      ...cleanData,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp()
    });
    return docRef.id;
  }
};

export const getArticles = async (): Promise<Article[]> => {
  const articlesCol = collection(db, "articles");
  const snapshot = await getDocs(articlesCol);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Article));
};

export const getArticleById = async (id: string): Promise<Article | null> => {
  const docRef = doc(db, "articles", id);
  const snapshot = await getDoc(docRef);
  return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as Article) : null;
};

export const getArticleByGenerationInputs = async (targetKeywords: string, referenceUrl: string): Promise<Article | null> => {
  const articlesCol = collection(db, "articles");
  const q = query(
    articlesCol, 
    where("targetKeywords", "array-contains", targetKeywords),
    where("referenceUrl", "==", referenceUrl)
  );
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() } as Article;
  }
  return null;
};

export const getFolders = async (): Promise<Folder[]> => {
  const foldersCol = collection(db, "folders");
  const snapshot = await getDocs(foldersCol);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Folder));
};

export const createFolder = async (name: string) => {
  const foldersCol = collection(db, "folders");
  const docRef = await addDoc(foldersCol, { name });
  return { id: docRef.id, name };
};

export const updateArticleStage = async (id: string, stage: ArticleStage) => {
    const docRef = doc(db, "articles", id);
    await updateDoc(docRef, { stage, updatedAt: serverTimestamp() });
};

export const updateArticleFolder = async (id: string, folder: string) => {
    const docRef = doc(db, "articles", id);
    await updateDoc(docRef, { folder, updatedAt: serverTimestamp() });
};

// ── External Links ────────────────────────────────────────────────────────
export const getExternalLinks = async (): Promise<ExternalLink[]> => {
  const col = collection(db, "external_links");
  const snapshot = await getDocs(col);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ExternalLink));
};

export const saveExternalLink = async (link: ExternalLink) => {
  const col = collection(db, "external_links");
  if (link.id) {
    const docRef = doc(db, "external_links", link.id);
    await updateDoc(docRef, { ...link, updatedAt: serverTimestamp() });
    return link.id;
  } else {
    const docRef = await addDoc(col, { ...link, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return docRef.id;
  }
};

export const deleteExternalLink = async (id: string) => {
  const docRef = doc(db, "external_links", id);
  await deleteDoc(docRef);
};

export const updateExternalLinkFolder = async (id: string, folder: string) => {
    const docRef = doc(db, "external_links", id);
    await updateDoc(docRef, { folder, updatedAt: serverTimestamp() });
};

// ── SERP Cache ────────────────────────────────────────────────────────────
export const getCachedSerp = async (keyword: string, locale: string = "en-US") => {
  const cacheId = `${keyword.toLowerCase()}_${locale}`.replace(/[^a-z0-9_]/g, "-");
  const docRef = doc(db, "serp_cache", cacheId);
  const snapshot = await getDoc(docRef);
  return snapshot.exists() ? snapshot.data() : null;
};

export const saveCachedSerp = async (keyword: string, locale: string = "en-US", data: any) => {
  const cacheId = `${keyword.toLowerCase()}_${locale}`.replace(/[^a-z0-9_]/g, "-");
  const docRef = doc(db, "serp_cache", cacheId);
  await setDoc(docRef, {
    keyword,
    locale,
    data,
    updatedAt: serverTimestamp()
  });
};

// ── Content Plans ─────────────────────────────────────────────────────────

export interface RecommendedPage {
  title: string;
  keyword: string;
  intent: string;
  role: 'primary' | 'support';
  format: string;
  selected: boolean;
}

export type KeywordIntent = 'informational' | 'commercial' | 'transactional' | 'navigational' | 'mixed';

export interface KeywordTarget {
  id?: string;
  keyword: string;
  normalizedKeyword: string;
  normalizedTokens?: string;
  intent: KeywordIntent;
  searchIntent?: 'informational' | 'commercial' | 'navigational' | 'transactional';
  source: 'serper';
  originalSource?: 'organic_title' | 'paa_question' | 'related_search';
  sourceSeed?: string;
  estimatedDifficulty?: number;
  difficulty?: number;
  volume?: number;
  cpc?: number;
  metricsStatus?: 'not_fetched' | 'fetching' | 'fetched';
  refinementStatus?: 'pending' | 'success' | 'failed';
  similarTo?: string;
  selected: boolean;
  priorityScore?: number;
  rationale?: string;
}

export interface ContentPlan {
  id?: string;
  title?: string;
  productDescription: string;
  targetKeywords?: string[];
  keywordTargets?: KeywordTarget[];
  coreTakeaway?: string;
  actionPlan?: {
    title: string;
    description: string;
    tasks: { task: string; completed: boolean }[];
  }[];
  checklist?: any;
  mistakes?: string[];
  actionItems?: string[];
  recommendedPages: RecommendedPage[];
  saasIntelligenceProfile?: any;
  createdAt?: any;
  updatedAt?: any;
}

export const saveContentPlan = async (plan: ContentPlan) => {
  const col = collection(db, "content_plans");
  if (plan.id) {
    const docRef = doc(db, "content_plans", plan.id);
    await updateDoc(docRef, { ...plan, updatedAt: serverTimestamp() });
    return plan.id;
  } else {
    const docRef = await addDoc(col, { ...plan, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return docRef.id;
  }
};

export const getContentPlans = async (): Promise<ContentPlan[]> => {
  const col = collection(db, "content_plans");
  const snapshot = await getDocs(col);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ContentPlan));
};

export const getContentPlanById = async (id: string): Promise<ContentPlan | null> => {
  const docRef = doc(db, "content_plans", id);
  const snapshot = await getDoc(docRef);
  return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() } as ContentPlan) : null;
};

export const deleteContentPlan = async (id: string) => {
  const docRef = doc(db, "content_plans", id);
  await deleteDoc(docRef);
};

export const deleteArticle = async (id: string) => {
  const docRef = doc(db, "articles", id);
  await deleteDoc(docRef);
};

export const saveGeoVisibilityRun = async (runData: any) => {
  const col = collection(db, "geo_visibility_runs");
  const cleanData = Object.fromEntries(Object.entries(runData).filter(([_, v]) => v !== undefined));
  if (cleanData.id) {
    const docRef = doc(db, "geo_visibility_runs", cleanData.id as string);
    await updateDoc(docRef, { ...cleanData, updatedAt: serverTimestamp() });
    return cleanData.id as string;
  } else {
    const docRef = await addDoc(col, { ...cleanData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return docRef.id;
  }
};

export const getGeoVisibilityRuns = async (): Promise<any[]> => {
  const col = collection(db, "geo_visibility_runs");
  const snapshot = await getDocs(col);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const saveGeoOpportunity = async (opp: any) => {
  const col = collection(db, "geo_opportunities");
  const cleanData = Object.fromEntries(Object.entries(opp).filter(([_, v]) => v !== undefined));
  if (cleanData.id) {
    const docRef = doc(db, "geo_opportunities", cleanData.id as string);
    await updateDoc(docRef, { ...cleanData, updatedAt: serverTimestamp() });
    return cleanData.id as string;
  } else {
    const docRef = await addDoc(col, { ...cleanData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return docRef.id;
  }
};

export const getGeoOpportunities = async (): Promise<any[]> => {
  const col = collection(db, "geo_opportunities");
  const snapshot = await getDocs(col);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const saveDistributionJob = async (job: any) => {
  const col = collection(db, "distribution_jobs");
  const cleanData = Object.fromEntries(Object.entries(job).filter(([_, v]) => v !== undefined));
  if (cleanData.id || cleanData.jobId) {
    const docId = (cleanData.id || cleanData.jobId) as string;
    const docRef = doc(db, "distribution_jobs", docId);
    await setDoc(docRef, { ...cleanData, updatedAt: serverTimestamp() }, { merge: true });
    return docId;
  } else {
    const docRef = await addDoc(col, { ...cleanData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return docRef.id;
  }
};

export const getDistributionJobs = async (): Promise<any[]> => {
  const col = collection(db, "distribution_jobs");
  const snapshot = await getDocs(col);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const getDistributionJobById = async (id: string): Promise<any | null> => {
  const docRef = doc(db, "distribution_jobs", id);
  const snapshot = await getDoc(docRef);
  return snapshot.exists() ? ({ id: snapshot.id, ...snapshot.data() }) : null;
};

export const getDistributionJobByIdempotencyKey = async (idempotencyKey: string): Promise<any | null> => {
  const col = collection(db, "distribution_jobs");
  const q = query(col, where("idempotencyKey", "==", idempotencyKey));
  const snapshot = await getDocs(q);
  if (!snapshot.empty) {
    const doc = snapshot.docs[0];
    return { id: doc.id, ...doc.data() };
  }
  return null;
};

export const savePerformanceSnapshot = async (snap: any) => {
  const col = collection(db, "performance_snapshots");
  const cleanData = Object.fromEntries(Object.entries(snap).filter(([_, v]) => v !== undefined));
  const docId = (cleanData.id || cleanData.snapshotId) as string;
  if (docId) {
    const docRef = doc(db, "performance_snapshots", docId);
    await setDoc(docRef, { ...cleanData, updatedAt: serverTimestamp() }, { merge: true });
    return docId;
  } else {
    const docRef = await addDoc(col, { ...cleanData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return docRef.id;
  }
};

export const getPerformanceSnapshots = async (): Promise<any[]> => {
  const col = collection(db, "performance_snapshots");
  const snapshot = await getDocs(col);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const savePerformanceInsight = async (ins: any) => {
  const col = collection(db, "performance_insights");
  const cleanData = Object.fromEntries(Object.entries(ins).filter(([_, v]) => v !== undefined));
  const docId = (cleanData.id || cleanData.insightId) as string;
  if (docId) {
    const docRef = doc(db, "performance_insights", docId);
    await setDoc(docRef, { ...cleanData, updatedAt: serverTimestamp() }, { merge: true });
    return docId;
  } else {
    const docRef = await addDoc(col, { ...cleanData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return docRef.id;
  }
};

export const getPerformanceInsights = async (): Promise<any[]> => {
  const col = collection(db, "performance_insights");
  const snapshot = await getDocs(col);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const savePerformanceRecommendation = async (rec: any) => {
  const col = collection(db, "performance_recommendations");
  const cleanData = Object.fromEntries(Object.entries(rec).filter(([_, v]) => v !== undefined));
  const docId = (cleanData.id || cleanData.recommendationId) as string;
  if (docId) {
    const docRef = doc(db, "performance_recommendations", docId);
    await setDoc(docRef, { ...cleanData, updatedAt: serverTimestamp() }, { merge: true });
    return docId;
  } else {
    const docRef = await addDoc(col, { ...cleanData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return docRef.id;
  }
};

export const getPerformanceRecommendations = async (): Promise<any[]> => {
  const col = collection(db, "performance_recommendations");
  const snapshot = await getDocs(col);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};

export const saveAuthorityOpportunity = async (opp: any) => {
  const col = collection(db, "authority_opportunities");
  const cleanData = Object.fromEntries(Object.entries(opp).filter(([_, v]) => v !== undefined));
  const docId = (cleanData.id || cleanData.opportunityId) as string;
  if (docId) {
    const docRef = doc(db, "authority_opportunities", docId);
    await setDoc(docRef, { ...cleanData, updatedAt: serverTimestamp() }, { merge: true });
    return docId;
  } else {
    const docRef = await addDoc(col, { ...cleanData, createdAt: serverTimestamp(), updatedAt: serverTimestamp() });
    return docRef.id;
  }
};

export const getAuthorityOpportunities = async (): Promise<any[]> => {
  const col = collection(db, "authority_opportunities");
  const snapshot = await getDocs(col);
  return snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
};
