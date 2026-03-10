/**
 * AI Transformation Advisors Directory
 *
 * HOW TO ADD A NEW ADVISOR (weekly update workflow):
 * 1. Copy an existing entry below
 * 2. Fill in all fields
 * 3. Set `featured: true` for top-row placement, false otherwise
 * 4. Commit and push to main — site redeploys automatically in ~1 min
 *
 * FIELDS:
 *   name        — Full name
 *   firm        — Company or firm name
 *   role        — Title (e.g. "Founder & CEO")
 *   specialization — One-liner focus area (shown as badge)
 *   region      — Geographic focus (e.g. "North America", "Global")
 *   bio         — 2-sentence bio. Keep factual and punchy.
 *   url         — Website or LinkedIn URL
 *   featured    — true = appears first
 */

export interface Advisor {
  name: string;
  firm: string;
  role: string;
  specialization: string;
  region: string;
  bio: string;
  url: string;
  featured?: boolean;
}

export const advisors: Advisor[] = [
  {
    name: "Ethan Mollick",
    firm: "Wharton School, University of Pennsylvania",
    role: "Associate Professor & AI Advisor",
    specialization: "Generative AI Adoption & Organizational Change",
    region: "North America",
    bio: "Ralph J. Roberts Distinguished Faculty Scholar at Wharton and co-director of Wharton's Generative AI Labs, whose research focuses on how enterprises adopt and benefit from generative AI. NYT bestselling author of Co-Intelligence: Living and Working with AI.",
    url: "https://www.moreusefulthings.com/about",
    featured: true,
  },
  {
    name: "Reid Blackman",
    firm: "Virtue Consultants",
    role: "Founder & CEO",
    specialization: "AI Ethics & Governance",
    region: "North America",
    bio: "Founder and CEO of Virtue Consultants, an AI ethical risk consultancy that has co-designed responsible AI programs with Amazon, Merck, Kraft Heinz, US Bank, and Nationwide. Author of Ethical Machines (HBR Press) and founding member of EY's AI Advisory Board.",
    url: "https://www.virtueconsultants.com",
    featured: true,
  },
  {
    name: "Paul Roetzer",
    firm: "Marketing AI Institute",
    role: "Founder & CEO",
    specialization: "AI Transformation for Business Leaders",
    region: "North America",
    bio: "Founder and CEO of Marketing AI Institute, which has helped hundreds of organizations — from startups to Fortune 500 companies — understand, pilot, and scale AI since 2016. Co-author of Marketing Artificial Intelligence and host of The Artificial Intelligence Show podcast.",
    url: "https://www.marketingaiinstitute.com/about/paul-roetzer",
    featured: true,
  },
  {
    name: "Cassie Kozyrkov",
    firm: "Kozyr",
    role: "CEO & AI Advisor",
    specialization: "Decision Intelligence & Applied AI Strategy",
    region: "North America",
    bio: "Founder of the Decision Intelligence discipline and Google's first Chief Decision Scientist, where she personally trained over 20,000 Googlers in data-driven AI decision-making. As CEO of Kozyr, she advises senior leaders at enterprises including Lenovo and NASA.",
    url: "https://www.kozyr.com",
    featured: true,
  },
  {
    name: "Allie K. Miller",
    firm: "Open Machine",
    role: "Founder & CEO",
    specialization: "Enterprise AI Strategy & Generative AI Adoption",
    region: "North America",
    bio: "Founder of Open Machine and former AWS Global Head of Machine Learning for Startups, as well as the youngest woman to lead AI product development at IBM. Advises Fortune 500 companies including Novartis, Samsung, Salesforce, and Google on AI strategy and org design.",
    url: "https://www.alliekmiller.com",
    featured: false,
  },
  {
    name: "Isaac Sacolick",
    firm: "StarCIO",
    role: "Founder & President",
    specialization: "AI Strategy, Governance & Digital Transformation",
    region: "North America",
    bio: "Founder of StarCIO and a recognized Digital Trailblazer who has guided enterprise transformation programs for 20+ years, with over 15 AI strategy and governance advisories in 2025 alone. Amazon bestselling author of Driving Digital and prolific contributor to InfoWorld with 800+ articles on AI and enterprise change.",
    url: "https://www.starcio.com/isaac-sacolick",
    featured: false,
  },
  {
    name: "Bernard Marr",
    firm: "Bernard Marr & Co.",
    role: "CEO & Strategic Advisor",
    specialization: "AI Strategy & Business Performance",
    region: "Global",
    bio: "CEO of an independent think tank and consultancy that advises boards and executive teams at Accenture, Microsoft, Shell, and DHL on AI strategy and digital transformation. Author of over 20 books including Generative AI in Practice and a regular Forbes columnist.",
    url: "https://bernardmarr.com",
    featured: false,
  },
  {
    name: "Beena Ammanath",
    firm: "Deloitte AI Institute",
    role: "Executive Director",
    specialization: "Trustworthy AI & Enterprise AI Governance",
    region: "Global",
    bio: "Leads the Global Deloitte AI Institute, focused on bridging AI research with enterprise deployment — with particular emphasis on governance, board-level AI literacy, and responsible AI frameworks. Author of Trustworthy AI, with prior leadership roles at GE, HPE, Thomson Reuters, and Bank of America.",
    url: "https://www.linkedin.com/in/bammanath/",
    featured: false,
  },
  {
    name: "Nina Schick",
    firm: "Tamang Ventures",
    role: "Founder & Generative AI Strategist",
    specialization: "Generative AI & Enterprise Strategy",
    region: "Europe",
    bio: "Founder of Tamang Ventures and an early pioneer in generative AI strategy, advising NATO's Secretary General, the United Nations, and enterprises including Mastercard. Holds advisory and equity roles with frontier AI firms including Synthesia and Qlik.",
    url: "https://ninaschick.org",
    featured: false,
  },
];
