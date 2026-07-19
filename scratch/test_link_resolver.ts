import { ExternalLinkResolver } from '../src/lib/seo-intelligence/external_link_resolver';

const mockArticle = {
  title: "Best AI Website Builders in 2026",
  intro: {
    hook: "Looking for the [Best AI Website Builders](https://wix.com) to launch your new business site? We've got you covered.",
    thesis: "Modern AI website builders like Wix, Squarespace, and Framer are revolutionizing web development.",
    business_context: "Enterprise marketing teams are moving away from manual coding towards rapid AI generation."
  },
  sections: [
    {
      heading: "Wix ADI: The Industry Leader",
      level: "H2",
      what_it_is: "Wix ADI provides an automated web creation interface. To learn more, check out the [Wix Homepage](https://www.wix.com/). For developers, the [Wix API Docs](https://www.wix.com/docs/) offer clean endpoints. Avoid generic [CMS](https://cms.gov) configurations.",
      why_it_works: "The AI understands user goals and designs a website matching specific brand guidelines. Review their [Plans & Pricing](https://www.wix.com/pricing?utm_source=adwords&gclid=12345) to compare options.",
      experience_or_data_point: "Wix reports that over 50% of new users launch websites in under 1 hour.",
      takeaway: "Wix is the easiest starting point.",
      example_brands: ["Wix: Used by millions of small businesses for automated design."],
      outbound_authority_link: {
        anchor_text: "Wix AI Website Builder",
        search_query: "wix ai website builder",
        resolved_url: "https://www.wix.com/ai-website-builder",
        resolved_title: "Wix AI Website Builder"
      }
    },
    {
      heading: "Framer AI: Next-Level Aesthetics",
      level: "H2",
      what_it_is: "Framer AI allows design-centric teams to generate sites from canvas-like workspaces. Learn more on the [Framer Homepage](https://framer.com).",
      why_it_works: "It bridges the gap between Figma designs and live code. However, it requires a secure [Database](https://en.wikipedia.org/wiki/Database) integration.",
      experience_or_data_point: "Framer sites load 20% faster than average sites due to edge hosting.",
      takeaway: "Ideal for designers.",
      example_brands: ["Framer: Used by design agencies for pixel-perfect generation."],
      outbound_authority_link: {
        anchor_text: "Framer AI Features",
        search_query: "framer ai features",
        resolved_url: "https://www.google.com/aclk?adurl=https://framer.com/features&gclid=ads123",
        resolved_title: "Framer Ads"
      }
    },
    {
      heading: "Squarespace AI: Beautiful Templates",
      level: "H2",
      what_it_is: "Squarespace AI helps create template-based websites with ease. See the [Squarespace Portal](https://squarespace.com). For payment methods, avoid generic [Google Payments](https://myaccount.google.com/payments) configs.",
      why_it_works: "It simplifies blogging and store setups. Be sure to check [API](http://api.org) integrations carefully.",
      experience_or_data_point: "Squarespace maintains a 99.9% uptime record.",
      takeaway: "Best for simple blogging and stores.",
      example_brands: ["Squarespace: Used by local shops for beautiful template landing pages."],
      outbound_authority_link: {
        anchor_text: "Squarespace Pricing",
        search_query: "squarespace pricing",
        resolved_url: "https://squarespace.com/pricing-plans",
        resolved_title: "Squarespace Pricing"
      }
    }
  ],
  cta: {
    heading: "Start Building Today",
    description: "Launch your site using Framer or Wix. Check out their documentation pages: [Wix Docs](https://www.wix.com/docs/) and [Framer Tutorial](https://framer.com/tutorial).",
    button_text: "Get Started"
  }
};

console.log("=== RUNNING EXTERNAL LINK RESOLVER E2E TEST ===");
console.log("Original Article Text Sample:");
console.log("Wix Links in Section 1:", mockArticle.sections[0].what_it_is);
console.log("Google Payments Link in Section 3:", mockArticle.sections[2].what_it_is);
console.log("Framer Ads Link in Section 2 (resolved):", mockArticle.sections[1].outbound_authority_link?.resolved_url);

const resolved = ExternalLinkResolver.resolve(
  mockArticle,
  "Best AI Website Builders",
  ["Wix", "Framer", "Squarespace", "AI Website Builder"],
  3500
);

console.log("\n=== LINK RESOLUTION COMPLETE ===");
console.log("Wix Section 1 Updated Text:");
console.log("-> ", resolved.sections[0].what_it_is);

console.log("\nWix Section 1 Pricing link (Normalized/Canonicalized/Stripped utm & gclid):");
console.log("-> ", resolved.sections[0].why_it_works);

console.log("\nFramer Section 2 Ad Link (Should be completely stripped because it is an ad):");
console.log("-> outbound_authority_link: ", resolved.sections[1].outbound_authority_link);

console.log("\nSquarespace Section 3 CMS & Google Payments Mappings (Should be stripped to plain text):");
console.log("-> ", resolved.sections[2].what_it_is);
console.log("-> API Mismatch (api.org should be plain text): ", resolved.sections[2].why_it_works);

console.log("\nDuplicate Homepage Elimination (Wix resolved_url in Section 1 outbound should be Wix AI page, not a duplicate homepage):");
console.log("-> Section 1 outbound:", resolved.sections[0].outbound_authority_link);

console.log("\nIntro Link (Normalized Wix link):");
console.log("-> ", resolved.intro.hook);
