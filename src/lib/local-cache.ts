import fs from 'fs';
import path from 'path';
import crypto from 'crypto';

const CACHE_DIR = path.resolve('c:/Users/Joshua/Desktop/Blog-Generator-main/scratch/local_cache');

let cacheHits = 0;
let cacheMisses = 0;

interface CacheWrapper {
  timestamp: string;
  data: any;
}

function getTtlDays(key: string): number {
  if (key.startsWith('serp_')) return 7;
  if (key.startsWith('competitor_')) return 7;
  if (key.startsWith('outline_')) return 14;
  if (key.startsWith('entities_')) return 30;
  if (key.startsWith('intent_')) return 30;
  if (key.startsWith('gaps_')) return 30;
  if (key.startsWith('snippet_')) return 30;
  if (key.startsWith('keywords_')) return 30;
  if (key.startsWith('strategy_plan_')) return 30;
  return 30; // Default fallback
}

function getCacheFilename(key: string): string {
  // Hash key to avoid ENAMETOOLONG on Windows file paths
  const hash = crypto.createHash('md5').update(key).digest('hex');
  return path.join(CACHE_DIR, `${hash}.json`);
}

export function getLocalCache(key: string): any | null {
  try {
    const filename = getCacheFilename(key);
    if (!fs.existsSync(filename)) {
      cacheMisses++;
      return null;
    }
    const content = fs.readFileSync(filename, 'utf8');
    const wrapper: CacheWrapper = JSON.parse(content);
    
    const updatedAt = new Date(wrapper.timestamp);
    const ageMs = Date.now() - updatedAt.getTime();
    const ageHours = ageMs / (1000 * 60 * 60);
    
    const ttlDays = getTtlDays(key);
    const ttlHours = ttlDays * 24;
    
    if (ageHours > ttlHours) {
      console.log(`[LocalCache] Cache expired for key: ${key} (Age: ${ageHours.toFixed(2)}h, TTL: ${ttlHours}h)`);
      cacheMisses++;
      try {
        fs.unlinkSync(filename);
      } catch (err) {}
      return null;
    }
    
    console.log(`[LocalCache] Cache Hit for key: ${key} (Age: ${ageHours.toFixed(2)}h)`);
    cacheHits++;
    return wrapper.data;
  } catch (e) {
    console.warn('[LocalCache] Read failed for key:', key, e);
    cacheMisses++;
    return null;
  }
}

export function setLocalCache(key: string, value: any): void {
  try {
    if (!fs.existsSync(CACHE_DIR)) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
    }
    const filename = getCacheFilename(key);
    const wrapper: CacheWrapper = {
      timestamp: new Date().toISOString(),
      data: value
    };
    fs.writeFileSync(filename, JSON.stringify(wrapper, null, 2), 'utf8');
  } catch (e) {
    console.warn('[LocalCache] Write failed for key:', key, e);
  }
}

export function invalidateLocalCache(key: string): void {
  try {
    const filename = getCacheFilename(key);
    if (fs.existsSync(filename)) {
      fs.unlinkSync(filename);
      console.log(`[LocalCache] Invalidated/Deleted cache file: ${filename}`);
    }
  } catch (e) {
    console.warn('[LocalCache] Invalidation failed for key:', key, e);
  }
}

export function getCacheStats() {
  const total = cacheHits + cacheMisses;
  const percentage = total > 0 ? parseFloat(((cacheHits / total) * 100).toFixed(2)) : 0;
  return {
    cacheHits,
    cacheMisses,
    cacheHitPercentage: percentage
  };
}

export function resetCacheStats() {
  cacheHits = 0;
  cacheMisses = 0;
}

