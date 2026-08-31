import * as dotenv from 'dotenv';
import * as path from 'path';

// Load environment variables first
dotenv.config({ path: path.resolve('c:/Users/Joshua/Desktop/Blog-Generator-main/.env') });

async function run() {
  console.log('Querying Firestore articles...');
  try {
    const { getArticles } = await import('../src/lib/firebase/firestore');
    const articles = await getArticles();
    console.log(`\nFound ${articles.length} articles in Firestore:\n`);
    for (const a of articles) {
      console.log(`- ID: ${a.id}`);
      console.log(`  Title: ${a.title}`);
      console.log(`  Stage: ${a.stage}`);
      console.log(`  Folder: ${a.folder}`);
      console.log(`  Target Keywords: ${JSON.stringify(a.targetKeywords || [])}`);
      console.log(`  Content Length: ${a.content ? a.content.length : 0} characters`);
      console.log(`  Has Blueprint: ${a.blueprint ? 'YES' : 'NO'}`);
      console.log(`  Has AnalysisResults: ${a.analysisResults ? 'YES' : 'NO'}`);
      console.log('--------------------------------------------------');
    }
  } catch (error: any) {
    console.error('Firestore query failed:', error.message);
    if (error.stack) {
      console.error(error.stack);
    }
  }
}

run();
