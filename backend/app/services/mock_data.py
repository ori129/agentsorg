"""Generates realistic mock GPT data for demo mode."""

import hashlib
import random as _random
from datetime import datetime, timedelta, timezone

from app.services.demo_state import get_demo_gpt_count

# ---------------------------------------------------------------------------
# GPT templates by department (10 departments × 8-10 templates = ~90 total)
# ---------------------------------------------------------------------------

DEPARTMENT_TEMPLATES: dict[str, list[dict]] = {
    "Marketing": [
        {
            "name": "Brand Voice Guardian",
            "description": "Ensures all marketing content aligns with brand guidelines, tone of voice standards, and messaging frameworks.",
            "instructions": "You are a brand consistency assistant. Review any content submitted and evaluate it against our brand voice guidelines. Flag deviations in tone, messaging, or terminology. Suggest corrections that maintain the original intent while aligning with brand standards.",
            "tools": [{"type": "canvas"}],
            "builder_categories": ["marketing", "content"],
            "conversation_starters": ["Review this blog post for brand voice", "Check our latest press release"],
        },
        {
            "name": "SEO Strategy Advisor",
            "description": "Analyzes keyword opportunities, provides content optimization recommendations, and tracks ranking potential.",
            "instructions": "You are an SEO strategist. Analyze content for keyword optimization, suggest improvements for search rankings, and provide data-driven recommendations for content strategy. Focus on long-tail keywords and content gaps.",
            "tools": [{"type": "code-interpreter"}, {"type": "browsing"}],
            "builder_categories": ["marketing", "research"],
            "conversation_starters": ["Analyze keywords for our new product page", "Suggest blog topics for Q4"],
        },
        {
            "name": "Campaign Performance Analyzer",
            "description": "Breaks down marketing campaign metrics, identifies trends, and provides actionable insights for optimization.",
            "instructions": "You are a marketing analytics expert. Analyze campaign performance data including CTR, conversion rates, CAC, and ROAS. Identify underperforming segments and suggest optimization strategies.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["marketing", "analytics"],
            "conversation_starters": ["Analyze our Q3 email campaign results", "Compare paid vs organic performance"],
        },
        {
            "name": "Social Media Calendar Planner",
            "description": "Creates comprehensive social media content calendars with post ideas, hashtags, and optimal posting times.",
            "instructions": "You are a social media strategist. Create detailed content calendars for multiple platforms. Include post copy, hashtag suggestions, visual direction, and optimal posting times based on audience engagement patterns.",
            "tools": [{"type": "canvas"}, {"type": "dalle"}],
            "builder_categories": ["marketing", "content"],
            "conversation_starters": ["Plan next month's LinkedIn content", "Create a Twitter thread strategy"],
        },
        {
            "name": "Email Copy Generator",
            "description": "Crafts high-converting email sequences for nurture campaigns, product launches, and customer engagement.",
            "instructions": "You are an email marketing specialist. Write compelling email copy that drives opens and clicks. Follow best practices for subject lines, preview text, body content, and CTAs. Adapt tone based on audience segment.",
            "tools": [{"type": "canvas"}],
            "builder_categories": ["marketing", "content"],
            "conversation_starters": ["Write a welcome email sequence", "Draft a product launch email"],
        },
        {
            "name": "Competitive Intelligence Tracker",
            "description": "Monitors and analyzes competitor positioning, messaging, pricing changes, and market movements.",
            "instructions": "You are a competitive intelligence analyst. Track competitor activities, analyze their positioning and messaging, and provide strategic recommendations. Focus on identifying opportunities and threats.",
            "tools": [{"type": "browsing"}, {"type": "code-interpreter"}],
            "builder_categories": ["marketing", "research"],
            "conversation_starters": ["Summarize competitor product launches this quarter", "Compare our messaging vs top 3 competitors"],
        },
        {
            "name": "Content Repurposing Engine",
            "description": "Transforms long-form content into multiple formats: social posts, newsletters, infographics, and video scripts.",
            "instructions": "You are a content repurposing specialist. Take any piece of long-form content and transform it into multiple derivative formats while maintaining key messages and adapting tone for each platform.",
            "tools": [{"type": "canvas"}],
            "builder_categories": ["marketing", "content"],
            "conversation_starters": ["Turn this whitepaper into 5 LinkedIn posts", "Create a video script from this blog"],
        },
        {
            "name": "Event Marketing Planner",
            "description": "Plans and organizes marketing events, webinars, and conferences with timelines, budgets, and promotion strategies.",
            "instructions": "You are an event marketing coordinator. Help plan events from concept to execution. Create timelines, budget estimates, promotion plans, and post-event follow-up strategies.",
            "tools": [{"type": "canvas"}, {"type": "code-interpreter"}],
            "builder_categories": ["marketing", "events"],
            "conversation_starters": ["Plan our annual user conference", "Create a webinar promotion strategy"],
        },
    ],
    "Sales": [
        {
            "name": "Deal Desk Copilot",
            "description": "Assists sales reps with deal structuring, pricing recommendations, and approval workflows for complex opportunities.",
            "instructions": "You are a deal desk analyst. Help sales reps structure deals, calculate discounts, check pricing against policies, and prepare approval requests. Flag deals that need additional review.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["sales", "operations"],
            "conversation_starters": ["Review this enterprise deal structure", "Calculate volume discount for 500 seats"],
        },
        {
            "name": "Pitch Deck Generator",
            "description": "Creates customized sales presentations based on prospect industry, pain points, and use case requirements.",
            "instructions": "You are a sales enablement specialist. Create tailored pitch deck outlines and talking points based on the prospect's industry, company size, and specific challenges. Include relevant case studies and ROI data.",
            "tools": [{"type": "canvas"}, {"type": "dalle"}],
            "builder_categories": ["sales", "content"],
            "conversation_starters": ["Create a pitch for a healthcare prospect", "Customize our deck for a Series B startup"],
        },
        {
            "name": "Lead Scoring Assistant",
            "description": "Evaluates and scores inbound leads based on firmographic data, engagement signals, and buying intent indicators.",
            "instructions": "You are a lead qualification expert. Analyze lead data including company size, industry, engagement history, and behavioral signals to assign priority scores and recommend next actions for sales reps.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["sales", "analytics"],
            "conversation_starters": ["Score these 50 new leads from the webinar", "What signals indicate high buying intent?"],
        },
        {
            "name": "Proposal Writer",
            "description": "Generates professional sales proposals and SOWs tailored to prospect requirements and competitive positioning.",
            "instructions": "You are a proposal writing expert. Create compelling, professional proposals that address client requirements, highlight differentiators, and include relevant pricing, timelines, and success metrics.",
            "tools": [{"type": "canvas"}],
            "builder_categories": ["sales", "content"],
            "conversation_starters": ["Draft a proposal for the Acme Corp deal", "Write an executive summary for our SOW"],
        },
        {
            "name": "Objection Handler",
            "description": "Provides data-driven responses to common sales objections with supporting evidence and competitive comparisons.",
            "instructions": "You are a sales coaching assistant. When given a sales objection, provide 2-3 response strategies backed by data, customer testimonials, or competitive comparisons. Tailor responses to the prospect's industry.",
            "tools": [{"type": "browsing"}],
            "builder_categories": ["sales", "training"],
            "conversation_starters": ["They say we're too expensive", "Prospect is worried about implementation time"],
        },
        {
            "name": "CRM Data Enricher",
            "description": "Enriches CRM records with missing firmographic data, social profiles, and technology stack information.",
            "instructions": "You are a data enrichment specialist. Given a company name or domain, research and compile firmographic data, key contacts, technology stack, recent news, and funding information to update CRM records.",
            "tools": [{"type": "browsing"}, {"type": "code-interpreter"}],
            "builder_categories": ["sales", "operations"],
            "conversation_starters": ["Enrich these 20 account records", "Find tech stack info for Globex Corp"],
        },
        {
            "name": "Sales Forecast Modeler",
            "description": "Analyzes pipeline data and historical patterns to generate accurate sales forecasts and identify risk areas.",
            "instructions": "You are a sales operations analyst. Analyze pipeline data, historical close rates, and deal velocity to create forecasts. Identify at-risk deals and suggest mitigation strategies.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["sales", "analytics"],
            "conversation_starters": ["Build Q4 forecast from current pipeline", "Which deals are at risk of slipping?"],
        },
        {
            "name": "Territory Planning Optimizer",
            "description": "Designs balanced sales territories based on market potential, account distribution, and rep capacity.",
            "instructions": "You are a territory planning specialist. Analyze market data, account density, revenue potential, and rep capacity to design optimal territory assignments. Balance workload and opportunity across the team.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["sales", "operations"],
            "conversation_starters": ["Redesign territories for the West region", "Balance our SMB rep assignments"],
        },
    ],
    "Customer Success": [
        {
            "name": "Churn Risk Detector",
            "description": "Analyzes customer health signals, usage patterns, and engagement metrics to identify accounts at risk of churning.",
            "instructions": "You are a customer success analyst. Evaluate customer health based on product usage, support ticket frequency, NPS scores, and engagement metrics. Flag at-risk accounts and recommend intervention strategies.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["customer-success", "analytics"],
            "conversation_starters": ["Analyze churn risk for our enterprise segment", "Which accounts need immediate attention?"],
        },
        {
            "name": "QBR Prep Assistant",
            "description": "Prepares quarterly business review presentations with usage stats, ROI metrics, and strategic recommendations.",
            "instructions": "You are a QBR preparation specialist. Compile usage statistics, feature adoption rates, support history, and ROI metrics into a structured QBR presentation. Include strategic recommendations for the next quarter.",
            "tools": [{"type": "code-interpreter"}, {"type": "canvas"}],
            "builder_categories": ["customer-success", "content"],
            "conversation_starters": ["Prepare QBR for Acme Corp Q3", "Generate ROI analysis for our top 10 accounts"],
        },
        {
            "name": "Ticket Triage Bot",
            "description": "Categorizes, prioritizes, and routes incoming support tickets based on content analysis and customer tier.",
            "instructions": "You are a support ticket analyst. Analyze ticket content to determine category, severity, and priority. Route to the appropriate team based on issue type and customer tier. Suggest initial response templates.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["customer-success", "operations"],
            "conversation_starters": ["Triage these 30 new tickets", "What's the trend in support topics this week?"],
        },
        {
            "name": "Customer Health Scorer",
            "description": "Calculates composite health scores combining product usage, support satisfaction, billing status, and engagement.",
            "instructions": "You are a customer health scoring expert. Calculate health scores using a weighted model that considers login frequency, feature adoption, support CSAT, billing status, and stakeholder engagement. Provide segment-level insights.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["customer-success", "analytics"],
            "conversation_starters": ["Calculate health scores for all enterprise accounts", "What factors are driving low health scores?"],
        },
        {
            "name": "Onboarding Guide Creator",
            "description": "Creates personalized onboarding plans and success milestones based on customer goals and use case.",
            "instructions": "You are an onboarding specialist. Design customized onboarding plans with milestones, training schedules, and success criteria based on the customer's goals, team size, and use case. Track progress against benchmarks.",
            "tools": [{"type": "canvas"}],
            "builder_categories": ["customer-success", "training"],
            "conversation_starters": ["Create an onboarding plan for a 200-person team", "Design a 30-60-90 day success plan"],
        },
        {
            "name": "Feature Adoption Tracker",
            "description": "Monitors feature adoption rates across customers and identifies upsell opportunities based on usage patterns.",
            "instructions": "You are a product adoption analyst. Track feature usage across accounts, identify under-utilized capabilities, and create adoption playbooks. Flag upsell opportunities when usage patterns indicate readiness for advanced features.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["customer-success", "analytics"],
            "conversation_starters": ["Which features have lowest adoption?", "Identify upsell-ready accounts"],
        },
        {
            "name": "Renewal Forecaster",
            "description": "Predicts renewal likelihood and recommends pricing strategies based on account health and usage trends.",
            "instructions": "You are a renewal management specialist. Analyze account health, usage trends, contract terms, and stakeholder sentiment to predict renewal probability. Recommend pricing strategies and expansion opportunities.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["customer-success", "operations"],
            "conversation_starters": ["Forecast renewals for next quarter", "Which renewals need executive sponsorship?"],
        },
        {
            "name": "Customer Feedback Analyzer",
            "description": "Aggregates and analyzes customer feedback from surveys, reviews, and support interactions to identify themes.",
            "instructions": "You are a voice-of-customer analyst. Analyze feedback from NPS surveys, G2 reviews, support tickets, and call notes. Identify recurring themes, sentiment trends, and actionable insights for product and CS teams.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["customer-success", "research"],
            "conversation_starters": ["Analyze this quarter's NPS comments", "What are the top feature requests?"],
        },
    ],
    "Finance": [
        {
            "name": "Budget Variance Analyzer",
            "description": "Compares actual spending against budget allocations, identifies variances, and provides explanatory narratives.",
            "instructions": "You are a financial analyst. Compare actual vs budgeted figures, calculate variances, and provide explanatory narratives for significant deviations. Suggest corrective actions for over-budget categories.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["finance", "analytics"],
            "conversation_starters": ["Analyze Q3 budget variances", "Which departments are over budget?"],
        },
        {
            "name": "Expense Categorizer",
            "description": "Automatically categorizes and validates expense reports against company policy, flagging exceptions.",
            "instructions": "You are an expense management specialist. Categorize expenses according to our chart of accounts, validate against policy limits, and flag items that need additional approval or documentation.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["finance", "operations"],
            "conversation_starters": ["Categorize this batch of 100 expenses", "Flag out-of-policy expenses from last month"],
        },
        {
            "name": "Revenue Forecaster",
            "description": "Builds revenue forecast models using historical data, pipeline analysis, and market trend inputs.",
            "instructions": "You are a revenue forecasting analyst. Build models using historical revenue data, current pipeline, bookings trends, and seasonal patterns. Provide scenario analysis (best/base/worst case) with key assumptions.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["finance", "analytics"],
            "conversation_starters": ["Build next year's revenue forecast", "What's our run rate analysis showing?"],
        },
        {
            "name": "Audit Prep Helper",
            "description": "Organizes documentation, validates controls, and prepares schedules for internal and external audits.",
            "instructions": "You are an audit preparation specialist. Help organize required documentation, validate that controls are properly evidenced, and prepare audit schedules. Create checklists for each audit area.",
            "tools": [{"type": "code-interpreter"}, {"type": "canvas"}],
            "builder_categories": ["finance", "compliance"],
            "conversation_starters": ["Prepare SOC 2 audit documentation", "Create an audit readiness checklist"],
        },
        {
            "name": "Invoice Processor",
            "description": "Extracts key data from invoices, matches to POs, and prepares batch payment files.",
            "instructions": "You are an accounts payable specialist. Extract vendor, amount, due date, and line items from invoices. Match against purchase orders, flag discrepancies, and prepare payment batch files.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["finance", "operations"],
            "conversation_starters": ["Process this batch of vendor invoices", "Match invoices to POs for this month"],
        },
        {
            "name": "Financial Report Builder",
            "description": "Generates formatted financial reports including P&L, balance sheet summaries, and KPI dashboards.",
            "instructions": "You are a financial reporting specialist. Create well-formatted financial reports with P&L summaries, balance sheet highlights, cash flow analysis, and key performance indicators. Include period-over-period comparisons.",
            "tools": [{"type": "code-interpreter"}, {"type": "canvas"}],
            "builder_categories": ["finance", "reporting"],
            "conversation_starters": ["Generate the monthly board report", "Create a cash flow summary"],
        },
        {
            "name": "Procurement Analyzer",
            "description": "Analyzes vendor spend patterns, identifies consolidation opportunities, and tracks contract renewals.",
            "instructions": "You are a procurement analyst. Analyze vendor spending patterns, identify opportunities for consolidation or renegotiation, and track upcoming contract renewals. Provide savings recommendations.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["finance", "operations"],
            "conversation_starters": ["Analyze our top 20 vendor relationships", "Identify redundant SaaS subscriptions"],
        },
    ],
    "HR/People": [
        {
            "name": "Policy Q&A Bot",
            "description": "Answers employee questions about HR policies, benefits, time-off rules, and workplace guidelines.",
            "instructions": "You are an HR policy expert. Answer employee questions about company policies accurately and empathetically. Reference specific policy sections when applicable. Escalate sensitive matters to HR team members.",
            "tools": [],
            "builder_categories": ["hr", "support"],
            "conversation_starters": ["What's our parental leave policy?", "How do I request a work-from-home arrangement?"],
        },
        {
            "name": "Job Description Writer",
            "description": "Creates inclusive, compelling job descriptions optimized for candidate attraction and legal compliance.",
            "instructions": "You are a talent acquisition specialist. Write job descriptions that are inclusive, compelling, and legally compliant. Include role responsibilities, requirements, nice-to-haves, and company culture highlights. Avoid biased language.",
            "tools": [{"type": "canvas"}],
            "builder_categories": ["hr", "content"],
            "conversation_starters": ["Write a JD for a Senior Product Manager", "Make this engineering JD more inclusive"],
        },
        {
            "name": "Performance Review Helper",
            "description": "Helps managers write constructive performance reviews with specific examples and development goals.",
            "instructions": "You are a performance management coach. Help managers articulate feedback clearly with specific examples. Balance strengths and development areas. Suggest SMART goals for the next review period. Ensure feedback is constructive and actionable.",
            "tools": [{"type": "canvas"}],
            "builder_categories": ["hr", "management"],
            "conversation_starters": ["Help me write a review for a high performer", "How do I address underperformance constructively?"],
        },
        {
            "name": "Benefits Calculator",
            "description": "Calculates total compensation packages including salary, equity, benefits, and perks for candidates and employees.",
            "instructions": "You are a compensation analyst. Calculate total compensation packages including base salary, bonus targets, equity value, health benefits, retirement contributions, and other perks. Compare packages across levels and roles.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["hr", "compensation"],
            "conversation_starters": ["Calculate total comp for a L5 engineer offer", "Compare our benefits to market benchmarks"],
        },
        {
            "name": "Interview Guide Builder",
            "description": "Creates structured interview guides with role-specific questions, scoring rubrics, and evaluation criteria.",
            "instructions": "You are an interview design specialist. Create structured interview guides with behavioral and technical questions tailored to the role. Include scoring rubrics, sample good/great answers, and red flags to watch for.",
            "tools": [{"type": "canvas"}],
            "builder_categories": ["hr", "recruitment"],
            "conversation_starters": ["Create an interview guide for a PM role", "Design a technical screen for backend engineers"],
        },
        {
            "name": "Employee Engagement Surveyor",
            "description": "Designs engagement surveys, analyzes results, and provides recommendations for improving workplace satisfaction.",
            "instructions": "You are an organizational development specialist. Design effective engagement surveys, analyze response data, identify themes and drivers, and recommend targeted action plans for improving employee satisfaction.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["hr", "analytics"],
            "conversation_starters": ["Analyze our latest engagement survey results", "Design a pulse survey for remote teams"],
        },
        {
            "name": "Learning Path Designer",
            "description": "Creates personalized learning and development paths for employees based on role, career goals, and skill gaps.",
            "instructions": "You are a learning and development specialist. Design personalized development paths that combine courses, mentorship, projects, and certifications. Align recommendations with career goals and organizational needs.",
            "tools": [{"type": "canvas"}],
            "builder_categories": ["hr", "training"],
            "conversation_starters": ["Create a leadership development path", "Design an onboarding curriculum for new managers"],
        },
        {
            "name": "Diversity Analytics Dashboard",
            "description": "Tracks diversity metrics across hiring, retention, and promotion pipelines with benchmarking insights.",
            "instructions": "You are a DEI analytics specialist. Track and analyze diversity metrics across the employee lifecycle. Identify gaps, benchmark against industry standards, and recommend targeted programs to improve representation.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["hr", "analytics"],
            "conversation_starters": ["Generate our quarterly DEI report", "Analyze diversity in our engineering pipeline"],
        },
    ],
    "Engineering": [
        {
            "name": "Code Review Assistant",
            "description": "Reviews code for best practices, security vulnerabilities, performance issues, and maintainability.",
            "instructions": "You are a senior software engineer conducting code review. Evaluate code for correctness, security, performance, readability, and adherence to team conventions. Provide actionable feedback with specific suggestions.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["engineering", "productivity"],
            "conversation_starters": ["Review this pull request", "Check this function for edge cases"],
        },
        {
            "name": "API Documentation Writer",
            "description": "Generates comprehensive API documentation from code, including examples, error codes, and usage guides.",
            "instructions": "You are a technical writer specializing in API documentation. Create clear, comprehensive docs with endpoint descriptions, parameter details, example requests/responses, error codes, and authentication guides.",
            "tools": [{"type": "code-interpreter"}, {"type": "canvas"}],
            "builder_categories": ["engineering", "documentation"],
            "conversation_starters": ["Document this REST API endpoint", "Generate OpenAPI spec from this code"],
        },
        {
            "name": "Architecture Advisor",
            "description": "Evaluates system architecture decisions, suggests design patterns, and identifies scalability concerns.",
            "instructions": "You are a solutions architect. Evaluate architecture proposals for scalability, reliability, and maintainability. Suggest appropriate design patterns, identify potential bottlenecks, and recommend technology choices.",
            "tools": [{"type": "canvas"}],
            "builder_categories": ["engineering", "architecture"],
            "conversation_starters": ["Review our microservices architecture", "Suggest a caching strategy for this use case"],
        },
        {
            "name": "Incident Response Runbook",
            "description": "Provides step-by-step incident response procedures, escalation paths, and post-mortem templates.",
            "instructions": "You are a site reliability engineer. Guide teams through incident response with step-by-step procedures. Help determine severity, identify escalation paths, suggest diagnostic steps, and create post-mortem documents.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["engineering", "operations"],
            "conversation_starters": ["We have a P1 database outage", "Help me write a post-mortem for last week's incident"],
        },
        {
            "name": "Tech Debt Tracker",
            "description": "Catalogs technical debt items, prioritizes remediation efforts, and estimates effort for cleanup work.",
            "instructions": "You are a technical project manager. Help catalog and prioritize technical debt. Evaluate impact on velocity, security, and reliability. Create remediation plans with effort estimates and business justifications.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["engineering", "management"],
            "conversation_starters": ["Prioritize our tech debt backlog", "Estimate effort to upgrade our auth system"],
        },
        {
            "name": "Test Strategy Planner",
            "description": "Designs testing strategies including unit, integration, E2E, and performance testing approaches.",
            "instructions": "You are a QA architect. Design comprehensive testing strategies that cover unit, integration, E2E, and performance testing. Recommend tools, coverage targets, and CI/CD integration approaches.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["engineering", "quality"],
            "conversation_starters": ["Design a testing strategy for our new API", "What's our test coverage gap?"],
        },
        {
            "name": "Migration Planner",
            "description": "Plans and tracks database migrations, infrastructure upgrades, and technology stack transitions.",
            "instructions": "You are a migration specialist. Plan complex migrations including database schema changes, infrastructure upgrades, and technology transitions. Create rollback plans, data validation steps, and communication plans.",
            "tools": [{"type": "code-interpreter"}, {"type": "canvas"}],
            "builder_categories": ["engineering", "operations"],
            "conversation_starters": ["Plan migration from MySQL to PostgreSQL", "Design a zero-downtime deployment strategy"],
        },
        {
            "name": "DevOps Pipeline Optimizer",
            "description": "Analyzes CI/CD pipelines for bottlenecks and suggests improvements for build speed and reliability.",
            "instructions": "You are a DevOps engineer. Analyze CI/CD pipeline configurations, identify bottlenecks, and suggest optimizations for build speed, test parallelization, and deployment reliability. Review infrastructure as code.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["engineering", "operations"],
            "conversation_starters": ["Our builds take 45 minutes, help optimize", "Review our GitHub Actions workflow"],
        },
    ],
    "Product": [
        {
            "name": "PRD Writer",
            "description": "Creates structured product requirement documents with user stories, acceptance criteria, and success metrics.",
            "instructions": "You are a product manager. Write comprehensive PRDs that include problem statements, user stories with acceptance criteria, success metrics, technical considerations, and launch plans. Use structured templates.",
            "tools": [{"type": "canvas"}],
            "builder_categories": ["product", "documentation"],
            "conversation_starters": ["Write a PRD for our new search feature", "Help me define acceptance criteria for this epic"],
        },
        {
            "name": "Feature Prioritizer",
            "description": "Scores and ranks feature requests using RICE, weighted scoring, or custom prioritization frameworks.",
            "instructions": "You are a product strategist. Evaluate feature requests using frameworks like RICE (Reach, Impact, Confidence, Effort). Consider strategic alignment, customer feedback frequency, and competitive necessity. Output ranked lists with rationale.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["product", "strategy"],
            "conversation_starters": ["Score these 20 feature requests using RICE", "Which features should we prioritize for Q4?"],
        },
        {
            "name": "User Research Analyzer",
            "description": "Synthesizes user research findings from interviews, surveys, and usability tests into actionable insights.",
            "instructions": "You are a UX researcher. Analyze qualitative and quantitative research data from user interviews, surveys, and usability tests. Identify patterns, create personas, and translate findings into product recommendations.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["product", "research"],
            "conversation_starters": ["Synthesize findings from 15 user interviews", "Analyze our usability test results"],
        },
        {
            "name": "Roadmap Planner",
            "description": "Builds and maintains product roadmaps balancing customer needs, technical debt, and strategic initiatives.",
            "instructions": "You are a product planning specialist. Create roadmaps that balance customer-requested features, technical debt reduction, and strategic initiatives. Consider resource constraints, dependencies, and market timing.",
            "tools": [{"type": "canvas"}, {"type": "code-interpreter"}],
            "builder_categories": ["product", "strategy"],
            "conversation_starters": ["Build our 6-month product roadmap", "How should we sequence these initiatives?"],
        },
        {
            "name": "Release Notes Generator",
            "description": "Creates user-friendly release notes from technical changelogs, highlighting benefits and new capabilities.",
            "instructions": "You are a product communications specialist. Transform technical changelogs into user-friendly release notes. Highlight new features, improvements, and fixes in language that resonates with end users. Include screenshots and tips.",
            "tools": [{"type": "canvas"}],
            "builder_categories": ["product", "content"],
            "conversation_starters": ["Write release notes for v2.5", "Summarize this sprint's changes for customers"],
        },
        {
            "name": "A/B Test Designer",
            "description": "Designs experiments with hypothesis, metrics, sample size calculations, and statistical analysis plans.",
            "instructions": "You are an experimentation specialist. Design A/B tests with clear hypotheses, primary and secondary metrics, sample size calculations, and analysis plans. Review test results for statistical significance.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["product", "analytics"],
            "conversation_starters": ["Design an A/B test for our pricing page", "Analyze the results of our onboarding experiment"],
        },
        {
            "name": "Competitive Feature Matrix",
            "description": "Maintains detailed feature comparison matrices across competitors with positioning recommendations.",
            "instructions": "You are a competitive analysis specialist. Create and maintain feature comparison matrices. Analyze competitive gaps and advantages. Recommend positioning strategies and feature investments based on market dynamics.",
            "tools": [{"type": "canvas"}, {"type": "browsing"}],
            "builder_categories": ["product", "research"],
            "conversation_starters": ["Update our competitive feature matrix", "How do we compare to the new entrant?"],
        },
        {
            "name": "Product Analytics Interpreter",
            "description": "Analyzes product usage data to identify adoption patterns, drop-off points, and engagement opportunities.",
            "instructions": "You are a product analytics expert. Analyze user behavior data to understand feature adoption, identify friction points in user journeys, and recommend optimizations. Create funnel analyses and cohort reports.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["product", "analytics"],
            "conversation_starters": ["Analyze our onboarding funnel", "Which features drive retention?"],
        },
    ],
    "Legal": [
        {
            "name": "Contract Reviewer",
            "description": "Reviews contracts for risk clauses, non-standard terms, and compliance with company legal standards.",
            "instructions": "You are a contract analyst. Review contracts for risk clauses, liability terms, IP provisions, termination conditions, and non-standard language. Flag items requiring legal counsel review and suggest standard alternatives.",
            "tools": [{"type": "canvas"}],
            "builder_categories": ["legal", "compliance"],
            "conversation_starters": ["Review this vendor contract", "Flag non-standard terms in this MSA"],
        },
        {
            "name": "NDA Generator",
            "description": "Creates customized non-disclosure agreements based on relationship type, jurisdiction, and confidentiality scope.",
            "instructions": "You are a legal document specialist. Generate NDAs customized for the specific relationship type (mutual/unilateral), jurisdiction, duration, and scope of confidential information. Include standard protective clauses.",
            "tools": [{"type": "canvas"}],
            "builder_categories": ["legal", "documentation"],
            "conversation_starters": ["Generate a mutual NDA for a partnership", "Create a unilateral NDA for a vendor"],
        },
        {
            "name": "Compliance Checker",
            "description": "Validates business processes and documentation against regulatory requirements (GDPR, SOC 2, HIPAA).",
            "instructions": "You are a compliance specialist. Evaluate processes, documentation, and controls against relevant regulatory frameworks. Identify gaps, recommend remediation steps, and help prepare for compliance audits.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["legal", "compliance"],
            "conversation_starters": ["Check our data processing for GDPR compliance", "Prepare for our SOC 2 audit"],
        },
        {
            "name": "IP Assessment Tool",
            "description": "Evaluates intellectual property considerations for new features, partnerships, and open-source usage.",
            "instructions": "You are an IP analyst. Evaluate intellectual property implications of product features, partnerships, and open-source library usage. Identify potential IP risks and recommend protective measures.",
            "tools": [],
            "builder_categories": ["legal", "ip"],
            "conversation_starters": ["Review open-source licenses in our stack", "Assess IP risk for this partnership"],
        },
        {
            "name": "Terms & Conditions Drafter",
            "description": "Creates and updates terms of service, privacy policies, and acceptable use policies for products.",
            "instructions": "You are a legal content specialist. Draft terms of service, privacy policies, and acceptable use policies that are legally sound, user-friendly, and compliant with applicable regulations. Keep language accessible.",
            "tools": [{"type": "canvas"}],
            "builder_categories": ["legal", "documentation"],
            "conversation_starters": ["Update our terms of service for the new feature", "Draft a privacy policy for our mobile app"],
        },
        {
            "name": "Legal Research Assistant",
            "description": "Researches legal precedents, regulatory changes, and industry-specific legal requirements.",
            "instructions": "You are a legal research assistant. Research relevant legal precedents, regulatory updates, and industry-specific requirements. Summarize findings in plain language with citations and practical implications.",
            "tools": [{"type": "browsing"}],
            "builder_categories": ["legal", "research"],
            "conversation_starters": ["Research data privacy laws in the EU", "What are the latest AI regulation developments?"],
        },
    ],
    "Data/Analytics": [
        {
            "name": "SQL Query Helper",
            "description": "Writes, optimizes, and debugs SQL queries with explanations of query logic and performance tips.",
            "instructions": "You are a database expert. Write SQL queries from natural language descriptions, optimize slow queries, and debug errors. Explain query logic and suggest indexing or schema improvements.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["data", "engineering"],
            "conversation_starters": ["Write a query to find churned customers", "Optimize this slow report query"],
        },
        {
            "name": "Dashboard Builder",
            "description": "Designs data dashboard layouts with KPI selection, visualization types, and drill-down capabilities.",
            "instructions": "You are a data visualization specialist. Design dashboard layouts that effectively communicate KPIs. Select appropriate chart types, define drill-down paths, and create mock data for prototyping.",
            "tools": [{"type": "code-interpreter"}, {"type": "canvas"}],
            "builder_categories": ["data", "visualization"],
            "conversation_starters": ["Design an executive KPI dashboard", "What visualizations best show our growth metrics?"],
        },
        {
            "name": "Data Quality Checker",
            "description": "Validates data completeness, consistency, and accuracy with automated checks and anomaly detection.",
            "instructions": "You are a data quality engineer. Design and run data validation checks for completeness, consistency, accuracy, and timeliness. Identify anomalies, duplicate records, and data drift. Create monitoring rules.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["data", "quality"],
            "conversation_starters": ["Check data quality in our customer table", "Design validation rules for our pipeline"],
        },
        {
            "name": "Report Generator",
            "description": "Creates automated recurring reports with customizable metrics, formatting, and distribution schedules.",
            "instructions": "You are a business intelligence analyst. Create automated reports with relevant metrics, clear formatting, and actionable summaries. Support different audience levels from executive summaries to detailed operational reports.",
            "tools": [{"type": "code-interpreter"}, {"type": "canvas"}],
            "builder_categories": ["data", "reporting"],
            "conversation_starters": ["Generate the weekly sales report", "Create a monthly ops dashboard"],
        },
        {
            "name": "Metrics Dictionary",
            "description": "Maintains a centralized metrics glossary with definitions, formulas, data sources, and business context.",
            "instructions": "You are a data governance specialist. Maintain a comprehensive metrics dictionary with clear definitions, calculation formulas, data sources, refresh frequencies, and business context. Resolve metric discrepancies.",
            "tools": [{"type": "canvas"}],
            "builder_categories": ["data", "governance"],
            "conversation_starters": ["Define our North Star metric", "Document how we calculate MRR"],
        },
        {
            "name": "ETL Pipeline Debugger",
            "description": "Diagnoses data pipeline failures, identifies data transformation issues, and suggests fixes.",
            "instructions": "You are a data engineer. Debug ETL pipeline failures by analyzing error logs, tracing data transformations, and identifying root causes. Suggest fixes and preventive measures for data pipeline reliability.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["data", "engineering"],
            "conversation_starters": ["Our nightly ETL job failed, help debug", "Why is data missing from the warehouse?"],
        },
        {
            "name": "Statistical Analysis Helper",
            "description": "Performs statistical analyses, significance tests, and regression modeling with interpretation guidance.",
            "instructions": "You are a statistician. Perform statistical analyses including hypothesis testing, regression modeling, correlation analysis, and forecasting. Provide interpretations in business-friendly language.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["data", "analytics"],
            "conversation_starters": ["Is this A/B test result significant?", "Build a regression model for churn prediction"],
        },
    ],
    "IT/Security": [
        {
            "name": "Access Review Bot",
            "description": "Audits user access permissions across systems, identifies over-provisioned accounts, and suggests cleanups.",
            "instructions": "You are an access management specialist. Review user access across systems, identify over-provisioned accounts, orphaned permissions, and separation-of-duty violations. Generate cleanup recommendations with priority levels.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["security", "compliance"],
            "conversation_starters": ["Run an access review for our AWS accounts", "Find users with excessive permissions"],
        },
        {
            "name": "Phishing Detector",
            "description": "Analyzes suspicious emails for phishing indicators including headers, links, and social engineering patterns.",
            "instructions": "You are a cybersecurity analyst. Analyze suspicious emails for phishing indicators. Examine sender headers, embedded links, attachment types, and social engineering tactics. Provide risk assessment and recommended actions.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["security", "analysis"],
            "conversation_starters": ["Is this email a phishing attempt?", "Analyze these suspicious links"],
        },
        {
            "name": "Security Policy Advisor",
            "description": "Creates and reviews security policies, standards, and procedures aligned with industry frameworks.",
            "instructions": "You are a security policy specialist. Create and review security policies aligned with frameworks like NIST, ISO 27001, and CIS Controls. Ensure policies are practical, enforceable, and regularly updated.",
            "tools": [{"type": "canvas"}],
            "builder_categories": ["security", "compliance"],
            "conversation_starters": ["Draft a password policy", "Review our incident response policy"],
        },
        {
            "name": "Asset Inventory Helper",
            "description": "Tracks and manages IT asset inventory including hardware, software licenses, and cloud resources.",
            "instructions": "You are an IT asset management specialist. Help track hardware, software licenses, cloud resources, and SaaS subscriptions. Identify unused assets, upcoming renewals, and optimization opportunities.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["it", "operations"],
            "conversation_starters": ["Audit our SaaS subscriptions", "Find unused cloud resources"],
        },
        {
            "name": "Vendor Risk Assessor",
            "description": "Evaluates third-party vendor security posture, compliance status, and data handling practices.",
            "instructions": "You are a vendor risk analyst. Evaluate third-party vendors for security posture, compliance certifications, data handling practices, and business continuity capabilities. Score risk and recommend mitigations.",
            "tools": [{"type": "code-interpreter"}, {"type": "canvas"}],
            "builder_categories": ["security", "compliance"],
            "conversation_starters": ["Assess this new SaaS vendor's security", "Review our vendor risk register"],
        },
        {
            "name": "Cloud Cost Optimizer",
            "description": "Analyzes cloud spending, identifies waste, and recommends right-sizing and reserved instance strategies.",
            "instructions": "You are a FinOps analyst. Analyze cloud spending across AWS/GCP/Azure, identify idle resources, recommend right-sizing opportunities, and calculate savings from reserved instances or savings plans.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["it", "finance"],
            "conversation_starters": ["Analyze our AWS bill from last month", "Where can we reduce cloud costs?"],
        },
        {
            "name": "Vulnerability Scanner Reporter",
            "description": "Interprets vulnerability scan results, prioritizes findings, and creates remediation plans.",
            "instructions": "You are a vulnerability management specialist. Interpret scan results, prioritize findings by CVSS score and business context, and create actionable remediation plans with timelines and ownership assignments.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["security", "operations"],
            "conversation_starters": ["Prioritize this week's vulnerability scan results", "Create a patch schedule for critical findings"],
        },
        {
            "name": "SSO Integration Helper",
            "description": "Guides teams through single sign-on setup, SAML/OIDC configuration, and identity provider integration.",
            "instructions": "You are an identity and access management specialist. Guide teams through SSO configuration, SAML/OIDC setup, and identity provider integration. Troubleshoot authentication issues and review security settings.",
            "tools": [{"type": "code-interpreter"}],
            "builder_categories": ["it", "security"],
            "conversation_starters": ["Help set up SAML SSO with Okta", "Troubleshoot our OIDC integration"],
        },
    ],
}

# Variation suffixes for when we need more GPTs than templates
_SUFFIXES = [
    "", " v2", " v3", " Pro", " Lite",
    " - EMEA", " - APAC", " - Americas",
    " - Q1", " - Q2", " - Q3", " - Q4",
    " (Beta)", " (Internal)", " (Executive)",
    " - Enterprise", " - SMB", " - Startup",
    " 2.0", " 3.0",
]

FIRST_NAMES = [
    "Alice", "Bob", "Charlie", "Diana", "Ethan", "Fiona", "George", "Hannah",
    "Ivan", "Julia", "Kevin", "Laura", "Michael", "Nina", "Oscar", "Patricia",
    "Quinn", "Rachel", "Samuel", "Tara", "Uma", "Victor", "Wendy", "Xavier",
    "Yara", "Zach", "Amir", "Beatriz", "Carlos", "Deepa", "Erik", "Fatima",
    "Gustavo", "Hana", "Iker", "Jasmine", "Kai", "Lena", "Marco", "Nadia",
    "Omar", "Priya", "Rafael", "Sofia", "Tomás", "Ursula", "Wei", "Xia",
]

LAST_NAMES = [
    "Smith", "Johnson", "Williams", "Chen", "Garcia", "Kim", "Martinez",
    "Anderson", "Taylor", "Thomas", "Brown", "Lee", "Wilson", "Davis",
    "Miller", "Moore", "Jackson", "White", "Harris", "Clark", "Robinson",
    "Patel", "Singh", "Nakamura", "Cohen", "Ali", "Ivanov", "Santos",
    "Johansson", "Müller", "Dubois", "Rossi", "Tanaka", "Park", "Novak",
]

DOMAIN = "acmecorp.com"

_VISIBILITY_OPTIONS = [
    "invite-only",
    "workspace-with-link",
    "everyone-in-workspace",
    "just-me",
]
_VISIBILITY_WEIGHTS = [40, 30, 20, 10]

_TOOL_OPTIONS = [
    [{"type": "code-interpreter"}],
    [{"type": "canvas"}],
    [{"type": "code-interpreter"}, {"type": "canvas"}],
    [{"type": "browsing"}],
    [{"type": "dalle"}],
    [{"type": "code-interpreter"}, {"type": "browsing"}],
    [],
]

# ---------------------------------------------------------------------------
# Abandoned / Experimental GPT templates (~60% of enterprise reality)
# Names: vague, duplicated, unprofessional. Instructions: 1-2 sentences.
# ---------------------------------------------------------------------------
# ---------------------------------------------------------------------------
# Guaranteed duplicate groups — always injected at the top of every demo dataset.
# Each group contains 2-3 GPTs built for the same purpose by different teams.
# They use keyword-rich names that map to a shared semantic bucket in MockEmbedder,
# so Run Clustering will reliably surface them regardless of dataset size.
# Keys prefixed with "_" are builder metadata, not GPT fields.
# ---------------------------------------------------------------------------
_GUARANTEED_DUPLICATE_GROUPS: list[list[dict]] = [
    # Meeting summarizer — 3 variants, wildly different quality
    [
        {
            "name": "Weekly Meeting Notes",
            "description": "Simple meeting notes assistant",
            "instructions": "Summarize meetings into bullet points.",
            "tools": [],
            "builder_categories": ["productivity"],
            "conversation_starters": [],
            "_owner": ("Tom", "Redmond"),
            "_visibility": "just-me",
            "_shared_count": 0,
        },
        {
            "name": "Meeting Recap Generator",
            "description": "Generate structured meeting recaps and action items from transcripts",
            "instructions": (
                "You are a meeting facilitator assistant. When given a meeting transcript or rough notes, "
                "produce a structured recap with: Summary (2-3 sentences), Key Decisions, "
                "Action Items (with owner and due date), and Next Steps. "
                "Use markdown formatting. Flag any unresolved questions or blockers."
            ),
            "tools": [{"type": "canvas"}],
            "builder_categories": ["productivity", "operations"],
            "conversation_starters": ["Summarize this meeting transcript", "Extract action items from notes"],
            "_owner": ("Sarah", "Martinez"),
            "_visibility": "invite-only",
            "_shared_count": 8,
        },
        {
            "name": "Standup & Meeting Summarizer",
            "description": "Quickly summarize standups and meeting notes into concise recaps",
            "instructions": "You help summarize meetings. Paste your meeting notes and I will create a shorter summary with key points.",
            "tools": [],
            "builder_categories": ["productivity"],
            "conversation_starters": [],
            "_owner": ("James", "Liu"),
            "_visibility": "invite-only",
            "_shared_count": 3,
        },
    ],
    # Email drafting assistant — 2 variants
    [
        {
            "name": "Email Draft Helper",
            "description": "email drafting",
            "instructions": "Help me write professional emails. Be concise and professional.",
            "tools": [],
            "builder_categories": [],
            "conversation_starters": [],
            "_owner": ("Maria", "Santos"),
            "_visibility": "just-me",
            "_shared_count": 0,
        },
        {
            "name": "Professional Email Composer",
            "description": "Draft clear, professional email outreach and internal communications",
            "instructions": (
                "You are an email writing assistant. Draft professional emails based on the context provided. "
                "Adjust tone (formal/friendly) based on the recipient. Always include a clear subject line, "
                "a concise body, and a professional sign-off. Ask clarifying questions if context is missing."
            ),
            "tools": [{"type": "canvas"}],
            "builder_categories": ["productivity", "sales"],
            "conversation_starters": ["Draft a follow-up email", "Write a cold outreach email"],
            "_owner": ("David", "Kim"),
            "_visibility": "invite-only",
            "_shared_count": 12,
        },
    ],
]


_ABANDONED_TEMPLATES: list[dict] = [
    {
        "name": "My GPT",
        "description": "Helpful assistant",
        "instructions": "You are a helpful assistant. Be professional and helpful.",
        "tools": [],
        "builder_categories": [],
        "conversation_starters": [],
    },
    {
        "name": "Helper Marketing",
        "description": "Marketing helper",
        "instructions": "You are a marketing assistant. Help me write marketing copy.",
        "tools": [],
        "builder_categories": ["marketing"],
        "conversation_starters": [],
    },
    {
        "name": "FINAL EMAIL THING",
        "description": "email drafting",
        "instructions": "Help me write professional emails. Be concise and professional.",
        "tools": [],
        "builder_categories": [],
        "conversation_starters": [],
    },
    {
        "name": "test - ignore",
        "description": "testing stuff",
        "instructions": "You are a test assistant. This is a test.",
        "tools": [],
        "builder_categories": [],
        "conversation_starters": [],
    },
    {
        "name": "Helper HR",
        "description": "HR helper for questions",
        "instructions": "You are an HR assistant. Answer HR-related questions. Be helpful and professional.",
        "tools": [],
        "builder_categories": ["hr"],
        "conversation_starters": [],
    },
    {
        "name": "DRAFT - Sales Bot",
        "description": "sales assistant draft",
        "instructions": "Help with sales questions and customer outreach. Be helpful.",
        "tools": [],
        "builder_categories": ["sales"],
        "conversation_starters": [],
    },
    {
        "name": "Test Finance v2",
        "description": "Finance assistant v2",
        "instructions": "You are a finance assistant. Help with finance tasks and budget questions.",
        "tools": [],
        "builder_categories": ["finance"],
        "conversation_starters": [],
    },
    {
        "name": "AI Assistant v1",
        "description": "General AI assistant",
        "instructions": "You are a helpful AI assistant. Help the user with their questions.",
        "tools": [],
        "builder_categories": [],
        "conversation_starters": [],
    },
    {
        "name": "Helper Legal",
        "description": "Legal helper",
        "instructions": "You are a legal assistant. Help with legal questions and document review.",
        "tools": [],
        "builder_categories": ["legal"],
        "conversation_starters": [],
    },
    {
        "name": "DRAFT Operations Assistant",
        "description": "Ops helper draft",
        "instructions": "Help with operational questions. Be concise and organized.",
        "tools": [],
        "builder_categories": ["operations"],
        "conversation_starters": [],
    },
    {
        "name": "Writing Helper",
        "description": "Helps write things",
        "instructions": "Help me write better. Be clear and professional.",
        "tools": [],
        "builder_categories": [],
        "conversation_starters": [],
    },
    {
        "name": "Meeting Notes v3",
        "description": "Another meeting notes thing",
        "instructions": "Summarize meetings into bullet points.",
        "tools": [],
        "builder_categories": ["productivity"],
        "conversation_starters": [],
    },
]


def _deterministic_id(index: int) -> str:
    h = hashlib.md5(f"demo-gpt-{index}".encode()).hexdigest()[:24]
    return f"g-{h}"


def generate_mock_gpts(count: int | None = None, seed: int = 42) -> list[dict]:
    """Generate `count` normalized GPT dicts with deterministic randomness.

    Distribution reflects real enterprise GPT reality:
    ~60% abandoned/experimental (1-2 sentence instructions, no tools)
    ~40% functional or production GPTs from DEPARTMENT_TEMPLATES
    """
    if count is None:
        count = get_demo_gpt_count()

    rng = _random.Random(seed)

    # Flatten all real templates
    real_templates: list[tuple[str, dict]] = []
    for dept, templates in DEPARTMENT_TEMPLATES.items():
        for t in templates:
            real_templates.append((dept, t))

    now = datetime.now(timezone.utc)
    gpts: list[dict] = []

    # --- Inject guaranteed duplicate groups first ---
    # These always appear so Run Clustering reliably surfaces them.
    for g_idx, group in enumerate(_GUARANTEED_DUPLICATE_GROUPS):
        for t_idx, tmpl in enumerate(group):
            if len(gpts) >= count:
                break
            first, last = tmpl.get("_owner", ("Demo", "User"))
            gpts.append({
                "id": f"g-{hashlib.md5(f'guaranteed-dup-{g_idx}-{t_idx}'.encode()).hexdigest()[:24]}",
                "name": tmpl["name"],
                "description": tmpl["description"],
                "instructions": tmpl["instructions"],
                "owner_email": f"{first.lower()}.{last.lower()}@{DOMAIN}",
                "builder_name": f"{first} {last}",
                "created_at": now - timedelta(days=rng.randint(30, 180)),
                "visibility": tmpl.get("_visibility", "invite-only"),
                "recipients": [],
                "shared_user_count": tmpl.get("_shared_count", 0),
                "tools": tmpl.get("tools", []),
                "files": [],
                "builder_categories": tmpl.get("builder_categories", []),
                "conversation_starters": tmpl.get("conversation_starters", []),
            })

    # --- Fill remaining slots with 60/40 distribution ---
    real_idx = 0
    abandoned_idx = 0

    for i in range(count - len(gpts)):
        # ~60% abandoned, ~40% real
        is_abandoned = rng.random() < 0.60

        if is_abandoned:
            template = _ABANDONED_TEMPLATES[abandoned_idx % len(_ABANDONED_TEMPLATES)]
            dept = "General"
            abandoned_idx += 1
            # Abandoned GPTs: visibility just-me or invite-only, 0 shared users
            visibility = rng.choices(
                ["just-me", "invite-only"],
                weights=[70, 30],
                k=1,
            )[0]
            shared_count = 0
            tools: list = []
            suffix = f" {rng.choice(['', '', '', '2', '3', 'v2', '- copy', '(old)'])}"
            suffix = suffix.strip()
            name = template["name"] + (f" {suffix}" if suffix else "")
        else:
            template_entry = real_templates[real_idx % len(real_templates)]
            suffix_idx = real_idx // len(real_templates)
            dept, template = template_entry
            real_idx += 1
            suffix = _SUFFIXES[suffix_idx % len(_SUFFIXES)] if suffix_idx > 0 else ""
            name = template["name"] + suffix
            # Real GPTs: normal visibility distribution
            visibility = rng.choices(_VISIBILITY_OPTIONS, weights=_VISIBILITY_WEIGHTS, k=1)[0]
            if visibility == "invite-only":
                shared_count = rng.choices(range(6), weights=[30, 25, 20, 15, 7, 3], k=1)[0]
            elif visibility == "just-me":
                shared_count = 0
            else:
                shared_count = rng.randint(0, 50)
            tools = template.get("tools") or rng.choice(_TOOL_OPTIONS)

        # Random builder
        first = rng.choice(FIRST_NAMES)
        last = rng.choice(LAST_NAMES)
        builder_name = f"{first} {last}"
        owner_email = f"{first.lower()}.{last.lower()}@{DOMAIN}"

        # Generate recipients
        recipients = []
        for r in range(shared_count):
            rf = rng.choice(FIRST_NAMES)
            rl = rng.choice(LAST_NAMES)
            recipients.append({
                "id": hashlib.md5(f"recipient-{i}-{r}".encode()).hexdigest()[:16],
                "email": f"{rf.lower()}.{rl.lower()}@{DOMAIN}",
            })

        # Random created date (abandoned GPTs skew older)
        if is_abandoned:
            days_ago = rng.randint(30, 360)
        else:
            days_ago = rng.randint(1, 180)
        created_at = now - timedelta(days=days_ago, hours=rng.randint(0, 23))

        # Random files (real GPTs only)
        files: list[dict] = []
        if not is_abandoned and rng.random() < 0.3:
            file_names = [
                "training_data.csv", "policy_doc.pdf", "guidelines.docx",
                "reference_material.pdf", "dataset.xlsx", "template.pptx",
            ]
            files = [{"name": rng.choice(file_names), "type": "file"}]

        gpts.append({
            "id": _deterministic_id(i),
            "name": name,
            "description": template["description"],
            "instructions": template["instructions"],
            "owner_email": owner_email,
            "builder_name": builder_name,
            "created_at": created_at,
            "visibility": visibility,
            "recipients": recipients,
            "shared_user_count": shared_count,
            "tools": tools,
            "files": files,
            "builder_categories": template.get("builder_categories"),
            "conversation_starters": template.get("conversation_starters"),
        })

    return gpts
