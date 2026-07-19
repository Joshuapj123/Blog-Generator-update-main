export interface AuthorProfile {
  id: string;
  name: string;
  role: string;
  bio: string;
  expertise: string[];
}

export const AUTHOR_PROFILES: AuthorProfile[] = [
  {
    id: "tech-expert",
    name: "Alex Rivera",
    role: "Senior Systems Architect",
    bio: "Alex Rivera has over 15 years of experience designing scalable distributed systems for Fortune 500 companies. His insights regularly appear in leading tech publications.",
    expertise: ["Cloud Computing", "System Architecture", "DevOps"],
  },
  {
    id: "marketing-guru",
    name: "Jordan Lee",
    role: "Growth Marketing Lead",
    bio: "Jordan Lee is a data-driven marketer who has scaled 3 distinct B2B SaaS startups to over 1M ARR. They specialize in SEO and highly converting content strategies.",
    expertise: ["SEO", "Content Marketing", "Growth Hacking"],
  },
  {
    id: "finance-author",
    name: "Dr. Emily Chen",
    role: "Financial Analyst",
    bio: "Dr. Chen holds a Ph.D. in Economics and serves as a lead analyst for a global investment firm, bringing nuanced quantitative perspectives to market trends.",
    expertise: ["Macroeconomics", "Crypto Markets", "Investment Strategy"],
  }
];
