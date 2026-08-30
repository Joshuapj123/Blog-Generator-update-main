import 'dotenv/config';
import { getArticles } from '../src/lib/firebase/firestore';

async function list() {
  try {
    const articles = await getArticles();
    console.log(`Found ${articles.length} articles:`);
    articles.slice(0, 10).forEach(a => {
      console.log(`ID: ${a.id} | Title: "${a.title}" | Stage: ${a.stage}`);
    });
  } catch (err: any) {
    console.error('Error fetching articles:', err.message);
  }
}

list();
