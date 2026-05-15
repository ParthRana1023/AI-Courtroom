<h1 align="center" id="title">AI Courtroom</h1>

<p align="center">
  <img src="https://socialify.git.ci/ParthRana1023/AI-Courtroom/image?description=1&amp;language=1&amp;name=1&amp;theme=Dark" alt="project-image">
</p>

<p align="center">
  <img src="https://img.shields.io/badge/version-4.7.4-blue.svg" alt="version">
  <img src="https://img.shields.io/badge/Next.js-Latest-black.svg" alt="nextjs">
  <img src="https://img.shields.io/badge/FastAPI-0.115-009688.svg" alt="fastapi">
  <img src="https://img.shields.io/badge/MongoDB-Latest-47A248.svg" alt="mongodb">
  <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="license">
</p>

<h2>🧐 Features</h2>

Here're some of the project's best features:

- **Case Generation**: AI-powered generation of legal case scenarios with location-based High Court assignment
- **Witness Examination**: Interactive AI witness calling and examination flow with real-time polling and response generation
- **RAG System**: Retrieval-Augmented Generation for standardized case context, improving AI accuracy and argument relevance
- **Parties Involved**: Chat with case parties (applicants/non-applicants) to gather evidence before courtroom
- **Interactive Arguments**: Submit arguments as either plaintiff or defendant with intelligent counter-arguments
- **Verdict & Analysis**: Comprehensive AI-generated verdicts and case strength analysis
- **Mobile Support**: Native-like experience on **Android** and **iOS** via Capacitor integration
- **PWA Support**: Offline-ready and installable web application with Serwist
- **User Authentication**: Secure login with email/password and Google OAuth
- **Profile Management**: User profiles with bento grid layout and case statistics
- **Location Caching**: Efficient MongoDB-based location data caching with monthly refresh
- **SEO Optimized**: Advanced SEO with structured data, sitemap generation, and dynamic Open Graph images
- **Structured Logging**: Comprehensive backend request tracing (Request IDs) and secure environment logging

## Tech Stack

### Frontend

- **Next.js 15**: React framework for server-rendered applications
- **Capacitor**: Cross-platform bridge for Android and iOS native builds
- **Serwist**: Modern PWA library for Next.js (Service Workers)
- **TypeScript**: Typed JavaScript for better development experience
- **Tailwind CSS 4**: Utility-first CSS framework
- **Framer Motion & GSAP**: Smooth animations and transitions
- **Google OAuth**: Integrated authentication
- **Playwright**: End-to-end testing framework

### Backend

- **FastAPI**: Modern, fast web framework for Python APIs
- **LangChain**: Framework for RAG and multi-provider LLM orchestration
- **Multi-Provider LLM**: Robust fallback system using **Groq** and **OpenRouter**
- **Beanie ODM**: MongoDB object-document mapper for Python
- **Sentence Transformers**: Local embeddings for RAG (`all-MiniLM-L6-v2`)
- **JWT Authentication**: Secure user authentication with configurable expiry
- **Country State City API**: Global location data integration

### Database

- **MongoDB**: NoSQL database for users, cases, feedback, and location cache

### Deployment

- **Frontend**: Vercel (automatic deploys from GitHub)
- **Backend**: Render (Docker-based deployment)

## Getting Started

### Prerequisites

- Node.js (v22 or higher)
- Python (v3.13 or higher)
- MongoDB
- Docker (optional, for containerized development)

### Quick Start with Docker

```bash
# Clone the repository
git clone https://github.com/ParthRana1023/AI-Courtroom.git
cd AI-Courtroom

# Build and run with Docker Compose
docker compose up --build
```

### Backend Setup

1. Navigate to the server directory:

   ```bash
   cd server
   ```

2. Create a virtual environment:

   ```bash
   python -m venv venv
   source venv/bin/activate  # On Windows: venv\Scripts\activate
   ```

3. Install dependencies:

   ```bash
   pip install -r requirements.txt
   ```

4. Create a `.env` file:

   ```env
   # Database
   MONGODB_URL=mongodb://localhost:27017
   MONGODB_DB_NAME=ai_courtroom

   # Authentication
   SECRET_KEY=your-secure-random-key-here
   ALGORITHM=HS256

   # AI Providers
   GROQ_API_KEY=your_groq_api_key
   OPENROUTER_API_KEY=your_openrouter_api_key

   # RAG Configuration
   RAG_ENABLED=true
   EMBEDDING_MODEL_NAME=sentence-transformers/all-MiniLM-L6-v2

   # Email (for OTP)
   email_sender=your-email-username-here
   email_username=your-email-id-here
   email_password=your-app-password-here
   smtp_server=smtp.gmail.com
   smtp_port=587

   # Google OAuth
   GOOGLE_CLIENT_ID=your-google-client-id
   GOOGLE_CLIENT_SECRET=your-google-client-secret

   # Cloudinary
   CLOUDINARY_CLOUD_NAME=your-cloud-name
   CLOUDINARY_API_KEY=your-api-key
   CLOUDINARY_API_SECRET=your-api-secret

   # Location API
   CSC_API_KEY=your-country-state-city-api-key

   # Logging
   LOG_LEVEL=INFO
   LOG_FORMAT=json

   PORT=8000
   ```

5. Start the backend:
   ```bash
   uvicorn app.main:app --reload
   ```

### Frontend Setup

1. Navigate to the client directory:

   ```bash
   cd client
   ```

2. Install dependencies:

   ```bash
   pnpm install
   ```

3. Create a `.env.local` file:

   ```env
   NEXT_PUBLIC_API_URL=http://localhost:8000
   NEXT_PUBLIC_GOOGLE_CLIENT_ID=your-google-client-id
   ```

4. Start development:

   ```bash
   pnpm dev
   ```

5. **Mobile Build (Optional)**:
   ```bash
   pnpm build:mobile
   npx cap sync android # or ios
   npx cap open android # or ios
   ```

## Project Structure

```
├── client/                 # Frontend Next.js application
│   ├── android/            # Android native project files
│   ├── ios/                # iOS native project files
│   ├── app/                # Next.js app directory
│   ├── components/         # React components
│   ├── lib/                # Utility functions
│   └── public/             # Static assets & PWA manifests
├── server/                 # Backend FastAPI application
│   ├── app/
│   │   ├── models/         # Database models (Beanie)
│   │   ├── routes/         # API routes (Cases, Witness, Arguments)
│   │   ├── services/       # Business logic (RAG, LLM orchestration)
│   │   └── utils/          # Utility functions
│   └── requirements.txt    # Python dependencies
├── future_plans/           # Development roadmaps & redesign plans
├── docker-compose.yaml     # Docker configuration
└── README.md
```

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

## License

This project is licensed under the MIT License.
